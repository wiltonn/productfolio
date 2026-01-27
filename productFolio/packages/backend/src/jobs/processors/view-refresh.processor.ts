import { Job } from 'bullmq';
import { prisma } from '../../lib/prisma.js';
import { setCachedData, deleteKey, CACHE_TTL } from '../../lib/redis.js';
import type { ViewRefreshJobData } from '../queue.js';

// Cache keys for materialized views
const VIEW_CACHE_KEYS = {
  demandSummary: (scenarioId: string) => `view:demand:${scenarioId}`,
  capacitySummary: (scenarioId: string) => `view:capacity:${scenarioId}`,
  globalDemand: 'view:demand:global',
  globalCapacity: 'view:capacity:global',
};

interface DemandSummary {
  scenarioId: string;
  quarterSummaries: Array<{
    quarter: string;
    totalDemandHours: number;
    skillBreakdown: Record<string, number>;
    initiativeCount: number;
  }>;
  calculatedAt: string;
}

interface CapacitySummary {
  scenarioId: string;
  quarterSummaries: Array<{
    quarter: string;
    totalCapacityHours: number;
    skillBreakdown: Record<string, number>;
    employeeCount: number;
  }>;
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
    select: { id: true, name: true, quarterRange: true },
  });

  job.log(`Found ${scenarios.length} scenarios to process`);

  const totalSteps = scenarios.length * (viewType === 'all' ? 2 : 1);
  let currentStep = 0;

  for (const scenario of scenarios) {
    if (viewType === 'demand_summary' || viewType === 'all') {
      await refreshDemandSummary(scenario.id, scenario.quarterRange, job);
      currentStep++;
      await job.updateProgress(Math.round((currentStep / totalSteps) * 100));
    }

    if (viewType === 'capacity_summary' || viewType === 'all') {
      await refreshCapacitySummary(scenario.id, scenario.quarterRange, job);
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
  quarterRange: string,
  job: Job
): Promise<void> {
  job.log(`Refreshing demand summary for scenario ${scenarioId}`);

  const scenario = await prisma.scenario.findUnique({
    where: { id: scenarioId },
  });

  if (!scenario) return;

  const priorityRankings = (scenario.priorityRankings as Array<{ initiativeId: string }>) || [];
  const initiativeIds = priorityRankings.map((pr) => pr.initiativeId);

  // Get initiatives with scope items
  const initiatives = await prisma.initiative.findMany({
    where: { id: { in: initiativeIds } },
    include: { scopeItems: true },
  });

  // Parse quarter range
  const quarters = getQuartersInRange(quarterRange);

  // Aggregate demand by quarter
  const quarterSummaries = quarters.map((quarter) => {
    const skillBreakdown: Record<string, number> = {};
    let totalDemandHours = 0;

    for (const initiative of initiatives) {
      for (const scopeItem of initiative.scopeItems) {
        const skillDemand = (scopeItem.skillDemand as Record<string, number>) || {};
        const quarterDistribution = (scopeItem.quarterDistribution as Record<string, number>) || {};
        const distribution = quarterDistribution[quarter] || 0;

        for (const [skill, hours] of Object.entries(skillDemand)) {
          const hoursForQuarter = hours * distribution;
          skillBreakdown[skill] = (skillBreakdown[skill] || 0) + hoursForQuarter;
          totalDemandHours += hoursForQuarter;
        }
      }
    }

    return {
      quarter,
      totalDemandHours,
      skillBreakdown,
      initiativeCount: initiatives.length,
    };
  });

  const summary: DemandSummary = {
    scenarioId,
    quarterSummaries,
    calculatedAt: new Date().toISOString(),
  };

  // Store in cache with extended TTL (1 hour for materialized views)
  await setCachedData(VIEW_CACHE_KEYS.demandSummary(scenarioId), summary, 3600);
}

async function refreshCapacitySummary(
  scenarioId: string,
  quarterRange: string,
  job: Job
): Promise<void> {
  job.log(`Refreshing capacity summary for scenario ${scenarioId}`);

  // Get allocations with employee skills
  const allocations = await prisma.allocation.findMany({
    where: { scenarioId },
    include: {
      employee: {
        include: { skills: true },
      },
    },
  });

  const quarters = getQuartersInRange(quarterRange);

  // Aggregate capacity by quarter
  const quarterSummaries = quarters.map((quarter) => {
    const skillBreakdown: Record<string, number> = {};
    let totalCapacityHours = 0;
    const employeeIds = new Set<string>();

    const quarterDates = getQuarterDates(quarter);

    for (const allocation of allocations) {
      // Check if allocation overlaps with quarter
      const overlap = calculateDateOverlap(
        allocation.startDate,
        allocation.endDate,
        quarterDates.start,
        quarterDates.end
      );

      if (overlap === 0) continue;

      employeeIds.add(allocation.employeeId);

      // Base hours per quarter (520 = 40 hours/week * 13 weeks)
      const baseHours = 520 * (allocation.percentage / 100) * overlap;

      for (const skill of allocation.employee.skills) {
        const proficiencyMultiplier = skill.proficiency / 5;
        const effectiveHours = baseHours * proficiencyMultiplier;
        skillBreakdown[skill.name] = (skillBreakdown[skill.name] || 0) + effectiveHours;
        totalCapacityHours += effectiveHours;
      }
    }

    return {
      quarter,
      totalCapacityHours,
      skillBreakdown,
      employeeCount: employeeIds.size,
    };
  });

  const summary: CapacitySummary = {
    scenarioId,
    quarterSummaries,
    calculatedAt: new Date().toISOString(),
  };

  await setCachedData(VIEW_CACHE_KEYS.capacitySummary(scenarioId), summary, 3600);
}

async function refreshGlobalDemandSummary(job: Job): Promise<void> {
  job.log('Refreshing global demand summary');

  // Aggregate demand across all approved initiatives
  const initiatives = await prisma.initiative.findMany({
    where: { status: 'APPROVED' },
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

// Helper functions
function getQuartersInRange(quarterRange: string): string[] {
  const [startQuarter, endQuarter] = quarterRange.split(':');
  const quarters: string[] = [];

  const [startYear, startQ] = startQuarter.split('-Q');
  const [endYear, endQ] = endQuarter.split('-Q');

  let currentYear = parseInt(startYear, 10);
  let currentQ = parseInt(startQ, 10);
  const endYearNum = parseInt(endYear, 10);
  const endQNum = parseInt(endQ, 10);

  while (currentYear < endYearNum || (currentYear === endYearNum && currentQ <= endQNum)) {
    quarters.push(`${currentYear}-Q${currentQ}`);
    currentQ++;
    if (currentQ > 4) {
      currentQ = 1;
      currentYear++;
    }
  }

  return quarters;
}

function getQuarterDates(quarter: string): { start: Date; end: Date } {
  const [year, q] = quarter.split('-Q');
  const yearNum = parseInt(year, 10);
  const qNum = parseInt(q, 10);

  const startMonth = (qNum - 1) * 3;
  const endMonth = startMonth + 2;

  const start = new Date(yearNum, startMonth, 1);
  const end = new Date(yearNum, endMonth + 1, 0);

  return { start, end };
}

function calculateDateOverlap(
  allocStart: Date,
  allocEnd: Date,
  quarterStart: Date,
  quarterEnd: Date
): number {
  const overlapStart = new Date(Math.max(allocStart.getTime(), quarterStart.getTime()));
  const overlapEnd = new Date(Math.min(allocEnd.getTime(), quarterEnd.getTime()));

  if (overlapStart > overlapEnd) return 0;

  const overlapDays = (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24) + 1;
  const quarterDays = (quarterEnd.getTime() - quarterStart.getTime()) / (1000 * 60 * 60 * 24) + 1;

  return overlapDays / quarterDays;
}
