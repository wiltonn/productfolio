/**
 * Scenario — the full portfolio state projection.
 *
 * A scenario is an immutable snapshot of projected work item states,
 * capacity allocations, and constraint evaluations.
 */

import type { PeriodId, ScenarioId, TeamId } from './branded.js';
import type { CapacitySlot } from './capacity-slot.js';
import type { Constraint, ConstraintResult, ConstraintViolation } from './constraint.js';
import type { WorkItem } from './work-item.js';

/**
 * A work item projected into the timeline with start/end period assignments.
 */
export interface ProjectedWorkItem {
  readonly workItem: WorkItem;
  readonly startPeriodId: PeriodId;
  readonly endPeriodId: PeriodId;
}

/**
 * The full Team × Period allocation matrix.
 * Outer key: TeamId, inner key: PeriodId.
 */
export type CapacityGrid = ReadonlyMap<TeamId, ReadonlyMap<PeriodId, CapacitySlot>>;

export interface Scenario {
  readonly id: ScenarioId;
  readonly name: string;
  /** Work items with their projected states and timing. */
  readonly projectedWorkItems: readonly ProjectedWorkItem[];
  /** The full Team × Period allocation matrix. */
  readonly capacityGrid: CapacityGrid;
  /** The constraint set used for evaluation. */
  readonly constraints: readonly Constraint[];
  /** Results of evaluating all constraints. */
  readonly constraintResults: readonly ConstraintResult[];
  /** Whether the scenario satisfies all error-level constraints. */
  readonly feasible: boolean;
  /** Subset of constraint results that are violations. */
  readonly violations: readonly ConstraintViolation[];
}
