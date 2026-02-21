import { describe, it, expect, beforeEach } from 'vitest';
import { ScenarioProjector } from '../engine/projection/scenario-projector.js';
import type {
  WorkItem,
  CapacityGrid,
  OrchestrationGraph,
  ProposedChange,
} from '../engine/projection/types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeGrid(
  periodCount: number,
  skills: Record<string, number>,
): CapacityGrid {
  const periods = Array.from({ length: periodCount }, (_, i) => ({
    index: i,
    periodId: `P${i}`,
    label: `Period ${i}`,
  }));

  const cells = periods.flatMap((p) =>
    Object.entries(skills).map(([skill, hours]) => ({
      periodIndex: p.index,
      skill,
      totalHours: hours,
      allocatedHours: 0,
      availableHours: hours,
    })),
  );

  return { periods, cells };
}

function makeItem(overrides: Partial<WorkItem> & { id: string }): WorkItem {
  return {
    title: overrides.id,
    status: 'backlog',
    skillDemand: {},
    dependencies: [],
    priority: 10,
    ...overrides,
  };
}

const emptyGraph: OrchestrationGraph = { edges: [] };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ScenarioProjector', () => {
  let projector: ScenarioProjector;

  beforeEach(() => {
    projector = new ScenarioProjector();
  });

  // =========================================================================
  // 1. Project a single item addition and verify the scenario
  // =========================================================================
  describe('projectChange — single item addition', () => {
    it('adds a new work item and reflects it in the scenario', () => {
      const grid = makeGrid(4, { backend: 100, frontend: 80 });

      const existing = [
        makeItem({
          id: 'existing-1',
          title: 'Existing Feature',
          status: 'scheduled',
          scheduledStart: 0,
          durationPeriods: 2,
          skillDemand: { backend: 60 },
          priority: 1,
        }),
      ];

      const newItem: WorkItem = makeItem({
        id: 'new-1',
        title: 'New Feature',
        status: 'backlog',
        skillDemand: { backend: 40, frontend: 30 },
        priority: 2,
      });

      const change: ProposedChange = { type: 'add', item: newItem };

      const scenario = projector.projectChange(
        existing,
        grid,
        emptyGraph,
        change,
      );

      // Both items present
      expect(scenario.projectedItems).toHaveLength(2);

      const projected = scenario.projectedItems.find(
        (p) => p.itemId === 'new-1',
      );
      expect(projected).toBeDefined();
      expect(projected!.title).toBe('New Feature');
      expect(projected!.status).toBe('backlog');

      // Existing item still scheduled
      const existingProjected = scenario.projectedItems.find(
        (p) => p.itemId === 'existing-1',
      );
      expect(existingProjected!.startPeriod).toBe(0);

      // Summary reflects 2 items
      expect(scenario.summary.totalItems).toBe(2);
    });

    it('scheduling a new item consumes capacity on the grid', () => {
      const grid = makeGrid(4, { backend: 50 });

      const items: WorkItem[] = [];
      const newItem = makeItem({
        id: 'item-1',
        title: 'Feature A',
        status: 'backlog',
        skillDemand: { backend: 80 },
        priority: 1,
      });

      // Add then schedule
      const scenario = projector.whatIf(items, grid, emptyGraph, [
        { type: 'add', item: newItem },
        { type: 'schedule', itemId: 'item-1', startPeriod: 0 },
      ]);

      const projected = scenario.projectedItems.find(
        (p) => p.itemId === 'item-1',
      );
      expect(projected!.status).toBe('scheduled');
      expect(projected!.startPeriod).toBe(0);

      // 80 hours of backend consumed across periods (50 + 30)
      const totalAllocated = scenario.capacityGrid.cells
        .filter((c) => c.skill === 'backend')
        .reduce((sum, c) => sum + c.allocatedHours, 0);
      expect(totalAllocated).toBe(80);
    });
  });

  // =========================================================================
  // 2. Project a full portfolio schedule and validate via L3 (gaps)
  // =========================================================================
  describe('projectFullSchedule', () => {
    it('auto-schedules all backlog items using greedy forward allocation', () => {
      // 6 periods, 100 hours backend capacity each
      const grid = makeGrid(6, { backend: 100 });

      const items: WorkItem[] = [
        makeItem({
          id: 'A',
          title: 'Item A',
          skillDemand: { backend: 150 },
          priority: 1,
        }),
        makeItem({
          id: 'B',
          title: 'Item B',
          skillDemand: { backend: 80 },
          priority: 2,
        }),
        makeItem({
          id: 'C',
          title: 'Item C',
          skillDemand: { backend: 200 },
          priority: 3,
        }),
      ];

      const scenario = projector.projectFullSchedule(items, grid, emptyGraph);

      // All items should be scheduled
      expect(scenario.summary.scheduledItems).toBe(3);
      expect(scenario.summary.unscheduledItems).toBe(0);

      const pA = scenario.projectedItems.find((p) => p.itemId === 'A')!;
      const pB = scenario.projectedItems.find((p) => p.itemId === 'B')!;
      const pC = scenario.projectedItems.find((p) => p.itemId === 'C')!;

      // A has highest priority → scheduled first at period 0
      expect(pA.startPeriod).toBe(0);
      // A needs 150h at 100h/period → 2 periods
      expect(pA.durationPeriods).toBe(2);

      // B scheduled after A (greedy: starts at 0 but capacity is consumed)
      expect(pB.startPeriod).toBeDefined();

      // C scheduled last
      expect(pC.startPeriod).toBeDefined();

      // No capacity gaps (600 total capacity > 430 total demand)
      expect(scenario.capacityGaps).toHaveLength(0);
    });

    it('reports capacity gaps when demand exceeds supply', () => {
      // Only 2 periods of 50 hours = 100 total
      const grid = makeGrid(2, { backend: 50 });

      const items: WorkItem[] = [
        makeItem({
          id: 'X',
          title: 'Big Item',
          skillDemand: { backend: 200 },
          priority: 1,
        }),
      ];

      const scenario = projector.projectFullSchedule(items, grid, emptyGraph);

      // Item can't be fully scheduled (200 > 100)
      expect(scenario.summary.unscheduledItems).toBe(1);
    });

    it('respects dependency order in topological sort', () => {
      const grid = makeGrid(6, { backend: 100 });

      const items: WorkItem[] = [
        makeItem({
          id: 'dep-first',
          title: 'Dependency First',
          skillDemand: { backend: 100 },
          priority: 2,  // Lower priority but must go first
        }),
        makeItem({
          id: 'dep-second',
          title: 'Depends on First',
          skillDemand: { backend: 50 },
          dependencies: ['dep-first'],
          priority: 1,  // Higher priority but depends on dep-first
        }),
      ];

      const graph: OrchestrationGraph = {
        edges: [{ fromItemId: 'dep-first', toItemId: 'dep-second' }],
      };

      const scenario = projector.projectFullSchedule(items, grid, graph);

      const first = scenario.projectedItems.find(
        (p) => p.itemId === 'dep-first',
      )!;
      const second = scenario.projectedItems.find(
        (p) => p.itemId === 'dep-second',
      )!;

      expect(first.startPeriod).toBeDefined();
      expect(second.startPeriod).toBeDefined();

      // Second must start after first ends
      const firstEnd = first.startPeriod! + (first.durationPeriods ?? 1);
      expect(second.startPeriod!).toBeGreaterThanOrEqual(firstEnd);

      // Dependencies satisfied
      expect(second.dependenciesSatisfied).toBe(true);
    });
  });

  // =========================================================================
  // 3. What-if comparison: add item vs. don't add item
  // =========================================================================
  describe('whatIf — comparison scenarios', () => {
    it('compares baseline vs. what-if with an added item', () => {
      const grid = makeGrid(4, { backend: 100 });

      const baseItems: WorkItem[] = [
        makeItem({
          id: 'base-1',
          title: 'Existing Work',
          status: 'scheduled',
          scheduledStart: 0,
          durationPeriods: 2,
          skillDemand: { backend: 150 },
          priority: 1,
        }),
      ];

      // Baseline: no changes
      const baseline = projector.whatIf(baseItems, grid, emptyGraph, []);

      // What-if: add a new item and schedule it
      const whatIfScenario = projector.whatIf(baseItems, grid, emptyGraph, [
        {
          type: 'add',
          item: makeItem({
            id: 'new-item',
            title: 'Proposed Feature',
            skillDemand: { backend: 120 },
            priority: 2,
          }),
        },
        { type: 'schedule', itemId: 'new-item', startPeriod: 2 },
      ]);

      // Baseline has 1 item, what-if has 2
      expect(baseline.summary.totalItems).toBe(1);
      expect(whatIfScenario.summary.totalItems).toBe(2);

      // What-if consumes more capacity
      expect(whatIfScenario.summary.totalAllocatedHours).toBeGreaterThan(
        baseline.summary.totalAllocatedHours,
      );

      // New item is present in what-if
      const newProjected = whatIfScenario.projectedItems.find(
        (p) => p.itemId === 'new-item',
      );
      expect(newProjected).toBeDefined();
      expect(newProjected!.startPeriod).toBe(2);
    });

    it('compares removing an item vs keeping it', () => {
      const grid = makeGrid(4, { backend: 100 });

      const items: WorkItem[] = [
        makeItem({
          id: 'keep',
          title: 'Keep This',
          status: 'scheduled',
          scheduledStart: 0,
          durationPeriods: 1,
          skillDemand: { backend: 80 },
          priority: 1,
        }),
        makeItem({
          id: 'maybe-remove',
          title: 'Maybe Remove',
          status: 'scheduled',
          scheduledStart: 1,
          durationPeriods: 1,
          skillDemand: { backend: 60 },
          priority: 2,
        }),
      ];

      const withItem = projector.whatIf(items, grid, emptyGraph, []);
      const withoutItem = projector.whatIf(items, grid, emptyGraph, [
        { type: 'remove', itemId: 'maybe-remove' },
      ]);

      expect(withItem.summary.totalItems).toBe(2);
      expect(withoutItem.summary.totalItems).toBe(1);
      expect(withoutItem.summary.totalAllocatedHours).toBeLessThan(
        withItem.summary.totalAllocatedHours,
      );
    });
  });

  // =========================================================================
  // 4. Cascading effects: adding item A pushes item B later
  // =========================================================================
  describe('cascading effects', () => {
    it('adding a high-priority item pushes lower-priority items later', () => {
      // 4 periods, 100h backend each = 400h total
      const grid = makeGrid(4, { backend: 100 });

      const items: WorkItem[] = [
        makeItem({
          id: 'B',
          title: 'Item B',
          skillDemand: { backend: 150 },
          priority: 2,
        }),
      ];

      // Schedule B alone — should start at period 0
      const withoutA = projector.projectFullSchedule(
        items,
        grid,
        emptyGraph,
      );
      const bAlone = withoutA.projectedItems.find(
        (p) => p.itemId === 'B',
      )!;
      expect(bAlone.startPeriod).toBe(0);

      // Now add a higher-priority item A that also needs backend capacity
      const itemsWithA: WorkItem[] = [
        makeItem({
          id: 'A',
          title: 'Item A',
          skillDemand: { backend: 200 },
          priority: 1,
        }),
        makeItem({
          id: 'B',
          title: 'Item B',
          skillDemand: { backend: 150 },
          priority: 2,
        }),
      ];

      const withA = projector.projectFullSchedule(
        itemsWithA,
        grid,
        emptyGraph,
      );

      const aProjected = withA.projectedItems.find(
        (p) => p.itemId === 'A',
      )!;
      const bProjected = withA.projectedItems.find(
        (p) => p.itemId === 'B',
      )!;

      // A gets priority → starts at 0
      expect(aProjected.startPeriod).toBe(0);
      // A needs 200h at 100h/period → 2 periods (0, 1)
      expect(aProjected.durationPeriods).toBe(2);

      // B is pushed later because A consumed capacity first
      expect(bProjected.startPeriod!).toBeGreaterThanOrEqual(
        aProjected.startPeriod! + aProjected.durationPeriods!,
      );
    });

    it('dependency chains cascade: A→B→C scheduling propagates', () => {
      const grid = makeGrid(8, { backend: 100 });

      const items: WorkItem[] = [
        makeItem({
          id: 'A',
          title: 'Step A',
          skillDemand: { backend: 100 },
          priority: 1,
        }),
        makeItem({
          id: 'B',
          title: 'Step B',
          skillDemand: { backend: 100 },
          dependencies: ['A'],
          priority: 2,
        }),
        makeItem({
          id: 'C',
          title: 'Step C',
          skillDemand: { backend: 100 },
          dependencies: ['B'],
          priority: 3,
        }),
      ];

      const graph: OrchestrationGraph = {
        edges: [
          { fromItemId: 'A', toItemId: 'B' },
          { fromItemId: 'B', toItemId: 'C' },
        ],
      };

      const scenario = projector.projectFullSchedule(items, grid, graph);

      const pA = scenario.projectedItems.find((p) => p.itemId === 'A')!;
      const pB = scenario.projectedItems.find((p) => p.itemId === 'B')!;
      const pC = scenario.projectedItems.find((p) => p.itemId === 'C')!;

      // All scheduled
      expect(pA.startPeriod).toBeDefined();
      expect(pB.startPeriod).toBeDefined();
      expect(pC.startPeriod).toBeDefined();

      // Sequential: A → B → C
      expect(pB.startPeriod!).toBeGreaterThanOrEqual(
        pA.startPeriod! + (pA.durationPeriods ?? 1),
      );
      expect(pC.startPeriod!).toBeGreaterThanOrEqual(
        pB.startPeriod! + (pB.durationPeriods ?? 1),
      );

      // All dependencies satisfied
      expect(pA.dependenciesSatisfied).toBe(true);
      expect(pB.dependenciesSatisfied).toBe(true);
      expect(pC.dependenciesSatisfied).toBe(true);
    });
  });

  // =========================================================================
  // Structural violation detection
  // =========================================================================
  describe('structural violations', () => {
    it('detects dependency timing violations', () => {
      const grid = makeGrid(4, { backend: 100 });

      // Schedule B before A even though B depends on A
      const items: WorkItem[] = [
        makeItem({
          id: 'A',
          title: 'Dependency',
          status: 'scheduled',
          scheduledStart: 2,
          durationPeriods: 2,
          skillDemand: { backend: 50 },
          priority: 1,
        }),
        makeItem({
          id: 'B',
          title: 'Dependent',
          status: 'scheduled',
          scheduledStart: 0,
          durationPeriods: 1,
          skillDemand: { backend: 30 },
          dependencies: ['A'],
          priority: 2,
        }),
      ];

      const graph: OrchestrationGraph = {
        edges: [{ fromItemId: 'A', toItemId: 'B' }],
      };

      const scenario = projector.projectChange(items, grid, graph, {
        type: 'reprioritize',
        itemId: 'A',
        newPriority: 1,
      });

      // Should detect timing violation
      const timingViolations = scenario.structuralViolations.filter(
        (v) => v.type === 'dependency_timing',
      );
      expect(timingViolations.length).toBeGreaterThan(0);

      // B's dependencies should be unsatisfied
      const pB = scenario.projectedItems.find((p) => p.itemId === 'B')!;
      expect(pB.dependenciesSatisfied).toBe(false);
    });

    it('detects dependency cycles', () => {
      const grid = makeGrid(4, { backend: 100 });

      const items: WorkItem[] = [
        makeItem({
          id: 'X',
          title: 'X',
          skillDemand: { backend: 50 },
          dependencies: ['Y'],
          priority: 1,
        }),
        makeItem({
          id: 'Y',
          title: 'Y',
          skillDemand: { backend: 50 },
          dependencies: ['X'],
          priority: 2,
        }),
      ];

      const graph: OrchestrationGraph = {
        edges: [
          { fromItemId: 'X', toItemId: 'Y' },
          { fromItemId: 'Y', toItemId: 'X' },
        ],
      };

      const scenario = projector.projectChange(items, grid, graph, {
        type: 'reprioritize',
        itemId: 'X',
        newPriority: 1,
      });

      const cycles = scenario.structuralViolations.filter(
        (v) => v.type === 'dependency_cycle',
      );
      expect(cycles.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Multi-skill scenarios
  // =========================================================================
  describe('multi-skill scheduling', () => {
    it('schedules items requiring multiple skills', () => {
      const grid = makeGrid(4, { backend: 100, frontend: 80, qa: 60 });

      const items: WorkItem[] = [
        makeItem({
          id: 'full-stack',
          title: 'Full Stack Feature',
          skillDemand: { backend: 150, frontend: 120, qa: 40 },
          priority: 1,
        }),
      ];

      const scenario = projector.projectFullSchedule(
        items,
        grid,
        emptyGraph,
      );

      const item = scenario.projectedItems.find(
        (p) => p.itemId === 'full-stack',
      )!;
      expect(item.startPeriod).toBe(0);
      expect(item.status).toBe('scheduled');

      // Duration spans enough periods for the bottleneck skill
      // frontend: 120h at 80h/period → needs 2 periods
      // backend: 150h at 100h/period → needs 2 periods
      expect(item.durationPeriods!).toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================
  describe('edge cases', () => {
    it('handles empty portfolio gracefully', () => {
      const grid = makeGrid(4, { backend: 100 });
      const scenario = projector.projectFullSchedule([], grid, emptyGraph);

      expect(scenario.projectedItems).toHaveLength(0);
      expect(scenario.summary.totalItems).toBe(0);
      expect(scenario.capacityGaps).toHaveLength(0);
    });

    it('handles items with zero demand', () => {
      const grid = makeGrid(4, { backend: 100 });
      const items: WorkItem[] = [
        makeItem({ id: 'empty', title: 'No Demand', skillDemand: {} }),
      ];

      const scenario = projector.projectFullSchedule(
        items,
        grid,
        emptyGraph,
      );
      // Item stays unscheduled (no skills to allocate)
      expect(scenario.summary.totalItems).toBe(1);
    });

    it('handles empty capacity grid', () => {
      const grid: CapacityGrid = { periods: [], cells: [] };
      const items: WorkItem[] = [
        makeItem({
          id: 'orphan',
          title: 'No Capacity',
          skillDemand: { backend: 50 },
        }),
      ];

      const scenario = projector.projectFullSchedule(
        items,
        grid,
        emptyGraph,
      );
      expect(scenario.summary.unscheduledItems).toBe(1);
    });
  });
});
