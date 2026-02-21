/**
 * L2 Token-Based Scenario Projection — Types
 *
 * In-memory structures for projecting portfolio state changes
 * through token supply/demand. These mirror the Prisma TokenSupply
 * and TokenDemand models but live entirely in memory — no DB writes.
 */

// ---------------------------------------------------------------------------
// Initiative status (mirrors Prisma enum, defined locally for portability)
// ---------------------------------------------------------------------------

export type InitiativeStatus =
  | 'PROPOSED'
  | 'SCOPING'
  | 'RESOURCING'
  | 'IN_EXECUTION'
  | 'COMPLETE'
  | 'ON_HOLD'
  | 'CANCELLED';

// ---------------------------------------------------------------------------
// Token state (cloneable in-memory mirrors of DB rows)
// ---------------------------------------------------------------------------

export interface TokenSupplyEntry {
  skillPoolId: string;
  skillPoolName: string;
  tokens: number;
}

export interface TokenDemandEntry {
  initiativeId: string;
  skillPoolId: string;
  skillPoolName: string;
  tokensP50: number;
  tokensP90: number | null;
}

// ---------------------------------------------------------------------------
// Projected scenario — the in-memory result of a projection
// ---------------------------------------------------------------------------

export interface ProjectedScenario {
  /** Source scenario ID this projection is derived from */
  sourceScenarioId: string;
  /** Cloned token supply (unchanged by projection) */
  supply: TokenSupplyEntry[];
  /** Cloned + mutated token demand */
  demand: TokenDemandEntry[];
  /** Changes that were applied to produce this projection */
  appliedChanges: AppliedChange[];
  /** Per-pool supply vs demand delta */
  ledger: ProjectedLedgerEntry[];
}

export interface ProjectedLedgerEntry {
  skillPoolId: string;
  skillPoolName: string;
  supplyTokens: number;
  demandP50: number;
  demandP90: number | null;
  deltaP50: number;
  deltaP90: number | null;
}

// ---------------------------------------------------------------------------
// Change descriptors
// ---------------------------------------------------------------------------

export interface StatusTransition {
  initiativeId: string;
  targetStatus: InitiativeStatus;
}

export interface AppliedChange {
  initiativeId: string;
  targetStatus: InitiativeStatus;
  action: 'add_demand' | 'remove_demand' | 'no_change';
  affectedSkillPools: string[];
}

// ---------------------------------------------------------------------------
// Initiative demand snapshot (what an initiative needs per skill pool)
// ---------------------------------------------------------------------------

export interface InitiativeDemandSnapshot {
  initiativeId: string;
  demands: {
    skillPoolId: string;
    skillPoolName: string;
    tokensP50: number;
    tokensP90: number | null;
  }[];
}

// ---------------------------------------------------------------------------
// Validation types (mirrors L3 — kept local for portability)
// ---------------------------------------------------------------------------

export interface ConstraintViolation {
  constraintId: string;
  severity: 'error';
  message: string;
  affectedItemIds: string[];
  affectedTeamIds: string[];
  affectedPeriods: number[];
}

export interface ConstraintWarning {
  constraintId: string;
  severity: 'warning';
  message: string;
  metric: string;
  threshold: number;
  actual: number;
}

export interface UtilizationCell {
  teamId: string;
  periodIndex: number;
  allocated: number;
  available: number;
  utilization: number;
}

export interface ValidationResult {
  feasible: boolean;
  violations: ConstraintViolation[];
  warnings: ConstraintWarning[];
  utilizationMap: UtilizationCell[];
}

// ---------------------------------------------------------------------------
// L3 constraint scenario types (mirrors constraints/types.ts)
// ---------------------------------------------------------------------------

export interface TeamAllocation {
  teamId: string;
  periodIndex: number;
  tokens: number;
}

export interface ScheduledItem {
  id: string;
  name: string;
  teamAllocations: TeamAllocation[];
  startPeriod: number;
  duration: number;
  dependencies: string[];
}

export interface ConstraintTeam {
  id: string;
  name: string;
  capacityByPeriod: number[];
}

export interface ConstraintScenario {
  id: string;
  name: string;
  horizon: number;
  teams: ConstraintTeam[];
  items: ScheduledItem[];
}

// ---------------------------------------------------------------------------
// What-if result: projection + validation bundled together
// ---------------------------------------------------------------------------

export interface WhatIfResult {
  projection: ProjectedScenario;
  validation: ValidationResult;
  /** L3 constraint scenario that was evaluated */
  constraintScenario: ConstraintScenario;
}

// ---------------------------------------------------------------------------
// Validator interface — injectable for L3 integration
// ---------------------------------------------------------------------------

export interface ScenarioValidator {
  validate(scenario: ConstraintScenario): ValidationResult;
}

// ---------------------------------------------------------------------------
// Data provider interface — abstracts DB access for testability
// ---------------------------------------------------------------------------

export interface ScenarioDataProvider {
  /** Load all token supply entries for a scenario */
  getTokenSupply(scenarioId: string): Promise<TokenSupplyEntry[]>;
  /** Load all token demand entries for a scenario */
  getTokenDemand(scenarioId: string): Promise<TokenDemandEntry[]>;
  /** Load the demand snapshot for a specific initiative (what it would need) */
  getInitiativeDemand(
    scenarioId: string,
    initiativeId: string,
  ): Promise<InitiativeDemandSnapshot>;
  /** Load dependency IDs for an initiative (what must complete before it) */
  getInitiativeDependencies(initiativeId: string): Promise<string[]>;
}
