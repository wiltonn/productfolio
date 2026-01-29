import { prisma } from '../lib/prisma.js';
import {
  NotFoundError,
  ValidationError,
  WorkflowError,
  ForbiddenError,
} from '../lib/errors.js';
import { logAuditEvent } from './audit.service.js';
import {
  previewChain,
  resolveChainForEmployee,
  resolveChainForMultipleNodes,
  type ChainStep,
} from './approval-policy.service.js';
import { getActiveMembership } from './org-membership.service.js';
import type { ApprovalScope, ApprovalRequestStatus, CrossBuStrategy, Prisma } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

export interface CreateRequestInput {
  scope: ApprovalScope;
  subjectType: 'allocation' | 'initiative' | 'scenario';
  subjectId: string;
  requesterId: string;
  snapshotContext?: Record<string, unknown>;
  expiresAt?: Date;
}

export interface DecisionInput {
  requestId: string;
  deciderId: string;
  decision: 'APPROVED' | 'REJECTED';
  comments?: string;
}

// ============================================================================
// Request Creation
// ============================================================================

export async function createApprovalRequest(
  input: CreateRequestInput,
  actorId?: string,
) {
  // Verify requester exists
  const requester = await prisma.user.findUnique({
    where: { id: input.requesterId },
  });
  if (!requester) throw new NotFoundError('User (requester)', input.requesterId);

  // Cancel any existing pending requests for the same subject
  await prisma.approvalRequest.updateMany({
    where: {
      scope: input.scope,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      status: 'PENDING',
    },
    data: {
      status: 'CANCELLED',
      resolvedAt: new Date(),
    },
  });

  // Resolve the approval chain
  const chain = await previewChain({
    scope: input.scope,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
  });

  if (chain.length === 0) {
    // No approval policies configured — auto-approve
    const request = await prisma.approvalRequest.create({
      data: {
        scope: input.scope,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        requesterId: input.requesterId,
        status: 'APPROVED',
        snapshotChain: [] as Prisma.InputJsonValue,
        snapshotContext: (input.snapshotContext ?? {}) as Prisma.InputJsonValue,
        currentLevel: 0,
        resolvedAt: new Date(),
        expiresAt: input.expiresAt ?? null,
      },
    });

    if (actorId) {
      await logAuditEvent({
        actorId,
        entityType: 'ApprovalRequest',
        entityId: request.id,
        action: 'AUTO_APPROVE',
        payload: { scope: input.scope, subjectType: input.subjectType, subjectId: input.subjectId },
      });
    }

    return request;
  }

  // Apply delegation substitutions to the chain
  const augmentedChain = await applyDelegations(chain);

  const request = await prisma.approvalRequest.create({
    data: {
      scope: input.scope,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      requesterId: input.requesterId,
      status: 'PENDING',
      snapshotChain: augmentedChain as unknown as Prisma.InputJsonValue,
      snapshotContext: (input.snapshotContext ?? {}) as Prisma.InputJsonValue,
      currentLevel: augmentedChain[0].level,
      expiresAt: input.expiresAt ?? null,
    },
    include: {
      requester: { select: { id: true, name: true, email: true } },
    },
  });

  if (actorId) {
    await logAuditEvent({
      actorId,
      entityType: 'ApprovalRequest',
      entityId: request.id,
      action: 'CREATE',
      payload: {
        scope: input.scope,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        chainLevels: augmentedChain.length,
      },
    });
  }

  return request;
}

// ============================================================================
// Decision Recording
// ============================================================================

export async function submitDecision(input: DecisionInput, actorId?: string) {
  const request = await prisma.approvalRequest.findUnique({
    where: { id: input.requestId },
    include: { decisions: true },
  });
  if (!request) throw new NotFoundError('ApprovalRequest', input.requestId);

  if (request.status !== 'PENDING') {
    throw new WorkflowError(
      `Cannot submit decision on a ${request.status} request`,
      request.status,
      'PENDING',
    );
  }

  const chain = request.snapshotChain as unknown as ChainStep[];
  const currentStep = chain.find((s) => s.level === request.currentLevel);

  if (!currentStep) {
    throw new ValidationError('Current level not found in approval chain');
  }

  // Verify decider is authorized at the current level
  const isAuthorized = currentStep.resolvedApprovers.some(
    (a) => a.userId === input.deciderId,
  );
  if (!isAuthorized) {
    throw new ForbiddenError('You are not an authorized approver at the current level');
  }

  // Check for duplicate decision
  const existingDecision = request.decisions.find(
    (d) => d.level === request.currentLevel && d.deciderId === input.deciderId,
  );
  if (existingDecision) {
    // Idempotent: return existing decision without error
    return { request, decision: existingDecision, advanced: false };
  }

  // Record the decision
  const decision = await prisma.approvalDecision.create({
    data: {
      requestId: input.requestId,
      level: request.currentLevel,
      deciderId: input.deciderId,
      decision: input.decision,
      comments: input.comments ?? null,
    },
  });

  if (actorId) {
    await logAuditEvent({
      actorId,
      entityType: 'ApprovalRequest',
      entityId: input.requestId,
      action: input.decision === 'APPROVED' ? 'APPROVE' : 'REJECT',
      payload: {
        level: request.currentLevel,
        deciderId: input.deciderId,
        comments: input.comments,
      },
    });
  }

  // Handle rejection — immediately resolve
  if (input.decision === 'REJECTED') {
    await prisma.approvalRequest.update({
      where: { id: input.requestId },
      data: { status: 'REJECTED', resolvedAt: new Date() },
    });

    const updatedRequest = await prisma.approvalRequest.findUnique({
      where: { id: input.requestId },
      include: { decisions: true, requester: { select: { id: true, name: true, email: true } } },
    });

    return { request: updatedRequest, decision, advanced: false };
  }

  // Handle approval — check if the current level is satisfied
  const levelSatisfied = await isLevelSatisfied(input.requestId, request.currentLevel, currentStep);

  if (!levelSatisfied) {
    // More approvals needed at this level (e.g., committee quorum not met)
    const updatedRequest = await prisma.approvalRequest.findUnique({
      where: { id: input.requestId },
      include: { decisions: true, requester: { select: { id: true, name: true, email: true } } },
    });
    return { request: updatedRequest, decision, advanced: false };
  }

  // Level satisfied — check for next level
  const currentIdx = chain.findIndex((s) => s.level === request.currentLevel);
  const nextStep = chain[currentIdx + 1];

  if (nextStep) {
    // Advance to next level
    // Skip-level optimization: if the next level has the same approver who already approved
    // at a lower level, auto-satisfy it
    const nextStepDecidedByCurrentApprover = nextStep.resolvedApprovers.some(
      (a) => a.userId === input.deciderId,
    );

    if (nextStepDecidedByCurrentApprover && nextStep.resolvedApprovers.length === 1) {
      // Auto-approve the next level (skip-level)
      await prisma.approvalDecision.create({
        data: {
          requestId: input.requestId,
          level: nextStep.level,
          deciderId: input.deciderId,
          decision: 'APPROVED',
          comments: 'Auto-approved (same approver at lower level)',
        },
      });

      // Check if there's yet another level
      const nextNextStep = chain[currentIdx + 2];
      if (nextNextStep) {
        await prisma.approvalRequest.update({
          where: { id: input.requestId },
          data: { currentLevel: nextNextStep.level },
        });
      } else {
        // Fully approved
        await prisma.approvalRequest.update({
          where: { id: input.requestId },
          data: { status: 'APPROVED', resolvedAt: new Date() },
        });
      }
    } else {
      await prisma.approvalRequest.update({
        where: { id: input.requestId },
        data: { currentLevel: nextStep.level },
      });
    }
  } else {
    // No more levels — fully approved
    await prisma.approvalRequest.update({
      where: { id: input.requestId },
      data: { status: 'APPROVED', resolvedAt: new Date() },
    });
  }

  const updatedRequest = await prisma.approvalRequest.findUnique({
    where: { id: input.requestId },
    include: { decisions: true, requester: { select: { id: true, name: true, email: true } } },
  });

  return { request: updatedRequest, decision, advanced: true };
}

// ============================================================================
// Request Queries
// ============================================================================

export async function getApprovalRequest(id: string) {
  const request = await prisma.approvalRequest.findUnique({
    where: { id },
    include: {
      requester: { select: { id: true, name: true, email: true } },
      decisions: {
        include: {
          decider: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ level: 'asc' }, { decidedAt: 'asc' }],
      },
    },
  });
  if (!request) throw new NotFoundError('ApprovalRequest', id);
  return request;
}

export async function listApprovalRequests(filters?: {
  scope?: ApprovalScope;
  subjectType?: string;
  subjectId?: string;
  requesterId?: string;
  status?: ApprovalRequestStatus;
  page?: number;
  limit?: number;
}) {
  const {
    scope,
    subjectType,
    subjectId,
    requesterId,
    status,
    page = 1,
    limit = 20,
  } = filters ?? {};

  const where: Record<string, unknown> = {};
  if (scope) where.scope = scope;
  if (subjectType) where.subjectType = subjectType;
  if (subjectId) where.subjectId = subjectId;
  if (requesterId) where.requesterId = requesterId;
  if (status) where.status = status;

  const skip = (page - 1) * limit;

  const [requests, total] = await Promise.all([
    prisma.approvalRequest.findMany({
      where,
      skip,
      take: limit,
      include: {
        requester: { select: { id: true, name: true, email: true } },
        _count: { select: { decisions: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.approvalRequest.count({ where }),
  ]);

  return {
    data: requests,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getApproverInbox(userId: string, filters?: {
  scope?: ApprovalScope;
  page?: number;
  limit?: number;
}) {
  const { scope, page = 1, limit = 20 } = filters ?? {};

  // Find all pending requests where this user is an approver at the current level
  // We search the snapshotChain JSONB for the user's ID
  const where: Record<string, unknown> = {
    status: 'PENDING',
  };
  if (scope) where.scope = scope;

  const allPending = await prisma.approvalRequest.findMany({
    where,
    include: {
      requester: { select: { id: true, name: true, email: true } },
      _count: { select: { decisions: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Filter to only requests where the user is an approver at the current level
  // Also check delegations
  const activeDelegations = await prisma.approvalDelegation.findMany({
    where: {
      delegateId: userId,
      effectiveStart: { lte: new Date() },
      effectiveEnd: { gte: new Date() },
    },
  });
  const delegatorIds = activeDelegations.map((d) => d.delegatorId);

  const inboxItems = allPending.filter((req) => {
    const chain = req.snapshotChain as unknown as ChainStep[];
    const currentStep = chain.find((s) => s.level === req.currentLevel);
    if (!currentStep) return false;

    return currentStep.resolvedApprovers.some(
      (a) => a.userId === userId || delegatorIds.includes(a.userId),
    );
  });

  // Paginate
  const total = inboxItems.length;
  const skip = (page - 1) * limit;
  const paginated = inboxItems.slice(skip, skip + limit);

  return {
    data: paginated,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getMyRequests(userId: string, filters?: {
  status?: ApprovalRequestStatus;
  page?: number;
  limit?: number;
}) {
  return listApprovalRequests({
    requesterId: userId,
    status: filters?.status,
    page: filters?.page,
    limit: filters?.limit,
  });
}

// ============================================================================
// Request Lifecycle
// ============================================================================

export async function cancelRequest(requestId: string, actorId?: string) {
  const request = await prisma.approvalRequest.findUnique({
    where: { id: requestId },
  });
  if (!request) throw new NotFoundError('ApprovalRequest', requestId);

  if (request.status !== 'PENDING') {
    throw new WorkflowError(
      `Cannot cancel a ${request.status} request`,
      request.status,
      'CANCELLED',
    );
  }

  const updated = await prisma.approvalRequest.update({
    where: { id: requestId },
    data: { status: 'CANCELLED', resolvedAt: new Date() },
  });

  if (actorId) {
    await logAuditEvent({
      actorId,
      entityType: 'ApprovalRequest',
      entityId: requestId,
      action: 'CANCEL',
      payload: { scope: request.scope, subjectType: request.subjectType, subjectId: request.subjectId },
    });
  }

  return updated;
}

// ============================================================================
// Delegation Management
// ============================================================================

export async function createDelegation(input: {
  delegatorId: string;
  delegateId: string;
  scope?: ApprovalScope;
  orgNodeId?: string;
  effectiveStart: Date;
  effectiveEnd: Date;
  reason?: string;
}, actorId?: string) {
  const delegator = await prisma.user.findUnique({ where: { id: input.delegatorId } });
  if (!delegator) throw new NotFoundError('User (delegator)', input.delegatorId);

  const delegate = await prisma.user.findUnique({ where: { id: input.delegateId } });
  if (!delegate) throw new NotFoundError('User (delegate)', input.delegateId);

  if (input.delegatorId === input.delegateId) {
    throw new ValidationError('Cannot delegate to yourself');
  }

  if (input.effectiveEnd <= input.effectiveStart) {
    throw new ValidationError('effectiveEnd must be after effectiveStart');
  }

  if (input.orgNodeId) {
    const node = await prisma.orgNode.findUnique({ where: { id: input.orgNodeId } });
    if (!node) throw new NotFoundError('OrgNode', input.orgNodeId);
  }

  const delegation = await prisma.approvalDelegation.create({
    data: {
      delegatorId: input.delegatorId,
      delegateId: input.delegateId,
      scope: input.scope ?? null,
      orgNodeId: input.orgNodeId ?? null,
      effectiveStart: input.effectiveStart,
      effectiveEnd: input.effectiveEnd,
      reason: input.reason ?? null,
    },
    include: {
      delegator: { select: { id: true, name: true, email: true } },
      delegate: { select: { id: true, name: true, email: true } },
    },
  });

  if (actorId) {
    await logAuditEvent({
      actorId,
      entityType: 'ApprovalDelegation',
      entityId: delegation.id,
      action: 'CREATE',
      payload: { delegatorId: input.delegatorId, delegateId: input.delegateId },
    });
  }

  return delegation;
}

export async function revokeDelegation(delegationId: string, actorId?: string) {
  const delegation = await prisma.approvalDelegation.findUnique({
    where: { id: delegationId },
  });
  if (!delegation) throw new NotFoundError('ApprovalDelegation', delegationId);

  // Set effectiveEnd to now to revoke
  const updated = await prisma.approvalDelegation.update({
    where: { id: delegationId },
    data: { effectiveEnd: new Date() },
  });

  if (actorId) {
    await logAuditEvent({
      actorId,
      entityType: 'ApprovalDelegation',
      entityId: delegationId,
      action: 'REVOKE',
      payload: { delegatorId: delegation.delegatorId, delegateId: delegation.delegateId },
    });
  }

  return updated;
}

export async function listActiveDelegations(filters?: {
  delegatorId?: string;
  delegateId?: string;
}) {
  const where: Record<string, unknown> = {
    effectiveStart: { lte: new Date() },
    effectiveEnd: { gte: new Date() },
  };
  if (filters?.delegatorId) where.delegatorId = filters.delegatorId;
  if (filters?.delegateId) where.delegateId = filters.delegateId;

  return prisma.approvalDelegation.findMany({
    where,
    include: {
      delegator: { select: { id: true, name: true, email: true } },
      delegate: { select: { id: true, name: true, email: true } },
      orgNode: { select: { id: true, name: true, code: true } },
    },
    orderBy: { effectiveStart: 'desc' },
  });
}

// ============================================================================
// Internal Helpers
// ============================================================================

async function isLevelSatisfied(
  requestId: string,
  level: number,
  step: ChainStep,
): Promise<boolean> {
  const approvals = await prisma.approvalDecision.count({
    where: {
      requestId,
      level,
      decision: 'APPROVED',
    },
  });

  if (step.ruleType === 'COMMITTEE' && step.quorum) {
    return approvals >= step.quorum;
  }

  // For non-committee, a single approval is sufficient
  return approvals >= 1;
}

async function applyDelegations(chain: ChainStep[]): Promise<ChainStep[]> {
  const now = new Date();
  const allApproverIds = chain.flatMap((s) => s.resolvedApprovers.map((a) => a.userId));

  if (allApproverIds.length === 0) return chain;

  const activeDelegations = await prisma.approvalDelegation.findMany({
    where: {
      delegatorId: { in: allApproverIds },
      effectiveStart: { lte: now },
      effectiveEnd: { gte: now },
    },
    include: {
      delegate: { select: { id: true, name: true, email: true } },
    },
  });

  if (activeDelegations.length === 0) return chain;

  // Build delegator -> delegate map
  const delegationMap = new Map<string, Array<{ userId: string; name: string; email: string }>>();
  for (const d of activeDelegations) {
    const existing = delegationMap.get(d.delegatorId) ?? [];
    existing.push({ userId: d.delegate.id, name: d.delegate.name, email: d.delegate.email });
    delegationMap.set(d.delegatorId, existing);
  }

  // Add delegates to the chain steps (they can approve on behalf of delegator)
  return chain.map((step) => {
    const additionalApprovers: Array<{ userId: string; name: string; email: string }> = [];
    const existingIds = new Set(step.resolvedApprovers.map((a) => a.userId));

    for (const approver of step.resolvedApprovers) {
      const delegates = delegationMap.get(approver.userId);
      if (delegates) {
        for (const del of delegates) {
          if (!existingIds.has(del.userId)) {
            additionalApprovers.push(del);
            existingIds.add(del.userId);
          }
        }
      }
    }

    return {
      ...step,
      resolvedApprovers: [...step.resolvedApprovers, ...additionalApprovers],
    };
  });
}
