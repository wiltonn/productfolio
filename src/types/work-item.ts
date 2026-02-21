/**
 * WorkItem — a unit of deliverable work in the portfolio.
 */

import type { TeamId, WorkItemId } from './branded.js';
import type { TokenRequirement } from './token.js';

/**
 * Lifecycle states for a work item.
 * Kept as a union so the lifecycle graph can be extended
 * without breaking existing consumers.
 */
export type WorkItemState =
  | 'proposed'
  | 'scoping'
  | 'ready'
  | 'in_progress'
  | 'done'
  | 'cancelled';

export interface WorkItem {
  readonly id: WorkItemId;
  readonly name: string;
  readonly state: WorkItemState;
  /**
   * Token requirements keyed by the team that must supply them.
   * Uses a readonly map to preserve immutability.
   */
  readonly tokenRequirements: ReadonlyMap<TeamId, TokenRequirement>;
  /** Duration in planning periods (e.g. 2 = spans two sprints). */
  readonly duration: number;
  /** IDs of work items that must complete before this one can start. */
  readonly dependencies: readonly WorkItemId[];
}
