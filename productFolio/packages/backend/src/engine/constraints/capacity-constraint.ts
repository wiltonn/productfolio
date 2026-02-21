import type {
  CapacityConstraintResult,
  ConstraintEvaluator,
  ConstraintViolation,
  ConstraintWarning,
  Scenario,
  UtilizationCell,
} from './types.js';

const DEFAULT_WARNING_THRESHOLD = 0.85;

export class CapacityConstraint implements ConstraintEvaluator {
  readonly id = 'capacity';
  readonly name = 'Capacity Constraint';

  private warningThreshold: number;

  constructor(warningThreshold = DEFAULT_WARNING_THRESHOLD) {
    this.warningThreshold = warningThreshold;
  }

  evaluate(scenario: Scenario): CapacityConstraintResult {
    const violations: ConstraintViolation[] = [];
    const warnings: ConstraintWarning[] = [];
    const utilizationGrid: UtilizationCell[] = [];

    for (const team of scenario.teams) {
      const allocated = new Array<number>(scenario.horizon).fill(0);

      for (const item of scenario.items) {
        for (const alloc of item.teamAllocations) {
          if (alloc.teamId === team.id && alloc.periodIndex < scenario.horizon) {
            allocated[alloc.periodIndex] += alloc.tokens;
          }
        }
      }

      for (let p = 0; p < scenario.horizon; p++) {
        const available = team.capacityByPeriod[p] ?? 0;
        const used = allocated[p];
        const utilization = available > 0 ? used / available : used > 0 ? Infinity : 0;

        utilizationGrid.push({
          teamId: team.id,
          periodIndex: p,
          allocated: used,
          available,
          utilization,
        });

        if (used > available) {
          violations.push({
            constraintId: this.id,
            severity: 'error',
            message: `Team "${team.name}" is over-allocated in period ${p}: ${used} tokens allocated but only ${available} available`,
            affectedItemIds: scenario.items
              .filter((item) =>
                item.teamAllocations.some(
                  (a) => a.teamId === team.id && a.periodIndex === p && a.tokens > 0,
                ),
              )
              .map((item) => item.id),
            affectedTeamIds: [team.id],
            affectedPeriods: [p],
          });
        } else if (utilization > this.warningThreshold) {
          warnings.push({
            constraintId: this.id,
            severity: 'warning',
            message: `Team "${team.name}" utilization in period ${p} is ${(utilization * 100).toFixed(1)}%`,
            metric: 'utilization',
            threshold: this.warningThreshold,
            actual: utilization,
          });
        }
      }
    }

    return { violations, warnings, utilizationGrid };
  }
}
