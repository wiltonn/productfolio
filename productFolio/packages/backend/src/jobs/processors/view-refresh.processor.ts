import { Job } from 'bullmq';
import { prisma } from '../../lib/prisma.js';
import { setCachedData } from '../../lib/redis.js';
import type { ViewRefreshJobData } from '../queue.js';

// Cache keys for materialized views
const VIEW_CACHE_KEYS = {
  demandSummary: (scenarioId: string) => `view:demand:${scenarioId}`,
  capacitySummary: (scenarioId: string) => `view:capacity:${scenarioId}`,
  globalDemand: 'view:demand:global',
  globalCapacity: 'view:capacity:global',
};

interface PeriodSummary {
  periodId: string;
  periodLabel: string;
  totalHours: number;
  skillBreakdown: Record<string, number>;
}

interface DemandSummary {
  scenarioId: string;
  periodSummaries: Array<PeriodSummary & { initiativeCount: number }>;
  calculatedAt: string;
}

interface CapacitySummary {
  scenarioId: string;
  periodSummaries: Array<PeriodSummary & { employeeCount: number }>;
  calculatedAt: string;
}

interface RefreshResult {
  viewType: string;
  scenariosProcessed: number;
  refreshedAt: string;
}

/**
 * Process materialized view refresh jobs
 *
 * This processor:
 * 1. Aggregates demand/capacity data across scenarios
 * 2. Stores pre-computed summaries in Redis
 * 3. Enables fast dashboard queries
 */
export async function processViewRefresh(
  job: Job<ViewRefreshJobData>
): Promise<RefreshResult> {
  const { viewType, scenarioIds, triggeredBy } = job.data;

  job.log(`Starting view refresh: ${viewType}`);
  job.log(`Triggered by: ${triggeredBy}`);

  let processedCount = 0;

  // Get scenarios to process
  const scenarios = await prisma.scenario.findMany({
    where: scenarioIds ? { id: { in: scenarioIds } } : undefined,
    select: {
      id: true,
      name: true,
      period: true,
    },
  });

  job.log(`Found ${scenarios.length} scenarios to process`);

  const totalSteps = scenarios.length * (viewType === 'all' ? 2 : 1);
  let currentStep = 0;

  for (const scenario of scenarios) {
    const periods = [scenario.period];

    if (viewType === 'demand_summary' || viewType === 'all') {
      await refreshDemandSummary(scenario.id, periods, job);
      currentStep++;
      await job.updateProgress(Math.round((currentStep / totalSteps) * 100));
    }

    if (viewType === 'capacity_summary' || viewType === 'all') {
      await refreshCapacitySummary(scenario.id, periods, job);
      currentStep++;
      await job.updateProgress(Math.round((currentStep / totalSteps) * 100));
    }

    processedCount++;
  }

  // Refresh global summaries if processing all or no specific scenarios
  if (!scenarioIds || scenarioIds.length === 0) {
    if (viewType === 'demand_summary' || viewType === 'all') {
      await refreshGlobalDemandSummary(job);
    }
    if (viewType === 'capacity_summary' || viewType === 'all') {
      await refreshGlobalCapacitySummary(job);
    }
  }

  job.log(`View refresh complete: processed ${processedCount} scenarios`);

  return {
    viewType,
    scenariosProcessed: processedCount,
    refreshedAt: new Date().toISOString(),
  };
}

async function refreshDemandSummary(
  scenarioId: string,
  periods: Array<{ id: string; label: string }>,
  job: Job
): Promise<void> {
  job.log(`Refreshing demand summary for scenario ${scenarioId}`);

  const scenario = await prisma.scenario.findUnique({
    where: { id: scenarioId },
  });

  if (!scenario) return;

  const priorityRankings = (scenario.priorityRankings as Array<{ initiativeId: string }>) || [];
  const initiativeIds = priorityRankings.map((pr) => pr.initiativeId);

  // Get initiatives with scope items and their period distributions
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

  // Aggregate demand by period
  const periodSummaries = periods.map((period) => {
    const skillBreakdown: Record<string, number> = {};
    let totalDemandHours = 0;

    for (const initiative of initiatives) {
      for (const scopeItem of initiative.scopeItems) {
        const skillDemand = (scopeItem.skillDemand as Record<string, number>) || {};
        const distribution =
          scopeItem.periodDistributions.find((pd) => pd.periodId === period.id)?.distribution || 0;

        for (const [skill, hours] of Object.entries(skillDemand)) {
          const hoursForPeriod = hours * distribution;
          skillBreakdown[skill] = (skillBreakdown[skill] || 0) + hoursForPeriod;
          totalDemandHours += hoursForPeriod;
        }
      }
    }

    return {
      periodId: period.id,
      periodLabel: period.label,
      totalHours: totalDemandHours,
      skillBreakdown,
      initiativeCount: initiatives.length,
    };
  });

  const summary: DemandSummary = {
    scenarioId,
    periodSummaries,
    calculatedAt: new Date().toISOString(),
  };

  // Store in cache with extended TTL (1 hour for materialized views)
  await setCachedData(VIEW_CACHE_KEYS.demandSummary(scenarioId), summary, 3600);
}

async function refreshCapacitySummary(
  scenarioId: string,
  periods: Array<{ id: string; label: string }>,
  job: Job
): Promise<void> {
  job.log(`Refreshing capacity summary for scenario ${scenarioId}`);

  // Get allocations with employee skills and allocation periods
  const allocations = await prisma.allocation.findMany({
    where: { scenarioId },
    include: {
      employee: {
        include: { skills: true },
      },
      allocationPeriods: true,
    },
  });

  // Aggregate capacity by period using AllocationPeriod junction
  const periodSummaries = periods.map((period) => {
    const skillBreakdown: Record<string, number> = {};
    let totalCapacityHours = 0;
    const employeeIds = new Set<string>();

    for (const allocation of allocations) {
      // Find the AllocationPeriod for this period
      const ap = allocation.allocationPeriods.find(
        (a) => a.periodId === period.id
      );
      if (!ap || ap.overlapRatio === 0) continue;

      employeeIds.add(allocation.employeeId);

      const baseHours = ap.hoursInPeriod;

      for (const skill of allocation.employee.skills) {
        const proficiencyMultiplier = skill.proficiency / 5;
        const effectiveHours = baseHours * proficiencyMultiplier;
        skillBreakdown[skill.name] = (skillBreakdown[skill.name] || 0) + effectiveHours;
        totalCapacityHours += effectiveHours;
      }
    }

    return {
      periodId: period.id,
      periodLabel: period.label,
      totalHours: totalCapacityHours,
      skillBreakdown,
      employeeCount: employeeIds.size,
    };
  });

  const summary: CapacitySummary = {
    scenarioId,
    periodSummaries,
    calculatedAt: new Date().toISOString(),
  };

  await setCachedData(VIEW_CACHE_KEYS.capacitySummary(scenarioId), summary, 3600);
}

async function refreshGlobalDemandSummary(job: Job): Promise<void> {
  job.log('Refreshing global demand summary');

  // Aggregate demand across all approved initiatives
  const initiatives = await prisma.initiative.findMany({
    where: { status: { in: ['RESOURCING', 'IN_EXECUTION'] } },
    include: { scopeItems: true },
  });

  const skillTotals: Record<string, number> = {};
  let totalHours = 0;

  for (const initiative of initiatives) {
    for (const scopeItem of initiative.scopeItems) {
      const skillDemand = (scopeItem.skillDemand as Record<string, number>) || {};
      for (const [skill, hours] of Object.entries(skillDemand)) {
        skillTotals[skill] = (skillTotals[skill] || 0) + hours;
        totalHours += hours;
      }
    }
  }

  const summary = {
    totalDemandHours: totalHours,
    skillBreakdown: skillTotals,
    initiativeCount: initiatives.length,
    calculatedAt: new Date().toISOString(),
  };

  await setCachedData(VIEW_CACHE_KEYS.globalDemand, summary, 3600);
}

async function refreshGlobalCapacitySummary(job: Job): Promise<void> {
  job.log('Refreshing global capacity summary');

  // Aggregate capacity across all employees
  const employees = await prisma.employee.findMany({
    include: { skills: true },
  });

  const skillTotals: Record<string, number> = {};
  let totalHours = 0;

  for (const employee of employees) {
    // Base hours per quarter
    const baseHours = employee.hoursPerWeek * 13;

    for (const skill of employee.skills) {
      const proficiencyMultiplier = skill.proficiency / 5;
      const effectiveHours = baseHours * proficiencyMultiplier;
      skillTotals[skill.name] = (skillTotals[skill.name] || 0) + effectiveHours;
      totalHours += effectiveHours;
    }
  }

  const summary = {
    totalCapacityHours: totalHours,
    skillBreakdown: skillTotals,
    employeeCount: employees.length,
    calculatedAt: new Date().toISOString(),
  };

  await setCachedData(VIEW_CACHE_KEYS.globalCapacity, summary, 3600);
}
