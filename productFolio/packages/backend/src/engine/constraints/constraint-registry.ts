import type { ConstraintEvaluator } from './types.js';
import { CapacityConstraint } from './capacity-constraint.js';
import { DependencyConstraint } from './dependency-constraint.js';
import { TemporalFitConstraint } from './temporal-fit-constraint.js';
import { BudgetConstraint } from './budget-constraint.js';

export class ConstraintRegistry {
  private evaluators: ConstraintEvaluator[] = [];

  constructor({ defaults = true }: { defaults?: boolean } = {}) {
    if (defaults) {
      this.evaluators.push(
        new CapacityConstraint(),
        new DependencyConstraint(),
        new TemporalFitConstraint(),
        new BudgetConstraint(),
      );
    }
  }

  register(evaluator: ConstraintEvaluator): void {
    this.evaluators.push(evaluator);
  }

  getAll(): ConstraintEvaluator[] {
    return [...this.evaluators];
  }
}
