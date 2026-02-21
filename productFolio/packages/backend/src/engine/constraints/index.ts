export type {
  TeamAllocation,
  ScheduledItem,
  Team,
  Scenario,
  ValidationResult,
  ConstraintViolation,
  ConstraintWarning,
  UtilizationCell,
  ConstraintEvaluator,
  ConstraintEvaluatorResult,
  CapacityConstraintResult,
} from './types.js';

export { CapacityConstraint } from './capacity-constraint.js';
export { DependencyConstraint } from './dependency-constraint.js';
export { TemporalFitConstraint } from './temporal-fit-constraint.js';
export { BudgetConstraint } from './budget-constraint.js';
export { ConstraintRegistry } from './constraint-registry.js';
export { ConstraintValidator } from './constraint-validator.js';
export { CapacityGrid } from './capacity-grid.js';
export type { CapacitySlot, GridWorkItem, ContentionEntry } from './capacity-grid.js';

import { ConstraintValidator } from './constraint-validator.js';

export function createConstraintValidator(): ConstraintValidator {
  return new ConstraintValidator();
}
