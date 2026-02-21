/**
 * PlanningHorizon — the temporal dimension of the portfolio plan.
 */

import type { PeriodId } from './branded.js';

export interface PlanningPeriod {
  readonly id: PeriodId;
  readonly startDate: string; // ISO 8601 date
  readonly endDate: string;   // ISO 8601 date
}

export interface PlanningHorizon {
  readonly periods: readonly PlanningPeriod[];
}
