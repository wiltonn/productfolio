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
    tokenSupply: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
  };
  return { prisma: mockPrisma };
});

import { prisma } from '../lib/prisma.js';

const mockPrisma = prisma as any;

// ---------------------------------------------------------------------------
// TokenSupplyService unit tests
// ---------------------------------------------------------------------------

describe('TokenSupplyService', () => {
  let tokenSupplyService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../services/token-supply.service.js');
    tokenSupplyService = mod.tokenSupplyService;
  });

  describe('list', () => {
    it('returns supply list for existing scenario', async () => {
      mockPrisma.scenario.findUnique.mockResolvedValue({
        id: testUuid('5c0'),
      });

      const supplies = [
        {
          id: testUuid('d01'),
          scenarioId: testUuid('5c0'),
          skillPoolId: testUuid('a01'),
          tokens: 100,
          skillPool: { id: testUuid('a01'), name: 'Backend' },
        },
      ];
      mockPrisma.tokenSupply.findMany.mockResolvedValue(supplies);

      const result = await tokenSupplyService.list(testUuid('5c0'));
      expect(result).toHaveLength(1);
      expect(result[0].tokens).toBe(100);
    });

    it('throws NotFoundError for missing scenario', async () => {
      mockPrisma.scenario.findUnique.mockResolvedValue(null);

      await expect(tokenSupplyService.list(testUuid('404'))).rejects.toThrow(NotFoundError);
    });
  });

  describe('upsert', () => {
    it('upserts supply for TOKEN mode scenario', async () => {
      mockPrisma.scenario.findUnique.mockResolvedValue({
        id: testUuid('5c0'),
        planningMode: 'TOKEN',
      });
      mockPrisma.skillPool.findUnique.mockResolvedValue({
        id: testUuid('a01'),
        name: 'Backend',
      });

      const upserted = {
        id: testUuid('d01'),
        scenarioId: testUuid('5c0'),
        skillPoolId: testUuid('a01'),
        tokens: 50,
        skillPool: { id: testUuid('a01'), name: 'Backend' },
      };
      mockPrisma.tokenSupply.upsert.mockResolvedValue(upserted);

      const result = await tokenSupplyService.upsert(testUuid('5c0'), {
        skillPoolId: testUuid('a01'),
        tokens: 50,
      });

      expect(result.tokens).toBe(50);
      expect(mockPrisma.tokenSupply.upsert).toHaveBeenCalled();
    });

    it('rejects when planningMode=LEGACY', async () => {
      mockPrisma.scenario.findUnique.mockResolvedValue({
        id: testUuid('5c0'),
        planningMode: 'LEGACY',
      });

      await expect(
        tokenSupplyService.upsert(testUuid('5c0'), {
          skillPoolId: testUuid('a01'),
          tokens: 50,
        })
      ).rejects.toThrow(WorkflowError);
    });

    it('throws NotFoundError for non-existent scenario', async () => {
      mockPrisma.scenario.findUnique.mockResolvedValue(null);

      await expect(
        tokenSupplyService.upsert(testUuid('404'), {
          skillPoolId: testUuid('a01'),
          tokens: 50,
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('delete', () => {
    it('removes supply entry for TOKEN mode scenario', async () => {
      mockPrisma.scenario.findUnique.mockResolvedValue({
        id: testUuid('5c0'),
        planningMode: 'TOKEN',
      });
      mockPrisma.tokenSupply.findUnique.mockResolvedValue({
        id: testUuid('d01'),
        scenarioId: testUuid('5c0'),
        skillPoolId: testUuid('a01'),
      });
      mockPrisma.tokenSupply.delete.mockResolvedValue({});

      await tokenSupplyService.delete(testUuid('5c0'), testUuid('a01'));

      expect(mockPrisma.tokenSupply.delete).toHaveBeenCalled();
    });

    it('throws WorkflowError when planningMode=LEGACY', async () => {
      mockPrisma.scenario.findUnique.mockResolvedValue({
        id: testUuid('5c0'),
        planningMode: 'LEGACY',
      });

      await expect(
        tokenSupplyService.delete(testUuid('5c0'), testUuid('a01'))
      ).rejects.toThrow(WorkflowError);
    });
  });
});
