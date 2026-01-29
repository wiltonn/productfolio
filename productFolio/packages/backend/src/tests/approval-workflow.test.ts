import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundError, ValidationError, WorkflowError, ForbiddenError } from '../lib/errors.js';

// Mock Prisma
vi.mock('../lib/prisma.js', () => {
  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    approvalRequest: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    approvalDecision: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    approvalDelegation: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    orgMembership: {
      findFirst: vi.fn(),
    },
    orgNode: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    approvalPolicy: {
      findMany: vi.fn(),
    },
    employee: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    allocation: {
      findUnique: vi.fn(),
    },
    initiative: {
      findUnique: vi.fn(),
    },
    scenario: {
      findUnique: vi.fn(),
    },
    auditEvent: {
      create: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma)),
  };
  return { prisma: mockPrisma };
});

// Mock audit
vi.mock('../services/audit.service.js', () => ({
  logAuditEvent: vi.fn(),
}));

// Mock chain resolution
vi.mock('../services/approval-policy.service.js', () => ({
  previewChain: vi.fn(),
  resolveChainForEmployee: vi.fn(),
  resolveChainForMultipleNodes: vi.fn(),
}));

// Mock membership
vi.mock('../services/org-membership.service.js', () => ({
  getActiveMembership: vi.fn(),
}));

import { prisma } from '../lib/prisma.js';
import { previewChain } from '../services/approval-policy.service.js';
import {
  createApprovalRequest,
  submitDecision,
  cancelRequest,
  getApprovalRequest,
  getApproverInbox,
  getMyRequests,
  createDelegation,
  revokeDelegation,
} from '../services/approval-workflow.service.js';

const mockPrisma = prisma as any;
const mockPreviewChain = previewChain as any;

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    role: 'ADMIN',
    ...overrides,
  };
}

function makeChainStep(overrides: Record<string, unknown> = {}) {
  return {
    level: 1,
    orgNodeId: 'node-1',
    orgNodeName: 'Engineering',
    ruleType: 'NODE_MANAGER',
    resolvedApprovers: [{ userId: 'user-2', name: 'Manager' }],
    ...overrides,
  };
}

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    scope: 'RESOURCE_ALLOCATION',
    subjectType: 'allocation',
    subjectId: 'alloc-1',
    requesterId: 'user-1',
    status: 'PENDING',
    snapshotChain: [
      makeChainStep({ level: 1 }),
      makeChainStep({ level: 2, resolvedApprovers: [{ userId: 'user-3', name: 'Director' }] }),
    ],
    snapshotContext: {},
    currentLevel: 1,
    resolvedAt: null,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    decisions: [],
    ...overrides,
  };
}

describe('ApprovalWorkflowService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // createApprovalRequest
  // ==========================================================================

  describe('createApprovalRequest', () => {
    it('should create a request with resolved chain', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());
      mockPrisma.approvalRequest.updateMany.mockResolvedValue({ count: 0 });
      mockPreviewChain.mockResolvedValue([makeChainStep()]);
      mockPrisma.approvalDelegation.findMany.mockResolvedValue([]);
      const created = makeRequest();
      mockPrisma.approvalRequest.create.mockResolvedValue(created);

      const result = await createApprovalRequest({
        scope: 'RESOURCE_ALLOCATION',
        subjectType: 'allocation',
        subjectId: 'alloc-1',
        requesterId: 'user-1',
      });

      expect(result.id).toBe('req-1');
      expect(mockPrisma.approvalRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            scope: 'RESOURCE_ALLOCATION',
            status: 'PENDING',
          }),
        }),
      );
    });

    it('should auto-approve when no policies exist (empty chain)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());
      mockPrisma.approvalRequest.updateMany.mockResolvedValue({ count: 0 });
      mockPreviewChain.mockResolvedValue([]); // No policies
      const autoApproved = makeRequest({ status: 'APPROVED', resolvedAt: new Date() });
      mockPrisma.approvalRequest.create.mockResolvedValue(autoApproved);

      const result = await createApprovalRequest({
        scope: 'RESOURCE_ALLOCATION',
        subjectType: 'allocation',
        subjectId: 'alloc-1',
        requesterId: 'user-1',
      }, 'user-1');

      expect(result.status).toBe('APPROVED');
      expect(mockPrisma.approvalRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'APPROVED' }),
        }),
      );
    });

    it('should cancel existing pending requests for the same subject', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());
      mockPrisma.approvalRequest.updateMany.mockResolvedValue({ count: 1 });
      mockPreviewChain.mockResolvedValue([makeChainStep()]);
      mockPrisma.approvalDelegation.findMany.mockResolvedValue([]);
      mockPrisma.approvalRequest.create.mockResolvedValue(makeRequest());

      await createApprovalRequest({
        scope: 'RESOURCE_ALLOCATION',
        subjectType: 'allocation',
        subjectId: 'alloc-1',
        requesterId: 'user-1',
      });

      expect(mockPrisma.approvalRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            scope: 'RESOURCE_ALLOCATION',
            subjectType: 'allocation',
            subjectId: 'alloc-1',
            status: 'PENDING',
          }),
          data: expect.objectContaining({ status: 'CANCELLED' }),
        }),
      );
    });

    it('should throw NotFoundError when requester does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        createApprovalRequest({
          scope: 'INITIATIVE',
          subjectType: 'initiative',
          subjectId: 'init-1',
          requesterId: 'missing-user',
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ==========================================================================
  // submitDecision
  // ==========================================================================

  describe('submitDecision', () => {
    it('should reject decision on non-PENDING request', async () => {
      mockPrisma.approvalRequest.findUnique.mockResolvedValue(
        makeRequest({ status: 'APPROVED' }),
      );

      await expect(
        submitDecision({
          requestId: 'req-1',
          deciderId: 'user-2',
          decision: 'APPROVED',
        }),
      ).rejects.toThrow(WorkflowError);
    });

    it('should reject decision from unauthorized user', async () => {
      const request = makeRequest({
        snapshotChain: [
          makeChainStep({
            level: 1,
            resolvedApprovers: [{ userId: 'user-2', name: 'Manager' }],
          }),
        ],
        currentLevel: 1,
      });
      mockPrisma.approvalRequest.findUnique.mockResolvedValue(request);

      await expect(
        submitDecision({
          requestId: 'req-1',
          deciderId: 'unauthorized-user',
          decision: 'APPROVED',
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('should record APPROVED decision and advance level', async () => {
      const chain = [
        makeChainStep({ level: 1, resolvedApprovers: [{ userId: 'user-2', name: 'Manager' }] }),
        makeChainStep({ level: 2, resolvedApprovers: [{ userId: 'user-3', name: 'Director' }] }),
      ];
      const request = makeRequest({ snapshotChain: chain, currentLevel: 1 });
      mockPrisma.approvalRequest.findUnique
        .mockResolvedValueOnce(request) // initial lookup
        .mockResolvedValue(makeRequest({ currentLevel: 2 })); // after update
      mockPrisma.approvalDecision.create.mockResolvedValue({
        id: 'dec-1',
        requestId: 'req-1',
        deciderId: 'user-2',
        decision: 'APPROVED',
        level: 1,
      });
      mockPrisma.approvalDecision.count.mockResolvedValue(1); // isLevelSatisfied: 1 approval
      mockPrisma.approvalRequest.update.mockResolvedValue(makeRequest({ currentLevel: 2 }));

      const result = await submitDecision({
        requestId: 'req-1',
        deciderId: 'user-2',
        decision: 'APPROVED',
      });

      expect(mockPrisma.approvalDecision.create).toHaveBeenCalled();
      expect(mockPrisma.approvalRequest.update).toHaveBeenCalled();
    });

    it('should reject the entire request on REJECTED decision', async () => {
      const chain = [
        makeChainStep({ level: 1, resolvedApprovers: [{ userId: 'user-2', name: 'Manager' }] }),
      ];
      const request = makeRequest({ snapshotChain: chain, currentLevel: 1 });
      const rejectedRequest = makeRequest({ status: 'REJECTED', resolvedAt: new Date() });
      mockPrisma.approvalRequest.findUnique
        .mockResolvedValueOnce(request)       // initial lookup
        .mockResolvedValue(rejectedRequest);  // post-update lookup
      mockPrisma.approvalDecision.create.mockResolvedValue({
        id: 'dec-1',
        requestId: 'req-1',
        deciderId: 'user-2',
        decision: 'REJECTED',
        level: 1,
      });
      mockPrisma.approvalRequest.update.mockResolvedValue(rejectedRequest);

      const result = await submitDecision({
        requestId: 'req-1',
        deciderId: 'user-2',
        decision: 'REJECTED',
      });

      expect(mockPrisma.approvalRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'REJECTED',
          }),
        }),
      );
    });

    it('should fully approve request when last level is approved', async () => {
      const chain = [
        makeChainStep({ level: 1, resolvedApprovers: [{ userId: 'user-2', name: 'Manager' }] }),
      ];
      const request = makeRequest({
        snapshotChain: chain,
        currentLevel: 1,
        decisions: [],
      });
      const approvedRequest = makeRequest({ status: 'APPROVED', resolvedAt: new Date() });
      mockPrisma.approvalRequest.findUnique
        .mockResolvedValueOnce(request)      // initial lookup
        .mockResolvedValue(approvedRequest); // final lookup after update
      mockPrisma.approvalDecision.create.mockResolvedValue({
        id: 'dec-1',
        requestId: 'req-1',
        deciderId: 'user-2',
        decision: 'APPROVED',
        level: 1,
      });
      mockPrisma.approvalDecision.count.mockResolvedValue(1); // isLevelSatisfied
      mockPrisma.approvalRequest.update.mockResolvedValue(approvedRequest);

      const result = await submitDecision({
        requestId: 'req-1',
        deciderId: 'user-2',
        decision: 'APPROVED',
      });

      expect(result.request.status).toBe('APPROVED');
    });
  });

  // ==========================================================================
  // cancelRequest
  // ==========================================================================

  describe('cancelRequest', () => {
    it('should cancel a PENDING request', async () => {
      const request = makeRequest({ status: 'PENDING' });
      mockPrisma.approvalRequest.findUnique.mockResolvedValue(request);
      const cancelled = makeRequest({ status: 'CANCELLED', resolvedAt: new Date() });
      mockPrisma.approvalRequest.update.mockResolvedValue(cancelled);

      const result = await cancelRequest('req-1', 'user-1');

      expect(result.status).toBe('CANCELLED');
      expect(mockPrisma.approvalRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'CANCELLED' }),
        }),
      );
    });

    it('should throw WorkflowError when cancelling non-PENDING request', async () => {
      mockPrisma.approvalRequest.findUnique.mockResolvedValue(
        makeRequest({ status: 'APPROVED' }),
      );

      await expect(cancelRequest('req-1', 'user-1')).rejects.toThrow(WorkflowError);
    });

    it('should throw NotFoundError when request does not exist', async () => {
      mockPrisma.approvalRequest.findUnique.mockResolvedValue(null);

      await expect(cancelRequest('missing', 'user-1')).rejects.toThrow(NotFoundError);
    });
  });

  // ==========================================================================
  // getApprovalRequest
  // ==========================================================================

  describe('getApprovalRequest', () => {
    it('should return request with relations', async () => {
      const request = makeRequest();
      mockPrisma.approvalRequest.findUnique.mockResolvedValue(request);

      const result = await getApprovalRequest('req-1');

      expect(result.id).toBe('req-1');
      expect(mockPrisma.approvalRequest.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'req-1' } }),
      );
    });

    it('should throw NotFoundError when missing', async () => {
      mockPrisma.approvalRequest.findUnique.mockResolvedValue(null);

      await expect(getApprovalRequest('missing')).rejects.toThrow(NotFoundError);
    });
  });

  // ==========================================================================
  // getApproverInbox
  // ==========================================================================

  describe('getApproverInbox', () => {
    it('should return pending requests where user is approver at current level', async () => {
      const requests = [makeRequest()];
      mockPrisma.approvalRequest.findMany.mockResolvedValue(requests);
      mockPrisma.approvalRequest.count.mockResolvedValue(1);

      const result = await getApproverInbox('user-2');

      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
    });
  });

  // ==========================================================================
  // getMyRequests
  // ==========================================================================

  describe('getMyRequests', () => {
    it('should return requests created by user', async () => {
      const requests = [makeRequest({ requesterId: 'user-1' })];
      mockPrisma.approvalRequest.findMany.mockResolvedValue(requests);
      mockPrisma.approvalRequest.count.mockResolvedValue(1);

      const result = await getMyRequests('user-1');

      expect(result.data).toHaveLength(1);
      expect(mockPrisma.approvalRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ requesterId: 'user-1' }),
        }),
      );
    });
  });

  // ==========================================================================
  // createDelegation
  // ==========================================================================

  describe('createDelegation', () => {
    it('should create delegation between two users', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(makeUser({ id: 'user-1' }))
        .mockResolvedValueOnce(makeUser({ id: 'user-2' }));
      mockPrisma.approvalDelegation.findMany.mockResolvedValue([]); // no overlapping
      const delegation = {
        id: 'del-1',
        delegatorId: 'user-1',
        delegateId: 'user-2',
        effectiveStart: new Date('2026-01-01'),
        effectiveEnd: new Date('2026-02-01'),
      };
      mockPrisma.approvalDelegation.create.mockResolvedValue(delegation);

      const result = await createDelegation({
        delegatorId: 'user-1',
        delegateId: 'user-2',
        effectiveStart: new Date('2026-01-01'),
        effectiveEnd: new Date('2026-02-01'),
      });

      expect(result.id).toBe('del-1');
    });

    it('should reject self-delegation', async () => {
      const user = makeUser({ id: 'user-1' });
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(user)   // delegator lookup
        .mockResolvedValueOnce(user);  // delegate lookup

      await expect(
        createDelegation({
          delegatorId: 'user-1',
          delegateId: 'user-1',
          effectiveStart: new Date('2026-01-01'),
          effectiveEnd: new Date('2026-02-01'),
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw when delegator does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        createDelegation({
          delegatorId: 'missing',
          delegateId: 'user-2',
          effectiveStart: new Date('2026-01-01'),
          effectiveEnd: new Date('2026-02-01'),
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ==========================================================================
  // revokeDelegation
  // ==========================================================================

  describe('revokeDelegation', () => {
    it('should revoke an active delegation', async () => {
      const delegation = {
        id: 'del-1',
        isActive: true,
        revokedAt: null,
      };
      mockPrisma.approvalDelegation.findUnique.mockResolvedValue(delegation);
      mockPrisma.approvalDelegation.update.mockResolvedValue({
        ...delegation,
        isActive: false,
        revokedAt: new Date(),
      });

      const result = await revokeDelegation('del-1');

      expect(result.isActive).toBe(false);
    });

    it('should throw NotFoundError for missing delegation', async () => {
      mockPrisma.approvalDelegation.findUnique.mockResolvedValue(null);

      await expect(revokeDelegation('missing')).rejects.toThrow(NotFoundError);
    });
  });
});
