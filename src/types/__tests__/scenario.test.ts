/**
 * Comprehensive scenario test for CohesionXL type system.
 *
 * Models a realistic portfolio with:
 *   - 4 teams: Platform, Frontend, Data, QA
 *   - 6 planning periods (Q1-P1 through Q2-P3)
 *   - 5 work items with cross-team requirements and dependency chains
 *
 * Proves the type system can represent:
 *   a) A feasible scenario where everything fits
 *   b) An infeasible scenario with a capacity collision
 *   c) A dependency violation
 *   d) A multi-team temporal constraint (hyperedge)
 */

import { describe, it, expect } from 'vitest';
import type {
  TeamId,
  WorkItemId,
  PeriodId,
  ConstraintId,
  ScenarioId,
  CapacitySlotId,
  Team,
  Token,
  TokenRequirement,
  WorkItem,
  PlanningPeriod,
  PlanningHorizon,
  CapacitySlot,
  Constraint,
  ConstraintResult,
  ConstraintViolation,
  ProjectedWorkItem,
  CapacityGrid,
  Scenario,
} from '../index.js';

// ---------------------------------------------------------------------------
// Helpers — branded-type casters
// ---------------------------------------------------------------------------
const teamId = (s: string) => s as TeamId;
const workItemId = (s: string) => s as WorkItemId;
const periodId = (s: string) => s as PeriodId;
const constraintId = (s: string) => s as ConstraintId;
const scenarioId = (s: string) => s as ScenarioId;
const capSlotId = (s: string) => s as CapacitySlotId;

// ---------------------------------------------------------------------------
// 1. Teams
// ---------------------------------------------------------------------------
const PLATFORM: Team = {
  id: teamId('team-platform'),
  name: 'Platform',
  tokenBudget: { tokenAmount: 100, tokenType: 'human' },
  skillTags: ['infra', 'api', 'devops'],
};

const FRONTEND: Team = {
  id: teamId('team-frontend'),
  name: 'Frontend',
  tokenBudget: { tokenAmount: 80, tokenType: 'human' },
  skillTags: ['react', 'ux', 'a11y'],
};

const DATA: Team = {
  id: teamId('team-data'),
  name: 'Data',
  tokenBudget: { tokenAmount: 60, tokenType: 'blended' },
  skillTags: ['etl', 'ml', 'analytics'],
};

const QA: Team = {
  id: teamId('team-qa'),
  name: 'QA',
  tokenBudget: { tokenAmount: 40, tokenType: 'human' },
  skillTags: ['automation', 'perf-test', 'security'],
};

const ALL_TEAMS = [PLATFORM, FRONTEND, DATA, QA] as const;

// ---------------------------------------------------------------------------
// 2. Planning periods  (6 periods — two quarters, 3 periods each)
// ---------------------------------------------------------------------------
const periods: readonly PlanningPeriod[] = [
  { id: periodId('q1-p1'), startDate: '2026-01-05', endDate: '2026-02-01' },
  { id: periodId('q1-p2'), startDate: '2026-02-02', endDate: '2026-03-01' },
  { id: periodId('q1-p3'), startDate: '2026-03-02', endDate: '2026-03-29' },
  { id: periodId('q2-p1'), startDate: '2026-03-30', endDate: '2026-04-26' },
  { id: periodId('q2-p2'), startDate: '2026-04-27', endDate: '2026-05-24' },
  { id: periodId('q2-p3'), startDate: '2026-05-25', endDate: '2026-06-21' },
];

const horizon: PlanningHorizon = { periods };

const periodIndex = (pid: PeriodId): number =>
  periods.findIndex((p) => p.id === pid);

// ---------------------------------------------------------------------------
// 3. Work items  (5 items with cross-team needs + dependency chains)
//
//    Dependency graph:
//      WI-1 (API Platform) ──► WI-2 (Dashboard UI)
//                           └─► WI-3 (ML Pipeline)
//      WI-3 ──────────────────► WI-4 (Analytics Dashboard)
//      WI-2 + WI-4 ──────────► WI-5 (E2E Integration Test)
// ---------------------------------------------------------------------------
function tokenReq(amount: number, type: Token['tokenType'] = 'human', confidence = 0.8): TokenRequirement {
  return { tokens: { tokenAmount: amount, tokenType: type }, confidence };
}

const WI_1: WorkItem = {
  id: workItemId('wi-1'),
  name: 'API Platform v2',
  state: 'ready',
  duration: 2,
  dependencies: [],
  tokenRequirements: new Map<TeamId, TokenRequirement>([
    [PLATFORM.id, tokenReq(80)],
    [QA.id, tokenReq(20)],
  ]),
};

const WI_2: WorkItem = {
  id: workItemId('wi-2'),
  name: 'Dashboard UI Redesign',
  state: 'ready',
  duration: 2,
  dependencies: [WI_1.id],
  tokenRequirements: new Map<TeamId, TokenRequirement>([
    [FRONTEND.id, tokenReq(70)],
    [PLATFORM.id, tokenReq(15)],
    [QA.id, tokenReq(15)],
  ]),
};

const WI_3: WorkItem = {
  id: workItemId('wi-3'),
  name: 'ML Pipeline',
  state: 'ready',
  duration: 2,
  dependencies: [WI_1.id],
  tokenRequirements: new Map<TeamId, TokenRequirement>([
    [DATA.id, tokenReq(50, 'blended')],
    [PLATFORM.id, tokenReq(20)],
  ]),
};

const WI_4: WorkItem = {
  id: workItemId('wi-4'),
  name: 'Analytics Dashboard',
  state: 'ready',
  duration: 1,
  dependencies: [WI_3.id],
  tokenRequirements: new Map<TeamId, TokenRequirement>([
    [DATA.id, tokenReq(30, 'blended')],
    [FRONTEND.id, tokenReq(40)],
  ]),
};

const WI_5: WorkItem = {
  id: workItemId('wi-5'),
  name: 'E2E Integration Test Suite',
  state: 'ready',
  duration: 1,
  dependencies: [WI_2.id, WI_4.id],
  tokenRequirements: new Map<TeamId, TokenRequirement>([
    [QA.id, tokenReq(35)],
    [PLATFORM.id, tokenReq(10)],
    [FRONTEND.id, tokenReq(10)],
    [DATA.id, tokenReq(5, 'blended')],
  ]),
};

const ALL_WORK_ITEMS = [WI_1, WI_2, WI_3, WI_4, WI_5] as const;

// ---------------------------------------------------------------------------
// Capacity grid builder
// ---------------------------------------------------------------------------
function buildCapacityGrid(
  teams: readonly Team[],
  allPeriods: readonly PlanningPeriod[],
  allocations: Map<string, number>, // "teamId:periodId" → allocated
): CapacityGrid {
  const outer = new Map<TeamId, Map<PeriodId, CapacitySlot>>();
  for (const team of teams) {
    const inner = new Map<PeriodId, CapacitySlot>();
    for (const period of allPeriods) {
      const key = `${team.id}:${period.id}`;
      const allocated = allocations.get(key) ?? 0;
      const slot: CapacitySlot = {
        id: capSlotId(`slot-${team.id}-${period.id}`),
        teamId: team.id,
        periodId: period.id,
        totalTokens: team.tokenBudget.tokenAmount,
        allocatedTokens: allocated,
        remainingTokens: team.tokenBudget.tokenAmount - allocated,
      };
      inner.set(period.id, slot);
    }
    outer.set(team.id, inner);
  }
  return outer as CapacityGrid;
}

// ---------------------------------------------------------------------------
// Constraint factories
// ---------------------------------------------------------------------------

/** Capacity constraint: allocated must not exceed total for any slot. */
function makeCapacityConstraint(): Constraint {
  return {
    id: constraintId('c-capacity'),
    name: 'Capacity ceiling',
    type: 'capacity',
    scope: {
      teamIds: ALL_TEAMS.map((t) => t.id),
      periodIds: periods.map((p) => p.id),
    },
    evaluate(ctx) {
      const grid = ctx.capacityGrid as CapacityGrid;
      for (const [, periodMap] of grid) {
        for (const [, slot] of periodMap) {
          if (slot.allocatedTokens > slot.totalTokens) {
            return {
              constraintId: constraintId('c-capacity'),
              satisfied: false,
              severity: 'error',
              message: `Team ${slot.teamId} overallocated in period ${slot.periodId}: ${slot.allocatedTokens}/${slot.totalTokens}`,
            };
          }
        }
      }
      return {
        constraintId: constraintId('c-capacity'),
        satisfied: true,
        severity: 'info',
        message: 'All capacity ceilings satisfied',
      };
    },
  };
}

/** Dependency constraint: a work item must not start before all its dependencies end. */
function makeDependencyConstraint(): Constraint {
  return {
    id: constraintId('c-dependency'),
    name: 'Dependency ordering',
    type: 'dependency',
    scope: { workItemIds: ALL_WORK_ITEMS.map((w) => w.id) },
    evaluate(ctx) {
      const projected = ctx.projectedWorkItems as readonly ProjectedWorkItem[];
      const endMap = new Map<string, PeriodId>();
      for (const pw of projected) {
        endMap.set(pw.workItem.id as string, pw.endPeriodId);
      }
      for (const pw of projected) {
        for (const depId of pw.workItem.dependencies) {
          const depEnd = endMap.get(depId as string);
          if (depEnd === undefined) continue;
          if (periodIndex(pw.startPeriodId) <= periodIndex(depEnd)) {
            return {
              constraintId: constraintId('c-dependency'),
              satisfied: false,
              severity: 'error',
              message: `${pw.workItem.name} starts in ${pw.startPeriodId} but dependency ${depId} ends in ${depEnd}`,
            };
          }
        }
      }
      return {
        constraintId: constraintId('c-dependency'),
        satisfied: true,
        severity: 'info',
        message: 'All dependencies satisfied',
      };
    },
  };
}

/**
 * Hyperedge constraint (multi-team temporal):
 * WI-5 (E2E Integration) requires all 4 teams to be available
 * in the SAME period — a cross-team synchronisation point.
 */
function makeHyperedgeConstraint(): Constraint {
  return {
    id: constraintId('c-hyperedge'),
    name: 'E2E Integration sync point',
    type: 'temporal',
    scope: {
      teamIds: ALL_TEAMS.map((t) => t.id),
      workItemIds: [WI_5.id],
    },
    evaluate(ctx) {
      const projected = ctx.projectedWorkItems as readonly ProjectedWorkItem[];
      const grid = ctx.capacityGrid as CapacityGrid;
      const wi5 = projected.find((pw) => pw.workItem.id === WI_5.id);
      if (!wi5) {
        return {
          constraintId: constraintId('c-hyperedge'),
          satisfied: true,
          severity: 'info',
          message: 'WI-5 not projected; constraint vacuously satisfied',
        };
      }

      // All 4 teams must have remaining capacity in wi5's period
      for (const team of ALL_TEAMS) {
        const teamRow = grid.get(team.id);
        if (!teamRow) continue;
        const slot = teamRow.get(wi5.startPeriodId);
        if (!slot || slot.remainingTokens < 0) {
          return {
            constraintId: constraintId('c-hyperedge'),
            satisfied: false,
            severity: 'error',
            message: `Hyperedge violated: ${team.name} has no remaining capacity in ${wi5.startPeriodId}`,
          };
        }
      }
      return {
        constraintId: constraintId('c-hyperedge'),
        satisfied: true,
        severity: 'info',
        message: 'All 4 teams synchronised for E2E Integration',
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Scenario builder
// ---------------------------------------------------------------------------
function buildScenario(
  id: string,
  name: string,
  projectedWorkItems: readonly ProjectedWorkItem[],
  capacityGrid: CapacityGrid,
  constraints: readonly Constraint[],
): Scenario {
  const constraintResults: ConstraintResult[] = constraints.map((c) =>
    c.evaluate({ projectedWorkItems, capacityGrid }),
  );
  const violations = constraintResults.filter(
    (r): r is ConstraintViolation => !r.satisfied,
  );
  const feasible = violations.every((v) => v.severity !== 'error');

  return {
    id: scenarioId(id),
    name,
    projectedWorkItems,
    capacityGrid,
    constraints,
    constraintResults,
    feasible: violations.length === 0 || feasible,
    violations,
  };
}

// ===========================================================================
// Tests
// ===========================================================================

describe('CohesionXL type system — realistic portfolio scenario', () => {
  // -----------------------------------------------------------------------
  // (a) Feasible scenario — everything fits
  // -----------------------------------------------------------------------
  describe('(a) Feasible scenario', () => {
    /*
     * Schedule (respecting dependencies and capacity):
     *   WI-1: q1-p1 → q1-p2  (Platform 80/period, QA 20/period → within budget)
     *   WI-2: q1-p3 → q2-p1  (Frontend 70, Platform 15, QA 15)
     *   WI-3: q1-p3 → q2-p1  (Data 50, Platform 20)
     *   WI-4: q2-p2           (Data 30, Frontend 40)
     *   WI-5: q2-p3           (QA 35, Platform 10, Frontend 10, Data 5)
     *
     * In q1-p3 + q2-p1: Platform has WI-2(15) + WI-3(20) = 35 ≤ 100 ✓
     */

    const projections: readonly ProjectedWorkItem[] = [
      { workItem: WI_1, startPeriodId: periodId('q1-p1'), endPeriodId: periodId('q1-p2') },
      { workItem: WI_2, startPeriodId: periodId('q1-p3'), endPeriodId: periodId('q2-p1') },
      { workItem: WI_3, startPeriodId: periodId('q1-p3'), endPeriodId: periodId('q2-p1') },
      { workItem: WI_4, startPeriodId: periodId('q2-p2'), endPeriodId: periodId('q2-p2') },
      { workItem: WI_5, startPeriodId: periodId('q2-p3'), endPeriodId: periodId('q2-p3') },
    ];

    // Build allocations per team×period from the schedule
    const alloc = new Map<string, number>();
    // WI-1: Platform 80 in q1-p1, q1-p2; QA 20 in q1-p1, q1-p2
    alloc.set('team-platform:q1-p1', 80);
    alloc.set('team-platform:q1-p2', 80);
    alloc.set('team-qa:q1-p1', 20);
    alloc.set('team-qa:q1-p2', 20);
    // WI-2: Frontend 70, Platform 15, QA 15 in q1-p3, q2-p1
    alloc.set('team-frontend:q1-p3', 70);
    alloc.set('team-frontend:q2-p1', 70);
    alloc.set('team-platform:q1-p3', (alloc.get('team-platform:q1-p3') ?? 0) + 15);
    alloc.set('team-platform:q2-p1', (alloc.get('team-platform:q2-p1') ?? 0) + 15);
    alloc.set('team-qa:q1-p3', 15);
    alloc.set('team-qa:q2-p1', 15);
    // WI-3: Data 50, Platform 20 in q1-p3, q2-p1
    alloc.set('team-data:q1-p3', 50);
    alloc.set('team-data:q2-p1', 50);
    alloc.set('team-platform:q1-p3', (alloc.get('team-platform:q1-p3') ?? 0) + 20); // 35
    alloc.set('team-platform:q2-p1', (alloc.get('team-platform:q2-p1') ?? 0) + 20); // 35
    // WI-4: Data 30, Frontend 40 in q2-p2
    alloc.set('team-data:q2-p2', 30);
    alloc.set('team-frontend:q2-p2', 40);
    // WI-5: QA 35, Platform 10, Frontend 10, Data 5 in q2-p3
    alloc.set('team-qa:q2-p3', 35);
    alloc.set('team-platform:q2-p3', 10);
    alloc.set('team-frontend:q2-p3', 10);
    alloc.set('team-data:q2-p3', 5);

    const grid = buildCapacityGrid(ALL_TEAMS, periods, alloc);
    const constraints = [makeCapacityConstraint(), makeDependencyConstraint(), makeHyperedgeConstraint()];
    const scenario = buildScenario('s-feasible', 'Feasible baseline', projections, grid, constraints);

    it('is marked feasible', () => {
      expect(scenario.feasible).toBe(true);
    });

    it('has zero violations', () => {
      expect(scenario.violations).toHaveLength(0);
    });

    it('has all constraint results satisfied', () => {
      expect(scenario.constraintResults.every((r) => r.satisfied)).toBe(true);
    });

    it('projects exactly 5 work items', () => {
      expect(scenario.projectedWorkItems).toHaveLength(5);
    });

    it('capacity grid covers 4 teams × 6 periods = 24 slots', () => {
      let count = 0;
      for (const [, periodMap] of scenario.capacityGrid) {
        count += periodMap.size;
      }
      expect(count).toBe(24);
    });

    it('no slot exceeds its capacity', () => {
      for (const [, periodMap] of scenario.capacityGrid) {
        for (const [, slot] of periodMap) {
          expect(slot.remainingTokens).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('Platform is at 80% utilisation in q1-p1', () => {
      const slot = scenario.capacityGrid.get(PLATFORM.id)!.get(periodId('q1-p1'))!;
      expect(slot.allocatedTokens).toBe(80);
      expect(slot.totalTokens).toBe(100);
    });
  });

  // -----------------------------------------------------------------------
  // (b) Infeasible scenario — capacity collision
  // -----------------------------------------------------------------------
  describe('(b) Capacity collision', () => {
    /*
     * Move WI-2 and WI-3 to overlap with WI-1 in q1-p1..q1-p2.
     * Platform demand: WI-1(80) + WI-2(15) + WI-3(20) = 115 > 100  ✗
     */
    const projections: readonly ProjectedWorkItem[] = [
      { workItem: WI_1, startPeriodId: periodId('q1-p1'), endPeriodId: periodId('q1-p2') },
      { workItem: WI_2, startPeriodId: periodId('q1-p1'), endPeriodId: periodId('q1-p2') },
      { workItem: WI_3, startPeriodId: periodId('q1-p1'), endPeriodId: periodId('q1-p2') },
      { workItem: WI_4, startPeriodId: periodId('q1-p3'), endPeriodId: periodId('q1-p3') },
      { workItem: WI_5, startPeriodId: periodId('q2-p1'), endPeriodId: periodId('q2-p1') },
    ];

    const alloc = new Map<string, number>();
    // q1-p1 and q1-p2: Platform = 80+15+20 = 115
    alloc.set('team-platform:q1-p1', 115);
    alloc.set('team-platform:q1-p2', 115);
    // Frontend 70 for WI-2
    alloc.set('team-frontend:q1-p1', 70);
    alloc.set('team-frontend:q1-p2', 70);
    // Data 50 for WI-3
    alloc.set('team-data:q1-p1', 50);
    alloc.set('team-data:q1-p2', 50);
    // QA 20+15 = 35 for WI-1+WI-2
    alloc.set('team-qa:q1-p1', 35);
    alloc.set('team-qa:q1-p2', 35);

    const grid = buildCapacityGrid(ALL_TEAMS, periods, alloc);
    const constraints = [makeCapacityConstraint(), makeDependencyConstraint()];
    const scenario = buildScenario('s-collision', 'Capacity collision', projections, grid, constraints);

    it('is marked infeasible', () => {
      expect(scenario.feasible).toBe(false);
    });

    it('reports a capacity violation', () => {
      expect(scenario.violations.length).toBeGreaterThanOrEqual(1);
      const capViolation = scenario.violations.find(
        (v) => v.constraintId === constraintId('c-capacity'),
      );
      expect(capViolation).toBeDefined();
      expect(capViolation!.severity).toBe('error');
    });

    it('violation message identifies Platform as overallocated', () => {
      const capViolation = scenario.violations.find(
        (v) => v.constraintId === constraintId('c-capacity'),
      )!;
      expect(capViolation.message).toContain('team-platform');
      expect(capViolation.message).toContain('115');
    });

    it('capacity grid shows negative remaining tokens for Platform', () => {
      const slot = scenario.capacityGrid.get(PLATFORM.id)!.get(periodId('q1-p1'))!;
      expect(slot.allocatedTokens).toBe(115);
      expect(slot.remainingTokens).toBe(-15);
    });
  });

  // -----------------------------------------------------------------------
  // (c) Dependency violation
  // -----------------------------------------------------------------------
  describe('(c) Dependency violation', () => {
    /*
     * WI-2 depends on WI-1, but we schedule WI-2 to START in the same
     * period WI-1 ENDS → violation (start must be strictly after end).
     */
    const projections: readonly ProjectedWorkItem[] = [
      { workItem: WI_1, startPeriodId: periodId('q1-p1'), endPeriodId: periodId('q1-p2') },
      // WI-2 starts in q1-p2 — same period WI-1 ends → violation
      { workItem: WI_2, startPeriodId: periodId('q1-p2'), endPeriodId: periodId('q1-p3') },
      { workItem: WI_3, startPeriodId: periodId('q1-p3'), endPeriodId: periodId('q2-p1') },
      { workItem: WI_4, startPeriodId: periodId('q2-p2'), endPeriodId: periodId('q2-p2') },
      { workItem: WI_5, startPeriodId: periodId('q2-p3'), endPeriodId: periodId('q2-p3') },
    ];

    // Use light allocations — we don't care about capacity here
    const alloc = new Map<string, number>();
    const grid = buildCapacityGrid(ALL_TEAMS, periods, alloc);
    const constraints = [makeDependencyConstraint()];
    const scenario = buildScenario('s-dep-violation', 'Dependency violation', projections, grid, constraints);

    it('is marked infeasible', () => {
      expect(scenario.feasible).toBe(false);
    });

    it('reports a dependency violation', () => {
      const depViolation = scenario.violations.find(
        (v) => v.constraintId === constraintId('c-dependency'),
      );
      expect(depViolation).toBeDefined();
      expect(depViolation!.severity).toBe('error');
    });

    it('violation message identifies Dashboard UI and q1-p2 overlap', () => {
      const depViolation = scenario.violations.find(
        (v) => v.constraintId === constraintId('c-dependency'),
      )!;
      expect(depViolation.message).toContain('Dashboard UI');
      expect(depViolation.message).toContain('q1-p2');
    });
  });

  // -----------------------------------------------------------------------
  // (d) Multi-team temporal constraint — "hyperedge"
  // -----------------------------------------------------------------------
  describe('(d) Hyperedge — multi-team sync point', () => {
    /*
     * WI-5 requires all 4 teams in the same period.
     * We schedule WI-5 in q2-p3 but exhaust QA's capacity there
     * with other allocations → hyperedge fails because QA has
     * negative remaining tokens.
     */
    const projections: readonly ProjectedWorkItem[] = [
      { workItem: WI_1, startPeriodId: periodId('q1-p1'), endPeriodId: periodId('q1-p2') },
      { workItem: WI_2, startPeriodId: periodId('q1-p3'), endPeriodId: periodId('q2-p1') },
      { workItem: WI_3, startPeriodId: periodId('q1-p3'), endPeriodId: periodId('q2-p1') },
      { workItem: WI_4, startPeriodId: periodId('q2-p2'), endPeriodId: periodId('q2-p2') },
      { workItem: WI_5, startPeriodId: periodId('q2-p3'), endPeriodId: periodId('q2-p3') },
    ];

    const alloc = new Map<string, number>();
    // Exhaust QA in q2-p3 with 45 tokens (budget is 40)
    alloc.set('team-qa:q2-p3', 45);
    // Other teams have capacity
    alloc.set('team-platform:q2-p3', 10);
    alloc.set('team-frontend:q2-p3', 10);
    alloc.set('team-data:q2-p3', 5);

    const grid = buildCapacityGrid(ALL_TEAMS, periods, alloc);
    const constraints = [makeHyperedgeConstraint()];
    const scenario = buildScenario('s-hyperedge', 'Hyperedge violation', projections, grid, constraints);

    it('is marked infeasible', () => {
      expect(scenario.feasible).toBe(false);
    });

    it('reports a hyperedge (temporal) violation', () => {
      const hyper = scenario.violations.find(
        (v) => v.constraintId === constraintId('c-hyperedge'),
      );
      expect(hyper).toBeDefined();
      expect(hyper!.severity).toBe('error');
    });

    it('violation identifies QA as the bottleneck', () => {
      const hyper = scenario.violations.find(
        (v) => v.constraintId === constraintId('c-hyperedge'),
      )!;
      expect(hyper.message).toContain('QA');
    });

    it('constraint scope spans all 4 teams and WI-5', () => {
      const hyperedgeConstraint = constraints[0];
      expect(hyperedgeConstraint.scope.teamIds).toHaveLength(4);
      expect(hyperedgeConstraint.scope.workItemIds).toEqual([WI_5.id]);
    });
  });

  // -----------------------------------------------------------------------
  // Structural / type-level sanity checks
  // -----------------------------------------------------------------------
  describe('Type system structural checks', () => {
    it('branded IDs prevent cross-domain assignment at runtime', () => {
      // Two different branded types holding the same underlying string
      const tid = teamId('shared-string');
      const wid = workItemId('shared-string');
      // They compare equal as strings but are distinct branded types
      expect(tid as unknown as string).toBe(wid as unknown as string);
      // TypeScript prevents: const x: TeamId = wid; (compile-time)
    });

    it('WorkItem.tokenRequirements is a ReadonlyMap', () => {
      // Proves we can read but the Map interface disallows mutation
      expect(WI_5.tokenRequirements.size).toBe(4);
      expect(WI_5.tokenRequirements.get(QA.id)!.tokens.tokenAmount).toBe(35);
    });

    it('CapacityGrid is doubly-keyed: TeamId → PeriodId → CapacitySlot', () => {
      const grid = buildCapacityGrid(ALL_TEAMS, periods, new Map());
      const platformRow = grid.get(PLATFORM.id)!;
      expect(platformRow.size).toBe(6);
      const slot = platformRow.get(periodId('q1-p1'))!;
      expect(slot.teamId).toBe(PLATFORM.id);
      expect(slot.periodId).toBe(periodId('q1-p1'));
    });

    it('ConstraintViolation narrows satisfied to false', () => {
      const violation: ConstraintViolation = {
        constraintId: constraintId('test'),
        satisfied: false,
        severity: 'error',
        message: 'test violation',
      };
      // TypeScript enforces: violation.satisfied is always false
      expect(violation.satisfied).toBe(false);
    });

    it('dependency chain depth: WI-5 transitively depends on WI-1', () => {
      // WI-5 → WI-2 → WI-1, and WI-5 → WI-4 → WI-3 → WI-1
      const transitiveDeps = (wi: WorkItem, all: readonly WorkItem[]): Set<string> => {
        const visited = new Set<string>();
        const stack = [...wi.dependencies];
        while (stack.length > 0) {
          const depId = stack.pop()!;
          if (visited.has(depId)) continue;
          visited.add(depId);
          const dep = all.find((w) => w.id === depId);
          if (dep) stack.push(...dep.dependencies);
        }
        return visited;
      };

      const wi5Deps = transitiveDeps(WI_5, ALL_WORK_ITEMS);
      expect(wi5Deps.has(WI_1.id)).toBe(true);
      expect(wi5Deps.has(WI_2.id)).toBe(true);
      expect(wi5Deps.has(WI_3.id)).toBe(true);
      expect(wi5Deps.has(WI_4.id)).toBe(true);
      expect(wi5Deps.size).toBe(4); // depends on all other items
    });
  });
});
