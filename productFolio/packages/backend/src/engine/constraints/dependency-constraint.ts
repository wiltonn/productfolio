import type {
  ConstraintEvaluator,
  ConstraintEvaluatorResult,
  ConstraintViolation,
  Scenario,
} from './types.js';

export class DependencyConstraint implements ConstraintEvaluator {
  readonly id = 'dependency';
  readonly name = 'Dependency Constraint';

  evaluate(scenario: Scenario): ConstraintEvaluatorResult {
    const violations: ConstraintViolation[] = [];
    const itemMap = new Map(scenario.items.map((item) => [item.id, item]));

    for (const item of scenario.items) {
      for (const depId of item.dependencies) {
        const dep = itemMap.get(depId);
        if (!dep) continue;

        const depCompletes = dep.startPeriod + dep.duration;
        if (item.startPeriod < depCompletes) {
          violations.push({
            constraintId: this.id,
            severity: 'error',
            message: `Item "${item.name}" starts at period ${item.startPeriod} but dependency "${dep.name}" does not complete until period ${depCompletes}`,
            affectedItemIds: [item.id, dep.id],
            affectedTeamIds: [],
            affectedPeriods: [item.startPeriod],
          });
        }
      }
    }

    return { violations, warnings: [] };
  }
}
