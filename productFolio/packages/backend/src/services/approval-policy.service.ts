import { prisma } from '../lib/prisma.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { logAuditEvent } from './audit.service.js';
import { getActiveMembership } from './org-membership.service.js';
import type { ApprovalScope, ApprovalRuleType, CrossBuStrategy, Prisma, UserRole } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

export interface CreatePolicyInput {
  orgNodeId: string;
  scope: ApprovalScope;
  level: number;
  ruleType: ApprovalRuleType;
  ruleConfig?: Record<string, unknown>;
  crossBuStrategy?: CrossBuStrategy;
}

export interface UpdatePolicyInput {
  ruleType?: ApprovalRuleType;
  ruleConfig?: Record<string, unknown>;
  crossBuStrategy?: CrossBuStrategy;
  isActive?: boolean;
}

export interface ResolvedApprover {
  userId: string;
  name: string;
  email: string;
}

export interface ChainStep {
  level: number;
  orgNodeId: string;
  orgNodeName: string;
  ruleType: ApprovalRuleType;
  resolvedApprovers: ResolvedApprover[];
  quorum?: number;
}

// ============================================================================
// Policy CRUD
// ============================================================================

export async function createPolicy(input: CreatePolicyInput, actorId?: string) {
  const node = await prisma.orgNode.findUnique({ where: { id: input.orgNodeId } });
  if (!node) throw new NotFoundError('OrgNode', input.orgNodeId);
  if (!node.isActive) throw new ValidationError('Cannot add policy to an inactive node');

  if (input.level < 1) throw new ValidationError('Level must be >= 1');

  // Validate rule-specific config
  await validateRuleConfig(input.ruleType, input.ruleConfig ?? {});

  const policy = await prisma.approvalPolicy.create({
    data: {
      orgNodeId: input.orgNodeId,
      scope: input.scope,
      level: input.level,
      ruleType: input.ruleType,
      ruleConfig: (input.ruleConfig ?? {}) as Prisma.InputJsonValue,
      crossBuStrategy: input.crossBuStrategy ?? 'COMMON_ANCESTOR',
    },
    include: {
      orgNode: { select: { id: true, name: true, code: true } },
    },
  });

  if (actorId) {
    await logAuditEvent({
      actorId,
      entityType: 'ApprovalPolicy',
      entityId: policy.id,
      action: 'CREATE',
      payload: { orgNodeId: input.orgNodeId, scope: input.scope, level: input.level, ruleType: input.ruleType },
    });
  }

  return policy;
}

export async function updatePolicy(id: string, input: UpdatePolicyInput, actorId?: string) {
  const policy = await prisma.approvalPolicy.findUnique({ where: { id } });
  if (!policy) throw new NotFoundError('ApprovalPolicy', id);

  if (input.ruleType) {
    await validateRuleConfig(input.ruleType, input.ruleConfig ?? (policy.ruleConfig as Record<string, unknown>));
  }

  const data: Record<string, unknown> = {};
  if (input.ruleType !== undefined) data.ruleType = input.ruleType;
  if (input.ruleConfig !== undefined) data.ruleConfig = input.ruleConfig;
  if (input.crossBuStrategy !== undefined) data.crossBuStrategy = input.crossBuStrategy;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  const updated = await prisma.approvalPolicy.update({
    where: { id },
    data,
    include: {
      orgNode: { select: { id: true, name: true, code: true } },
    },
  });

  if (actorId) {
    await logAuditEvent({
      actorId,
      entityType: 'ApprovalPolicy',
      entityId: id,
      action: 'UPDATE',
      payload: { before: { ruleType: policy.ruleType, isActive: policy.isActive }, after: { ...input } } as Prisma.InputJsonValue,
    });
  }

  return updated;
}

export async function deletePolicy(id: string, actorId?: string) {
  const policy = await prisma.approvalPolicy.findUnique({ where: { id } });
  if (!policy) throw new NotFoundError('ApprovalPolicy', id);

  await prisma.approvalPolicy.update({
    where: { id },
    data: { isActive: false },
  });

  if (actorId) {
    await logAuditEvent({
      actorId,
      entityType: 'ApprovalPolicy',
      entityId: id,
      action: 'DELETE',
      payload: { orgNodeId: policy.orgNodeId, scope: policy.scope, level: policy.level },
    });
  }

  return { id };
}

export async function listPoliciesForNode(orgNodeId: string) {
  const node = await prisma.orgNode.findUnique({ where: { id: orgNodeId } });
  if (!node) throw new NotFoundError('OrgNode', orgNodeId);

  return prisma.approvalPolicy.findMany({
    where: { orgNodeId, isActive: true },
    orderBy: [{ scope: 'asc' }, { level: 'asc' }],
  });
}

// ============================================================================
// Chain Resolution
// ============================================================================

/**
 * Resolve the approval chain for a given employee + scope.
 * Walks from the employee's node up through ancestors, collecting policies.
 */
export async function resolveChainForEmployee(
  employeeId: string,
  scope: ApprovalScope,
): Promise<ChainStep[]> {
  const membership = await getActiveMembership(employeeId);
  if (!membership) {
    // Fall back to Unassigned node
    const unassigned = await prisma.orgNode.findFirst({
      where: { code: 'UNASSIGNED', isActive: true },
    });
    if (!unassigned) return resolveAdminFallback(scope);
    return resolveChainFromNode(unassigned.id, scope);
  }

  return resolveChainFromNode(membership.orgNodeId, scope);
}

/**
 * Resolve chain starting from a specific node, walking up the ancestry.
 */
export async function resolveChainFromNode(
  nodeId: string,
  scope: ApprovalScope,
): Promise<ChainStep[]> {
  const node = await prisma.orgNode.findUnique({ where: { id: nodeId } });
  if (!node) throw new NotFoundError('OrgNode', nodeId);

  // Get ancestor IDs from the materialized path (includes self)
  const pathSegments = node.path
    .split('/')
    .filter((s) => s.length > 0);

  // Fetch all policies for these nodes + scope, ordered by level
  const policies = await prisma.approvalPolicy.findMany({
    where: {
      orgNodeId: { in: pathSegments },
      scope,
      isActive: true,
    },
    include: {
      orgNode: { select: { id: true, name: true, code: true, managerId: true, path: true } },
    },
    orderBy: { level: 'asc' },
  });

  if (policies.length === 0) {
    return resolveAdminFallback(scope);
  }

  const chain: ChainStep[] = [];

  for (const policy of policies) {
    const resolvedApprovers = await resolveApprovers(
      policy.ruleType,
      policy.ruleConfig as Record<string, unknown>,
      policy.orgNode,
    );

    chain.push({
      level: policy.level,
      orgNodeId: policy.orgNodeId,
      orgNodeName: policy.orgNode.name,
      ruleType: policy.ruleType,
      resolvedApprovers,
      quorum: policy.ruleType === 'COMMITTEE'
        ? ((policy.ruleConfig as Record<string, unknown>).quorum as number) ?? resolvedApprovers.length
        : undefined,
    });
  }

  return chain;
}

/**
 * Resolve the approval chain for an entity that spans multiple nodes.
 * Used for initiatives and scenarios that involve employees from different BUs.
 */
export async function resolveChainForMultipleNodes(
  nodeIds: string[],
  scope: ApprovalScope,
  strategy: CrossBuStrategy = 'COMMON_ANCESTOR',
): Promise<ChainStep[]> {
  if (nodeIds.length === 0) return resolveAdminFallback(scope);
  if (nodeIds.length === 1) return resolveChainFromNode(nodeIds[0], scope);

  if (strategy === 'COMMON_ANCESTOR') {
    const lcaId = await findLowestCommonAncestor(nodeIds);
    if (!lcaId) return resolveAdminFallback(scope);
    return resolveChainFromNode(lcaId, scope);
  }

  // ALL_BRANCHES: collect chains from each node, merge by level
  const allChains = await Promise.all(
    nodeIds.map((nid) => resolveChainFromNode(nid, scope)),
  );

  // Merge: for each level, collect unique approvers across all branches
  const levelMap = new Map<number, ChainStep>();
  for (const chain of allChains) {
    for (const step of chain) {
      const existing = levelMap.get(step.level);
      if (!existing) {
        levelMap.set(step.level, { ...step });
      } else {
        // Merge approvers, de-duplicate by userId
        const existingIds = new Set(existing.resolvedApprovers.map((a) => a.userId));
        for (const approver of step.resolvedApprovers) {
          if (!existingIds.has(approver.userId)) {
            existing.resolvedApprovers.push(approver);
            existingIds.add(approver.userId);
          }
        }
      }
    }
  }

  return Array.from(levelMap.values()).sort((a, b) => a.level - b.level);
}

/**
 * Preview the approval chain for a given subject (without creating a request).
 */
export async function previewChain(params: {
  scope: ApprovalScope;
  subjectType: 'allocation' | 'initiative' | 'scenario';
  subjectId: string;
}): Promise<ChainStep[]> {
  const { scope, subjectType, subjectId } = params;

  const nodeIds = await getAffectedNodeIds(subjectType, subjectId);

  // Determine cross-BU strategy from highest applicable policy
  let strategy: CrossBuStrategy = 'COMMON_ANCESTOR';
  if (nodeIds.length > 0) {
    const firstPolicy = await prisma.approvalPolicy.findFirst({
      where: { orgNodeId: { in: nodeIds }, scope, isActive: true },
      orderBy: { level: 'asc' },
    });
    if (firstPolicy) {
      strategy = firstPolicy.crossBuStrategy;
    }
  }

  return resolveChainForMultipleNodes(nodeIds, scope, strategy);
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Fallback: return a chain with a single FALLBACK_ADMIN step
 * when no approval policies are found anywhere in the ancestry.
 */
async function resolveAdminFallback(scope: ApprovalScope): Promise<ChainStep[]> {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', isActive: true },
  });

  if (admins.length === 0) return [];

  return [
    {
      level: 1,
      orgNodeId: 'FALLBACK',
      orgNodeName: 'System Fallback (Admin)',
      ruleType: 'FALLBACK_ADMIN',
      resolvedApprovers: admins.map((u) => ({
        userId: u.id,
        name: u.name,
        email: u.email,
      })),
    },
  ];
}

async function validateRuleConfig(ruleType: ApprovalRuleType, config: Record<string, unknown>) {
  if (ruleType === 'SPECIFIC_PERSON') {
    if (!config.userId || typeof config.userId !== 'string') {
      throw new ValidationError('SPECIFIC_PERSON rule requires ruleConfig.userId');
    }
    const user = await prisma.user.findUnique({ where: { id: config.userId as string } });
    if (!user) throw new NotFoundError('User', config.userId as string);
  }

  if (ruleType === 'COMMITTEE') {
    if (!Array.isArray(config.userIds) || config.userIds.length === 0) {
      throw new ValidationError('COMMITTEE rule requires ruleConfig.userIds (non-empty array)');
    }
    if (config.quorum !== undefined) {
      const quorum = config.quorum as number;
      if (typeof quorum !== 'number' || quorum < 1 || quorum > (config.userIds as string[]).length) {
        throw new ValidationError(
          `Quorum must be between 1 and ${(config.userIds as string[]).length}`,
        );
      }
    }
  }

  if (ruleType === 'ROLE_BASED') {
    if (!config.role || typeof config.role !== 'string') {
      throw new ValidationError('ROLE_BASED rule requires ruleConfig.role');
    }
  }
}

async function resolveApprovers(
  ruleType: ApprovalRuleType,
  config: Record<string, unknown>,
  orgNode: { id: string; name: string; managerId: string | null; path: string },
): Promise<ResolvedApprover[]> {
  switch (ruleType) {
    case 'NODE_MANAGER': {
      if (!orgNode.managerId) return [];
      // Manager is an Employee; find linked User by name/email match
      // For now, return employee info — in practice you'd link Employee->User
      const manager = await prisma.employee.findUnique({
        where: { id: orgNode.managerId },
      });
      if (!manager) return [];
      // Attempt to find a matching user
      const user = await prisma.user.findFirst({
        where: { name: manager.name, isActive: true },
      });
      if (!user) return [];
      return [{ userId: user.id, name: user.name, email: user.email }];
    }

    case 'SPECIFIC_PERSON': {
      const user = await prisma.user.findUnique({
        where: { id: config.userId as string },
      });
      if (!user || !user.isActive) return [];
      return [{ userId: user.id, name: user.name, email: user.email }];
    }

    case 'ROLE_BASED': {
      const users = await prisma.user.findMany({
        where: { role: config.role as UserRole, isActive: true },
      });
      return users.map((u) => ({ userId: u.id, name: u.name, email: u.email }));
    }

    case 'ANCESTOR_MANAGER': {
      // Walk up the path to find the first ancestor with a managerId
      const ancestorIds = orgNode.path
        .split('/')
        .filter((s) => s.length > 0)
        .reverse(); // start from deepest

      for (const ancId of ancestorIds) {
        if (ancId === orgNode.id) continue;
        const ancestor = await prisma.orgNode.findUnique({
          where: { id: ancId },
          include: { manager: true },
        });
        if (ancestor?.managerId && ancestor.manager) {
          const user = await prisma.user.findFirst({
            where: { name: ancestor.manager.name, isActive: true },
          });
          if (user) return [{ userId: user.id, name: user.name, email: user.email }];
        }
      }
      return [];
    }

    case 'COMMITTEE': {
      const userIds = config.userIds as string[];
      const users = await prisma.user.findMany({
        where: { id: { in: userIds }, isActive: true },
      });
      return users.map((u) => ({ userId: u.id, name: u.name, email: u.email }));
    }

    case 'FALLBACK_ADMIN': {
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN', isActive: true },
      });
      return admins.map((u) => ({ userId: u.id, name: u.name, email: u.email }));
    }

    default:
      return [];
  }
}

async function findLowestCommonAncestor(nodeIds: string[]): Promise<string | null> {
  const nodes = await prisma.orgNode.findMany({
    where: { id: { in: nodeIds } },
    select: { id: true, path: true },
  });

  if (nodes.length === 0) return null;

  // Parse paths into arrays of ancestor IDs
  const pathArrays = nodes.map((n) =>
    n.path.split('/').filter((s) => s.length > 0),
  );

  // Find the longest common prefix
  const shortest = Math.min(...pathArrays.map((p) => p.length));
  let lcaId: string | null = null;

  for (let i = 0; i < shortest; i++) {
    const segment = pathArrays[0][i];
    if (pathArrays.every((p) => p[i] === segment)) {
      lcaId = segment;
    } else {
      break;
    }
  }

  return lcaId;
}

/**
 * Determine which org nodes are affected by a given subject.
 */
async function getAffectedNodeIds(
  subjectType: string,
  subjectId: string,
): Promise<string[]> {
  switch (subjectType) {
    case 'allocation': {
      const allocation = await prisma.allocation.findUnique({
        where: { id: subjectId },
        select: { employeeId: true },
      });
      if (!allocation) return [];
      const membership = await getActiveMembership(allocation.employeeId);
      return membership ? [membership.orgNodeId] : [];
    }

    case 'initiative': {
      // Find all employees allocated to this initiative
      const allocations = await prisma.allocation.findMany({
        where: { initiativeId: subjectId },
        select: { employeeId: true },
        distinct: ['employeeId'],
      });

      if (allocations.length === 0) {
        // Fall back to business owner's node
        const initiative = await prisma.initiative.findUnique({
          where: { id: subjectId },
          select: { businessOwnerId: true },
        });
        if (!initiative) return [];
        // Try to find an employee matching the business owner
        const ownerUser = await prisma.user.findUnique({
          where: { id: initiative.businessOwnerId },
        });
        if (!ownerUser) return [];
        const employee = await prisma.employee.findFirst({
          where: { name: ownerUser.name },
        });
        if (!employee) return [];
        const membership = await getActiveMembership(employee.id);
        return membership ? [membership.orgNodeId] : [];
      }

      const nodeIds = new Set<string>();
      for (const alloc of allocations) {
        const membership = await getActiveMembership(alloc.employeeId);
        if (membership) nodeIds.add(membership.orgNodeId);
      }
      return Array.from(nodeIds);
    }

    case 'scenario': {
      const allocations = await prisma.allocation.findMany({
        where: { scenarioId: subjectId },
        select: { employeeId: true },
        distinct: ['employeeId'],
      });

      const nodeIds = new Set<string>();
      for (const alloc of allocations) {
        const membership = await getActiveMembership(alloc.employeeId);
        if (membership) nodeIds.add(membership.orgNodeId);
      }
      return Array.from(nodeIds);
    }

    default:
      return [];
  }
}
