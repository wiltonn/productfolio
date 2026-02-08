import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testUuid } from './setup.js';

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
    featureFlag: {
      findUnique: vi.fn(),
    },
    approvalPolicy: {
      findFirst: vi.fn(),
    },
    approvalRequest: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  };
  return { prisma: mockPrisma };
});

const mockPreviewChain = vi.fn();
vi.mock('../services/approval-policy.service.js', () => ({
  previewChain: (...args: any[]) => mockPreviewChain(...args),
}));

import { prisma } from '../lib/prisma.js';

const mockPrisma = prisma as any;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ApprovalEnforcementService', () => {
  let approvalEnforcementService: any;

  const defaultParams = {
    scope: 'INITIATIVE' as const,
    subjectType: 'initiative' as const,
    subjectId: testUuid('a01'),
    actorId: testUuid('a02'),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../services/approval-enforcement.service.js');
    approvalEnforcementService = mod.approvalEnforcementService;
  });

  describe('checkApproval()', () => {
    it('returns allowed:true with enforcement:NONE when feature flag disabled', async () => {
      mockPrisma.featureFlag.findUnique.mockResolvedValue(null);

      const result = await approvalEnforcementService.checkApproval(defaultParams);

      expect(result.allowed).toBe(true);
      expect(result.enforcement).toBe('NONE');
      expect(result.warnings).toEqual([]);
      expect(result.chain).toEqual([]);
    });

    it('returns allowed:true with enforcement:NONE when flag exists but disabled', async () => {
      mockPrisma.featureFlag.findUnique.mockResolvedValue({
        key: 'approval_enforcement_v1',
        enabled: false,
      });

      const result = await approvalEnforcementService.checkApproval(defaultParams);

      expect(result.allowed).toBe(true);
      expect(result.enforcement).toBe('NONE');
    });

    it('returns allowed:true with enforcement:NONE when chain is empty (no policies)', async () => {
      mockPrisma.featureFlag.findUnique.mockResolvedValue({
        key: 'approval_enforcement_v1',
        enabled: true,
      });
      mockPreviewChain.mockResolvedValue([]);

      const result = await approvalEnforcementService.checkApproval(defaultParams);

      expect(result.allowed).toBe(true);
      expect(result.enforcement).toBe('NONE');
      expect(result.chain).toEqual([]);
    });

    it('returns allowed:false for BLOCKING policy with no approved request, creates pending request', async () => {
      const orgNodeId = testUuid('b01');
      const chain = [
        {
          level: 1,
          orgNodeId,
          orgNodeName: 'Engineering',
          ruleType: 'ROLE_BASED',
          resolvedApprovers: [],
        },
      ];

      mockPrisma.featureFlag.findUnique.mockResolvedValue({
        key: 'approval_enforcement_v1',
        enabled: true,
      });
      mockPreviewChain.mockResolvedValue(chain);
      mockPrisma.approvalPolicy.findFirst.mockResolvedValue({
        id: testUuid('c01'),
        enforcement: 'BLOCKING',
        level: 1,
      });
      // No approved request
      mockPrisma.approvalRequest.findFirst
        .mockResolvedValueOnce(null)  // Check for APPROVED
        .mockResolvedValueOnce(null); // Check for existing PENDING

      const newRequestId = testUuid('d01');
      mockPrisma.approvalRequest.create.mockResolvedValue({
        id: newRequestId,
        status: 'PENDING',
      });

      const result = await approvalEnforcementService.checkApproval(defaultParams);

      expect(result.allowed).toBe(false);
      expect(result.enforcement).toBe('BLOCKING');
      expect(result.pendingRequestId).toBe(newRequestId);
      expect(mockPrisma.approvalRequest.create).toHaveBeenCalledOnce();
    });

    it('returns allowed:false for BLOCKING with existing PENDING request (no duplicate)', async () => {
      const orgNodeId = testUuid('b02');
      const chain = [
        {
          level: 1,
          orgNodeId,
          orgNodeName: 'Product',
          ruleType: 'ROLE_BASED',
          resolvedApprovers: [],
        },
      ];

      mockPrisma.featureFlag.findUnique.mockResolvedValue({
        key: 'approval_enforcement_v1',
        enabled: true,
      });
      mockPreviewChain.mockResolvedValue(chain);
      mockPrisma.approvalPolicy.findFirst.mockResolvedValue({
        id: testUuid('c02'),
        enforcement: 'BLOCKING',
        level: 1,
      });

      const existingPendingId = testUuid('d02');
      mockPrisma.approvalRequest.findFirst
        .mockResolvedValueOnce(null) // No APPROVED request
        .mockResolvedValueOnce({ id: existingPendingId, status: 'PENDING' }); // Existing PENDING

      const result = await approvalEnforcementService.checkApproval(defaultParams);

      expect(result.allowed).toBe(false);
      expect(result.enforcement).toBe('BLOCKING');
      expect(result.pendingRequestId).toBe(existingPendingId);
      // Should NOT create a new request
      expect(mockPrisma.approvalRequest.create).not.toHaveBeenCalled();
    });

    it('returns allowed:true for ADVISORY policy with no approved request (with warning)', async () => {
      const orgNodeId = testUuid('b03');
      const chain = [
        {
          level: 1,
          orgNodeId,
          orgNodeName: 'Design',
          ruleType: 'ROLE_BASED',
          resolvedApprovers: [],
        },
      ];

      mockPrisma.featureFlag.findUnique.mockResolvedValue({
        key: 'approval_enforcement_v1',
        enabled: true,
      });
      mockPreviewChain.mockResolvedValue(chain);
      mockPrisma.approvalPolicy.findFirst.mockResolvedValue({
        id: testUuid('c03'),
        enforcement: 'ADVISORY',
        level: 1,
      });
      // No approved request
      mockPrisma.approvalRequest.findFirst.mockResolvedValue(null);

      const result = await approvalEnforcementService.checkApproval(defaultParams);

      expect(result.allowed).toBe(true);
      expect(result.enforcement).toBe('ADVISORY');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Advisory');
    });

    it('returns allowed:true when an APPROVED request exists', async () => {
      const orgNodeId = testUuid('b04');
      const chain = [
        {
          level: 1,
          orgNodeId,
          orgNodeName: 'QA',
          ruleType: 'ROLE_BASED',
          resolvedApprovers: [],
        },
      ];

      mockPrisma.featureFlag.findUnique.mockResolvedValue({
        key: 'approval_enforcement_v1',
        enabled: true,
      });
      mockPreviewChain.mockResolvedValue(chain);
      mockPrisma.approvalPolicy.findFirst.mockResolvedValue({
        id: testUuid('c04'),
        enforcement: 'BLOCKING',
        level: 1,
      });
      // Approved request exists
      mockPrisma.approvalRequest.findFirst.mockResolvedValue({
        id: testUuid('d04'),
        status: 'APPROVED',
      });

      const result = await approvalEnforcementService.checkApproval(defaultParams);

      expect(result.allowed).toBe(true);
      expect(result.enforcement).toBe('BLOCKING');
      expect(result.warnings).toEqual([]);
    });

    it('defaults enforcement to BLOCKING when policy has no enforcement field', async () => {
      const orgNodeId = testUuid('b05');
      const chain = [
        {
          level: 1,
          orgNodeId,
          orgNodeName: 'Ops',
          ruleType: 'ROLE_BASED',
          resolvedApprovers: [],
        },
      ];

      mockPrisma.featureFlag.findUnique.mockResolvedValue({
        key: 'approval_enforcement_v1',
        enabled: true,
      });
      mockPreviewChain.mockResolvedValue(chain);
      // findFirst returns null (no matching policy) — defaults to BLOCKING
      mockPrisma.approvalPolicy.findFirst.mockResolvedValue(null);
      // No approved request
      mockPrisma.approvalRequest.findFirst
        .mockResolvedValueOnce(null)  // APPROVED check
        .mockResolvedValueOnce(null); // PENDING check

      const newRequestId = testUuid('d05');
      mockPrisma.approvalRequest.create.mockResolvedValue({
        id: newRequestId,
        status: 'PENDING',
      });

      const result = await approvalEnforcementService.checkApproval(defaultParams);

      expect(result.allowed).toBe(false);
      expect(result.enforcement).toBe('BLOCKING');
    });
  });
});
