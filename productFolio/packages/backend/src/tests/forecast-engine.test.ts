import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma
vi.mock('../lib/prisma.js', () => {
  const mockPrisma = {
    initiative: { findMany: vi.fn() },
    forecastRun: { create: vi.fn() },
    initiativeStatusLog: { findMany: vi.fn() },
    scopeItem: { findMany: vi.fn() },
    allocation: { findMany: vi.fn() },
  };
  return { prisma: mockPrisma };
});

// Mock Redis (required by scenario-calculator)
vi.mock('../lib/redis.js', () => ({
  getCachedData: vi.fn(async () => null),
  setCachedData: vi.fn(async () => true),
  deleteKey: vi.fn(async () => true),
  CACHE_KEYS: { scenarioCalculation: (id: string) => `scenario:${id}:calc` },
  CACHE_TTL: { CALCULATION: 300 },
}));

// Mock scenario calculator
vi.mock('../services/scenario-calculator.service.js', () => ({
  scenarioCalculatorService: {
    calculate: vi.fn(),
    invalidateCache: vi.fn(),
  },
}));

import {
  lognormalSample,
  createLognormalSampler,
  runSimulation,
  computePercentiles,
  boxMullerNormal,
  runScopeBasedForecast,
  runEmpiricalForecast,
  assessDataQuality,
} from '../services/forecast.service.js';
import type { SimulationResult, ScopeBasedForecastResult, EmpiricalForecastResult, DataQualityResult } from '../services/forecast.service.js';
import { prisma } from '../lib/prisma.js';
import { scenarioCalculatorService } from '../services/scenario-calculator.service.js';

const mockPrisma = prisma as unknown as {
  initiative: { findMany: ReturnType<typeof vi.fn> };
  forecastRun: { create: ReturnType<typeof vi.fn> };
  initiativeStatusLog: { findMany: ReturnType<typeof vi.fn> };
  scopeItem: { findMany: ReturnType<typeof vi.fn> };
  allocation: { findMany: ReturnType<typeof vi.fn> };
};
const mockCalculator = scenarioCalculatorService as unknown as {
  calculate: ReturnType<typeof vi.fn>;
};

// Helper: compute median of an array
function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// Helper: compute the Nth percentile of an array
function percentileOf(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  const frac = rank - lower;
  return lower === upper
    ? sorted[lower]
    : sorted[lower] * (1 - frac) + sorted[upper] * frac;
}

describe('Monte Carlo Engine Core', () => {
  // =========================================================================
  // boxMullerNormal
  // =========================================================================
  describe('boxMullerNormal', () => {
    it('produces values centered around 0', () => {
      const N = 10000;
      let sum = 0;
      for (let i = 0; i < N; i++) {
        sum += boxMullerNormal();
      }
      const mean = sum / N;
      // Mean should be close to 0 (within ~0.05 for N=10000)
      expect(Math.abs(mean)).toBeLessThan(0.1);
    });

    it('produces values with stddev close to 1', () => {
      const N = 10000;
      const values: number[] = [];
      for (let i = 0; i < N; i++) {
        values.push(boxMullerNormal());
      }
      const mean = values.reduce((s, v) => s + v, 0) / N;
      const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / N;
      const stddev = Math.sqrt(variance);
      // Stddev should be close to 1 (within ~0.05 for N=10000)
      expect(stddev).toBeGreaterThan(0.9);
      expect(stddev).toBeLessThan(1.1);
    });
  });

  // =========================================================================
  // lognormalSample
  // =========================================================================
  describe('lognormalSample', () => {
    it('always produces positive values', () => {
      for (let i = 0; i < 1000; i++) {
        const val = lognormalSample(100, 150);
        expect(val).toBeGreaterThan(0);
      }
    });

    it('produces median close to p50', () => {
      const N = 10000;
      const samples: number[] = [];
      for (let i = 0; i < N; i++) {
        samples.push(lognormalSample(100, 150));
      }
      const med = median(samples);
      // Median should be within 10% of p50=100
      expect(med).toBeGreaterThan(90);
      expect(med).toBeLessThan(110);
    });

    it('produces 90th percentile close to p90', () => {
      const N = 10000;
      const samples: number[] = [];
      for (let i = 0; i < N; i++) {
        samples.push(lognormalSample(100, 150));
      }
      const p90 = percentileOf(samples, 90);
      // P90 should be within 15% of p90=150
      expect(p90).toBeGreaterThan(127.5);
      expect(p90).toBeLessThan(172.5);
    });

    it('returns deterministic value when p50 === p90', () => {
      const val = lognormalSample(100, 100);
      expect(val).toBeCloseTo(100, 5);
    });

    it('throws when p50 <= 0', () => {
      expect(() => lognormalSample(0, 100)).toThrow('p50 must be positive');
      expect(() => lognormalSample(-5, 100)).toThrow('p50 must be positive');
    });

    it('throws when p90 < p50', () => {
      expect(() => lognormalSample(100, 50)).toThrow('p90 must be >= p50');
    });
  });

  // =========================================================================
  // createLognormalSampler
  // =========================================================================
  describe('createLognormalSampler', () => {
    it('returns a function that produces positive values', () => {
      const sampler = createLognormalSampler(100, 150);
      for (let i = 0; i < 100; i++) {
        expect(sampler()).toBeGreaterThan(0);
      }
    });

    it('validates inputs at creation time', () => {
      expect(() => createLognormalSampler(0, 100)).toThrow('p50 must be positive');
      expect(() => createLognormalSampler(-1, 100)).toThrow('p50 must be positive');
      expect(() => createLognormalSampler(100, 50)).toThrow('p90 must be >= p50');
    });

    it('pre-computes parameters for consistent distribution', () => {
      const sampler = createLognormalSampler(200, 300);
      const N = 10000;
      const samples: number[] = [];
      for (let i = 0; i < N; i++) {
        samples.push(sampler());
      }
      const med = median(samples);
      // Median should be within 10% of p50=200
      expect(med).toBeGreaterThan(180);
      expect(med).toBeLessThan(220);
    });
  });

  // =========================================================================
  // runSimulation
  // =========================================================================
  describe('runSimulation', () => {
    it('returns correct count', () => {
      const result = runSimulation(100, () => Math.random());
      expect(result.count).toBe(100);
      expect(result.values).toHaveLength(100);
    });

    it('returns sorted values', () => {
      const result = runSimulation(500, () => Math.random() * 1000);
      for (let i = 1; i < result.values.length; i++) {
        expect(result.values[i]).toBeGreaterThanOrEqual(result.values[i - 1]);
      }
    });

    it('works with a deterministic sample function', () => {
      const result = runSimulation(5, () => 42);
      expect(result.count).toBe(5);
      expect(result.values).toEqual([42, 42, 42, 42, 42]);
    });

    it('works with an incrementing sample function', () => {
      let counter = 0;
      const result = runSimulation(5, () => ++counter);
      expect(result.count).toBe(5);
      // Values should be sorted: [1, 2, 3, 4, 5]
      expect(result.values).toEqual([1, 2, 3, 4, 5]);
    });

    it('throws when n < 1', () => {
      expect(() => runSimulation(0, () => 1)).toThrow('Simulation count must be >= 1');
      expect(() => runSimulation(-5, () => 1)).toThrow('Simulation count must be >= 1');
    });

    it('completes N=1000 in less than 100ms', () => {
      const sampler = createLognormalSampler(100, 150);
      const start = performance.now();
      runSimulation(1000, sampler);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(100);
    });
  });

  // =========================================================================
  // computePercentiles
  // =========================================================================
  describe('computePercentiles', () => {
    it('computes correct percentiles for known data', () => {
      // Sorted values 1..100
      const values = Array.from({ length: 100 }, (_, i) => i + 1);
      const result: SimulationResult = { values, count: 100 };

      const percentiles = computePercentiles(result, [50, 90]);
      const p50 = percentiles.find(p => p.level === 50)!;
      const p90 = percentiles.find(p => p.level === 90)!;

      // For [1..100]: P50 interpolates around 50.5, P90 around 90.1
      expect(p50.value).toBeGreaterThan(49);
      expect(p50.value).toBeLessThan(52);
      expect(p90.value).toBeGreaterThan(89);
      expect(p90.value).toBeLessThan(92);
    });

    it('returns the same value for all percentiles when only one value', () => {
      const result: SimulationResult = { values: [42], count: 1 };
      const percentiles = computePercentiles(result, [25, 50, 75, 95]);
      for (const p of percentiles) {
        expect(p.value).toBe(42);
      }
    });

    it('returns empty array when no levels requested', () => {
      const result: SimulationResult = { values: [1, 2, 3], count: 3 };
      const percentiles = computePercentiles(result, []);
      expect(percentiles).toEqual([]);
    });

    it('handles boundary percentiles (P0 and P100)', () => {
      const values = [10, 20, 30, 40, 50];
      const result: SimulationResult = { values, count: 5 };
      const percentiles = computePercentiles(result, [0, 100]);

      const p0 = percentiles.find(p => p.level === 0)!;
      const p100 = percentiles.find(p => p.level === 100)!;
      expect(p0.value).toBe(10);
      expect(p100.value).toBe(50);
    });

    it('returns zeros for empty simulation', () => {
      const result: SimulationResult = { values: [], count: 0 };
      const percentiles = computePercentiles(result, [50, 90]);
      for (const p of percentiles) {
        expect(p.value).toBe(0);
      }
    });

    it('preserves requested level values in output', () => {
      const result: SimulationResult = { values: [1, 2, 3], count: 3 };
      const percentiles = computePercentiles(result, [50, 75, 85, 95]);
      expect(percentiles.map(p => p.level)).toEqual([50, 75, 85, 95]);
    });
  });

  // =========================================================================
  // Integration: full pipeline
  // =========================================================================
  describe('Integration: sampler -> simulation -> percentiles', () => {
    it('produces statistically valid results for p50=100, p90=150', () => {
      const sampler = createLognormalSampler(100, 150);
      const simResult = runSimulation(10000, sampler);
      const percentiles = computePercentiles(simResult, [50, 75, 85, 95]);

      const p50 = percentiles.find(p => p.level === 50)!;
      const p95 = percentiles.find(p => p.level === 95)!;

      // P50 should be within 10% of 100
      expect(p50.value).toBeGreaterThan(90);
      expect(p50.value).toBeLessThan(110);

      // P95 should be greater than P50 (right-skewed distribution)
      expect(p95.value).toBeGreaterThan(p50.value);
    });

    it('produces P90 close to input p90=150', () => {
      const sampler = createLognormalSampler(100, 150);
      const simResult = runSimulation(10000, sampler);
      const percentiles = computePercentiles(simResult, [90]);

      const p90 = percentiles[0];
      // P90 should be within 15% of 150
      expect(p90.value).toBeGreaterThan(127.5);
      expect(p90.value).toBeLessThan(172.5);
    });

    it('handles small estimates (p50=5, p90=8)', () => {
      const sampler = createLognormalSampler(5, 8);
      const simResult = runSimulation(10000, sampler);
      const percentiles = computePercentiles(simResult, [50, 90]);

      const p50 = percentiles.find(p => p.level === 50)!;
      const p90 = percentiles.find(p => p.level === 90)!;

      expect(p50.value).toBeGreaterThan(4);
      expect(p50.value).toBeLessThan(6);
      expect(p90.value).toBeGreaterThan(6.5);
      expect(p90.value).toBeLessThan(9.5);
    });

    it('handles large estimates (p50=10000, p90=25000)', () => {
      const sampler = createLognormalSampler(10000, 25000);
      const simResult = runSimulation(10000, sampler);
      const percentiles = computePercentiles(simResult, [50, 90]);

      const p50 = percentiles.find(p => p.level === 50)!;
      const p90 = percentiles.find(p => p.level === 90)!;

      expect(p50.value).toBeGreaterThan(8000);
      expect(p50.value).toBeLessThan(12000);
      expect(p90.value).toBeGreaterThan(20000);
      expect(p90.value).toBeLessThan(30000);
    });

    it('full pipeline completes N=1000 in under 5 seconds', () => {
      const sampler = createLognormalSampler(100, 150);
      const start = performance.now();
      const simResult = runSimulation(1000, sampler);
      computePercentiles(simResult, [50, 75, 85, 95]);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(5000);
    });
  });
});

// =============================================================================
// Mode A: Scope-Based Forecast
// =============================================================================
describe('Mode A: Scope-Based Forecast', () => {
  const scenarioId = '00000000-0000-4000-8000-000000000001';
  const initiativeId1 = '00000000-0000-4000-8000-000000000010';
  const initiativeId2 = '00000000-0000-4000-8000-000000000020';
  const periodId1 = '00000000-0000-4000-8000-000000000100';
  const periodId2 = '00000000-0000-4000-8000-000000000200';

  function setupMocks(opts?: {
    scopeItems?: Array<{
      estimateP50: number | null;
      estimateP90: number | null;
      skillDemand: Record<string, number> | null;
      periodDistributions: Array<{ periodId: string; distribution: number }>;
    }>;
    initiatives?: Array<{
      id: string;
      title: string;
      scopeItems: Array<{
        id: string;
        name: string;
        estimateP50: number | null;
        estimateP90: number | null;
        skillDemand: Record<string, number> | null;
        periodDistributions: Array<{ periodId: string; distribution: number }>;
      }>;
    }>;
    capacityBySkill?: Array<{ periodId: string; skill: string; effectiveHours: number }>;
  }) {
    const defaultInitiatives = opts?.initiatives || [{
      id: initiativeId1,
      title: 'Initiative Alpha',
      scopeItems: opts?.scopeItems?.map((si, idx) => ({
        id: `00000000-0000-4000-8000-00000000100${idx}`,
        name: `Scope Item ${idx}`,
        ...si,
      })) || [{
        id: '00000000-0000-4000-8000-000000001000',
        name: 'Build Feature',
        estimateP50: 100,
        estimateP90: 150,
        skillDemand: { frontend: 60, backend: 40 },
        periodDistributions: [
          { periodId: periodId1, distribution: 0.6 },
          { periodId: periodId2, distribution: 0.4 },
        ],
      }],
    }];

    mockPrisma.initiative.findMany.mockResolvedValue(defaultInitiatives);
    mockPrisma.forecastRun.create.mockResolvedValue({ id: 'run-1' });

    const defaultCapacity = opts?.capacityBySkill || [
      { periodId: periodId1, periodLabel: 'Q1 2025', skill: 'frontend', totalHours: 200, effectiveHours: 200, employeeBreakdown: [] },
      { periodId: periodId1, periodLabel: 'Q1 2025', skill: 'backend', totalHours: 150, effectiveHours: 150, employeeBreakdown: [] },
      { periodId: periodId2, periodLabel: 'Q2 2025', skill: 'frontend', totalHours: 200, effectiveHours: 200, employeeBreakdown: [] },
      { periodId: periodId2, periodLabel: 'Q2 2025', skill: 'backend', totalHours: 150, effectiveHours: 150, employeeBreakdown: [] },
    ];

    mockCalculator.calculate.mockResolvedValue({
      scenarioId,
      scenarioName: 'Test Scenario',
      periods: [
        { periodId: periodId1, periodLabel: 'Q1 2025', periodType: 'QUARTER', startDate: new Date('2025-01-01'), endDate: new Date('2025-03-31') },
        { periodId: periodId2, periodLabel: 'Q2 2025', periodType: 'QUARTER', startDate: new Date('2025-04-01'), endDate: new Date('2025-06-30') },
      ],
      capacityBySkillPeriod: defaultCapacity,
      demandBySkillPeriod: [],
      gapAnalysis: [],
      issues: { shortages: [], overallocations: [], skillMismatches: [] },
      summary: { totalDemandHours: 0, totalCapacityHours: 700, overallGap: 700, overallUtilization: 0, totalShortages: 0, totalOverallocations: 0, totalSkillMismatches: 0, periodCount: 2, skillCount: 2, employeeCount: 3, initiativeCount: 1, rampCostHours: 0 },
      cacheHit: false,
      calculatedAt: new Date(),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns correct structure with mode SCOPE_BASED', async () => {
    setupMocks();
    const result = await runScopeBasedForecast({
      scenarioId,
      initiativeIds: [initiativeId1],
      simulationCount: 100,
    });

    expect(result.mode).toBe('SCOPE_BASED');
    expect(result.scenarioId).toBe(scenarioId);
    expect(result.simulationCount).toBe(100);
    expect(result.initiativeForecasts).toHaveLength(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('produces completion CDF with entries for each period', async () => {
    setupMocks();
    const result = await runScopeBasedForecast({
      scenarioId,
      initiativeIds: [initiativeId1],
      simulationCount: 500,
    });

    const forecast = result.initiativeForecasts[0];
    expect(forecast.completionCdf).toHaveLength(2); // 2 periods
    expect(forecast.completionCdf[0].periodId).toBe(periodId1);
    expect(forecast.completionCdf[1].periodId).toBe(periodId2);

    // CDF should be non-decreasing
    expect(forecast.completionCdf[1].cumulativeProbability)
      .toBeGreaterThanOrEqual(forecast.completionCdf[0].cumulativeProbability);
  });

  it('initiative completes early when capacity greatly exceeds demand', async () => {
    setupMocks({
      scopeItems: [{
        estimateP50: 10,    // very small demand
        estimateP90: 15,
        skillDemand: { frontend: 10 },
        periodDistributions: [
          { periodId: periodId1, distribution: 1.0 },
        ],
      }],
      capacityBySkill: [
        { periodId: periodId1, periodLabel: 'Q1 2025', skill: 'frontend', effectiveHours: 1000 } as any,
        { periodId: periodId2, periodLabel: 'Q2 2025', skill: 'frontend', effectiveHours: 1000 } as any,
      ],
    });

    const result = await runScopeBasedForecast({
      scenarioId,
      initiativeIds: [initiativeId1],
      simulationCount: 500,
    });

    const forecast = result.initiativeForecasts[0];
    // Should complete in period 1 with very high probability
    expect(forecast.completionCdf[0].cumulativeProbability).toBeGreaterThan(0.9);
  });

  it('demand spills over when capacity is insufficient in first period', async () => {
    setupMocks({
      scopeItems: [{
        estimateP50: 500,   // large demand
        estimateP90: 500,   // deterministic
        skillDemand: { frontend: 500 },
        periodDistributions: [
          { periodId: periodId1, distribution: 1.0 }, // all demand in period 1
        ],
      }],
      capacityBySkill: [
        { periodId: periodId1, periodLabel: 'Q1 2025', skill: 'frontend', effectiveHours: 200 } as any,
        { periodId: periodId2, periodLabel: 'Q2 2025', skill: 'frontend', effectiveHours: 400 } as any,
      ],
    });

    const result = await runScopeBasedForecast({
      scenarioId,
      initiativeIds: [initiativeId1],
      simulationCount: 500,
    });

    const forecast = result.initiativeForecasts[0];
    // Should NOT complete in period 1 (200 < 500)
    expect(forecast.completionCdf[0].cumulativeProbability).toBe(0);
    // Should complete in period 2 (200 + 400 = 600 >= 500)
    expect(forecast.completionCdf[1].cumulativeProbability).toBe(1);
  });

  it('warns about missing estimates', async () => {
    setupMocks({
      scopeItems: [{
        estimateP50: null,
        estimateP90: null,
        skillDemand: { frontend: 100 },
        periodDistributions: [{ periodId: periodId1, distribution: 1.0 }],
      }],
    });

    const result = await runScopeBasedForecast({
      scenarioId,
      initiativeIds: [initiativeId1],
      simulationCount: 100,
    });

    expect(result.warnings.some(w => w.includes('missing P50/P90'))).toBe(true);
    expect(result.initiativeForecasts[0].hasEstimates).toBe(false);
  });

  it('warns about missing initiatives', async () => {
    setupMocks();
    const result = await runScopeBasedForecast({
      scenarioId,
      initiativeIds: [initiativeId1, '00000000-0000-4000-8000-999999999999'],
      simulationCount: 100,
    });

    expect(result.warnings.some(w => w.includes('not found'))).toBe(true);
  });

  it('warns about initiatives with no scope items', async () => {
    setupMocks({
      initiatives: [{
        id: initiativeId1,
        title: 'Empty Initiative',
        scopeItems: [],
      }],
    });

    const result = await runScopeBasedForecast({
      scenarioId,
      initiativeIds: [initiativeId1],
      simulationCount: 100,
    });

    expect(result.warnings.some(w => w.includes('no scope items'))).toBe(true);
  });

  it('handles multiple initiatives independently', async () => {
    setupMocks({
      initiatives: [
        {
          id: initiativeId1,
          title: 'Small Initiative',
          scopeItems: [{
            id: '00000000-0000-4000-8000-000000001000',
            name: 'Small Work',
            estimateP50: 10,
            estimateP90: 10,
            skillDemand: { frontend: 10 },
            periodDistributions: [{ periodId: periodId1, distribution: 1.0 }],
          }],
        },
        {
          id: initiativeId2,
          title: 'Large Initiative',
          scopeItems: [{
            id: '00000000-0000-4000-8000-000000002000',
            name: 'Large Work',
            estimateP50: 1000,
            estimateP90: 1000,
            skillDemand: { frontend: 1000 },
            periodDistributions: [{ periodId: periodId1, distribution: 1.0 }],
          }],
        },
      ],
      capacityBySkill: [
        { periodId: periodId1, periodLabel: 'Q1 2025', skill: 'frontend', effectiveHours: 200 } as any,
        { periodId: periodId2, periodLabel: 'Q2 2025', skill: 'frontend', effectiveHours: 200 } as any,
      ],
    });

    const result = await runScopeBasedForecast({
      scenarioId,
      initiativeIds: [initiativeId1, initiativeId2],
      simulationCount: 500,
    });

    expect(result.initiativeForecasts).toHaveLength(2);

    const small = result.initiativeForecasts.find(f => f.initiativeId === initiativeId1)!;
    const large = result.initiativeForecasts.find(f => f.initiativeId === initiativeId2)!;

    // Small initiative should complete earlier
    expect(small.completionCdf[0].cumulativeProbability)
      .toBeGreaterThan(large.completionCdf[0].cumulativeProbability);
  });

  it('persists ForecastRun record', async () => {
    setupMocks();
    await runScopeBasedForecast({
      scenarioId,
      initiativeIds: [initiativeId1],
      simulationCount: 100,
    });

    expect(mockPrisma.forecastRun.create).toHaveBeenCalledTimes(1);
    const createCall = mockPrisma.forecastRun.create.mock.calls[0][0];
    expect(createCall.data.mode).toBe('SCOPE_BASED');
    expect(createCall.data.scenarioId).toBe(scenarioId);
    expect(createCall.data.simulationCount).toBe(100);
  });

  it('computes percentiles on completion period indices', async () => {
    setupMocks();
    const result = await runScopeBasedForecast({
      scenarioId,
      initiativeIds: [initiativeId1],
      simulationCount: 500,
      confidenceLevels: [50, 75, 85, 95],
    });

    const forecast = result.initiativeForecasts[0];
    expect(forecast.percentiles).toHaveLength(4);
    expect(forecast.percentiles.map(p => p.level)).toEqual([50, 75, 85, 95]);

    // Percentile values should be non-decreasing
    for (let i = 1; i < forecast.percentiles.length; i++) {
      expect(forecast.percentiles[i].value)
        .toBeGreaterThanOrEqual(forecast.percentiles[i - 1].value);
    }
  });

  it('completes N=1000 simulation in under 5 seconds', async () => {
    setupMocks();
    const start = performance.now();
    await runScopeBasedForecast({
      scenarioId,
      initiativeIds: [initiativeId1],
      simulationCount: 1000,
    });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });
});

// =============================================================================
// Mode B: Empirical Forecast
// =============================================================================
describe('Mode B: Empirical Forecast', () => {
  const initiativeId1 = '00000000-0000-4000-8000-000000000010';
  const initiativeId2 = '00000000-0000-4000-8000-000000000020';

  function setupModeBMocks(opts?: {
    completedLogs?: Array<{ initiativeId: string; transitionedAt: Date }>;
    resourcingLogs?: Array<{ initiativeId: string; transitionedAt: Date }>;
    initiatives?: Array<{ id: string; title: string; status: string }>;
  }) {
    // Default: 15 completed initiatives with cycle times of 30-120 days
    const defaultCompletedLogs = opts?.completedLogs || Array.from({ length: 15 }, (_, i) => ({
      initiativeId: `00000000-0000-4000-8000-00000000c${String(i).padStart(3, '0')}`,
      transitionedAt: new Date(`2024-${String(Math.min(12, 3 + Math.floor(i * 0.8))).padStart(2, '0')}-15`),
    }));

    const defaultResourcingLogs = opts?.resourcingLogs || Array.from({ length: 15 }, (_, i) => ({
      initiativeId: `00000000-0000-4000-8000-00000000c${String(i).padStart(3, '0')}`,
      transitionedAt: new Date(`2024-01-${String(Math.min(28, 1 + i)).padStart(2, '0')}`),
    }));

    const defaultInitiatives = opts?.initiatives || [
      { id: initiativeId1, title: 'In-Progress Alpha', status: 'IN_EXECUTION' },
    ];

    // Mock initiativeStatusLog.findMany to return different results based on where clause
    mockPrisma.initiativeStatusLog.findMany.mockImplementation(async (args: any) => {
      if (args?.where?.toStatus === 'COMPLETE') {
        return defaultCompletedLogs;
      }
      if (args?.where?.toStatus === 'RESOURCING') {
        // Check if this is for completed initiatives or in-progress ones
        const ids = args?.where?.initiativeId?.in || [];
        if (ids.some((id: string) => id.startsWith('00000000-0000-4000-8000-00000000c'))) {
          return defaultResourcingLogs;
        }
        // For in-progress initiatives
        return [{
          initiativeId: initiativeId1,
          transitionedAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000), // 45 days ago
        }];
      }
      return [];
    });

    mockPrisma.initiative.findMany.mockResolvedValue(defaultInitiatives);
    mockPrisma.forecastRun.create.mockResolvedValue({ id: 'run-b-1' });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns correct structure with mode EMPIRICAL', async () => {
    setupModeBMocks();
    const result = await runEmpiricalForecast({
      initiativeIds: [initiativeId1],
      simulationCount: 100,
    });

    expect(result.mode).toBe('EMPIRICAL');
    expect(result.simulationCount).toBe(100);
    expect(result.historicalDataPoints).toBeGreaterThan(0);
    expect(result.initiativeForecasts).toHaveLength(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('sets lowConfidence when < 10 historical data points', async () => {
    setupModeBMocks({
      completedLogs: [
        { initiativeId: '00000000-0000-4000-8000-00000000c000', transitionedAt: new Date('2024-06-01') },
        { initiativeId: '00000000-0000-4000-8000-00000000c001', transitionedAt: new Date('2024-07-01') },
        { initiativeId: '00000000-0000-4000-8000-00000000c002', transitionedAt: new Date('2024-08-01') },
      ],
      resourcingLogs: [
        { initiativeId: '00000000-0000-4000-8000-00000000c000', transitionedAt: new Date('2024-03-01') },
        { initiativeId: '00000000-0000-4000-8000-00000000c001', transitionedAt: new Date('2024-04-01') },
        { initiativeId: '00000000-0000-4000-8000-00000000c002', transitionedAt: new Date('2024-05-01') },
      ],
    });

    const result = await runEmpiricalForecast({
      initiativeIds: [initiativeId1],
      simulationCount: 100,
    });

    expect(result.lowConfidence).toBe(true);
    expect(result.warnings.some(w => w.includes('Low confidence'))).toBe(true);
    expect(result.historicalDataPoints).toBe(3);
  });

  it('warns when no historical data available', async () => {
    setupModeBMocks({
      completedLogs: [],
      resourcingLogs: [],
    });

    const result = await runEmpiricalForecast({
      initiativeIds: [initiativeId1],
      simulationCount: 100,
    });

    expect(result.lowConfidence).toBe(true);
    expect(result.historicalDataPoints).toBe(0);
    expect(result.warnings.some(w => w.includes('No historical cycle time data'))).toBe(true);
    // Percentiles should be 0 when no data
    expect(result.initiativeForecasts[0].percentiles.every(p => p.value === 0)).toBe(true);
  });

  it('computes elapsed days for in-progress initiatives', async () => {
    setupModeBMocks();
    const result = await runEmpiricalForecast({
      initiativeIds: [initiativeId1],
      simulationCount: 100,
    });

    const forecast = result.initiativeForecasts[0];
    // Should have elapsed days close to 45 (mocked 45 days ago)
    expect(forecast.elapsedDays).toBeGreaterThan(40);
    expect(forecast.elapsedDays).toBeLessThan(50);
  });

  it('computes percentiles for total and remaining days', async () => {
    setupModeBMocks();
    const result = await runEmpiricalForecast({
      initiativeIds: [initiativeId1],
      simulationCount: 500,
      confidenceLevels: [50, 75, 85, 95],
    });

    const forecast = result.initiativeForecasts[0];
    expect(forecast.percentiles).toHaveLength(4);
    expect(forecast.estimatedCompletionDays).toHaveLength(4);
    expect(forecast.percentiles.map(p => p.level)).toEqual([50, 75, 85, 95]);

    // Percentile values should be non-decreasing
    for (let i = 1; i < forecast.percentiles.length; i++) {
      expect(forecast.percentiles[i].value)
        .toBeGreaterThanOrEqual(forecast.percentiles[i - 1].value);
    }

    // Remaining days should be non-negative
    for (const p of forecast.estimatedCompletionDays) {
      expect(p.value).toBeGreaterThanOrEqual(0);
    }
  });

  it('persists ForecastRun with EMPIRICAL mode and data quality', async () => {
    setupModeBMocks();
    await runEmpiricalForecast({
      initiativeIds: [initiativeId1],
      simulationCount: 100,
    });

    expect(mockPrisma.forecastRun.create).toHaveBeenCalledTimes(1);
    const createCall = mockPrisma.forecastRun.create.mock.calls[0][0];
    expect(createCall.data.mode).toBe('EMPIRICAL');
    expect(createCall.data.scenarioId).toBeNull();
    expect(createCall.data.dataQuality).toBeDefined();
    expect(createCall.data.dataQuality.score).toBeGreaterThan(0);
  });

  it('warns about initiatives with no RESOURCING transition', async () => {
    // Mock no resourcing logs for in-progress initiatives
    mockPrisma.initiativeStatusLog.findMany.mockImplementation(async (args: any) => {
      if (args?.where?.toStatus === 'COMPLETE') {
        return Array.from({ length: 15 }, (_, i) => ({
          initiativeId: `00000000-0000-4000-8000-00000000c${String(i).padStart(3, '0')}`,
          transitionedAt: new Date(`2024-${String(Math.min(12, 3 + Math.floor(i * 0.8))).padStart(2, '0')}-15`),
        }));
      }
      if (args?.where?.toStatus === 'RESOURCING') {
        const ids = args?.where?.initiativeId?.in || [];
        if (ids.some((id: string) => id.startsWith('00000000-0000-4000-8000-00000000c'))) {
          return Array.from({ length: 15 }, (_, i) => ({
            initiativeId: `00000000-0000-4000-8000-00000000c${String(i).padStart(3, '0')}`,
            transitionedAt: new Date(`2024-01-${String(Math.min(28, 1 + i)).padStart(2, '0')}`),
          }));
        }
        return []; // No resourcing for in-progress initiatives
      }
      return [];
    });
    mockPrisma.initiative.findMany.mockResolvedValue([
      { id: initiativeId1, title: 'No Resourcing Init', status: 'PROPOSED' },
    ]);
    mockPrisma.forecastRun.create.mockResolvedValue({ id: 'run-b-2' });

    const result = await runEmpiricalForecast({
      initiativeIds: [initiativeId1],
      simulationCount: 100,
    });

    expect(result.warnings.some(w => w.includes('no RESOURCING transition'))).toBe(true);
  });

  it('completes N=1000 simulation in under 5 seconds', async () => {
    setupModeBMocks();
    const start = performance.now();
    await runEmpiricalForecast({
      initiativeIds: [initiativeId1],
      simulationCount: 1000,
    });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });
});

// =============================================================================
// Data Quality Assessment
// =============================================================================
describe('Data Quality Assessment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupDataQualityMocks(opts: {
    scopeItems?: Array<{
      id: string;
      estimateP50: number | null;
      estimateP90: number | null;
      periodDistributions: Array<{ periodId: string }>;
    }>;
    completedInitiativeCount?: number;
    allocations?: Array<{ initiativeId: string }>;
  }) {
    mockPrisma.scopeItem.findMany.mockResolvedValue(opts.scopeItems || []);
    mockPrisma.allocation.findMany.mockResolvedValue(opts.allocations || []);

    const completedCount = opts.completedInitiativeCount ?? 0;
    mockPrisma.initiativeStatusLog.findMany.mockResolvedValue(
      Array.from({ length: completedCount }, (_, i) => ({
        initiativeId: `00000000-0000-4000-8000-00000000d${String(i).padStart(3, '0')}`,
      }))
    );
  }

  it('returns perfect score when all data is present and sufficient history', async () => {
    setupDataQualityMocks({
      scopeItems: [
        { id: 'si-1', estimateP50: 100, estimateP90: 150, periodDistributions: [{ periodId: 'p1' }] },
        { id: 'si-2', estimateP50: 200, estimateP90: 300, periodDistributions: [{ periodId: 'p1' }, { periodId: 'p2' }] },
      ],
      completedInitiativeCount: 15,
    });

    const result = await assessDataQuality({ initiativeIds: ['init-1'] });

    expect(result.score).toBe(100);
    expect(result.confidence).toBe('good');
    expect(result.issues).toHaveLength(0);
    expect(result.details.totalScopeItems).toBe(2);
    expect(result.details.scopeItemsWithEstimates).toBe(2);
    expect(result.details.estimateCoverage).toBe(1);
    expect(result.details.scopeItemsWithDistributions).toBe(2);
    expect(result.details.distributionCoverage).toBe(1);
    expect(result.details.historicalCompletions).toBe(15);
    expect(result.details.modeBViable).toBe(true);
  });

  it('returns low score when no scope items and no history', async () => {
    setupDataQualityMocks({
      scopeItems: [],
      completedInitiativeCount: 0,
    });

    const result = await assessDataQuality({ initiativeIds: ['init-1'] });

    expect(result.score).toBe(0);
    expect(result.confidence).toBe('low');
    expect(result.issues).toContain('No scope items found');
    expect(result.issues.some(i => i.includes('historical completions'))).toBe(true);
    expect(result.details.modeBViable).toBe(false);
  });

  it('reports partial estimate coverage', async () => {
    setupDataQualityMocks({
      scopeItems: [
        { id: 'si-1', estimateP50: 100, estimateP90: 150, periodDistributions: [{ periodId: 'p1' }] },
        { id: 'si-2', estimateP50: null, estimateP90: null, periodDistributions: [{ periodId: 'p1' }] },
        { id: 'si-3', estimateP50: null, estimateP90: null, periodDistributions: [{ periodId: 'p1' }] },
        { id: 'si-4', estimateP50: 50, estimateP90: 80, periodDistributions: [{ periodId: 'p1' }] },
      ],
      completedInitiativeCount: 10,
    });

    const result = await assessDataQuality({ initiativeIds: ['init-1'] });

    expect(result.details.estimateCoverage).toBe(0.5);
    expect(result.details.scopeItemsWithEstimates).toBe(2);
    expect(result.issues.some(i => i.includes('2 of 4 scope items missing P50/P90'))).toBe(true);
    // Score: 40*0.5 + 30*1.0 + 30*1.0 = 20 + 30 + 30 = 80
    expect(result.score).toBe(80);
    expect(result.confidence).toBe('good');
  });

  it('reports partial distribution coverage', async () => {
    setupDataQualityMocks({
      scopeItems: [
        { id: 'si-1', estimateP50: 100, estimateP90: 150, periodDistributions: [{ periodId: 'p1' }] },
        { id: 'si-2', estimateP50: 200, estimateP90: 300, periodDistributions: [] },
      ],
      completedInitiativeCount: 10,
    });

    const result = await assessDataQuality({ initiativeIds: ['init-1'] });

    expect(result.details.distributionCoverage).toBe(0.5);
    expect(result.issues.some(i => i.includes('1 of 2 scope items missing period distributions'))).toBe(true);
    // Score: 40*1.0 + 30*0.5 + 30*1.0 = 40 + 15 + 30 = 85
    expect(result.score).toBe(85);
  });

  it('flags low historical data and sets modeBViable false', async () => {
    setupDataQualityMocks({
      scopeItems: [
        { id: 'si-1', estimateP50: 100, estimateP90: 150, periodDistributions: [{ periodId: 'p1' }] },
      ],
      completedInitiativeCount: 5,
    });

    const result = await assessDataQuality({ initiativeIds: ['init-1'] });

    expect(result.details.modeBViable).toBe(false);
    expect(result.details.historicalCompletions).toBe(5);
    expect(result.issues.some(i => i.includes('Only 5 historical completions'))).toBe(true);
    // Score: 40*1.0 + 30*1.0 + 30*(5/10) = 40 + 30 + 15 = 85
    expect(result.score).toBe(85);
  });

  it('returns low confidence for very poor data', async () => {
    setupDataQualityMocks({
      scopeItems: [
        { id: 'si-1', estimateP50: 100, estimateP90: 150, periodDistributions: [] },
        { id: 'si-2', estimateP50: null, estimateP90: null, periodDistributions: [] },
      ],
      completedInitiativeCount: 3,
    });

    const result = await assessDataQuality({ initiativeIds: ['init-1'] });

    // Score: 40*0.5 + 30*0 + 30*(3/10) = 20 + 0 + 9 = 29
    expect(result.score).toBe(29);
    expect(result.confidence).toBe('low');
  });

  it('looks up initiatives via scenario allocations when only scenarioId given', async () => {
    setupDataQualityMocks({
      scopeItems: [
        { id: 'si-1', estimateP50: 100, estimateP90: 150, periodDistributions: [{ periodId: 'p1' }] },
      ],
      completedInitiativeCount: 10,
      allocations: [
        { initiativeId: 'init-from-scenario-1' },
        { initiativeId: 'init-from-scenario-2' },
      ],
    });

    const result = await assessDataQuality({ scenarioId: 'scenario-1' });

    expect(mockPrisma.allocation.findMany).toHaveBeenCalledWith({
      where: { scenarioId: 'scenario-1' },
      select: { initiativeId: true },
      distinct: ['initiativeId'],
    });
    expect(mockPrisma.scopeItem.findMany).toHaveBeenCalledWith({
      where: { initiativeId: { in: ['init-from-scenario-1', 'init-from-scenario-2'] } },
      select: {
        id: true,
        estimateP50: true,
        estimateP90: true,
        periodDistributions: { select: { periodId: true } },
      },
    });
    expect(result.score).toBe(100);
  });

  it('queries all scope items when neither scenarioId nor initiativeIds given', async () => {
    setupDataQualityMocks({
      scopeItems: [
        { id: 'si-1', estimateP50: 100, estimateP90: 150, periodDistributions: [{ periodId: 'p1' }] },
      ],
      completedInitiativeCount: 10,
    });

    await assessDataQuality({});

    expect(mockPrisma.scopeItem.findMany).toHaveBeenCalledWith({
      where: {},
      select: {
        id: true,
        estimateP50: true,
        estimateP90: true,
        periodDistributions: { select: { periodId: true } },
      },
    });
  });

  it('computes moderate confidence at score boundary', async () => {
    setupDataQualityMocks({
      scopeItems: [
        { id: 'si-1', estimateP50: 100, estimateP90: 150, periodDistributions: [] },
        { id: 'si-2', estimateP50: null, estimateP90: null, periodDistributions: [{ periodId: 'p1' }] },
        ...Array.from({ length: 8 }, (_, i) => ({
          id: `si-${i + 3}`,
          estimateP50: i < 4 ? 100 : null as number | null,
          estimateP90: i < 4 ? 150 : null as number | null,
          periodDistributions: [] as Array<{ periodId: string }>,
        })),
      ],
      completedInitiativeCount: 3,
    });

    const result = await assessDataQuality({ initiativeIds: ['init-1'] });

    // 5/10 with estimates, 1/10 with distributions, 3 historical
    // 40*0.5 + 30*0.1 + 30*0.3 = 20 + 3 + 9 = 32
    expect(result.score).toBe(32);
    expect(result.confidence).toBe('moderate');
  });
});
