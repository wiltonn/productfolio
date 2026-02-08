import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testUuid } from './setup.js';
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
    },
    tokenSupply: { findMany: vi.fn() },
    tokenDemand: { findMany: vi.fn() },
    skillPool: { findMany: vi.fn() },
    featureFlag: { findUnique: vi.fn() },
  };
  return { prisma: mockPrisma };
});

const mockCalculateCapacityDemand = vi.fn();
const mockCalculate = vi.fn();

vi.mock('../services/allocation.service.js', () => ({
  allocationService: {
    calculateCapacityDemand: mockCalculateCapacityDemand,
  },
}));

vi.mock('../services/scenario-calculator.service.js', () => ({
  scenarioCalculatorService: {
    calculate: mockCalculate,
  },
  ScenarioCalculatorService: vi.fn(),
}));

import { prisma } from '../lib/prisma.js';

const mockPrisma = prisma as any;

// ---------------------------------------------------------------------------
// LegacyTimeModel tests
// ---------------------------------------------------------------------------

describe('LegacyTimeModel', () => {
  let LegacyTimeModel: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../planning/legacy-time-model.js');
    LegacyTimeModel = mod.LegacyTimeModel;
  });

  it('getCapacityDemand delegates to allocationService.calculateCapacityDemand', async () => {
    const expectedResult = [
      { quarter: 'Q1', skill: 'backend', demand: 200, capacity: 150, gap: -50 },
    ];
    mockCalculateCapacityDemand.mockResolvedValue(expectedResult);

    const model = new LegacyTimeModel();
    const result = await model.getCapacityDemand(testUuid('5c0'));

    expect(mockCalculateCapacityDemand).toHaveBeenCalledWith(testUuid('5c0'));
    expect(result).toEqual(expectedResult);
  });

  it('getCalculator delegates to scenarioCalculatorService.calculate', async () => {
    const expectedResult = {
      scenarioId: testUuid('5c0'),
      scenarioName: 'Test',
      periods: [],
      summary: { totalDemandHours: 0, totalCapacityHours: 0 },
    };
    mockCalculate.mockResolvedValue(expectedResult);

    const model = new LegacyTimeModel();
    const options = { skipCache: true };
    const result = await model.getCalculator(testUuid('5c0'), options);

    expect(mockCalculate).toHaveBeenCalledWith(testUuid('5c0'), options);
    expect(result).toEqual(expectedResult);
  });

  it('getTokenLedgerSummary throws WorkflowError for LEGACY mode', async () => {
    const model = new LegacyTimeModel();

    await expect(model.getTokenLedgerSummary(testUuid('5c0'))).rejects.toThrow(WorkflowError);
    await expect(model.getTokenLedgerSummary(testUuid('5c0'))).rejects.toThrow(/legacy/i);
  });
});

// ---------------------------------------------------------------------------
// TokenFlowModel tests
// ---------------------------------------------------------------------------

describe('TokenFlowModel', () => {
  let TokenFlowModel: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../planning/token-flow-model.js');
    TokenFlowModel = mod.TokenFlowModel;
  });

  it('getCapacityDemand throws WorkflowError (not implemented)', async () => {
    const model = new TokenFlowModel();

    await expect(model.getCapacityDemand(testUuid('5c0'))).rejects.toThrow(WorkflowError);
  });

  it('getCalculator throws WorkflowError (not implemented)', async () => {
    const model = new TokenFlowModel();

    await expect(model.getCalculator(testUuid('5c0'), {})).rejects.toThrow(WorkflowError);
  });

  it('getTokenLedgerSummary returns valid structure for TOKEN scenario', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('5c0'),
      planningMode: 'TOKEN',
      periodId: testUuid('aaa'),
      period: { id: testUuid('aaa'), label: 'Q1 2025' },
    });
    mockPrisma.skillPool.findMany.mockResolvedValue([]);
    mockPrisma.tokenSupply.findMany.mockResolvedValue([]);
    mockPrisma.tokenDemand.findMany.mockResolvedValue([]);

    const model = new TokenFlowModel();
    const result = await model.getTokenLedgerSummary(testUuid('5c0'));

    expect(result).toBeDefined();
    expect(result.scenarioId).toBe(testUuid('5c0'));
    expect(Array.isArray(result.pools)).toBe(true);
    expect(Array.isArray(result.bindingConstraints)).toBe(true);
  });

  it('getTokenLedgerSummary throws WorkflowError for LEGACY scenario', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('5c0'),
      planningMode: 'LEGACY',
      periodId: testUuid('aaa'),
      period: { id: testUuid('aaa'), label: 'Q1 2025' },
    });

    const model = new TokenFlowModel();
    await expect(model.getTokenLedgerSummary(testUuid('5c0'))).rejects.toThrow(WorkflowError);
  });

  it('getTokenLedgerSummary throws NotFoundError for missing scenario', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue(null);

    const model = new TokenFlowModel();
    await expect(model.getTokenLedgerSummary(testUuid('404'))).rejects.toThrow('not found');
  });
});

// ---------------------------------------------------------------------------
// PlanningService.getEngine tests
// ---------------------------------------------------------------------------

describe('PlanningService.getEngine', () => {
  let planningService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../planning/planning.service.js');
    planningService = mod.planningService;
  });

  it('returns LegacyTimeModel for LEGACY scenario', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      planningMode: 'LEGACY',
    });

    const { LegacyTimeModel } = await import('../planning/legacy-time-model.js');
    const engine = await planningService.getEngine(testUuid('5c0'));
    expect(engine).toBeInstanceOf(LegacyTimeModel);
  });

  it('returns TokenFlowModel for TOKEN scenario', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      planningMode: 'TOKEN',
    });

    const { TokenFlowModel } = await import('../planning/token-flow-model.js');
    const engine = await planningService.getEngine(testUuid('5c1'));
    expect(engine).toBeInstanceOf(TokenFlowModel);
  });

  it('throws NotFoundError for missing scenario', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue(null);

    await expect(planningService.getEngine(testUuid('404'))).rejects.toThrow('not found');
  });
});
