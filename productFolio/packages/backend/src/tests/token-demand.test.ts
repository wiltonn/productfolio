import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testUuid } from './setup.js';
import { NotFoundError, WorkflowError } from '../lib/errors.js';

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
    skillPool: {
      findUnique: vi.fn(),
    },
    initiative: {
      findUnique: vi.fn(),
    },
    tokenDemand: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn((fns: any[]) => Promise.all(fns)),
  };
  return { prisma: mockPrisma };
});

import { prisma } from '../lib/prisma.js';

const mockPrisma = prisma as any;

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function mockDemand(overrides: Record<string, any> = {}) {
  return {
    id: testUuid('d01'),
    scenarioId: testUuid('5c0'),
    initiativeId: testUuid('1a0'),
    skillPoolId: testUuid('a01'),
    tokensP50: 25,
    tokensP90: 40,
    notes: null,
    skillPool: { id: testUuid('a01'), name: 'Backend' },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TokenDemandService unit tests
// ---------------------------------------------------------------------------

describe('TokenDemandService', () => {
  let tokenDemandService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../services/token-demand.service.js');
    tokenDemandService = mod.tokenDemandService;
  });

  describe('list', () => {
    it('returns demand list for existing scenario', async () => {
      mockPrisma.scenario.findUnique.mockResolvedValue({
        id: testUuid('5c0'),
      });

      const demands = [mockDemand()];
      mockPrisma.tokenDemand.findMany.mockResolvedValue(demands);

      const result = await tokenDemandService.list(testUuid('5c0'));
      expect(result).toHaveLength(1);
      expect(result[0].tokensP50).toBe(25);
    });

    it('throws NotFoundError for missing scenario', async () => {
      mockPrisma.scenario.findUnique.mockResolvedValue(null);

      await expect(tokenDemandService.list(testUuid('404'))).rejects.toThrow(NotFoundError);
    });
  });

  describe('upsert', () => {
    it('upserts single demand for TOKEN mode scenario', async () => {
      mockPrisma.scenario.findUnique.mockResolvedValue({
        id: testUuid('5c0'),
        planningMode: 'TOKEN',
      });
      mockPrisma.skillPool.findUnique.mockResolvedValue({ id: testUuid('a01'), name: 'Backend' });
      mockPrisma.initiative.findUnique.mockResolvedValue({ id: testUuid('1a0'), title: 'Project A' });
      mockPrisma.tokenDemand.upsert.mockResolvedValue(mockDemand());

      const result = await tokenDemandService.upsert(testUuid('5c0'), {
        initiativeId: testUuid('1a0'),
        skillPoolId: testUuid('a01'),
        tokensP50: 25,
        tokensP90: 40,
      });

      expect(result.tokensP50).toBe(25);
      expect(mockPrisma.tokenDemand.upsert).toHaveBeenCalled();
    });

    it('rejects when planningMode=LEGACY', async () => {
      mockPrisma.scenario.findUnique.mockResolvedValue({
        id: testUuid('5c0'),
        planningMode: 'LEGACY',
      });

      await expect(
        tokenDemandService.upsert(testUuid('5c0'), {
          initiativeId: testUuid('1a0'),
          skillPoolId: testUuid('a01'),
          tokensP50: 25,
        })
      ).rejects.toThrow(WorkflowError);
    });

    it('throws NotFoundError for non-existent scenario', async () => {
      mockPrisma.scenario.findUnique.mockResolvedValue(null);

      await expect(
        tokenDemandService.upsert(testUuid('404'), {
          initiativeId: testUuid('1a0'),
          skillPoolId: testUuid('a01'),
          tokensP50: 25,
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('bulkUpsert', () => {
    it('bulk upserts multiple demands in transaction', async () => {
      mockPrisma.scenario.findUnique.mockResolvedValue({
        id: testUuid('5c0'),
        planningMode: 'TOKEN',
      });

      const demand1 = mockDemand();
      const demand2 = mockDemand({ id: testUuid('d02'), skillPoolId: testUuid('a02') });

      // $transaction receives array of prisma operations
      mockPrisma.tokenDemand.upsert
        .mockResolvedValueOnce(demand1)
        .mockResolvedValueOnce(demand2);

      const result = await tokenDemandService.bulkUpsert(testUuid('5c0'), [
        { initiativeId: testUuid('1a0'), skillPoolId: testUuid('a01'), tokensP50: 25, tokensP90: 40 },
        { initiativeId: testUuid('1a0'), skillPoolId: testUuid('a02'), tokensP50: 15 },
      ]);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('rejects bulk upsert when planningMode=LEGACY', async () => {
      mockPrisma.scenario.findUnique.mockResolvedValue({
        id: testUuid('5c0'),
        planningMode: 'LEGACY',
      });

      await expect(
        tokenDemandService.bulkUpsert(testUuid('5c0'), [
          { initiativeId: testUuid('1a0'), skillPoolId: testUuid('a01'), tokensP50: 25 },
        ])
      ).rejects.toThrow(WorkflowError);
    });
  });

  describe('delete', () => {
    it('removes single demand entry', async () => {
      mockPrisma.tokenDemand.findUnique.mockResolvedValue(mockDemand());
      mockPrisma.tokenDemand.delete.mockResolvedValue({});

      await tokenDemandService.delete(testUuid('d01'));

      expect(mockPrisma.tokenDemand.delete).toHaveBeenCalledWith({
        where: { id: testUuid('d01') },
      });
    });

    it('throws NotFoundError for missing demand entry', async () => {
      mockPrisma.tokenDemand.findUnique.mockResolvedValue(null);

      await expect(tokenDemandService.delete(testUuid('404'))).rejects.toThrow(NotFoundError);
    });
  });
});
