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
      update: vi.fn(),
    },
    skillPool: {
      findMany: vi.fn(),
    },
    tokenSupply: {
      findMany: vi.fn(),
    },
    tokenDemand: {
      findMany: vi.fn(),
    },
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
// PlanningService unit tests
// ---------------------------------------------------------------------------

describe('PlanningService', () => {
  let planningService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../planning/planning.service.js');
    planningService = mod.planningService;
  });

  describe('getEngine', () => {
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

  describe('getCapacityDemand', () => {
    it('delegates to LegacyTimeModel for LEGACY scenario', async () => {
      mockPrisma.scenario.findUnique.mockResolvedValue({
        planningMode: 'LEGACY',
      });

      const expectedResult = [{ quarter: 'Q1', skill: 'backend', demand: 200, capacity: 150, gap: -50 }];
      mockCalculateCapacityDemand.mockResolvedValue(expectedResult);

      const result = await planningService.getCapacityDemand(testUuid('5c0'));
      expect(result).toEqual(expectedResult);
      expect(mockCalculateCapacityDemand).toHaveBeenCalledWith(testUuid('5c0'));
    });

    it('throws WorkflowError for TOKEN scenario (not implemented)', async () => {
      mockPrisma.scenario.findUnique.mockResolvedValue({
        planningMode: 'TOKEN',
      });

      await expect(planningService.getCapacityDemand(testUuid('5c1'))).rejects.toThrow(WorkflowError);
    });
  });

  describe('getCalculator', () => {
    it('delegates to LegacyTimeModel for LEGACY scenario', async () => {
      mockPrisma.scenario.findUnique.mockResolvedValue({
        planningMode: 'LEGACY',
      });

      const expectedResult = { scenarioId: testUuid('5c0'), scenarioName: 'Test', periods: [] };
      mockCalculate.mockResolvedValue(expectedResult);

      const result = await planningService.getCalculator(testUuid('5c0'), { skipCache: true });
      expect(result).toEqual(expectedResult);
    });
  });

  describe('getTokenLedgerSummary', () => {
    it('throws WorkflowError for LEGACY scenario', async () => {
      mockPrisma.scenario.findUnique.mockResolvedValue({
        planningMode: 'LEGACY',
      });

      await expect(planningService.getTokenLedgerSummary(testUuid('5c0'))).rejects.toThrow(WorkflowError);
    });

    it('returns valid structure for TOKEN scenario', async () => {
      // First call: getEngine reads planningMode
      // Second call: getTokenLedgerSummary loads scenario with period
      mockPrisma.scenario.findUnique
        .mockResolvedValueOnce({ planningMode: 'TOKEN' })
        .mockResolvedValueOnce({
          id: testUuid('5c1'),
          planningMode: 'TOKEN',
          periodId: testUuid('aaa'),
          period: { id: testUuid('aaa'), label: 'Q1 2025' },
        });
      mockPrisma.skillPool.findMany.mockResolvedValue([]);
      mockPrisma.tokenSupply.findMany.mockResolvedValue([]);
      mockPrisma.tokenDemand.findMany.mockResolvedValue([]);

      const result = await planningService.getTokenLedgerSummary(testUuid('5c1'));
      expect(result).toBeDefined();
      expect(result.scenarioId).toBe(testUuid('5c1'));
      expect(Array.isArray(result.pools)).toBe(true);
      expect(Array.isArray(result.bindingConstraints)).toBe(true);
    });
  });
});
