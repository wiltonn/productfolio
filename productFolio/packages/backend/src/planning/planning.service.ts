import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';
import type { PlanningEngine } from './planning-engine.js';
import { LegacyTimeModel } from './legacy-time-model.js';
import { TokenFlowModel } from './token-flow-model.js';
import type { CapacityDemandResult, CalculatorResult, CalculatorOptions } from '../types/index.js';
import type { TokenLedgerSummary } from './types.js';

export class PlanningService {
  private legacyEngine: PlanningEngine;
  private tokenEngine: PlanningEngine;

  constructor() {
    this.legacyEngine = new LegacyTimeModel();
    this.tokenEngine = new TokenFlowModel();
  }

  async getEngine(scenarioId: string): Promise<PlanningEngine> {
    const scenario = await prisma.scenario.findUnique({
      where: { id: scenarioId },
      select: { planningMode: true },
    });
    if (!scenario) throw new NotFoundError('Scenario', scenarioId);

    return scenario.planningMode === 'TOKEN'
      ? this.tokenEngine
      : this.legacyEngine;
  }

  async getCapacityDemand(scenarioId: string): Promise<CapacityDemandResult[]> {
    const engine = await this.getEngine(scenarioId);
    return engine.getCapacityDemand(scenarioId);
  }

  async getCalculator(scenarioId: string, options?: CalculatorOptions): Promise<CalculatorResult> {
    const engine = await this.getEngine(scenarioId);
    return engine.getCalculator(scenarioId, options);
  }

  async getTokenLedgerSummary(scenarioId: string): Promise<TokenLedgerSummary> {
    const engine = await this.getEngine(scenarioId);
    return engine.getTokenLedgerSummary(scenarioId);
  }
}

export const planningService = new PlanningService();
