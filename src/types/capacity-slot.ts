/**
 * CapacitySlot — the intersection of Team × Period.
 *
 * Represents the token capacity available, allocated, and remaining
 * for a specific team during a specific planning period.
 */

import type { CapacitySlotId, PeriodId, TeamId } from './branded.js';

export interface CapacitySlot {
  readonly id: CapacitySlotId;
  readonly teamId: TeamId;
  readonly periodId: PeriodId;
  readonly totalTokens: number;
  readonly allocatedTokens: number;
  readonly remainingTokens: number;
}
