import type { PlanningEngine } from './planning-engine.js';
import { NotFoundError, WorkflowError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import type { CapacityDemandResult, CalculatorResult, CalculatorOptions } from '../types/index.js';
import type { TokenLedgerSummary, TokenLedgerPoolEntry, BindingConstraint, LedgerExplanation } from './types.js';

export class TokenFlowModel implements PlanningEngine {
  async getCapacityDemand(scenarioId: string): Promise<CapacityDemandResult[]> {
    throw new WorkflowError(
      'Token flow capacity-demand calculation is not yet implemented',
      'TOKEN'
    );
  }

  async getCalculator(scenarioId: string, options?: CalculatorOptions): Promise<CalculatorResult> {
    throw new WorkflowError(
      'Token flow calculator is not yet implemented',
      'TOKEN'
    );
  }

  async getTokenLedgerSummary(scenarioId: string): Promise<TokenLedgerSummary> {
    // 1. Load scenario with period info
    const scenario = await prisma.scenario.findUnique({
      where: { id: scenarioId },
      include: { period: true },
    });
    if (!scenario) {
      throw new NotFoundError('Scenario', scenarioId);
    }

    // 2. Validate planning mode
    if (scenario.planningMode !== 'TOKEN') {
      throw new WorkflowError(
        'Token ledger is only available for scenarios using TOKEN planning mode',
        scenario.planningMode
      );
    }

    // 3. Load active skill pools
    const skillPools = await prisma.skillPool.findMany({
      where: { isActive: true },
    });

    if (skillPools.length === 0) {
      return {
        scenarioId,
        periodId: scenario.periodId,
        periodLabel: scenario.period.label,
        pools: [],
        bindingConstraints: [],
        explanations: [],
      };
    }

    // 4. Load and aggregate token supply by pool
    const supplies = await prisma.tokenSupply.findMany({
      where: { scenarioId },
    });
    const supplyMap = new Map<string, number>();
    for (const s of supplies) {
      supplyMap.set(s.skillPoolId, (supplyMap.get(s.skillPoolId) ?? 0) + s.tokens);
    }

    // 5. Load and aggregate token demand by pool
    const demands = await prisma.tokenDemand.findMany({
      where: { scenarioId },
    });
    const demandP50Map = new Map<string, number>();
    const demandP90Map = new Map<string, number | null>();
    for (const d of demands) {
      // P50: simple sum
      demandP50Map.set(d.skillPoolId, (demandP50Map.get(d.skillPoolId) ?? 0) + d.tokensP50);

      // P90: sum if all non-null; null if any null
      if (!demandP90Map.has(d.skillPoolId)) {
        // First entry for this pool
        demandP90Map.set(d.skillPoolId, d.tokensP90);
      } else {
        const currentP90 = demandP90Map.get(d.skillPoolId) ?? null;
        if (currentP90 === null || d.tokensP90 === null) {
          // Any null makes the whole pool null
          demandP90Map.set(d.skillPoolId, null);
        } else {
          demandP90Map.set(d.skillPoolId, currentP90 + d.tokensP90);
        }
      }
    }

    // 6. Build pools array
    const pools: TokenLedgerPoolEntry[] = skillPools.map((pool) => {
      const supplyTokens = supplyMap.get(pool.id) ?? 0;
      const demandP50 = demandP50Map.get(pool.id) ?? 0;
      const demandP90 = demandP90Map.has(pool.id) ? demandP90Map.get(pool.id)! : null;
      const delta = supplyTokens - demandP50;
      return { poolName: pool.name, supplyTokens, demandP50, demandP90, delta };
    });

    // 7. Build binding constraints (pools where delta < 0, sorted by deficit descending)
    const bindingConstraints: BindingConstraint[] = pools
      .filter((p) => p.delta < 0)
      .map((p) => ({ poolName: p.poolName, deficit: Math.abs(p.delta) }))
      .sort((a, b) => b.deficit - a.deficit);

    // 8. Generate natural-language explanations for each pool
    const explanations: LedgerExplanation[] = pools
      .filter((p) => p.supplyTokens > 0 || p.demandP50 > 0)
      .map((p) => ({
        skillPool: p.poolName,
        message: buildPoolExplanation(p),
      }));

    return {
      scenarioId,
      periodId: scenario.periodId,
      periodLabel: scenario.period.label,
      pools,
      bindingConstraints,
      explanations,
    };
  }
}

function buildPoolExplanation(pool: TokenLedgerPoolEntry): string {
  const name = capitalize(pool.poolName);
  const deficit = Math.abs(pool.delta);

  if (pool.supplyTokens === 0 && pool.demandP50 === 0) {
    return `${name} has no supply or demand configured.`;
  }
  if (pool.supplyTokens === 0) {
    return `${name} has ${pool.demandP50} tokens of demand but no supply allocated.`;
  }
  if (pool.demandP50 === 0) {
    return `${name} has ${pool.supplyTokens} tokens of supply with no demand against it.`;
  }
  if (pool.delta < 0) {
    return `${name} throughput is constrained because demand exceeds calibrated quarterly capacity by ${deficit} tokens.`;
  }
  if (pool.delta === 0) {
    return `${name} supply exactly matches demand at ${pool.supplyTokens} tokens.`;
  }
  return `${name} has ${pool.delta} tokens of surplus capacity.`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
