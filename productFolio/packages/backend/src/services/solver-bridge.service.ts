/**
 * Solver Bridge Service
 *
 * Bridges the app's Prisma data model with the GovernanceEngine (L1–L4).
 * Loads token supply/demand from the DB, builds WorkItems + CapacityPlan,
 * and delegates capacity validation to the engine.
 */

import { InitiativeStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { GovernanceEngine } from '../engine/governance/index.js';
import type {
  WorkItem,
  CapacityPlan,
  GovernanceDecision,
  Violation,
  AlternativeSuggestion,
} from '../engine/governance/index.js';

// Statuses that require capacity validation before entering
const CAPACITY_GATED_STATUSES = new Set<InitiativeStatus>([
  InitiativeStatus.RESOURCING,
  InitiativeStatus.IN_EXECUTION,
]);

export interface CapacityCheckResult {
  /** Whether a capacity check was actually performed */
  checked: boolean;
  /** Whether the transition is approved */
  approved: boolean;
  /** Full governance decision (only when checked) */
  decision?: GovernanceDecision;
  /** Which scenario was checked */
  scenarioId?: string;
  /** Violations blocking the transition */
  violations?: Violation[];
  /** Suggested alternative if rejected */
  suggestion?: AlternativeSuggestion;
}

/**
 * Map InitiativeStatus to the GovernanceEngine's WorkItemStatus.
 */
function mapStatus(status: InitiativeStatus): WorkItem['status'] {
  switch (status) {
    case InitiativeStatus.PROPOSED:
    case InitiativeStatus.SCOPING:
      return 'PROPOSED';
    case InitiativeStatus.RESOURCING:
      return 'SCHEDULED';
    case InitiativeStatus.IN_EXECUTION:
      return 'IN_PROGRESS';
    case InitiativeStatus.COMPLETE:
    case InitiativeStatus.CANCELLED:
      return 'COMPLETE';
    case InitiativeStatus.ON_HOLD:
      return 'PROPOSED';
    default:
      return 'PROPOSED';
  }
}

/**
 * Check whether a status transition should be capacity-gated.
 */
export function requiresCapacityCheck(targetStatus: InitiativeStatus): boolean {
  return CAPACITY_GATED_STATUSES.has(targetStatus);
}

/**
 * Run the GovernanceEngine capacity check for an initiative status transition.
 *
 * Loads TOKEN-mode scenarios that have token demand for this initiative,
 * builds the engine, and validates the projected scenario.
 *
 * Returns { checked: false, approved: true } if no TOKEN scenarios apply
 * (backward-compatible — no capacity check performed).
 */
export async function checkTransitionCapacity(
  initiativeId: string,
  targetStatus: InitiativeStatus,
): Promise<CapacityCheckResult> {
  // Find all token demands for this initiative, grouped by scenario
  const tokenDemands = await prisma.tokenDemand.findMany({
    where: { initiativeId },
    include: {
      skillPool: { select: { id: true, name: true } },
    },
  });

  if (tokenDemands.length === 0) {
    return { checked: false, approved: true };
  }

  // Get distinct scenario IDs from token demands
  const scenarioIds = [...new Set(tokenDemands.map((td) => td.scenarioId))];

  // Load scenarios and filter to TOKEN mode
  const scenarios = await prisma.scenario.findMany({
    where: {
      id: { in: scenarioIds },
      planningMode: 'TOKEN',
    },
    select: { id: true },
  });

  if (scenarios.length === 0) {
    return { checked: false, approved: true };
  }

  // Check capacity against each TOKEN scenario — fail on first rejection
  for (const scenario of scenarios) {
    const result = await checkScenarioCapacity(
      scenario.id,
      initiativeId,
      targetStatus,
    );

    if (!result.approved) {
      return {
        checked: true,
        approved: false,
        decision: result,
        scenarioId: scenario.id,
        violations: result.violations,
        suggestion: result.alternativeSuggestions,
      };
    }
  }

  return { checked: true, approved: true };
}

/**
 * Build a GovernanceEngine for a specific scenario and check whether
 * transitioning the target initiative creates capacity violations.
 */
async function checkScenarioCapacity(
  scenarioId: string,
  initiativeId: string,
  targetStatus: InitiativeStatus,
): Promise<GovernanceDecision> {
  // Load all token supply for this scenario
  const supplies = await prisma.tokenSupply.findMany({
    where: { scenarioId },
    include: { skillPool: { select: { name: true } } },
  });

  // Load all token demand for this scenario
  const demands = await prisma.tokenDemand.findMany({
    where: { scenarioId },
    include: {
      skillPool: { select: { name: true } },
    },
  });

  // Load initiative titles for readable messages
  const initiativeIds = [...new Set(demands.map((d) => d.initiativeId))];
  const initiatives = await prisma.initiative.findMany({
    where: { id: { in: initiativeIds } },
    select: { id: true, title: true, status: true },
  });
  const initiativeMap = new Map(initiatives.map((i) => [i.id, i]));

  // Build CapacityPlan from token supplies
  // Single-period model: all supply is available in period 0
  const capacityBySkill: Record<string, number> = {};
  for (const supply of supplies) {
    const skillName = supply.skillPool.name;
    capacityBySkill[skillName] = (capacityBySkill[skillName] ?? 0) + supply.tokens;
  }

  const capacityPlan: CapacityPlan = {
    periods: 1,
    capacityBySkillPerPeriod: capacityBySkill,
  };

  // Build WorkItems from token demands, grouped by initiative
  const demandByInitiative = new Map<string, Record<string, number>>();
  for (const demand of demands) {
    const skillName = demand.skillPool.name;
    const existing = demandByInitiative.get(demand.initiativeId) ?? {};
    existing[skillName] = (existing[skillName] ?? 0) + demand.tokensP50;
    demandByInitiative.set(demand.initiativeId, existing);
  }

  const engine = new GovernanceEngine(capacityPlan);

  // Add all initiatives that are already in capacity-consuming states
  // (RESOURCING or IN_EXECUTION) as active demand
  for (const [initId, demandBySkill] of demandByInitiative) {
    const init = initiativeMap.get(initId);
    if (!init) continue;

    // Skip the target initiative — we'll add it separately with the new status
    if (initId === initiativeId) continue;

    // Only count initiatives that are currently consuming capacity
    const isConsuming =
      init.status === InitiativeStatus.RESOURCING ||
      init.status === InitiativeStatus.IN_EXECUTION;

    if (isConsuming) {
      const workItem: WorkItem = {
        id: initId,
        title: init.title,
        demandBySkill,
        priority: 1,
        dependencies: [],
        startPeriod: 0,
        duration: 1,
        status: mapStatus(init.status),
      };
      engine.addItem(workItem);
    }
  }

  // Add the target initiative with the projected new status
  const targetInit = initiativeMap.get(initiativeId);
  const targetDemand = demandByInitiative.get(initiativeId) ?? {};
  const targetWorkItem: WorkItem = {
    id: initiativeId,
    title: targetInit?.title ?? 'Unknown Initiative',
    demandBySkill: targetDemand,
    priority: 1,
    dependencies: [],
    startPeriod: 0,
    duration: 1,
    status: mapStatus(targetStatus),
  };
  engine.addItem(targetWorkItem);

  // Use requestTransition to validate — the item is already added with its
  // pre-transition state; now request the "new" state which triggers L2+L3
  // We pass the same demand but force the engine to validate the full scenario
  const decision = engine.requestTransition(initiativeId, {
    status: mapStatus(targetStatus),
  });

  return decision;
}
