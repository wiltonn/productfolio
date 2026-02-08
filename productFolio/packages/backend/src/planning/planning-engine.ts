import type { CapacityDemandResult, CalculatorResult, CalculatorOptions } from '../types/index.js';
import type { TokenLedgerSummary } from './types.js';

export interface PlanningEngine {
  getCapacityDemand(scenarioId: string): Promise<CapacityDemandResult[]>;
  getCalculator(scenarioId: string, options?: CalculatorOptions): Promise<CalculatorResult>;
  getTokenLedgerSummary(scenarioId: string): Promise<TokenLedgerSummary>;
}
