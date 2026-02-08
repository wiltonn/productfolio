import { prisma } from '../lib/prisma.js';
import { NotFoundError, WorkflowError } from '../lib/errors.js';
import type { SkillDemand, PriorityRanking } from '../types/index.js';

export interface DerivedDemandEntry {
  initiativeId: string;
  skillPoolId: string;
  skillPoolName: string;
  tokensP50: number;
  tokensP90: number | null;
}

export interface DeriveTokenDemandResult {
  derivedDemands: DerivedDemandEntry[];
  warnings: string[];
}

export async function deriveTokenDemand(
  scenarioId: string,
  initiativeId?: string
): Promise<DeriveTokenDemandResult> {
  const warnings: string[] = [];

  // 1. Load and validate scenario
  const scenario = await prisma.scenario.findUnique({
    where: { id: scenarioId },
  });
  if (!scenario) {
    throw new NotFoundError('Scenario', scenarioId);
  }
  if (scenario.planningMode !== 'TOKEN') {
    throw new WorkflowError(
      'Derive token demand is only available for scenarios using TOKEN planning mode',
      scenario.planningMode
    );
  }

  // 2. Load scope items
  let scopeItems;
  if (initiativeId) {
    scopeItems = await prisma.scopeItem.findMany({
      where: { initiativeId },
    });
  } else {
    const rankings = (scenario.priorityRankings as PriorityRanking[] | null) ?? [];
    const initiativeIds = rankings.map((r) => r.initiativeId);
    if (initiativeIds.length === 0) {
      warnings.push('Scenario has no priority rankings — no initiatives to derive demand for');
      return { derivedDemands: [], warnings };
    }
    scopeItems = await prisma.scopeItem.findMany({
      where: { initiativeId: { in: initiativeIds } },
    });
  }

  if (scopeItems.length === 0) {
    return { derivedDemands: [], warnings };
  }

  // 3. Load active skill pools, keyed by lowercase name
  const skillPools = await prisma.skillPool.findMany({
    where: { isActive: true },
  });
  const poolByName = new Map<string, { id: string; name: string }>();
  for (const pool of skillPools) {
    poolByName.set(pool.name.toLowerCase(), { id: pool.id, name: pool.name });
  }

  // 4. Load calibrations — pick most recent effectiveDate <= now per pool
  const now = new Date();
  const calibrations = await prisma.tokenCalibration.findMany({
    where: {
      skillPool: { isActive: true },
      effectiveDate: { lte: now },
    },
    orderBy: { effectiveDate: 'desc' },
  });
  const calibrationMap = new Map<string, number>();
  for (const cal of calibrations) {
    // First seen (ordered desc) is the most recent
    if (!calibrationMap.has(cal.skillPoolId)) {
      calibrationMap.set(cal.skillPoolId, cal.tokenPerHour);
    }
  }

  // 5. Process scope items
  // Aggregate key: `${initiativeId}:${skillPoolId}`
  const aggregateP50 = new Map<string, number>();
  const aggregateP90 = new Map<string, number | null>();
  const aggregateInfo = new Map<string, { initiativeId: string; skillPoolId: string; skillPoolName: string }>();

  const warnedMissingPools = new Set<string>();
  const warnedMissingCalibrations = new Set<string>();

  for (const item of scopeItems) {
    const demand = item.skillDemand as SkillDemand | null;
    if (!demand || Object.keys(demand).length === 0) continue;

    for (const [skill, demandHours] of Object.entries(demand)) {
      const pool = poolByName.get(skill.toLowerCase());
      if (!pool) {
        const warnKey = `${skill}:${item.name}`;
        if (!warnedMissingPools.has(warnKey)) {
          warnedMissingPools.add(warnKey);
          warnings.push(`Skill "${skill}" on scope item "${item.name}" does not match any active skill pool`);
        }
        continue;
      }

      // Get calibration rate
      let tokenPerHour = calibrationMap.get(pool.id);
      if (tokenPerHour === undefined) {
        tokenPerHour = 1.0;
        if (!warnedMissingCalibrations.has(pool.id)) {
          warnedMissingCalibrations.add(pool.id);
          warnings.push(`No calibration for pool "${pool.name}" — using 1:1 token-to-hour fallback`);
        }
      }

      const hours = demandHours as number;
      const tokensP50 = hours * tokenPerHour;

      // P90: scale using item-level estimate ratio if available
      let tokensP90: number | null = null;
      if (item.estimateP50 && item.estimateP50 > 0 && item.estimateP90 !== null && item.estimateP90 !== undefined) {
        tokensP90 = hours * (item.estimateP90 / item.estimateP50) * tokenPerHour;
      }

      // Aggregate
      const key = `${item.initiativeId}:${pool.id}`;
      aggregateP50.set(key, (aggregateP50.get(key) ?? 0) + tokensP50);

      if (!aggregateInfo.has(key)) {
        aggregateInfo.set(key, { initiativeId: item.initiativeId, skillPoolId: pool.id, skillPoolName: pool.name });
        aggregateP90.set(key, tokensP90);
      } else {
        const currentP90 = aggregateP90.get(key);
        if (currentP90 === null || tokensP90 === null) {
          aggregateP90.set(key, null);
        } else {
          aggregateP90.set(key, (currentP90 ?? 0) + tokensP90);
        }
      }
    }
  }

  // 6. Build result
  const derivedDemands: DerivedDemandEntry[] = [];
  for (const [key, info] of aggregateInfo) {
    derivedDemands.push({
      initiativeId: info.initiativeId,
      skillPoolId: info.skillPoolId,
      skillPoolName: info.skillPoolName,
      tokensP50: aggregateP50.get(key) ?? 0,
      tokensP90: aggregateP90.get(key) ?? null,
    });
  }

  return { derivedDemands, warnings };
}
