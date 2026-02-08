export interface TokenLedgerPoolEntry {
  poolName: string;
  supplyTokens: number;
  demandP50: number;
  demandP90: number | null;
  delta: number; // supplyTokens - demandP50
}

export interface BindingConstraint {
  poolName: string;
  deficit: number; // Math.abs(delta) for pools where delta < 0
}

export interface LedgerExplanation {
  skillPool: string;
  message: string;
}

export interface TokenLedgerSummary {
  scenarioId: string;
  periodId: string;
  periodLabel: string;
  pools: TokenLedgerPoolEntry[];
  bindingConstraints: BindingConstraint[];
  explanations: LedgerExplanation[];
}
