// ============================================================================
// Governance Decision Layer — Type Definitions
// ============================================================================

import type { TokenLedgerSummary } from '../../planning/types.js';

// --- Core Decision Types ---

export interface GovernanceDecision {
  approved: boolean;
  scenario: ProjectedScenario;
  violations: Violation[];
  warnings: Warning[];
  alternativeSuggestions?: AlternativeSuggestion;
}

export interface ProjectedScenario {
  items: WorkItem[];
  periodCapacity: PeriodCapacity[];
  totalDemand: number;
  totalCapacity: number;
  utilization: number;
  ledger: TokenLedgerSummary | null;
}

export interface Violation {
  code: ViolationCode;
  severity: 'critical' | 'high' | 'medium';
  message: string;
  affectedItems: string[];
  detail: Record<string, unknown>;
}

export type ViolationCode =
  | 'CAPACITY_EXCEEDED'
  | 'DEPENDENCY_CYCLE'
  | 'DEPENDENCY_NOT_SCHEDULED'
  | 'INVALID_STATE_TRANSITION'
  | 'SKILL_POOL_DEFICIT'
  | 'OVERALLOCATION'
  | 'PERIOD_CONFLICT';

export interface Warning {
  code: WarningCode;
  message: string;
  affectedItems: string[];
}

export type WarningCode =
  | 'NEAR_CAPACITY'
  | 'SINGLE_POINT_OF_FAILURE'
  | 'TIGHT_DEPENDENCY_CHAIN'
  | 'NO_BUFFER';

export interface AlternativeSuggestion {
  startPeriod: number;
  tradeoffs: string[];
}

// --- Work Item Types ---

export interface WorkItem {
  id: string;
  title: string;
  demandBySkill: Record<string, number>;
  priority: number;
  dependencies: string[];
  startPeriod: number;
  duration: number;
  status: WorkItemStatus;
}

export type WorkItemStatus = 'PROPOSED' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETE';

// --- Capacity Types ---

export interface PeriodCapacity {
  period: number;
  capacityBySkill: Record<string, number>;
  allocatedBySkill: Record<string, number>;
  remainingBySkill: Record<string, number>;
}

// --- Portfolio Health ---

export interface PortfolioHealthReport {
  healthy: boolean;
  score: number;
  items: WorkItem[];
  periodCapacity: PeriodCapacity[];
  violations: Violation[];
  warnings: Warning[];
  summary: PortfolioSummary;
}

export interface PortfolioSummary {
  totalItems: number;
  scheduledItems: number;
  totalDemandHours: number;
  totalCapacityHours: number;
  overallUtilization: number;
  constrainedSkills: string[];
  criticalViolations: number;
}

// --- Auto-Schedule Types ---

export interface AutoScheduleResult {
  feasible: boolean;
  scenario: ProjectedScenario;
  schedule: ScheduledItem[];
  violations: Violation[];
  warnings: Warning[];
}

export interface ScheduledItem {
  itemId: string;
  startPeriod: number;
  endPeriod: number;
  assignedCapacity: Record<string, number>;
}

// --- What-If Types ---

export interface WhatIfChange {
  type: 'ADD_ITEM' | 'REMOVE_ITEM' | 'MOVE_ITEM' | 'RESIZE_ITEM' | 'ADD_CAPACITY' | 'REMOVE_CAPACITY';
  itemId?: string;
  item?: WorkItem;
  targetPeriod?: number;
  newDuration?: number;
  skill?: string;
  capacityDelta?: number;
}

export interface WhatIfResult {
  baseline: ProjectedScenario;
  projected: ProjectedScenario;
  delta: WhatIfDelta;
  violations: Violation[];
  warnings: Warning[];
  feasible: boolean;
}

export interface WhatIfDelta {
  utilizationChange: number;
  newViolations: Violation[];
  resolvedViolations: Violation[];
  capacityImpact: Record<string, number>;
}

// --- Decision Log ---

export interface DecisionLogEntry {
  id: string;
  timestamp: Date;
  action: 'REQUEST_TRANSITION' | 'VALIDATE_PORTFOLIO' | 'AUTO_SCHEDULE' | 'WHAT_IF';
  request: unknown;
  projectedScenario: ProjectedScenario;
  constraintsEvaluated: string[];
  result: 'APPROVED' | 'REJECTED' | 'PARTIAL';
  violations: Violation[];
  warnings: Warning[];
  durationMs: number;
}

// --- Capacity Definition (input to the engine) ---

export interface CapacityPlan {
  periods: number;
  capacityBySkillPerPeriod: Record<string, number>;
}
