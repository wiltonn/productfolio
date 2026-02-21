/**
 * L2 Token-Based Scenario Projection Engine — TokenScenarioProjector
 *
 * Builds projected portfolio states by cloning token supply/demand and
 * applying initiative status transitions. The projector BUILDS scenarios;
 * it never decides feasibility — that's L3's job.
 *
 * Key design decisions:
 *   - All projections are in-memory (no DB writes)
 *   - Supply is cloned but never mutated (transitions affect demand only)
 *   - Only L4 governance decides whether to persist
 */

import type {
  InitiativeStatus,
  TokenSupplyEntry,
  TokenDemandEntry,
  ProjectedScenario,
  ProjectedLedgerEntry,
  StatusTransition,
  AppliedChange,
  ScenarioDataProvider,
  ScenarioValidator,
  WhatIfResult,
  InitiativeDemandSnapshot,
  ConstraintScenario,
  ConstraintTeam,
  ScheduledItem,
} from './token-types.js';

// ---------------------------------------------------------------------------
// Status categories — which statuses consume demand tokens
// ---------------------------------------------------------------------------

/** Statuses where an initiative's skill demand is "active" (consuming tokens) */
const DEMAND_ACTIVE_STATUSES: Set<InitiativeStatus> = new Set([
  'RESOURCING',
  'IN_EXECUTION',
]);

/** Statuses where an initiative's demand should be removed (completed/cancelled) */
const DEMAND_REMOVED_STATUSES: Set<InitiativeStatus> = new Set([
  'COMPLETE',
  'CANCELLED',
]);

// ---------------------------------------------------------------------------
// Default validator (no-op — always feasible)
// ---------------------------------------------------------------------------

const NO_OP_VALIDATOR: ScenarioValidator = {
  validate: () => ({
    feasible: true,
    violations: [],
    warnings: [],
    utilizationMap: [],
  }),
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class TokenScenarioProjector {
  private dataProvider: ScenarioDataProvider;
  private validator: ScenarioValidator;

  constructor(
    dataProvider: ScenarioDataProvider,
    validator?: ScenarioValidator,
  ) {
    this.dataProvider = dataProvider;
    this.validator = validator ?? NO_OP_VALIDATOR;
  }

  /**
   * Project a single initiative status transition.
   *
   * Clones the scenario's token state, then:
   *   - If targetStatus is RESOURCING/IN_EXECUTION: adds the initiative's
   *     skill demands to the cloned demand set
   *   - If targetStatus is COMPLETE/CANCELLED: removes the initiative's
   *     demands from the cloned set
   *   - Otherwise: no demand change (e.g. PROPOSED → SCOPING)
   */
  async projectTransition(
    scenarioId: string,
    initiativeId: string,
    targetStatus: InitiativeStatus,
  ): Promise<ProjectedScenario> {
    const [supply, demand, initiativeDemand] = await Promise.all([
      this.dataProvider.getTokenSupply(scenarioId),
      this.dataProvider.getTokenDemand(scenarioId),
      this.dataProvider.getInitiativeDemand(scenarioId, initiativeId),
    ]);

    const clonedSupply = cloneSupply(supply);
    let clonedDemand = cloneDemand(demand);

    const change = applyTransition(
      clonedDemand,
      initiativeId,
      targetStatus,
      initiativeDemand,
    );
    clonedDemand = change.demand;

    return buildProjectedScenario(
      scenarioId,
      clonedSupply,
      clonedDemand,
      [change.applied],
    );
  }

  /**
   * Project multiple initiative status changes onto a single scenario.
   *
   * Changes are applied in dependency order: if initiative B depends on A,
   * A's transition is applied before B's. The dependency ordering uses the
   * data provider to resolve initiative dependencies.
   */
  async projectPortfolio(
    scenarioId: string,
    changes: StatusTransition[],
  ): Promise<ProjectedScenario> {
    const [supply, demand] = await Promise.all([
      this.dataProvider.getTokenSupply(scenarioId),
      this.dataProvider.getTokenDemand(scenarioId),
    ]);

    // Resolve dependencies and sort changes
    const orderedChanges = await this.orderByDependencies(changes);

    const clonedSupply = cloneSupply(supply);
    let clonedDemand = cloneDemand(demand);
    const appliedChanges: AppliedChange[] = [];

    for (const change of orderedChanges) {
      const initiativeDemand = await this.dataProvider.getInitiativeDemand(
        scenarioId,
        change.initiativeId,
      );

      const result = applyTransition(
        clonedDemand,
        change.initiativeId,
        change.targetStatus,
        initiativeDemand,
      );
      clonedDemand = result.demand;
      appliedChanges.push(result.applied);
    }

    return buildProjectedScenario(
      scenarioId,
      clonedSupply,
      clonedDemand,
      appliedChanges,
    );
  }

  /**
   * What-if query: project changes, validate via L3, return both.
   *
   * This is the "what happens if we do X?" query. It:
   *   1. Builds the projected scenario
   *   2. Converts it to an L3 constraint scenario
   *   3. Validates via the injected ScenarioValidator
   *   4. Returns both the projection AND the validation result
   */
  async whatIf(
    scenarioId: string,
    hypothetical: StatusTransition[],
  ): Promise<WhatIfResult> {
    const projection = await this.projectPortfolio(scenarioId, hypothetical);

    const constraintScenario = toConstraintScenario(projection);
    const validation = this.validator.validate(constraintScenario);

    return {
      projection,
      validation,
      constraintScenario,
    };
  }

  // -------------------------------------------------------------------------
  // Internal: dependency-aware ordering
  // -------------------------------------------------------------------------

  private async orderByDependencies(
    changes: StatusTransition[],
  ): Promise<StatusTransition[]> {
    if (changes.length <= 1) return changes;

    // Build a dependency map for the initiatives being changed
    const changeMap = new Map(
      changes.map((c) => [c.initiativeId, c]),
    );

    const depMap = new Map<string, string[]>();
    for (const change of changes) {
      const deps = await this.dataProvider.getInitiativeDependencies(
        change.initiativeId,
      );
      // Only include dependencies that are also in this change set
      const relevantDeps = deps.filter((d) => changeMap.has(d));
      depMap.set(change.initiativeId, relevantDeps);
    }

    // Kahn's algorithm for topological sort
    const inDegree = new Map<string, number>();
    const forward = new Map<string, string[]>();

    for (const change of changes) {
      inDegree.set(change.initiativeId, 0);
      forward.set(change.initiativeId, []);
    }

    for (const [id, deps] of depMap) {
      inDegree.set(id, deps.length);
      for (const dep of deps) {
        forward.get(dep)!.push(id);
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }
    queue.sort(); // deterministic ordering

    const sorted: StatusTransition[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(changeMap.get(current)!);

      for (const neighbor of forward.get(current)!) {
        const newDeg = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) {
          // Insert sorted for determinism
          const idx = queue.findIndex((q) => q > neighbor);
          if (idx === -1) queue.push(neighbor);
          else queue.splice(idx, 0, neighbor);
        }
      }
    }

    // Append any items caught in cycles (shouldn't happen in healthy data)
    for (const change of changes) {
      if (!sorted.some((s) => s.initiativeId === change.initiativeId)) {
        sorted.push(change);
      }
    }

    return sorted;
  }
}

// ---------------------------------------------------------------------------
// Pure functions — cloning, mutation, ledger computation
// ---------------------------------------------------------------------------

function cloneSupply(supply: TokenSupplyEntry[]): TokenSupplyEntry[] {
  return supply.map((s) => ({ ...s }));
}

function cloneDemand(demand: TokenDemandEntry[]): TokenDemandEntry[] {
  return demand.map((d) => ({ ...d }));
}

function applyTransition(
  demand: TokenDemandEntry[],
  initiativeId: string,
  targetStatus: InitiativeStatus,
  initiativeDemand: InitiativeDemandSnapshot,
): { demand: TokenDemandEntry[]; applied: AppliedChange } {
  if (DEMAND_ACTIVE_STATUSES.has(targetStatus)) {
    // Add demand: merge initiative's skill demands into the demand set
    const existingIds = new Set(
      demand
        .filter((d) => d.initiativeId === initiativeId)
        .map((d) => `${d.initiativeId}:${d.skillPoolId}`),
    );

    const toAdd = initiativeDemand.demands.filter(
      (d) => !existingIds.has(`${initiativeId}:${d.skillPoolId}`),
    );

    const newDemand = [
      ...demand,
      ...toAdd.map((d) => ({
        initiativeId,
        skillPoolId: d.skillPoolId,
        skillPoolName: d.skillPoolName,
        tokensP50: d.tokensP50,
        tokensP90: d.tokensP90,
      })),
    ];

    return {
      demand: newDemand,
      applied: {
        initiativeId,
        targetStatus,
        action: 'add_demand',
        affectedSkillPools: toAdd.map((d) => d.skillPoolId),
      },
    };
  }

  if (DEMAND_REMOVED_STATUSES.has(targetStatus)) {
    // Remove demand: filter out all entries for this initiative
    const removed = demand.filter((d) => d.initiativeId === initiativeId);
    const newDemand = demand.filter((d) => d.initiativeId !== initiativeId);

    return {
      demand: newDemand,
      applied: {
        initiativeId,
        targetStatus,
        action: 'remove_demand',
        affectedSkillPools: removed.map((d) => d.skillPoolId),
      },
    };
  }

  // No demand change for other statuses (PROPOSED, SCOPING, ON_HOLD)
  return {
    demand,
    applied: {
      initiativeId,
      targetStatus,
      action: 'no_change',
      affectedSkillPools: [],
    },
  };
}

function computeLedger(
  supply: TokenSupplyEntry[],
  demand: TokenDemandEntry[],
): ProjectedLedgerEntry[] {
  // Build a map of all skill pools from supply
  const poolMap = new Map<string, ProjectedLedgerEntry>();

  for (const s of supply) {
    poolMap.set(s.skillPoolId, {
      skillPoolId: s.skillPoolId,
      skillPoolName: s.skillPoolName,
      supplyTokens: s.tokens,
      demandP50: 0,
      demandP90: null,
      deltaP50: s.tokens,
      deltaP90: null,
    });
  }

  // Aggregate demand per pool
  for (const d of demand) {
    let entry = poolMap.get(d.skillPoolId);
    if (!entry) {
      // Demand for a pool with no supply
      entry = {
        skillPoolId: d.skillPoolId,
        skillPoolName: d.skillPoolName,
        supplyTokens: 0,
        demandP50: 0,
        demandP90: null,
        deltaP50: 0,
        deltaP90: null,
      };
      poolMap.set(d.skillPoolId, entry);
    }

    entry.demandP50 += d.tokensP50;
    if (d.tokensP90 !== null) {
      entry.demandP90 = (entry.demandP90 ?? 0) + d.tokensP90;
    }
  }

  // Compute deltas
  for (const entry of poolMap.values()) {
    entry.deltaP50 = entry.supplyTokens - entry.demandP50;
    entry.deltaP90 =
      entry.demandP90 !== null
        ? entry.supplyTokens - entry.demandP90
        : null;
  }

  return [...poolMap.values()];
}

function buildProjectedScenario(
  sourceScenarioId: string,
  supply: TokenSupplyEntry[],
  demand: TokenDemandEntry[],
  appliedChanges: AppliedChange[],
): ProjectedScenario {
  return {
    sourceScenarioId,
    supply,
    demand,
    appliedChanges,
    ledger: computeLedger(supply, demand),
  };
}

// ---------------------------------------------------------------------------
// Conversion to L3 constraint scenario
// ---------------------------------------------------------------------------

/**
 * Convert a ProjectedScenario to the L3 ConstraintValidator's Scenario format.
 *
 * Each skill pool becomes a "team" with single-period capacity equal to supply.
 * Each initiative's demand entries become scheduled items allocated against
 * those teams. This lets L3 detect over-allocation (capacity violations).
 */
function toConstraintScenario(projection: ProjectedScenario): ConstraintScenario {
  const teams: ConstraintTeam[] = projection.supply.map((s) => ({
    id: s.skillPoolId,
    name: s.skillPoolName,
    capacityByPeriod: [s.tokens],
  }));

  // Also add teams for demand-only pools (no supply)
  const supplyPoolIds = new Set(projection.supply.map((s) => s.skillPoolId));
  const demandOnlyPools = new Map<string, string>();
  for (const d of projection.demand) {
    if (!supplyPoolIds.has(d.skillPoolId) && !demandOnlyPools.has(d.skillPoolId)) {
      demandOnlyPools.set(d.skillPoolId, d.skillPoolName);
    }
  }
  for (const [id, name] of demandOnlyPools) {
    teams.push({ id, name, capacityByPeriod: [0] });
  }

  // Group demands by initiative
  const initiativeMap = new Map<string, TokenDemandEntry[]>();
  for (const d of projection.demand) {
    const list = initiativeMap.get(d.initiativeId) ?? [];
    list.push(d);
    initiativeMap.set(d.initiativeId, list);
  }

  const items: ScheduledItem[] = [...initiativeMap.entries()].map(
    ([initId, demands]) => ({
      id: initId,
      name: initId,
      startPeriod: 0,
      duration: 1,
      dependencies: [],
      teamAllocations: demands.map((d) => ({
        teamId: d.skillPoolId,
        periodIndex: 0,
        tokens: d.tokensP50,
      })),
    }),
  );

  return {
    id: projection.sourceScenarioId,
    name: `Projected: ${projection.sourceScenarioId}`,
    horizon: 1,
    teams,
    items,
  };
}
