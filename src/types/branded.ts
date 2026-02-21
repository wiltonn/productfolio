/**
 * Branded types for type-safe IDs throughout CohesionXL.
 * Prevents accidental mixing of different ID domains.
 */

declare const __brand: unique symbol;

type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type TeamId = Brand<string, 'TeamId'>;
export type WorkItemId = Brand<string, 'WorkItemId'>;
export type PeriodId = Brand<string, 'PeriodId'>;
export type ConstraintId = Brand<string, 'ConstraintId'>;
export type ScenarioId = Brand<string, 'ScenarioId'>;
export type CapacitySlotId = Brand<string, 'CapacitySlotId'>;
