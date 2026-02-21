import type {
  ConstraintEvaluator,
  ConstraintEvaluatorResult,
  ConstraintViolation,
  Scenario,
} from './types.js';

export class TemporalFitConstraint implements ConstraintEvaluator {
  readonly id = 'temporal-fit';
  readonly name = 'Temporal Fit Constraint';

  evaluate(scenario: Scenario): ConstraintEvaluatorResult {
    const violations: ConstraintViolation[] = [];

    for (const item of scenario.items) {
      const endPeriod = item.startPeriod + item.duration;
      if (endPeriod > scenario.horizon) {
        violations.push({
          constraintId: this.id,
          severity: 'error',
          message: `Item "${item.name}" extends to period ${endPeriod} which exceeds the planning horizon of ${scenario.horizon}`,
          affectedItemIds: [item.id],
          affectedTeamIds: [],
          affectedPeriods: Array.from(
            { length: endPeriod - scenario.horizon },
            (_, i) => scenario.horizon + i,
          ),
        });
      }
    }

    return { violations, warnings: [] };
  }
}
