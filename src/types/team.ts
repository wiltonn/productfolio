/**
 * Team — a capacity-bearing organizational unit.
 */

import type { TeamId } from './branded.js';
import type { Token } from './token.js';

export interface Team {
  readonly id: TeamId;
  readonly name: string;
  /** Token budget available per planning period. */
  readonly tokenBudget: Token;
  /** Tags for future skill-matching against work item demands. */
  readonly skillTags: readonly string[];
}
