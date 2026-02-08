import type { PlanningEngine } from './planning-engine.js';
import { allocationService } from '../services/allocation.service.js';
import { scenarioCalculatorService } from '../services/scenario-calculator.service.js';
import { WorkflowError } from '../lib/errors.js';
import type { CapacityDemandResult, CalculatorResult, CalculatorOptions } from '../types/index.js';
import type { TokenLedgerSummary } from './types.js';

export class LegacyTimeModel implements PlanningEngine {
  async getCapacityDemand(scenarioId: string): Promise<CapacityDemandResult[]> {
    return allocationService.calculateCapacityDemand(scenarioId);
  }

  async getCalculator(scenarioId: string, options?: CalculatorOptions): Promise<CalculatorResult> {
    return scenarioCalculatorService.calculate(scenarioId, options);
  }

  async getTokenLedgerSummary(scenarioId: string): Promise<TokenLedgerSummary> {
    throw new WorkflowError(
      'Token ledger is not available in legacy planning mode. Switch to token-based planning to use this feature.',
      'LEGACY'
    );
  }
}
