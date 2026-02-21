/**
 * L2 Scenario Projection Engine — Types
 *
 * Pure data structures used by the ScenarioProjector.
 * These are independent of Prisma models so the engine can run
 * in-memory without database access (testable, composable).
 */

// ---------------------------------------------------------------------------
// Work Items
// ---------------------------------------------------------------------------

export interface WorkItem {
  id: string;
  title: string;
  /** Current lifecycle status */
  status: WorkItemStatus;
  /** Skill-hours demanded per skill name */
  skillDemand: Record<string, number>;
  /** Ordered list of dependency IDs (must complete before this item starts) */
  dependencies: string[];
  /** Priority rank — lower is higher priority (1 = top) */
  priority: number;
  /** If already scheduled, the period index where it starts */
  scheduledStart?: number;
  /** Duration in periods (if already known / fixed) */
  durationPeriods?: number;
}

export type WorkItemStatus =
  | 'backlog'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'on_hold'
  | 'cancelled';

// ---------------------------------------------------------------------------
// Capacity Grid  (mirrors L3 but as a plain matrix)
// ---------------------------------------------------------------------------

/** One cell of the capacity grid: a (skill, period) pair */
export interface CapacityCell {
  periodIndex: number;
  skill: string;
  totalHours: number;
  /** Hours already consumed by existing allocations */
  allocatedHours: number;
  /** totalHours - allocatedHours */
  availableHours: number;
}

/**
 * Full capacity grid — the "supply side" of the portfolio.
 * Indexed as grid[periodIndex][skill] → CapacityCell
 */
export interface CapacityGrid {
  periods: PeriodSlot[];
  cells: CapacityCell[];
}

export interface PeriodSlot {
  index: number;
  periodId: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Orchestration Graph  (L1 structural rules)
// ---------------------------------------------------------------------------

export interface DependencyEdge {
  fromItemId: string;
  toItemId: string;
}

export interface OrchestrationGraph {
  edges: DependencyEdge[];
}

// ---------------------------------------------------------------------------
// Proposed Changes
// ---------------------------------------------------------------------------

export type ProposedChange =
  | ScheduleChange
  | AddItemChange
  | RemoveItemChange
  | ReprioritizeChange;

export interface ScheduleChange {
  type: 'schedule';
  itemId: string;
  startPeriod: number;
}

export interface AddItemChange {
  type: 'add';
  item: WorkItem;
}

export interface RemoveItemChange {
  type: 'remove';
  itemId: string;
}

export interface ReprioritizeChange {
  type: 'reprioritize';
  itemId: string;
  newPriority: number;
}

// ---------------------------------------------------------------------------
// Projected Item  (work item + projection results)
// ---------------------------------------------------------------------------

export interface ProjectedItem {
  itemId: string;
  title: string;
  status: WorkItemStatus;
  priority: number;
  /** Period index where the item starts (undefined if unscheduled) */
  startPeriod?: number;
  /** Period index where the item ends (inclusive) */
  endPeriod?: number;
  /** Duration in periods */
  durationPeriods?: number;
  /** Skill-hours allocated per period */
  allocations: ProjectedAllocation[];
  /** Whether all dependencies are satisfied by the projected schedule */
  dependenciesSatisfied: boolean;
  /** IDs of dependencies that are NOT satisfied */
  unsatisfiedDependencies: string[];
}

export interface ProjectedAllocation {
  periodIndex: number;
  skill: string;
  hours: number;
}

// ---------------------------------------------------------------------------
// Structural Violations  (from L1 graph)
// ---------------------------------------------------------------------------

export interface StructuralViolation {
  type: 'dependency_cycle' | 'dependency_timing' | 'missing_dependency';
  message: string;
  itemIds: string[];
}

// ---------------------------------------------------------------------------
// Scenario  (the output of projection)
// ---------------------------------------------------------------------------

export interface Scenario {
  /** Projected state of every work item */
  projectedItems: ProjectedItem[];
  /** The capacity grid with all allocations applied */
  capacityGrid: CapacityGrid;
  /** Structural violations detected from the orchestration graph */
  structuralViolations: StructuralViolation[];
  /** Gap analysis: periods × skills where demand > supply */
  capacityGaps: CapacityGap[];
  /** Summary metrics */
  summary: ScenarioSummary;
}

export interface CapacityGap {
  periodIndex: number;
  skill: string;
  demandHours: number;
  availableHours: number;
  gapHours: number;
}

export interface ScenarioSummary {
  totalItems: number;
  scheduledItems: number;
  unscheduledItems: number;
  totalDemandHours: number;
  totalCapacityHours: number;
  totalAllocatedHours: number;
  overallGapHours: number;
  violationCount: number;
  /** Horizon span used for this projection */
  horizonPeriods: number;
}
