import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildTestApp, testUuid } from './setup.js';
import { WorkflowError } from '../lib/errors.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRedis = {
  get: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
};

vi.mock('../lib/redis.js', () => ({
  getRedisClient: () => mockRedis,
  getCachedData: vi.fn(),
  setCachedData: vi.fn(),
  deleteKey: vi.fn(),
  CACHE_KEYS: { scenarioCalculation: (id: string) => `scenario:${id}:calculations` },
  CACHE_TTL: { CALCULATION: 300 },
}));

vi.mock('../lib/prisma.js', () => {
  const mockPrisma = {
    scenario: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    skillPool: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    tokenSupply: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
    tokenDemand: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
    initiative: {
      findUnique: vi.fn(),
    },
    featureFlag: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((fns: any[]) => Promise.all(fns)),
  };
  return { prisma: mockPrisma };
});

vi.mock('../services/feature-flag.service.js', async (importOriginal) => {
  const orig: any = await importOriginal();
  return {
    ...orig,
    isEnabled: vi.fn(),
  };
});

vi.mock('../services/allocation.service.js', () => ({
  allocationService: {
    calculateCapacityDemand: vi.fn(),
  },
}));

vi.mock('../services/scenario-calculator.service.js', () => ({
  scenarioCalculatorService: {
    calculate: vi.fn(),
  },
  ScenarioCalculatorService: vi.fn(),
}));

import { prisma } from '../lib/prisma.js';
import { isEnabled } from '../services/feature-flag.service.js';

const mockPrisma = prisma as any;
const mockIsEnabled = isEnabled as any;

// ---------------------------------------------------------------------------
// TokenFlowModel.getTokenLedgerSummary unit tests
// ---------------------------------------------------------------------------

describe('TokenFlowModel.getTokenLedgerSummary', () => {
  let TokenFlowModel: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../planning/token-flow-model.js');
    TokenFlowModel = mod.TokenFlowModel;
  });

  it('computes correct deltas for 3 pools with supply and demand', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('5c0'),
      planningMode: 'TOKEN',
      periodId: testUuid('aaa'),
      period: { id: testUuid('aaa'), label: 'Q1 2025' },
    });

    mockPrisma.skillPool.findMany.mockResolvedValue([
      { id: testUuid('a01'), name: 'Backend', isActive: true },
      { id: testUuid('a02'), name: 'Frontend', isActive: true },
      { id: testUuid('a03'), name: 'QA', isActive: true },
    ]);

    mockPrisma.tokenSupply.findMany.mockResolvedValue([
      { skillPoolId: testUuid('a01'), tokens: 100 },
      { skillPoolId: testUuid('a02'), tokens: 50 },
      { skillPoolId: testUuid('a03'), tokens: 30 },
    ]);

    mockPrisma.tokenDemand.findMany.mockResolvedValue([
      { skillPoolId: testUuid('a01'), tokensP50: 80, tokensP90: 120 },
      { skillPoolId: testUuid('a02'), tokensP50: 70, tokensP90: 90 },
      { skillPoolId: testUuid('a03'), tokensP50: 10, tokensP90: 15 },
    ]);

    const model = new TokenFlowModel();
    const result = await model.getTokenLedgerSummary(testUuid('5c0'));

    expect(result.pools).toHaveLength(3);

    const backend = result.pools.find((p: any) => p.poolName === 'Backend');
    expect(backend.supplyTokens).toBe(100);
    expect(backend.demandP50).toBe(80);
    expect(backend.delta).toBe(20); // 100 - 80 = surplus

    const frontend = result.pools.find((p: any) => p.poolName === 'Frontend');
    expect(frontend.supplyTokens).toBe(50);
    expect(frontend.demandP50).toBe(70);
    expect(frontend.delta).toBe(-20); // 50 - 70 = deficit

    const qa = result.pools.find((p: any) => p.poolName === 'QA');
    expect(qa.delta).toBe(20); // 30 - 10 = surplus

    // Explanations for each pool with data
    expect(result.explanations).toHaveLength(3);
    const beExpl = result.explanations.find((e: any) => e.skillPool === 'Backend');
    expect(beExpl.message).toContain('surplus');
    const feExpl = result.explanations.find((e: any) => e.skillPool === 'Frontend');
    expect(feExpl.message).toContain('constrained');
    expect(feExpl.message).toContain('20 tokens');
  });

  it('bindingConstraints sorted by deficit (most negative first)', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('5c0'),
      planningMode: 'TOKEN',
      periodId: testUuid('aaa'),
      period: { id: testUuid('aaa'), label: 'Q1 2025' },
    });

    mockPrisma.skillPool.findMany.mockResolvedValue([
      { id: testUuid('a01'), name: 'Backend', isActive: true },
      { id: testUuid('a02'), name: 'Frontend', isActive: true },
      { id: testUuid('a03'), name: 'QA', isActive: true },
    ]);

    mockPrisma.tokenSupply.findMany.mockResolvedValue([
      { skillPoolId: testUuid('a01'), tokens: 10 },
      { skillPoolId: testUuid('a02'), tokens: 5 },
      // No supply for QA
    ]);

    mockPrisma.tokenDemand.findMany.mockResolvedValue([
      { skillPoolId: testUuid('a01'), tokensP50: 50, tokensP90: null },  // deficit 40
      { skillPoolId: testUuid('a02'), tokensP50: 100, tokensP90: null }, // deficit 95
      { skillPoolId: testUuid('a03'), tokensP50: 20, tokensP90: null },  // deficit 20
    ]);

    const model = new TokenFlowModel();
    const result = await model.getTokenLedgerSummary(testUuid('5c0'));

    // All pools have deficit
    expect(result.bindingConstraints).toHaveLength(3);
    // Sorted by deficit descending (biggest deficit first)
    expect(result.bindingConstraints[0].poolName).toBe('Frontend');
    expect(result.bindingConstraints[0].deficit).toBe(95);
    expect(result.bindingConstraints[1].poolName).toBe('Backend');
    expect(result.bindingConstraints[1].deficit).toBe(40);
    expect(result.bindingConstraints[2].poolName).toBe('QA');
    expect(result.bindingConstraints[2].deficit).toBe(20);
  });

  it('no supply entries results in all deficits', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('5c0'),
      planningMode: 'TOKEN',
      periodId: testUuid('aaa'),
      period: { id: testUuid('aaa'), label: 'Q1 2025' },
    });

    mockPrisma.skillPool.findMany.mockResolvedValue([
      { id: testUuid('a01'), name: 'Backend', isActive: true },
    ]);

    mockPrisma.tokenSupply.findMany.mockResolvedValue([]); // no supply

    mockPrisma.tokenDemand.findMany.mockResolvedValue([
      { skillPoolId: testUuid('a01'), tokensP50: 50, tokensP90: 70 },
    ]);

    const model = new TokenFlowModel();
    const result = await model.getTokenLedgerSummary(testUuid('5c0'));

    const backend = result.pools.find((p: any) => p.poolName === 'Backend');
    expect(backend.supplyTokens).toBe(0);
    expect(backend.demandP50).toBe(50);
    expect(backend.delta).toBe(-50);
    expect(result.bindingConstraints).toHaveLength(1);
    expect(result.bindingConstraints[0].deficit).toBe(50);

    expect(result.explanations).toHaveLength(1);
    expect(result.explanations[0].message).toContain('no supply allocated');
  });

  it('no demand entries results in all surplus', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('5c0'),
      planningMode: 'TOKEN',
      periodId: testUuid('aaa'),
      period: { id: testUuid('aaa'), label: 'Q1 2025' },
    });

    mockPrisma.skillPool.findMany.mockResolvedValue([
      { id: testUuid('a01'), name: 'Backend', isActive: true },
    ]);

    mockPrisma.tokenSupply.findMany.mockResolvedValue([
      { skillPoolId: testUuid('a01'), tokens: 100 },
    ]);

    mockPrisma.tokenDemand.findMany.mockResolvedValue([]); // no demand

    const model = new TokenFlowModel();
    const result = await model.getTokenLedgerSummary(testUuid('5c0'));

    const backend = result.pools.find((p: any) => p.poolName === 'Backend');
    expect(backend.supplyTokens).toBe(100);
    expect(backend.demandP50).toBe(0);
    expect(backend.delta).toBe(100);
    expect(result.bindingConstraints).toHaveLength(0); // no deficits

    expect(result.explanations).toHaveLength(1);
    expect(result.explanations[0].message).toContain('no demand');
  });

  it('throws WorkflowError for LEGACY mode scenario', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('5c0'),
      planningMode: 'LEGACY',
      periodId: testUuid('aaa'),
      period: { id: testUuid('aaa'), label: 'Q1 2025' },
    });

    const model = new TokenFlowModel();
    await expect(model.getTokenLedgerSummary(testUuid('5c0'))).rejects.toThrow(WorkflowError);
  });

  it('throws NotFoundError for missing scenario', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue(null);

    const model = new TokenFlowModel();
    await expect(model.getTokenLedgerSummary(testUuid('404'))).rejects.toThrow('not found');
  });
});

// ---------------------------------------------------------------------------
// Token Ledger Route Tests
// ---------------------------------------------------------------------------

describe('Token Ledger Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsEnabled.mockResolvedValue(true);
  });

  async function buildPlanningApp() {
    const app = await buildTestApp();
    const { default: featureFlagPlugin } = await import('../plugins/feature-flag.plugin.js');
    await app.register(featureFlagPlugin);

    app.decorate('authenticate', async () => {});
    app.decorate('authorize', () => async () => {});
    app.decorateRequest('user', { sub: testUuid('999'), role: 'ADMIN' });

    const { planningRoutes } = await import('../routes/planning.js');
    await app.register(planningRoutes);
    await app.ready();
    return app;
  }

  it('GET /api/scenarios/:id/token-ledger returns 200 with TOKEN mode', async () => {
    // First findUnique: route's own check for scenario existence + planningMode
    // Second findUnique: TokenFlowModel.getTokenLedgerSummary loads scenario with period
    // Third findUnique: PlanningService.getEngine reads planningMode
    mockPrisma.scenario.findUnique
      .mockResolvedValueOnce({ id: testUuid('5c0'), planningMode: 'TOKEN' }) // route check
      .mockResolvedValueOnce({ planningMode: 'TOKEN' }) // getEngine
      .mockResolvedValueOnce({ // getTokenLedgerSummary
        id: testUuid('5c0'),
        planningMode: 'TOKEN',
        periodId: testUuid('aaa'),
        period: { id: testUuid('aaa'), label: 'Q1 2025' },
      });

    mockPrisma.skillPool.findMany.mockResolvedValue([
      { id: testUuid('a01'), name: 'Backend', isActive: true },
    ]);
    mockPrisma.tokenSupply.findMany.mockResolvedValue([
      { skillPoolId: testUuid('a01'), tokens: 100 },
    ]);
    mockPrisma.tokenDemand.findMany.mockResolvedValue([
      { skillPoolId: testUuid('a01'), tokensP50: 60, tokensP90: 80 },
    ]);

    const app = await buildPlanningApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/scenarios/${testUuid('5c0')}/token-ledger`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.scenarioId).toBe(testUuid('5c0'));
    expect(body.pools).toBeDefined();
    expect(Array.isArray(body.pools)).toBe(true);
    expect(body.bindingConstraints).toBeDefined();
    await app.close();
  });

  it('GET /api/scenarios/:id/token-ledger returns 409 with LEGACY mode', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('5c0'),
      planningMode: 'LEGACY',
    });

    const app = await buildPlanningApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/scenarios/${testUuid('5c0')}/token-ledger`,
    });

    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it('GET /api/scenarios/:id/token-ledger returns 404 for missing scenario', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue(null);

    const app = await buildPlanningApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/scenarios/${testUuid('404')}/token-ledger`,
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
