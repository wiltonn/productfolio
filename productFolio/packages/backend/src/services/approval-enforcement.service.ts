import { prisma } from '../lib/prisma.js';
import { previewChain, type ChainStep } from './approval-policy.service.js';
import type { ApprovalScope, PolicyEnforcement, Prisma } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

export interface EnforcementResult {
  allowed: boolean;
  enforcement: 'BLOCKING' | 'ADVISORY' | 'NONE';
  pendingRequestId?: string;
  warnings: string[];
  chain: ChainStep[];
}

// ============================================================================
// Approval Enforcement Service
// ============================================================================

class ApprovalEnforcementService {
  /**
   * Check whether an operation is allowed based on approval policies.
   *
   * 1. If feature flag disabled → allowed (NONE)
   * 2. Preview chain; if empty → allowed (NONE)
   * 3. Determine enforcement level from highest applicable policy
   * 4. Check for existing APPROVED request
   * 5. BLOCKING + no approval → denied (auto-create PENDING request)
   * 6. ADVISORY + no approval → allowed with warning
   * 7. Approved request exists → allowed
   */
  async checkApproval(params: {
    scope: ApprovalScope;
    subjectType: 'allocation' | 'initiative' | 'scenario';
    subjectId: string;
    actorId: string;
  }): Promise<EnforcementResult> {
    // 1. Check feature flag
    const flag = await prisma.featureFlag.findUnique({
      where: { key: 'approval_enforcement_v1' },
    });
    if (!flag || !flag.enabled) {
      return { allowed: true, enforcement: 'NONE', warnings: [], chain: [] };
    }

    // 2. Resolve chain
    const chain = await previewChain({
      scope: params.scope,
      subjectType: params.subjectType,
      subjectId: params.subjectId,
    });

    if (chain.length === 0) {
      return { allowed: true, enforcement: 'NONE', warnings: [], chain: [] };
    }

    // 3. Determine enforcement from highest applicable policy
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const nodeIds = chain.map((step) => step.orgNodeId).filter((id) => UUID_RE.test(id));

    const highestPolicy = nodeIds.length > 0
      ? await prisma.approvalPolicy.findFirst({
          where: {
            orgNodeId: { in: nodeIds },
            scope: params.scope,
            isActive: true,
          },
          orderBy: { level: 'desc' },
        })
      : null;

    // No matching policy → no enforcement required
    if (!highestPolicy) {
      return { allowed: true, enforcement: 'NONE', warnings: [], chain };
    }

    const enforcement: PolicyEnforcement = highestPolicy.enforcement;

    // 4. Check for existing APPROVED request for this subject
    const approvedRequest = await prisma.approvalRequest.findFirst({
      where: {
        scope: params.scope,
        subjectType: params.subjectType,
        subjectId: params.subjectId,
        status: 'APPROVED',
      },
    });

    if (approvedRequest) {
      return { allowed: true, enforcement, warnings: [], chain };
    }

    // 5. BLOCKING + no approved request → deny and auto-create pending request
    if (enforcement === 'BLOCKING') {
      // Check for existing PENDING request to avoid duplicates
      const existingPending = await prisma.approvalRequest.findFirst({
        where: {
          scope: params.scope,
          subjectType: params.subjectType,
          subjectId: params.subjectId,
          status: 'PENDING',
        },
      });

      if (existingPending) {
        return {
          allowed: false,
          enforcement: 'BLOCKING',
          pendingRequestId: existingPending.id,
          warnings: [],
          chain,
        };
      }

      const newRequest = await prisma.approvalRequest.create({
        data: {
          scope: params.scope,
          subjectType: params.subjectType,
          subjectId: params.subjectId,
          requesterId: params.actorId,
          status: 'PENDING',
          snapshotChain: chain as unknown as Prisma.InputJsonValue,
          snapshotContext: {} as Prisma.InputJsonValue,
          currentLevel: 1,
        },
      });

      return {
        allowed: false,
        enforcement: 'BLOCKING',
        pendingRequestId: newRequest.id,
        warnings: [],
        chain,
      };
    }

    // 6. ADVISORY + no approved request → allowed with warning
    return {
      allowed: true,
      enforcement: 'ADVISORY',
      warnings: ['Advisory: approval recommended before proceeding'],
      chain,
    };
  }
}

export const approvalEnforcementService = new ApprovalEnforcementService();
