/**
 * Token — the fundamental capacity unit in CohesionXL.
 *
 * Tokens are NOT time. They are capability-throughput units that
 * abstract away hours, story points, and other legacy measures.
 */

export type TokenType = 'human' | 'ai_agent' | 'blended';

export interface Token {
  readonly tokenAmount: number;
  readonly tokenType: TokenType;
}

/**
 * A token requirement scoped to a specific team for a work item.
 */
export interface TokenRequirement {
  readonly tokens: Token;
  readonly confidence: number; // 0–1, how certain is this estimate
}
