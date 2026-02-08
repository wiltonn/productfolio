// ============================================================================
// Triple Constraint Rollup Types (frontend mirror of backend types)
// ============================================================================

export interface RollupScope {
  totalTokensP50: number;
  totalTokensP90: number | null;
  bySkillPool: Array<{
    skillPoolId: string;
    skillPoolName: string;
    tokensP50: number;
    tokensP90: number | null;
  }>;
}

export interface RollupBudget {
  totalHours: number;
  totalEstimatedCost: number;
  costCoverage: {
    hoursWithCostBand: number;
    hoursWithoutCostBand: number;
    employeesWithCostBand: number;
    employeesWithoutCostBand: number;
  };
}

export interface RollupTimeline {
  earliestStart: string | null;
  latestEnd: string | null;
  periodCount: number;
  totalAllocatedHours: number;
}

export interface RollupGroupRow {
  groupId: string;
  groupName: string;
  initiativeCount: number;
  initiativeIds: string[];
  scope: RollupScope | null;
  budget: RollupBudget;
  timeline: RollupTimeline;
}

export interface RollupResponse {
  scenarioId: string;
  scenarioName: string;
  planningMode: 'LEGACY' | 'TOKEN';
  periodId: string;
  periodLabel: string;
  lens: 'PORTFOLIO_AREA' | 'ORG_NODE' | 'BUSINESS_OWNER';
  groups: RollupGroupRow[];
  unattributed: RollupGroupRow;
  totals: {
    scope: RollupScope | null;
    budget: RollupBudget;
    timeline: RollupTimeline;
  };
  computedAt: string;
  warnings: string[];
}
