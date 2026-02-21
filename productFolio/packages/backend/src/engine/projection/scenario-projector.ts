/**
 * L2 Scenario Projection Engine — ScenarioProjector
 *
 * Builds projected Scenario objects by applying proposed changes to the
 * current portfolio state.  The projector does NOT validate — it builds
 * the world as-requested.  Validation is the job of L3.
 *
 * V1 auto-scheduling strategy:
 *   1. Topological sort by dependencies (from L1 orchestration graph)
 *   2. Greedy forward allocation (first period that fits)
 *   3. No optimization — just first-fit
 */

import type {
  WorkItem,
  ProposedChange,
  OrchestrationGraph,
  CapacityGrid,
  CapacityCell,
  Scenario,
  ProjectedItem,
  ProjectedAllocation,
  StructuralViolation,
  CapacityGap,
  ScenarioSummary,
} from './types.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class ScenarioProjector {
  /**
   * Project a single proposed change onto the current state.
   */
  projectChange(
    workItems: WorkItem[],
    capacityGrid: CapacityGrid,
    graph: OrchestrationGraph,
    change: ProposedChange,
  ): Scenario {
    const items = applyChange(workItems, change);
    return this.buildScenario(items, capacityGrid, graph);
  }

  /**
   * Auto-schedule all backlog items using greedy forward allocation.
   * Items that are already scheduled / in-progress / completed keep their slots.
   */
  projectFullSchedule(
    workItems: WorkItem[],
    capacityGrid: CapacityGrid,
    graph: OrchestrationGraph,
  ): Scenario {
    const items = workItems.map((w) => ({ ...w }));
    const grid = deepCloneGrid(capacityGrid);

    // Lock already-placed items first
    const placed = items.filter(
      (w) => w.scheduledStart !== undefined && w.status !== 'backlog',
    );
    for (const item of placed) {
      consumeCapacity(grid, item);
    }

    // Topological order for backlog items
    const backlog = items.filter(
      (w) => w.status === 'backlog' || (w.status === 'scheduled' && w.scheduledStart === undefined),
    );
    const sorted = topologicalSort(backlog, graph);

    // Greedy forward allocation
    for (const item of sorted) {
      const window = findFeasibleWindow(item, grid, items, graph);
      if (window !== null) {
        item.scheduledStart = window.startPeriod;
        item.durationPeriods = window.durationPeriods;
        item.status = 'scheduled';
        allocateWindow(grid, item, window);
      }
    }

    return this.buildScenario(items, grid, graph);
  }

  /**
   * Project multiple hypothetical changes at once.
   * Changes are applied sequentially in the order given.
   */
  whatIf(
    workItems: WorkItem[],
    capacityGrid: CapacityGrid,
    graph: OrchestrationGraph,
    changes: ProposedChange[],
  ): Scenario {
    let items = workItems.map((w) => ({ ...w }));
    for (const change of changes) {
      items = applyChange(items, change);
    }
    return this.buildScenario(items, capacityGrid, graph);
  }

  // -------------------------------------------------------------------------
  // Internal: build a complete Scenario from the current item + grid state
  // -------------------------------------------------------------------------

  private buildScenario(
    items: WorkItem[],
    inputGrid: CapacityGrid,
    graph: OrchestrationGraph,
  ): Scenario {
    const grid = deepCloneGrid(inputGrid);

    // Allocate all scheduled items onto the grid
    const scheduledItems = items.filter((w) => w.scheduledStart !== undefined);
    for (const item of scheduledItems) {
      consumeCapacity(grid, item);
    }

    // Build projected items
    const projectedItems = items.map((item) =>
      buildProjectedItem(item, items, graph),
    );

    // Detect structural violations from L1 graph
    const structuralViolations = detectViolations(items, graph);

    // Compute capacity gaps
    const capacityGaps = computeCapacityGaps(grid);

    // Summary
    const summary = computeSummary(projectedItems, grid, structuralViolations);

    return {
      projectedItems,
      capacityGrid: grid,
      structuralViolations,
      capacityGaps,
      summary,
    };
  }
}

// ---------------------------------------------------------------------------
// Change application
// ---------------------------------------------------------------------------

function applyChange(items: WorkItem[], change: ProposedChange): WorkItem[] {
  const result = items.map((w) => ({ ...w }));

  switch (change.type) {
    case 'schedule': {
      const item = result.find((w) => w.id === change.itemId);
      if (item) {
        item.scheduledStart = change.startPeriod;
        item.status = 'scheduled';
      }
      return result;
    }
    case 'add':
      return [...result, { ...change.item }];
    case 'remove':
      return result.filter((w) => w.id !== change.itemId);
    case 'reprioritize': {
      const item = result.find((w) => w.id === change.itemId);
      if (item) {
        item.priority = change.newPriority;
      }
      return result;
    }
  }
}

// ---------------------------------------------------------------------------
// Topological sort  (Kahn's algorithm)
// ---------------------------------------------------------------------------

function topologicalSort(
  items: WorkItem[],
  graph: OrchestrationGraph,
): WorkItem[] {
  const itemIds = new Set(items.map((w) => w.id));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const item of items) {
    inDegree.set(item.id, 0);
    adjacency.set(item.id, []);
  }

  // Build adjacency from graph edges relevant to these items
  for (const edge of graph.edges) {
    if (itemIds.has(edge.fromItemId) && itemIds.has(edge.toItemId)) {
      adjacency.get(edge.fromItemId)!.push(edge.toItemId);
      inDegree.set(edge.toItemId, (inDegree.get(edge.toItemId) ?? 0) + 1);
    }
  }

  // Seed queue with zero-indegree nodes, sorted by priority
  const queue: WorkItem[] = items
    .filter((w) => (inDegree.get(w.id) ?? 0) === 0)
    .sort((a, b) => a.priority - b.priority);

  const sorted: WorkItem[] = [];

  while (queue.length > 0) {
    // Always pick highest priority (lowest number) from the ready set
    queue.sort((a, b) => a.priority - b.priority);
    const current = queue.shift()!;
    sorted.push(current);

    for (const neighbor of adjacency.get(current.id) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        const neighborItem = items.find((w) => w.id === neighbor);
        if (neighborItem) queue.push(neighborItem);
      }
    }
  }

  // Append any items caught in cycles (still have in-degree > 0)
  for (const item of items) {
    if (!sorted.includes(item)) {
      sorted.push(item);
    }
  }

  return sorted;
}

// ---------------------------------------------------------------------------
// Greedy forward allocation
// ---------------------------------------------------------------------------

interface FeasibleWindow {
  startPeriod: number;
  durationPeriods: number;
  /** skill → hours[] indexed by period offset from startPeriod */
  allocation: Map<string, number[]>;
}

/**
 * Find the earliest contiguous window where all skill-hours can be satisfied.
 * Respects dependency ordering: start cannot be before all dependencies end.
 */
function findFeasibleWindow(
  item: WorkItem,
  grid: CapacityGrid,
  allItems: WorkItem[],
  graph: OrchestrationGraph,
): FeasibleWindow | null {
  const horizonLength = grid.periods.length;
  if (horizonLength === 0) return null;

  const skills = Object.keys(item.skillDemand);
  if (skills.length === 0) return null;

  // Earliest start: after all dependencies complete
  const earliestStart = getEarliestStart(item, allItems, graph);

  // Index the grid for fast lookup
  const available = buildAvailabilityIndex(grid);

  // Try starting from each period
  for (let start = earliestStart; start < horizonLength; start++) {
    const result = tryAllocateFrom(
      start,
      item.skillDemand,
      available,
      horizonLength,
    );
    if (result) return result;
  }

  return null;
}

function tryAllocateFrom(
  startPeriod: number,
  demand: Record<string, number>,
  available: Map<string, number[]>,
  horizonLength: number,
): FeasibleWindow | null {
  // Reject windows that start at a period with zero capacity for any skill
  for (const skill of Object.keys(demand)) {
    const skillAvail = available.get(skill);
    if (!skillAvail || (skillAvail[startPeriod] ?? 0) < 0.001) return null;
  }

  const allocation = new Map<string, number[]>();
  let maxEnd = startPeriod;

  for (const [skill, totalHours] of Object.entries(demand)) {
    const skillAvail = available.get(skill)!;

    let remaining = totalHours;
    const hoursByPeriod: number[] = [];
    let periodIdx = startPeriod;

    while (remaining > 0.001 && periodIdx < horizonLength) {
      const avail = skillAvail[periodIdx] ?? 0;
      const take = Math.min(remaining, avail);
      hoursByPeriod.push(take);
      remaining -= take;
      periodIdx++;
    }

    if (remaining > 0.001) return null; // Can't fit within horizon

    allocation.set(skill, hoursByPeriod);
    const endPeriod = startPeriod + hoursByPeriod.length - 1;
    if (endPeriod > maxEnd) maxEnd = endPeriod;
  }

  return {
    startPeriod,
    durationPeriods: maxEnd - startPeriod + 1,
    allocation,
  };
}

function getEarliestStart(
  item: WorkItem,
  allItems: WorkItem[],
  graph: OrchestrationGraph,
): number {
  let earliest = 0;

  // Find edges where this item is the target (toItemId)
  const depEdges = graph.edges.filter((e) => e.toItemId === item.id);

  for (const edge of depEdges) {
    const dep = allItems.find((w) => w.id === edge.fromItemId);
    if (dep && dep.scheduledStart !== undefined && dep.durationPeriods !== undefined) {
      const depEnd = dep.scheduledStart + dep.durationPeriods;
      if (depEnd > earliest) earliest = depEnd;
    }
  }

  // Also honor item's own dependencies list
  for (const depId of item.dependencies) {
    const dep = allItems.find((w) => w.id === depId);
    if (dep && dep.scheduledStart !== undefined && dep.durationPeriods !== undefined) {
      const depEnd = dep.scheduledStart + dep.durationPeriods;
      if (depEnd > earliest) earliest = depEnd;
    }
  }

  return earliest;
}

// ---------------------------------------------------------------------------
// Capacity grid helpers
// ---------------------------------------------------------------------------

function buildAvailabilityIndex(grid: CapacityGrid): Map<string, number[]> {
  const index = new Map<string, number[]>();
  for (const cell of grid.cells) {
    if (!index.has(cell.skill)) {
      index.set(cell.skill, new Array(grid.periods.length).fill(0));
    }
    index.get(cell.skill)![cell.periodIndex] = cell.availableHours;
  }
  return index;
}

function consumeCapacity(grid: CapacityGrid, item: WorkItem): void {
  if (item.scheduledStart === undefined) return;

  const skills = Object.keys(item.skillDemand);
  for (const skill of skills) {
    let remaining = item.skillDemand[skill];
    let periodIdx = item.scheduledStart;

    while (remaining > 0.001 && periodIdx < grid.periods.length) {
      const cell = findOrCreateCell(grid, periodIdx, skill);
      const take = Math.min(remaining, cell.availableHours);
      cell.allocatedHours += take;
      cell.availableHours -= take;
      remaining -= take;
      periodIdx++;
    }
  }

}

function allocateWindow(
  grid: CapacityGrid,
  _item: WorkItem,
  window: FeasibleWindow,
): void {
  for (const [skill, hoursByPeriod] of window.allocation) {
    for (let offset = 0; offset < hoursByPeriod.length; offset++) {
      const hours = hoursByPeriod[offset];
      if (hours <= 0) continue;
      const periodIdx = window.startPeriod + offset;
      const cell = findOrCreateCell(grid, periodIdx, skill);
      cell.allocatedHours += hours;
      cell.availableHours -= hours;
    }
  }
}

function findOrCreateCell(
  grid: CapacityGrid,
  periodIndex: number,
  skill: string,
): CapacityCell {
  let cell = grid.cells.find(
    (c) => c.periodIndex === periodIndex && c.skill === skill,
  );
  if (!cell) {
    cell = {
      periodIndex,
      skill,
      totalHours: 0,
      allocatedHours: 0,
      availableHours: 0,
    };
    grid.cells.push(cell);
  }
  return cell;
}

function deepCloneGrid(grid: CapacityGrid): CapacityGrid {
  return {
    periods: grid.periods.map((p) => ({ ...p })),
    cells: grid.cells.map((c) => ({ ...c })),
  };
}

// ---------------------------------------------------------------------------
// Projected item builder
// ---------------------------------------------------------------------------

function buildProjectedItem(
  item: WorkItem,
  allItems: WorkItem[],
  graph: OrchestrationGraph,
): ProjectedItem {
  const allocations: ProjectedAllocation[] = [];
  let startPeriod: number | undefined;
  let endPeriod: number | undefined;

  if (item.scheduledStart !== undefined) {
    startPeriod = item.scheduledStart;
    const duration = item.durationPeriods ?? estimateDuration(item);
    endPeriod = startPeriod + duration - 1;

    // Build per-period allocations
    for (const [skill, totalHours] of Object.entries(item.skillDemand)) {
      const perPeriod = totalHours / duration;
      for (let p = 0; p < duration; p++) {
        allocations.push({
          periodIndex: startPeriod + p,
          skill,
          hours: perPeriod,
        });
      }
    }
  }

  // Check dependency satisfaction
  const { satisfied, unsatisfied } = checkDependencies(item, allItems, graph);

  return {
    itemId: item.id,
    title: item.title,
    status: item.status,
    priority: item.priority,
    startPeriod,
    endPeriod,
    durationPeriods: item.durationPeriods,
    allocations,
    dependenciesSatisfied: satisfied,
    unsatisfiedDependencies: unsatisfied,
  };
}

function estimateDuration(item: WorkItem): number {
  // Default: 1 period if no info
  return item.durationPeriods ?? 1;
}

function checkDependencies(
  item: WorkItem,
  allItems: WorkItem[],
  graph: OrchestrationGraph,
): { satisfied: boolean; unsatisfied: string[] } {
  const unsatisfied: string[] = [];

  // Collect all dependency IDs (from graph edges + item.dependencies)
  const depIds = new Set<string>(item.dependencies);
  for (const edge of graph.edges) {
    if (edge.toItemId === item.id) {
      depIds.add(edge.fromItemId);
    }
  }

  if (item.scheduledStart === undefined) {
    // Unscheduled items: deps are trivially "unsatisfied" if they exist
    return { satisfied: depIds.size === 0, unsatisfied: [...depIds] };
  }

  for (const depId of depIds) {
    const dep = allItems.find((w) => w.id === depId);
    if (!dep) {
      unsatisfied.push(depId);
      continue;
    }
    if (dep.scheduledStart === undefined) {
      unsatisfied.push(depId);
      continue;
    }
    const depEnd =
      dep.scheduledStart + (dep.durationPeriods ?? estimateDuration(dep));
    if (depEnd > item.scheduledStart) {
      unsatisfied.push(depId);
    }
  }

  return { satisfied: unsatisfied.length === 0, unsatisfied };
}

// ---------------------------------------------------------------------------
// Violation detection
// ---------------------------------------------------------------------------

function detectViolations(
  items: WorkItem[],
  graph: OrchestrationGraph,
): StructuralViolation[] {
  const violations: StructuralViolation[] = [];
  const itemMap = new Map(items.map((w) => [w.id, w]));

  // Detect cycles
  const cycles = detectCycles(items, graph);
  for (const cycle of cycles) {
    violations.push({
      type: 'dependency_cycle',
      message: `Dependency cycle detected: ${cycle.join(' → ')}`,
      itemIds: cycle,
    });
  }

  // Detect timing violations (dependency scheduled after dependent)
  for (const edge of graph.edges) {
    const from = itemMap.get(edge.fromItemId);
    const to = itemMap.get(edge.toItemId);
    if (!from || !to) {
      // Missing dependency
      if (!from && itemMap.has(edge.toItemId)) {
        violations.push({
          type: 'missing_dependency',
          message: `Item "${edge.toItemId}" depends on missing item "${edge.fromItemId}"`,
          itemIds: [edge.toItemId, edge.fromItemId],
        });
      }
      continue;
    }

    if (
      from.scheduledStart !== undefined &&
      to.scheduledStart !== undefined
    ) {
      const fromEnd =
        from.scheduledStart + (from.durationPeriods ?? estimateDuration(from));
      if (fromEnd > to.scheduledStart) {
        violations.push({
          type: 'dependency_timing',
          message: `"${from.title}" (ends period ${fromEnd}) must complete before "${to.title}" (starts period ${to.scheduledStart})`,
          itemIds: [from.id, to.id],
        });
      }
    }
  }

  return violations;
}

function detectCycles(
  items: WorkItem[],
  graph: OrchestrationGraph,
): string[][] {
  const itemIds = new Set(items.map((w) => w.id));
  const adjacency = new Map<string, string[]>();

  for (const id of itemIds) {
    adjacency.set(id, []);
  }
  for (const edge of graph.edges) {
    if (itemIds.has(edge.fromItemId) && itemIds.has(edge.toItemId)) {
      adjacency.get(edge.fromItemId)!.push(edge.toItemId);
    }
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const cycles: string[][] = [];

  function dfs(node: string, path: string[]): void {
    if (inStack.has(node)) {
      // Found a cycle — extract it
      const cycleStart = path.indexOf(node);
      cycles.push(path.slice(cycleStart).concat(node));
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);
    path.push(node);

    for (const neighbor of adjacency.get(node) ?? []) {
      dfs(neighbor, path);
    }

    path.pop();
    inStack.delete(node);
  }

  for (const id of itemIds) {
    if (!visited.has(id)) {
      dfs(id, []);
    }
  }

  return cycles;
}

// ---------------------------------------------------------------------------
// Capacity gap analysis
// ---------------------------------------------------------------------------

function computeCapacityGaps(grid: CapacityGrid): CapacityGap[] {
  const gaps: CapacityGap[] = [];

  // Group cells by period
  for (const cell of grid.cells) {
    if (cell.allocatedHours > cell.totalHours) {
      gaps.push({
        periodIndex: cell.periodIndex,
        skill: cell.skill,
        demandHours: cell.allocatedHours,
        availableHours: cell.totalHours,
        gapHours: cell.allocatedHours - cell.totalHours,
      });
    }
  }

  return gaps;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function computeSummary(
  projectedItems: ProjectedItem[],
  grid: CapacityGrid,
  violations: StructuralViolation[],
): ScenarioSummary {
  const scheduled = projectedItems.filter((p) => p.startPeriod !== undefined);
  const totalDemandHours = projectedItems.reduce(
    (sum, p) => sum + p.allocations.reduce((s, a) => s + a.hours, 0),
    0,
  );
  const totalCapacityHours = grid.cells.reduce(
    (sum, c) => sum + c.totalHours,
    0,
  );
  const totalAllocatedHours = grid.cells.reduce(
    (sum, c) => sum + c.allocatedHours,
    0,
  );

  return {
    totalItems: projectedItems.length,
    scheduledItems: scheduled.length,
    unscheduledItems: projectedItems.length - scheduled.length,
    totalDemandHours,
    totalCapacityHours,
    totalAllocatedHours,
    overallGapHours: Math.max(0, totalAllocatedHours - totalCapacityHours),
    violationCount: violations.length,
    horizonPeriods: grid.periods.length,
  };
}
