import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';
import { isEnabled } from './feature-flag.service.js';
import type {
  RollupResponse,
  RollupGroupRow,
  RollupScope,
  RollupBudget,
  RollupTimeline,
  RollupLens,
} from '../types/rollup.types.js';

// ============================================================================
// Internal types for loaded data
// ============================================================================

interface ScenarioBundle {
  scenario: {
    id: string;
    name: string;
    planningMode: string;
    period: { id: string; label: string; startDate: Date; endDate: Date };
  };
  allocations: LoadedAllocation[];
}

interface LoadedAllocation {
  id: string;
  scenarioId: string;
  employeeId: string;
  initiativeId: string | null;
  startDate: Date;
  endDate: Date;
  percentage: number;
  employee: {
    id: string;
    name: string;
    jobProfile: { costBand: { hourlyRate: number | null } | null } | null;
    orgMemberships: Array<{
      orgNodeId: string;
      effectiveStart: Date;
      effectiveEnd: Date | null;
    }>;
    orgUnitLinks: Array<{
      orgNodeId: string;
      relationshipType: string;
      startDate: Date;
      endDate: Date | null;
    }>;
  };
  initiative: {
    id: string;
    title: string;
    portfolioAreaId: string | null;
    portfolioArea: { id: string; name: string } | null;
    businessOwnerId: string;
    businessOwner: { id: string; name: string };
  } | null;
  allocationPeriods: Array<{
    periodId: string;
    hoursInPeriod: number;
    period: { id: string; startDate: Date; endDate: Date };
  }>;
}

interface TokenDemandEntry {
  initiativeId: string;
  skillPoolId: string;
  skillPoolName: string;
  tokensP50: number;
  tokensP90: number | null;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Compute the fractional overlap between a membership range and a period range.
 * Returns a value between 0.0 and 1.0.
 */
export function computeOverlapRatio(
  memberStart: Date,
  memberEnd: Date | null,
  periodStart: Date,
  periodEnd: Date
): number {
  const effectiveEnd = memberEnd ?? periodEnd;
  const overlapStart = memberStart > periodStart ? memberStart : periodStart;
  const overlapEnd = effectiveEnd < periodEnd ? effectiveEnd : periodEnd;

  const overlapMs = overlapEnd.getTime() - overlapStart.getTime();
  if (overlapMs <= 0) return 0;

  const totalMs = periodEnd.getTime() - periodStart.getTime();
  if (totalMs <= 0) return 0;

  return Math.min(1, Math.max(0, overlapMs / totalMs));
}

function emptyBudget(): RollupBudget {
  return {
    totalHours: 0,
    totalEstimatedCost: 0,
    costCoverage: {
      hoursWithCostBand: 0,
      hoursWithoutCostBand: 0,
      employeesWithCostBand: 0,
      employeesWithoutCostBand: 0,
    },
  };
}

function emptyTimeline(): RollupTimeline {
  return {
    earliestStart: null,
    latestEnd: null,
    periodCount: 0,
    totalAllocatedHours: 0,
  };
}

function emptyGroup(id: string, name: string): RollupGroupRow {
  return {
    groupId: id,
    groupName: name,
    initiativeCount: 0,
    initiativeIds: [],
    scope: null,
    budget: emptyBudget(),
    timeline: emptyTimeline(),
  };
}

// ============================================================================
// Service
// ============================================================================

class RollupService {
  // --------------------------------------------------------------------------
  // Public lens methods
  // --------------------------------------------------------------------------

  async rollupByPortfolioArea(scenarioId: string): Promise<RollupResponse> {
    const bundle = await this.loadScenarioBundle(scenarioId);
    const demands = await this.loadTokenDemands(scenarioId);
    const { scenario, allocations } = bundle;
    const warnings: string[] = [];

    // Group allocations by initiative's portfolioAreaId
    const groupMap = new Map<string, { name: string; initiativeIds: Set<string>; allocations: LoadedAllocation[] }>();
    const unattributed: { initiativeIds: Set<string>; allocations: LoadedAllocation[] } = {
      initiativeIds: new Set(),
      allocations: [],
    };

    for (const alloc of allocations) {
      if (!alloc.initiative) {
        unattributed.allocations.push(alloc);
        continue;
      }

      const paId = alloc.initiative.portfolioAreaId;
      const paName = alloc.initiative.portfolioArea?.name ?? 'Unknown';

      if (!paId) {
        unattributed.initiativeIds.add(alloc.initiative.id);
        unattributed.allocations.push(alloc);
      } else {
        if (!groupMap.has(paId)) {
          groupMap.set(paId, { name: paName, initiativeIds: new Set(), allocations: [] });
        }
        const g = groupMap.get(paId)!;
        g.initiativeIds.add(alloc.initiative.id);
        g.allocations.push(alloc);
      }
    }

    const groups = this.buildGroups(groupMap, demands, scenario.planningMode);
    const unattributedRow = this.buildGroupRow(
      'unattributed',
      'Unattributed',
      [...unattributed.initiativeIds],
      unattributed.allocations,
      demands,
      scenario.planningMode
    );

    return this.buildResponse(scenario, 'PORTFOLIO_AREA', groups, unattributedRow, demands, warnings);
  }

  async rollupByBusinessOwner(scenarioId: string): Promise<RollupResponse> {
    const bundle = await this.loadScenarioBundle(scenarioId);
    const demands = await this.loadTokenDemands(scenarioId);
    const { scenario, allocations } = bundle;
    const warnings: string[] = [];

    const groupMap = new Map<string, { name: string; initiativeIds: Set<string>; allocations: LoadedAllocation[] }>();
    const unattributed: { initiativeIds: Set<string>; allocations: LoadedAllocation[] } = {
      initiativeIds: new Set(),
      allocations: [],
    };

    for (const alloc of allocations) {
      if (!alloc.initiative) {
        unattributed.allocations.push(alloc);
        continue;
      }

      const ownerId = alloc.initiative.businessOwnerId;
      const ownerName = alloc.initiative.businessOwner?.name ?? 'Unknown';

      if (!groupMap.has(ownerId)) {
        groupMap.set(ownerId, { name: ownerName, initiativeIds: new Set(), allocations: [] });
      }
      const g = groupMap.get(ownerId)!;
      g.initiativeIds.add(alloc.initiative.id);
      g.allocations.push(alloc);
    }

    const groups = this.buildGroups(groupMap, demands, scenario.planningMode);
    const unattributedRow = this.buildGroupRow(
      'unattributed',
      'Unattributed',
      [...unattributed.initiativeIds],
      unattributed.allocations,
      demands,
      scenario.planningMode
    );

    return this.buildResponse(scenario, 'BUSINESS_OWNER', groups, unattributedRow, demands, warnings);
  }

  async rollupByOrgNode(scenarioId: string): Promise<RollupResponse> {
    const bundle = await this.loadScenarioBundle(scenarioId);
    const demands = await this.loadTokenDemands(scenarioId);
    const { scenario, allocations } = bundle;
    const warnings: string[] = [];

    const useMatrixOrg = await isEnabled('matrix_org_v1');
    const periodStart = scenario.period.startDate;
    const periodEnd = scenario.period.endDate;

    // Load org node names for display
    const orgNodes = await prisma.orgNode.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });
    const orgNameMap = new Map(orgNodes.map((n) => [n.id, n.name]));

    // For each allocation, determine org node attribution with temporal overlap
    // Structure: orgNodeId → { initiativeIds, weighted allocations }
    const orgGroupMap = new Map<string, {
      name: string;
      initiativeIds: Set<string>;
      weightedHours: number;
      costWeightedHours: number;
      hoursWithCostBand: number;
      hoursWithoutCostBand: number;
      employeesWithCostBand: Set<string>;
      employeesWithoutCostBand: Set<string>;
      earliestStart: Date | null;
      latestEnd: Date | null;
      periodIds: Set<string>;
    }>();
    const unattributed: { initiativeIds: Set<string>; allocations: LoadedAllocation[] } = {
      initiativeIds: new Set(),
      allocations: [],
    };

    for (const alloc of allocations) {
      const hourlyRate = alloc.employee.jobProfile?.costBand?.hourlyRate ?? null;
      const totalHours = alloc.allocationPeriods.reduce((s, ap) => s + ap.hoursInPeriod, 0);

      // Get employee's org memberships during the period
      const memberships = useMatrixOrg
        ? alloc.employee.orgUnitLinks
            .filter((l) => l.relationshipType === 'PRIMARY_REPORTING')
            .map((l) => ({ orgNodeId: l.orgNodeId, start: l.startDate, end: l.endDate }))
        : alloc.employee.orgMemberships.map((m) => ({
            orgNodeId: m.orgNodeId,
            start: m.effectiveStart,
            end: m.effectiveEnd,
          }));

      if (memberships.length === 0) {
        // No org membership — unattributed
        if (alloc.initiative) {
          unattributed.initiativeIds.add(alloc.initiative.id);
        }
        unattributed.allocations.push(alloc);
        continue;
      }

      // Split hours proportionally across org memberships
      for (const mem of memberships) {
        const ratio = computeOverlapRatio(mem.start, mem.end, periodStart, periodEnd);
        if (ratio <= 0) continue;

        const attributedHours = totalHours * ratio;

        if (!orgGroupMap.has(mem.orgNodeId)) {
          orgGroupMap.set(mem.orgNodeId, {
            name: orgNameMap.get(mem.orgNodeId) ?? 'Unknown',
            initiativeIds: new Set(),
            weightedHours: 0,
            costWeightedHours: 0,
            hoursWithCostBand: 0,
            hoursWithoutCostBand: 0,
            employeesWithCostBand: new Set(),
            employeesWithoutCostBand: new Set(),
            earliestStart: null,
            latestEnd: null,
            periodIds: new Set(),
          });
        }

        const g = orgGroupMap.get(mem.orgNodeId)!;
        if (alloc.initiative) {
          g.initiativeIds.add(alloc.initiative.id);
        }
        g.weightedHours += attributedHours;

        if (hourlyRate !== null) {
          g.costWeightedHours += attributedHours * hourlyRate;
          g.hoursWithCostBand += attributedHours;
          g.employeesWithCostBand.add(alloc.employeeId);
        } else {
          g.hoursWithoutCostBand += attributedHours;
          g.employeesWithoutCostBand.add(alloc.employeeId);
        }

        // Timeline
        const allocStart = alloc.startDate;
        const allocEnd = alloc.endDate;
        if (!g.earliestStart || allocStart < g.earliestStart) g.earliestStart = allocStart;
        if (!g.latestEnd || allocEnd > g.latestEnd) g.latestEnd = allocEnd;
        for (const ap of alloc.allocationPeriods) {
          g.periodIds.add(ap.periodId);
        }
      }
    }

    // Build groups from orgGroupMap
    const groups: RollupGroupRow[] = [];
    for (const [orgNodeId, g] of orgGroupMap) {
      const initiativeIds = [...g.initiativeIds];
      groups.push({
        groupId: orgNodeId,
        groupName: g.name,
        initiativeCount: initiativeIds.length,
        initiativeIds,
        scope: this.buildScope(initiativeIds, demands, scenario.planningMode),
        budget: {
          totalHours: g.weightedHours,
          totalEstimatedCost: g.costWeightedHours,
          costCoverage: {
            hoursWithCostBand: g.hoursWithCostBand,
            hoursWithoutCostBand: g.hoursWithoutCostBand,
            employeesWithCostBand: g.employeesWithCostBand.size,
            employeesWithoutCostBand: g.employeesWithoutCostBand.size,
          },
        },
        timeline: {
          earliestStart: g.earliestStart?.toISOString() ?? null,
          latestEnd: g.latestEnd?.toISOString() ?? null,
          periodCount: g.periodIds.size,
          totalAllocatedHours: g.weightedHours,
        },
      });
    }

    groups.sort((a, b) => b.budget.totalHours - a.budget.totalHours);

    const unattributedRow = this.buildGroupRow(
      'unattributed',
      'Unattributed',
      [...unattributed.initiativeIds],
      unattributed.allocations,
      demands,
      scenario.planningMode
    );

    return this.buildResponse(scenario, 'ORG_NODE', groups, unattributedRow, demands, warnings);
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private async loadScenarioBundle(scenarioId: string): Promise<ScenarioBundle> {
    const scenario = await prisma.scenario.findUnique({
      where: { id: scenarioId },
      include: {
        period: true,
        allocations: {
          include: {
            employee: {
              include: {
                jobProfile: { include: { costBand: true } },
                orgMemberships: true,
                orgUnitLinks: true,
              },
            },
            initiative: {
              include: {
                portfolioArea: true,
                businessOwner: true,
              },
            },
            allocationPeriods: { include: { period: true } },
          },
        },
      },
    });

    if (!scenario) {
      throw new NotFoundError('Scenario', scenarioId);
    }

    return {
      scenario: {
        id: scenario.id,
        name: scenario.name,
        planningMode: scenario.planningMode,
        period: {
          id: scenario.period.id,
          label: scenario.period.label,
          startDate: scenario.period.startDate,
          endDate: scenario.period.endDate,
        },
      },
      allocations: scenario.allocations as unknown as LoadedAllocation[],
    };
  }

  private async loadTokenDemands(scenarioId: string): Promise<Map<string, TokenDemandEntry[]>> {
    const demands = await prisma.tokenDemand.findMany({
      where: { scenarioId },
      include: {
        skillPool: { select: { id: true, name: true } },
      },
    });

    const byInitiative = new Map<string, TokenDemandEntry[]>();
    for (const d of demands) {
      const entry: TokenDemandEntry = {
        initiativeId: d.initiativeId,
        skillPoolId: d.skillPoolId,
        skillPoolName: d.skillPool.name,
        tokensP50: d.tokensP50,
        tokensP90: d.tokensP90,
      };
      if (!byInitiative.has(d.initiativeId)) {
        byInitiative.set(d.initiativeId, []);
      }
      byInitiative.get(d.initiativeId)!.push(entry);
    }

    return byInitiative;
  }

  private buildScope(
    initiativeIds: string[],
    demands: Map<string, TokenDemandEntry[]>,
    planningMode: string
  ): RollupScope | null {
    if (planningMode !== 'TOKEN') return null;

    const poolMap = new Map<string, { name: string; p50: number; p90: number | null }>();

    for (const initId of initiativeIds) {
      const entries = demands.get(initId) ?? [];
      for (const entry of entries) {
        if (!poolMap.has(entry.skillPoolId)) {
          poolMap.set(entry.skillPoolId, {
            name: entry.skillPoolName,
            p50: 0,
            p90: entry.tokensP90 !== null ? 0 : null,
          });
        }
        const pool = poolMap.get(entry.skillPoolId)!;
        pool.p50 += entry.tokensP50;
        if (pool.p90 !== null && entry.tokensP90 !== null) {
          pool.p90 += entry.tokensP90;
        } else if (entry.tokensP90 === null) {
          pool.p90 = null;
        }
      }
    }

    let totalP50 = 0;
    let totalP90: number | null = 0;
    const bySkillPool: RollupScope['bySkillPool'] = [];

    for (const [poolId, pool] of poolMap) {
      totalP50 += pool.p50;
      if (totalP90 !== null && pool.p90 !== null) {
        totalP90 += pool.p90;
      } else {
        totalP90 = null;
      }
      bySkillPool.push({
        skillPoolId: poolId,
        skillPoolName: pool.name,
        tokensP50: pool.p50,
        tokensP90: pool.p90,
      });
    }

    return { totalTokensP50: totalP50, totalTokensP90: totalP90, bySkillPool };
  }

  private buildBudget(allocations: LoadedAllocation[]): RollupBudget {
    let totalHours = 0;
    let totalEstimatedCost = 0;
    let hoursWithCostBand = 0;
    let hoursWithoutCostBand = 0;
    const employeesWithCostBand = new Set<string>();
    const employeesWithoutCostBand = new Set<string>();

    for (const alloc of allocations) {
      const hours = alloc.allocationPeriods.reduce((s, ap) => s + ap.hoursInPeriod, 0);
      totalHours += hours;

      const hourlyRate = alloc.employee.jobProfile?.costBand?.hourlyRate ?? null;
      if (hourlyRate !== null) {
        totalEstimatedCost += hours * hourlyRate;
        hoursWithCostBand += hours;
        employeesWithCostBand.add(alloc.employeeId);
      } else {
        hoursWithoutCostBand += hours;
        employeesWithoutCostBand.add(alloc.employeeId);
      }
    }

    return {
      totalHours,
      totalEstimatedCost,
      costCoverage: {
        hoursWithCostBand,
        hoursWithoutCostBand,
        employeesWithCostBand: employeesWithCostBand.size,
        employeesWithoutCostBand: employeesWithoutCostBand.size,
      },
    };
  }

  private buildTimeline(allocations: LoadedAllocation[]): RollupTimeline {
    let earliestStart: Date | null = null;
    let latestEnd: Date | null = null;
    const periodIds = new Set<string>();
    let totalAllocatedHours = 0;

    for (const alloc of allocations) {
      if (!earliestStart || alloc.startDate < earliestStart) earliestStart = alloc.startDate;
      if (!latestEnd || alloc.endDate > latestEnd) latestEnd = alloc.endDate;

      for (const ap of alloc.allocationPeriods) {
        periodIds.add(ap.periodId);
        totalAllocatedHours += ap.hoursInPeriod;
      }
    }

    return {
      earliestStart: earliestStart?.toISOString() ?? null,
      latestEnd: latestEnd?.toISOString() ?? null,
      periodCount: periodIds.size,
      totalAllocatedHours,
    };
  }

  private buildGroupRow(
    groupId: string,
    groupName: string,
    initiativeIds: string[],
    allocations: LoadedAllocation[],
    demands: Map<string, TokenDemandEntry[]>,
    planningMode: string
  ): RollupGroupRow {
    return {
      groupId,
      groupName,
      initiativeCount: initiativeIds.length,
      initiativeIds,
      scope: this.buildScope(initiativeIds, demands, planningMode),
      budget: this.buildBudget(allocations),
      timeline: this.buildTimeline(allocations),
    };
  }

  private buildGroups(
    groupMap: Map<string, { name: string; initiativeIds: Set<string>; allocations: LoadedAllocation[] }>,
    demands: Map<string, TokenDemandEntry[]>,
    planningMode: string
  ): RollupGroupRow[] {
    const groups: RollupGroupRow[] = [];
    for (const [groupId, g] of groupMap) {
      groups.push(
        this.buildGroupRow(groupId, g.name, [...g.initiativeIds], g.allocations, demands, planningMode)
      );
    }
    groups.sort((a, b) => b.budget.totalHours - a.budget.totalHours);
    return groups;
  }

  private buildResponse(
    scenario: ScenarioBundle['scenario'],
    lens: RollupLens,
    groups: RollupGroupRow[],
    unattributed: RollupGroupRow,
    demands: Map<string, TokenDemandEntry[]>,
    warnings: string[]
  ): RollupResponse {
    // Compute totals across all groups + unattributed
    const allInitiativeIds = new Set<string>();
    const allBudgets: RollupBudget[] = [];
    const allTimelines: RollupTimeline[] = [];

    for (const g of [...groups, unattributed]) {
      for (const id of g.initiativeIds) allInitiativeIds.add(id);
      allBudgets.push(g.budget);
      allTimelines.push(g.timeline);
    }

    const totalBudget: RollupBudget = {
      totalHours: allBudgets.reduce((s, b) => s + b.totalHours, 0),
      totalEstimatedCost: allBudgets.reduce((s, b) => s + b.totalEstimatedCost, 0),
      costCoverage: {
        hoursWithCostBand: allBudgets.reduce((s, b) => s + b.costCoverage.hoursWithCostBand, 0),
        hoursWithoutCostBand: allBudgets.reduce((s, b) => s + b.costCoverage.hoursWithoutCostBand, 0),
        employeesWithCostBand: allBudgets.reduce((s, b) => s + b.costCoverage.employeesWithCostBand, 0),
        employeesWithoutCostBand: allBudgets.reduce((s, b) => s + b.costCoverage.employeesWithoutCostBand, 0),
      },
    };

    // Timeline totals: min of earliestStart, max of latestEnd
    let totalEarliestStart: string | null = null;
    let totalLatestEnd: string | null = null;
    let totalPeriodCount = 0;
    let totalAllocatedHours = 0;

    for (const t of allTimelines) {
      if (t.earliestStart && (!totalEarliestStart || t.earliestStart < totalEarliestStart)) {
        totalEarliestStart = t.earliestStart;
      }
      if (t.latestEnd && (!totalLatestEnd || t.latestEnd > totalLatestEnd)) {
        totalLatestEnd = t.latestEnd;
      }
      totalPeriodCount = Math.max(totalPeriodCount, t.periodCount);
      totalAllocatedHours += t.totalAllocatedHours;
    }

    const totalTimeline: RollupTimeline = {
      earliestStart: totalEarliestStart,
      latestEnd: totalLatestEnd,
      periodCount: totalPeriodCount,
      totalAllocatedHours,
    };

    const totalScope = this.buildScope(
      [...allInitiativeIds],
      demands,
      scenario.planningMode
    );

    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      planningMode: scenario.planningMode as 'LEGACY' | 'TOKEN',
      periodId: scenario.period.id,
      periodLabel: scenario.period.label,
      lens,
      groups,
      unattributed,
      totals: {
        scope: totalScope,
        budget: totalBudget,
        timeline: totalTimeline,
      },
      computedAt: new Date().toISOString(),
      warnings,
    };
  }
}

export const rollupService = new RollupService();
