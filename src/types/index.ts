/**
 * CohesionXL Core Type System
 *
 * Domain primitives for token-based portfolio capacity planning.
 */

// Branded IDs
export type {
  TeamId,
  WorkItemId,
  PeriodId,
  ConstraintId,
  ScenarioId,
  CapacitySlotId,
} from './branded.js';

// Token primitives
export type { Token, TokenType, TokenRequirement } from './token.js';

// Organizational
export type { Team } from './team.js';

// Work
export type { WorkItem, WorkItemState } from './work-item.js';

// Temporal
export type { PlanningPeriod, PlanningHorizon } from './planning-horizon.js';

// Capacity
export type { CapacitySlot } from './capacity-slot.js';

// Constraints
export type {
  Constraint,
  ConstraintType,
  ConstraintSeverity,
  ConstraintScope,
  ConstraintResult,
  ConstraintViolation,
} from './constraint.js';

// Scenario
export type {
  Scenario,
  ProjectedWorkItem,
  CapacityGrid,
} from './scenario.js';
