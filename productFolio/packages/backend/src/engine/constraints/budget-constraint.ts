import type { ConstraintEvaluator, ConstraintEvaluatorResult, Scenario } from './types.js';

export class BudgetConstraint implements ConstraintEvaluator {
  readonly id = 'budget';
  readonly name = 'Budget Constraint';

  evaluate(_scenario: Scenario): ConstraintEvaluatorResult {
    return { violations: [], warnings: [] };
  }
}
