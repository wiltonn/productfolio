// =============================================================================
// Monte Carlo Forecast Engine
// =============================================================================

import { prisma } from '../lib/prisma.js';
import { scenarioCalculatorService } from './scenario-calculator.service.js';
import type { CapacityBySkillPeriod } from '../types/index.js';
import { ForecastMode, InitiativeStatus, Prisma } from '@prisma/client';

// =============================================================================
// Core Types (pure engine)
// =============================================================================

export interface SimulationResult {
  values: number[];  // sorted simulation outputs
  count: number;     // number of simulations run
}

export interface PercentileResult {
  level: number;     // e.g., 50, 75, 85, 95
  value: number;     // the computed percentile value
}

export type SampleFn = () => number;

// =============================================================================
// Mode A Types
// =============================================================================

export interface ScopeBasedForecastOptions {
  scenarioId: string;
  initiativeIds: string[];
  simulationCount?: number;       // default 1000
  confidenceLevels?: number[];    // default [50, 75, 85, 95]
  orgNodeId?: string;
}

export interface InitiativeForecast {
  initiativeId: string;
  initiativeTitle: string;
  completionCdf: Array<{
    periodId: string;
    periodLabel: string;
    cumulativeProbability: number;  // 0-1
  }>;
  percentiles: PercentileResult[];
  scopeItemCount: number;
  hasEstimates: boolean;
}

export interface ScopeBasedForecastResult {
  mode: 'SCOPE_BASED';
  scenarioId: string;
  simulationCount: number;
  initiativeForecasts: InitiativeForecast[];
  warnings: string[];
  durationMs: number;
}

// Internal types for scope data loaded from DB
interface ScopeItemData {
  id: string;
  name: string;
  estimateP50: number | null;
  estimateP90: number | null;
  skillDemand: Record<string, number>;
  periodDistributions: Array<{
    periodId: string;
    distribution: number;
  }>;
}

interface InitiativeScopeData {
  id: string;
  title: string;
  scopeItems: ScopeItemData[];
}

interface PeriodCapacity {
  periodId: string;
  periodLabel: string;
  capacityBySkill: Map<string, number>;  // skill -> effective hours
}

// =============================================================================
// Mode B Types
// =============================================================================

export interface EmpiricalForecastOptions {
  initiativeIds: string[];        // in-progress initiatives to forecast
  simulationCount?: number;       // default 1000
  confidenceLevels?: number[];    // default [50, 75, 85, 95]
}

export interface EmpiricalInitiativeForecast {
  initiativeId: string;
  initiativeTitle: string;
  currentStatus: string;
  elapsedDays: number;
  percentiles: PercentileResult[];  // forecasted total days at P50/P75/P85/P95
  estimatedCompletionDays: PercentileResult[];  // remaining days at each percentile
}

export interface EmpiricalForecastResult {
  mode: 'EMPIRICAL';
  simulationCount: number;
  historicalDataPoints: number;
  lowConfidence: boolean;
  initiativeForecasts: EmpiricalInitiativeForecast[];
  warnings: string[];
  durationMs: number;
}

// =============================================================================
// Data Quality Types
// =============================================================================

export interface DataQualityOptions {
  scenarioId?: string;
  initiativeIds?: string[];
}

export interface DataQualityResult {
  score: number;               // 0-100
  confidence: 'low' | 'moderate' | 'good';
  issues: string[];
  details: {
    totalScopeItems: number;
    scopeItemsWithEstimates: number;
    estimateCoverage: number;   // 0-1
    scopeItemsWithDistributions: number;
    distributionCoverage: number;  // 0-1
    historicalCompletions: number;
    modeBViable: boolean;
  };
}

// =============================================================================
// Normal sampling via Box-Muller transform
// =============================================================================

let boxMullerSpare: number | null = null;

/**
 * Generate a standard normal sample (mean=0, stddev=1) using Box-Muller.
 * Produces two values per pair of uniform samples; caches the spare.
 */
export function boxMullerNormal(): number {
  if (boxMullerSpare !== null) {
    const val = boxMullerSpare;
    boxMullerSpare = null;
    return val;
  }

  let u: number;
  let v: number;
  let s: number;

  // Use rejection sampling form (Marsaglia polar method) for better numerical stability
  do {
    u = Math.random() * 2 - 1;
    v = Math.random() * 2 - 1;
    s = u * u + v * v;
  } while (s >= 1 || s === 0);

  const mul = Math.sqrt(-2.0 * Math.log(s) / s);
  boxMullerSpare = v * mul;
  return u * mul;
}

// =============================================================================
// Lognormal sampling
// =============================================================================

/**
 * Draw a single sample from a lognormal distribution parameterized by
 * the 50th and 90th percentile estimates (in hours).
 *
 * Math:
 *   median of lognormal = e^mu  =>  mu = ln(p50)
 *   P90 = e^(mu + z_0.90 * sigma)  =>  sigma = (ln(p90) - ln(p50)) / 1.2816
 *
 * @param p50 - 50th percentile estimate (must be > 0)
 * @param p90 - 90th percentile estimate (must be >= p50)
 * @returns a random sample from the lognormal distribution
 */
export function lognormalSample(p50: number, p90: number): number {
  if (p50 <= 0) {
    throw new Error('p50 must be positive');
  }
  if (p90 < p50) {
    throw new Error('p90 must be >= p50');
  }

  const mu = Math.log(p50);
  // When p50 === p90, sigma = 0 => deterministic output
  const sigma = p90 === p50 ? 0 : (Math.log(p90) - mu) / 1.2816;
  const z = boxMullerNormal();

  return Math.exp(mu + sigma * z);
}

// =============================================================================
// Sampler factory
// =============================================================================

/**
 * Create a reusable lognormal sampler that pre-computes mu and sigma.
 * Validates inputs once at creation time.
 *
 * @param p50 - 50th percentile estimate (must be > 0)
 * @param p90 - 90th percentile estimate (must be >= p50)
 * @returns a SampleFn that draws from the lognormal distribution
 */
export function createLognormalSampler(p50: number, p90: number): SampleFn {
  if (p50 <= 0) {
    throw new Error('p50 must be positive');
  }
  if (p90 < p50) {
    throw new Error('p90 must be >= p50');
  }

  const mu = Math.log(p50);
  const sigma = p90 === p50 ? 0 : (Math.log(p90) - mu) / 1.2816;

  return () => {
    const z = boxMullerNormal();
    return Math.exp(mu + sigma * z);
  };
}

// =============================================================================
// Simulation runner
// =============================================================================

/**
 * Run N iterations of a sample function and collect sorted results.
 *
 * @param n - number of simulation iterations (must be >= 1)
 * @param sampleFn - function that produces one random sample per call
 * @returns SimulationResult with sorted values array and count
 */
export function runSimulation(n: number, sampleFn: SampleFn): SimulationResult {
  if (n < 1) {
    throw new Error('Simulation count must be >= 1');
  }

  const values = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    values[i] = sampleFn();
  }

  // Sort ascending for efficient percentile computation
  values.sort((a, b) => a - b);

  return { values, count: n };
}

// =============================================================================
// Percentile computation
// =============================================================================

/**
 * Compute percentiles from sorted simulation results using linear interpolation.
 *
 * @param results - SimulationResult with sorted values
 * @param levels - percentile levels to compute (e.g., [50, 75, 85, 95])
 * @returns array of PercentileResult objects
 */
export function computePercentiles(
  results: SimulationResult,
  levels: number[]
): PercentileResult[] {
  if (levels.length === 0) {
    return [];
  }

  const { values, count } = results;
  if (count === 0) {
    return levels.map(level => ({ level, value: 0 }));
  }

  return levels.map(level => {
    if (level <= 0) {
      return { level, value: values[0] };
    }
    if (level >= 100) {
      return { level, value: values[count - 1] };
    }

    // Linear interpolation
    const rank = (level / 100) * (count - 1);
    const lower = Math.floor(rank);
    const upper = Math.ceil(rank);
    const fraction = rank - lower;

    const value = lower === upper
      ? values[lower]
      : values[lower] * (1 - fraction) + values[upper] * fraction;

    return { level, value };
  });
}

// =============================================================================
// Mode A: Scope-Based Forecast
// =============================================================================

/**
 * Load initiative scope data from the database.
 */
async function loadScopeData(initiativeIds: string[]): Promise<InitiativeScopeData[]> {
  const initiatives = await prisma.initiative.findMany({
    where: { id: { in: initiativeIds } },
    include: {
      scopeItems: {
        include: {
          periodDistributions: true,
        },
      },
    },
  });

  return initiatives.map(init => ({
    id: init.id,
    title: init.title,
    scopeItems: init.scopeItems.map(si => ({
      id: si.id,
      name: si.name,
      estimateP50: si.estimateP50,
      estimateP90: si.estimateP90,
      skillDemand: (si.skillDemand as Record<string, number>) || {},
      periodDistributions: si.periodDistributions.map(pd => ({
        periodId: pd.periodId,
        distribution: pd.distribution,
      })),
    })),
  }));
}

/**
 * Extract per-period, per-skill capacity from calculator results.
 * Returns periods in chronological order.
 */
function buildPeriodCapacity(
  capacityBySkillPeriod: CapacityBySkillPeriod[],
  periods: Array<{ periodId: string; periodLabel: string; startDate: Date }>
): PeriodCapacity[] {
  // Sort periods chronologically
  const sortedPeriods = [...periods].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime()
  );

  return sortedPeriods.map(p => {
    const capacityBySkill = new Map<string, number>();
    for (const entry of capacityBySkillPeriod) {
      if (entry.periodId === p.periodId) {
        capacityBySkill.set(entry.skill, entry.effectiveHours);
      }
    }
    return {
      periodId: p.periodId,
      periodLabel: p.periodLabel,
      capacityBySkill,
    };
  });
}

/**
 * Sample one iteration of total effort per initiative, distributed by skill and period.
 * Returns: Map<initiativeId, Map<periodId, Map<skill, sampledHours>>>
 */
function sampleInitiativeEffort(
  initiatives: InitiativeScopeData[]
): Map<string, Map<string, Map<string, number>>> {
  const result = new Map<string, Map<string, Map<string, number>>>();

  for (const init of initiatives) {
    const periodSkillDemand = new Map<string, Map<string, number>>();

    for (const si of init.scopeItems) {
      if (si.estimateP50 == null || si.estimateP90 == null) continue;
      if (si.estimateP50 <= 0) continue;

      const p90 = Math.max(si.estimateP90, si.estimateP50);
      const sampledEffort = lognormalSample(si.estimateP50, p90);

      // Total skill demand hours for this scope item (sum of all skills)
      const totalSkillHours = Object.values(si.skillDemand)
        .reduce((sum, h) => sum + h, 0);

      if (totalSkillHours === 0) continue;

      // Distribute sampled effort across periods and skills
      for (const pd of si.periodDistributions) {
        if (pd.distribution <= 0) continue;

        if (!periodSkillDemand.has(pd.periodId)) {
          periodSkillDemand.set(pd.periodId, new Map());
        }
        const skillMap = periodSkillDemand.get(pd.periodId)!;

        for (const [skill, baseHours] of Object.entries(si.skillDemand)) {
          // Scale: (skill proportion of total) * sampled effort * period distribution weight
          const scaledHours = (baseHours / totalSkillHours) * sampledEffort * pd.distribution;
          skillMap.set(skill, (skillMap.get(skill) || 0) + scaledHours);
        }
      }
    }

    result.set(init.id, periodSkillDemand);
  }

  return result;
}

/**
 * Walk periods chronologically for a single initiative, tracking spillover.
 * Returns the 0-based period index where the initiative completes,
 * or periods.length if it doesn't complete within the forecast horizon.
 */
function walkPeriodsForInitiative(
  initiativeDemand: Map<string, Map<string, number>>,
  periodCapacity: PeriodCapacity[]
): number {
  // Track remaining demand per skill (spillover from previous periods)
  const remainingBySkill = new Map<string, number>();

  for (let i = 0; i < periodCapacity.length; i++) {
    const period = periodCapacity[i];

    // Add this period's demand to remaining
    const periodDemand = initiativeDemand.get(period.periodId);
    if (periodDemand) {
      for (const [skill, hours] of periodDemand) {
        remainingBySkill.set(skill, (remainingBySkill.get(skill) || 0) + hours);
      }
    }

    // Apply capacity to reduce remaining demand
    for (const [skill, remaining] of remainingBySkill) {
      const capacity = period.capacityBySkill.get(skill) || 0;
      const fulfilled = Math.min(remaining, capacity);
      const newRemaining = remaining - fulfilled;
      if (newRemaining <= 0.001) {
        remainingBySkill.delete(skill);
      } else {
        remainingBySkill.set(skill, newRemaining);
      }
    }

    // Check if all demand has been fulfilled
    if (remainingBySkill.size === 0) {
      return i;
    }
  }

  // Did not complete within the horizon
  return periodCapacity.length;
}

/**
 * Run a scope-based (Mode A) Monte Carlo forecast.
 *
 * Algorithm:
 * 1. Load scope data and capacity data (once)
 * 2. For each of N iterations:
 *    a. Sample total effort per scope item from lognormal(P50, P90)
 *    b. Distribute across periods using ScopeItemPeriodDistribution weights
 *    c. Walk periods, applying capacity and tracking spillover
 *    d. Record completion period index per initiative
 * 3. Compute CDF and percentiles from completion indices
 */
export async function runScopeBasedForecast(
  options: ScopeBasedForecastOptions
): Promise<ScopeBasedForecastResult> {
  const {
    scenarioId,
    initiativeIds,
    simulationCount = 1000,
    confidenceLevels = [50, 75, 85, 95],
  } = options;

  const startTime = performance.now();
  const warnings: string[] = [];

  // 1. Load data
  const [initiatives, calculatorResult] = await Promise.all([
    loadScopeData(initiativeIds),
    scenarioCalculatorService.calculate(scenarioId, { skipCache: true }),
  ]);

  // Validate initiatives exist
  const foundIds = new Set(initiatives.map(i => i.id));
  for (const id of initiativeIds) {
    if (!foundIds.has(id)) {
      warnings.push(`Initiative ${id} not found`);
    }
  }

  // Build period capacity from calculator output
  const periodCapacity = buildPeriodCapacity(
    calculatorResult.capacityBySkillPeriod,
    calculatorResult.periods.map(p => ({
      periodId: p.periodId,
      periodLabel: p.periodLabel,
      startDate: p.startDate,
    }))
  );

  if (periodCapacity.length === 0) {
    warnings.push('No periods found in scenario');
  }

  // Check for missing estimates
  for (const init of initiatives) {
    const missingEstimates = init.scopeItems.filter(
      si => si.estimateP50 == null || si.estimateP90 == null
    );
    if (missingEstimates.length > 0) {
      warnings.push(
        `Initiative "${init.title}": ${missingEstimates.length} of ${init.scopeItems.length} scope items missing P50/P90 estimates`
      );
    }
    if (init.scopeItems.length === 0) {
      warnings.push(`Initiative "${init.title}": no scope items defined`);
    }
  }

  // 2. Run simulations
  // completionIndices[initiativeId][iteration] = period index
  const completionIndices = new Map<string, number[]>();
  for (const init of initiatives) {
    completionIndices.set(init.id, []);
  }

  for (let iter = 0; iter < simulationCount; iter++) {
    const sampledEffort = sampleInitiativeEffort(initiatives);

    for (const init of initiatives) {
      const demand = sampledEffort.get(init.id) || new Map();
      const completionIdx = walkPeriodsForInitiative(demand, periodCapacity);
      completionIndices.get(init.id)!.push(completionIdx);
    }
  }

  // 3. Compute results per initiative
  const initiativeForecasts: InitiativeForecast[] = initiatives.map(init => {
    const indices = completionIndices.get(init.id)!;
    const hasEstimates = init.scopeItems.length > 0 &&
      init.scopeItems.some(si => si.estimateP50 != null && si.estimateP90 != null);

    // Completion CDF: probability of completing at or before each period
    const completionCdf = periodCapacity.map((p, periodIdx) => {
      const completedCount = indices.filter(idx => idx <= periodIdx).length;
      return {
        periodId: p.periodId,
        periodLabel: p.periodLabel,
        cumulativeProbability: completedCount / simulationCount,
      };
    });

    // Percentiles on completion period index
    const sorted = [...indices].sort((a, b) => a - b);
    const simResult: SimulationResult = { values: sorted, count: sorted.length };
    const percentiles = computePercentiles(simResult, confidenceLevels);

    return {
      initiativeId: init.id,
      initiativeTitle: init.title,
      completionCdf,
      percentiles,
      scopeItemCount: init.scopeItems.length,
      hasEstimates,
    };
  });

  const durationMs = Math.round(performance.now() - startTime);

  const result: ScopeBasedForecastResult = {
    mode: 'SCOPE_BASED',
    scenarioId,
    simulationCount,
    initiativeForecasts,
    warnings,
    durationMs,
  };

  // Persist ForecastRun
  await prisma.forecastRun.create({
    data: {
      mode: ForecastMode.SCOPE_BASED,
      scenarioId,
      orgNodeId: options.orgNodeId || null,
      initiativeIds: initiativeIds,
      simulationCount,
      confidenceLevels,
      inputSnapshot: {
        initiativeCount: initiatives.length,
        scopeItemCount: initiatives.reduce((sum, i) => sum + i.scopeItems.length, 0),
        periodCount: periodCapacity.length,
      },
      results: result as unknown as Prisma.InputJsonValue,
      warnings: warnings.length > 0 ? (warnings as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      durationMs,
    },
  });

  return result;
}

// =============================================================================
// Mode B: Empirical Forecast
// =============================================================================

const LOW_CONFIDENCE_THRESHOLD = 10;

/**
 * Compute cycle times (in days) from InitiativeStatusLog.
 * Cycle time = elapsed days from first RESOURCING transition to COMPLETE transition.
 */
async function computeHistoricalCycleTimes(): Promise<number[]> {
  // Find initiatives that reached COMPLETE
  const completedLogs = await prisma.initiativeStatusLog.findMany({
    where: { toStatus: InitiativeStatus.COMPLETE },
    select: {
      initiativeId: true,
      transitionedAt: true,
    },
  });

  if (completedLogs.length === 0) return [];

  const completedInitiativeIds = [...new Set(completedLogs.map(l => l.initiativeId))];

  // Find the earliest RESOURCING entry for each completed initiative
  const resourcingLogs = await prisma.initiativeStatusLog.findMany({
    where: {
      initiativeId: { in: completedInitiativeIds },
      toStatus: InitiativeStatus.RESOURCING,
    },
    select: {
      initiativeId: true,
      transitionedAt: true,
    },
    orderBy: { transitionedAt: 'asc' },
  });

  // Build map: initiativeId -> earliest RESOURCING date
  const resourcingStartMap = new Map<string, Date>();
  for (const log of resourcingLogs) {
    if (!resourcingStartMap.has(log.initiativeId)) {
      resourcingStartMap.set(log.initiativeId, log.transitionedAt);
    }
  }

  // Build map: initiativeId -> latest COMPLETE date
  const completeMap = new Map<string, Date>();
  for (const log of completedLogs) {
    const existing = completeMap.get(log.initiativeId);
    if (!existing || log.transitionedAt > existing) {
      completeMap.set(log.initiativeId, log.transitionedAt);
    }
  }

  // Compute cycle times
  const cycleTimes: number[] = [];
  for (const [initId, startDate] of resourcingStartMap) {
    const endDate = completeMap.get(initId);
    if (endDate) {
      const days = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      if (days > 0) {
        cycleTimes.push(days);
      }
    }
  }

  return cycleTimes;
}

/**
 * Get the elapsed days for in-progress initiatives (from their RESOURCING transition).
 */
async function getInProgressInitiatives(
  initiativeIds: string[]
): Promise<Array<{
  id: string;
  title: string;
  status: string;
  elapsedDays: number;
  resourcingStart: Date | null;
}>> {
  const initiatives = await prisma.initiative.findMany({
    where: { id: { in: initiativeIds } },
    select: {
      id: true,
      title: true,
      status: true,
    },
  });

  // Find earliest RESOURCING date for each initiative
  const resourcingLogs = await prisma.initiativeStatusLog.findMany({
    where: {
      initiativeId: { in: initiativeIds },
      toStatus: InitiativeStatus.RESOURCING,
    },
    select: {
      initiativeId: true,
      transitionedAt: true,
    },
    orderBy: { transitionedAt: 'asc' },
  });

  const resourcingStartMap = new Map<string, Date>();
  for (const log of resourcingLogs) {
    if (!resourcingStartMap.has(log.initiativeId)) {
      resourcingStartMap.set(log.initiativeId, log.transitionedAt);
    }
  }

  const now = new Date();

  return initiatives.map(init => {
    const resourcingStart = resourcingStartMap.get(init.id) || null;
    const elapsedDays = resourcingStart
      ? (now.getTime() - resourcingStart.getTime()) / (1000 * 60 * 60 * 24)
      : 0;

    return {
      id: init.id,
      title: init.title,
      status: init.status,
      elapsedDays,
      resourcingStart,
    };
  });
}

/**
 * Sample from the empirical cycle time distribution.
 * Uses random selection from the historical data (bootstrap sampling).
 */
function sampleFromCycleTimes(cycleTimes: number[]): number {
  const idx = Math.floor(Math.random() * cycleTimes.length);
  return cycleTimes[idx];
}

/**
 * Run an empirical (Mode B) Monte Carlo forecast.
 *
 * Algorithm:
 * 1. Query InitiativeStatusLog for completed initiatives -> cycle time distribution
 * 2. If < 10 data points -> low-confidence warning
 * 3. For each in-progress initiative:
 *    a. Compute elapsed days since RESOURCING
 *    b. For each simulation: sample a total cycle time from historical distribution
 *    c. Remaining = max(0, sampled_total - elapsed)
 *    d. Collect remaining days across simulations
 * 4. Compute percentiles on total and remaining days
 */
export async function runEmpiricalForecast(
  options: EmpiricalForecastOptions
): Promise<EmpiricalForecastResult> {
  const {
    initiativeIds,
    simulationCount = 1000,
    confidenceLevels = [50, 75, 85, 95],
  } = options;

  const startTime = performance.now();
  const warnings: string[] = [];

  // 1. Get historical cycle times
  const cycleTimes = await computeHistoricalCycleTimes();
  const lowConfidence = cycleTimes.length < LOW_CONFIDENCE_THRESHOLD;

  if (cycleTimes.length === 0) {
    warnings.push('No historical cycle time data available (no completed RESOURCING->COMPLETE cycles found)');
  } else if (lowConfidence) {
    warnings.push(
      `Low confidence: only ${cycleTimes.length} historical data points (minimum ${LOW_CONFIDENCE_THRESHOLD} recommended)`
    );
  }

  // 2. Get in-progress initiatives
  const inProgressInitiatives = await getInProgressInitiatives(initiativeIds);

  // Warn about initiatives not found
  const foundIds = new Set(inProgressInitiatives.map(i => i.id));
  for (const id of initiativeIds) {
    if (!foundIds.has(id)) {
      warnings.push(`Initiative ${id} not found`);
    }
  }

  for (const init of inProgressInitiatives) {
    if (!init.resourcingStart) {
      warnings.push(`Initiative "${init.title}": no RESOURCING transition found, elapsed days set to 0`);
    }
  }

  // 3. Run simulations (only if we have historical data)
  const initiativeForecasts: EmpiricalInitiativeForecast[] = inProgressInitiatives.map(init => {
    if (cycleTimes.length === 0) {
      return {
        initiativeId: init.id,
        initiativeTitle: init.title,
        currentStatus: init.status,
        elapsedDays: Math.round(init.elapsedDays),
        percentiles: confidenceLevels.map(level => ({ level, value: 0 })),
        estimatedCompletionDays: confidenceLevels.map(level => ({ level, value: 0 })),
      };
    }

    // Simulate total cycle times and remaining days
    const totalDaysSamples: number[] = [];
    const remainingDaysSamples: number[] = [];

    for (let i = 0; i < simulationCount; i++) {
      const sampledTotal = sampleFromCycleTimes(cycleTimes);
      totalDaysSamples.push(sampledTotal);
      const remaining = Math.max(0, sampledTotal - init.elapsedDays);
      remainingDaysSamples.push(remaining);
    }

    // Sort for percentile computation
    totalDaysSamples.sort((a, b) => a - b);
    remainingDaysSamples.sort((a, b) => a - b);

    const totalSimResult: SimulationResult = {
      values: totalDaysSamples,
      count: simulationCount,
    };
    const remainingSimResult: SimulationResult = {
      values: remainingDaysSamples,
      count: simulationCount,
    };

    return {
      initiativeId: init.id,
      initiativeTitle: init.title,
      currentStatus: init.status,
      elapsedDays: Math.round(init.elapsedDays),
      percentiles: computePercentiles(totalSimResult, confidenceLevels),
      estimatedCompletionDays: computePercentiles(remainingSimResult, confidenceLevels),
    };
  });

  const durationMs = Math.round(performance.now() - startTime);

  const result: EmpiricalForecastResult = {
    mode: 'EMPIRICAL',
    simulationCount,
    historicalDataPoints: cycleTimes.length,
    lowConfidence,
    initiativeForecasts,
    warnings,
    durationMs,
  };

  // Persist ForecastRun
  await prisma.forecastRun.create({
    data: {
      mode: ForecastMode.EMPIRICAL,
      scenarioId: null,
      orgNodeId: null,
      initiativeIds,
      simulationCount,
      confidenceLevels,
      inputSnapshot: {
        historicalDataPoints: cycleTimes.length,
        initiativeCount: inProgressInitiatives.length,
        lowConfidence,
      },
      results: result as unknown as Prisma.InputJsonValue,
      warnings: warnings.length > 0 ? (warnings as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      dataQuality: {
        score: lowConfidence ? Math.max(5, cycleTimes.length * 3) : Math.min(100, 30 + cycleTimes.length),
        issues: warnings.filter(w => w.includes('confidence') || w.includes('No historical')),
      } as unknown as Prisma.InputJsonValue,
      durationMs,
    },
  });

  return result;
}

// =============================================================================
// Data Quality Assessment
// =============================================================================

/**
 * Assess data quality for forecasting.
 *
 * Checks:
 * 1. Estimate coverage: % of scope items with P50/P90 estimates
 * 2. Distribution completeness: % of scope items with period distributions
 * 3. Historical completion count for Mode B viability (>=10 recommended)
 *
 * Score breakdown (0-100):
 * - Estimate coverage:     0-40 points (40 * estimateCoverage)
 * - Distribution coverage: 0-30 points (30 * distributionCoverage)
 * - Historical data:       0-30 points (30 * min(1, completions/10))
 *
 * Confidence thresholds: 0-30 low, 31-60 moderate, 61-100 good
 */
export async function assessDataQuality(
  options: DataQualityOptions
): Promise<DataQualityResult> {
  const { scenarioId, initiativeIds } = options;
  const issues: string[] = [];

  // Build where clause for scope items
  const scopeItemWhere: Record<string, unknown> = {};
  if (initiativeIds && initiativeIds.length > 0) {
    scopeItemWhere.initiativeId = { in: initiativeIds };
  } else if (scenarioId) {
    // If scenarioId given but no initiativeIds, look up the scenario's allocations
    const allocations = await prisma.allocation.findMany({
      where: { scenarioId },
      select: { initiativeId: true },
      distinct: ['initiativeId'],
    });
    const ids = allocations.map(a => a.initiativeId);
    if (ids.length > 0) {
      scopeItemWhere.initiativeId = { in: ids };
    }
  }

  // Query scope items with their period distributions
  const scopeItems = await prisma.scopeItem.findMany({
    where: scopeItemWhere,
    select: {
      id: true,
      estimateP50: true,
      estimateP90: true,
      periodDistributions: {
        select: { periodId: true },
      },
    },
  });

  const totalScopeItems = scopeItems.length;

  // Estimate coverage
  const scopeItemsWithEstimates = scopeItems.filter(
    si => si.estimateP50 != null && si.estimateP90 != null
  ).length;
  const estimateCoverage = totalScopeItems > 0
    ? scopeItemsWithEstimates / totalScopeItems
    : 0;

  // Distribution coverage
  const scopeItemsWithDistributions = scopeItems.filter(
    si => si.periodDistributions.length > 0
  ).length;
  const distributionCoverage = totalScopeItems > 0
    ? scopeItemsWithDistributions / totalScopeItems
    : 0;

  // Historical completions (for Mode B viability)
  const completedLogs = await prisma.initiativeStatusLog.findMany({
    where: { toStatus: InitiativeStatus.COMPLETE },
    select: { initiativeId: true },
    distinct: ['initiativeId'],
  });
  const historicalCompletions = completedLogs.length;
  const modeBViable = historicalCompletions >= LOW_CONFIDENCE_THRESHOLD;

  // Compute score
  const estimatePoints = 40 * estimateCoverage;
  const distributionPoints = 30 * distributionCoverage;
  const historicalPoints = 30 * Math.min(1, historicalCompletions / LOW_CONFIDENCE_THRESHOLD);
  const score = Math.round(estimatePoints + distributionPoints + historicalPoints);

  // Determine confidence level
  const confidence: DataQualityResult['confidence'] =
    score <= 30 ? 'low' : score <= 60 ? 'moderate' : 'good';

  // Populate issues
  if (totalScopeItems === 0) {
    issues.push('No scope items found');
  }
  if (estimateCoverage < 1 && totalScopeItems > 0) {
    const missing = totalScopeItems - scopeItemsWithEstimates;
    issues.push(`${missing} of ${totalScopeItems} scope items missing P50/P90 estimates`);
  }
  if (distributionCoverage < 1 && totalScopeItems > 0) {
    const missing = totalScopeItems - scopeItemsWithDistributions;
    issues.push(`${missing} of ${totalScopeItems} scope items missing period distributions`);
  }
  if (!modeBViable) {
    issues.push(
      `Only ${historicalCompletions} historical completions (need ${LOW_CONFIDENCE_THRESHOLD} for empirical forecasting)`
    );
  }

  return {
    score,
    confidence,
    issues,
    details: {
      totalScopeItems,
      scopeItemsWithEstimates,
      estimateCoverage,
      scopeItemsWithDistributions,
      distributionCoverage,
      historicalCompletions,
      modeBViable,
    },
  };
}
