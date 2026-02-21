/**
 * Constraint — a named, typed constraint that bounds portfolio feasibility.
 */

import type { ConstraintId, PeriodId, TeamId, WorkItemId } from './branded.js';

export type ConstraintType =
  | 'capacity'
  | 'dependency'
  | 'temporal'
  | 'policy'
  | 'budget';

export type ConstraintSeverity = 'error' | 'warning' | 'info';

/**
 * Defines which teams, periods, and/or work items a constraint spans.
 */
export interface ConstraintScope {
  readonly teamIds?: readonly TeamId[];
  readonly periodIds?: readonly PeriodId[];
  readonly workItemIds?: readonly WorkItemId[];
}

/**
 * The result of evaluating a single constraint against a scenario.
 */
export interface ConstraintResult {
  readonly constraintId: ConstraintId;
  readonly satisfied: boolean;
  readonly severity: ConstraintSeverity;
  readonly message: string;
}

export type ConstraintViolation = ConstraintResult & {
  readonly satisfied: false;
};

/**
 * Minimal scenario shape needed by constraint evaluation.
 * Avoids circular dependency with scenario.ts.
 */
export interface ConstraintEvaluationContext {
  readonly projectedWorkItems: readonly unknown[];
  readonly capacityGrid: ReadonlyMap<unknown, ReadonlyMap<unknown, unknown>>;
}

/**
 * A constraint definition. The `evaluate` function is a pure function
 * that inspects a scenario and returns a result.
 */
export interface Constraint {
  readonly id: ConstraintId;
  readonly name: string;
  readonly type: ConstraintType;
  readonly scope: ConstraintScope;
  readonly evaluate: (scenario: ConstraintEvaluationContext) => ConstraintResult;
}
