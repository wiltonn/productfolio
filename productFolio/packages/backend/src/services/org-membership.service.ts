import { prisma } from '../lib/prisma.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { logAuditEvent } from './audit.service.js';

// ============================================================================
// Types
// ============================================================================

export interface AssignInput {
  employeeId: string;
  orgNodeId: string;
  effectiveStart?: Date;
}

export interface BulkAssignInput {
  employeeIds: string[];
  orgNodeId: string;
  effectiveStart?: Date;
}

// ============================================================================
// Membership CRUD
// ============================================================================

export async function assignEmployeeToNode(
  input: AssignInput,
  actorId?: string,
) {
  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
  });
  if (!employee) throw new NotFoundError('Employee', input.employeeId);

  const orgNode = await prisma.orgNode.findUnique({
    where: { id: input.orgNodeId },
  });
  if (!orgNode) throw new NotFoundError('OrgNode', input.orgNodeId);
  if (!orgNode.isActive) throw new ValidationError('Cannot assign to an inactive node');

  const effectiveStart = input.effectiveStart ?? new Date();

  // End any current active membership
  const currentMembership = await prisma.orgMembership.findFirst({
    where: { employeeId: input.employeeId, effectiveEnd: null },
  });

  const oldNodeId = currentMembership?.orgNodeId ?? null;

  await prisma.$transaction(async (tx) => {
    if (currentMembership) {
      // End-date the current membership to the day before the new one starts
      const endDate = new Date(effectiveStart);
      endDate.setDate(endDate.getDate() - 1);
      await tx.orgMembership.update({
        where: { id: currentMembership.id },
        data: { effectiveEnd: endDate },
      });
    }

    await tx.orgMembership.create({
      data: {
        employeeId: input.employeeId,
        orgNodeId: input.orgNodeId,
        effectiveStart: effectiveStart,
      },
    });
  });

  if (actorId) {
    await logAuditEvent({
      actorId,
      entityType: 'OrgMembership',
      entityId: input.employeeId,
      action: oldNodeId ? 'REASSIGN' : 'ASSIGN',
      payload: { employeeId: input.employeeId, from: oldNodeId, to: input.orgNodeId },
    });
  }

  return getActiveMembership(input.employeeId);
}

export async function bulkAssignEmployees(
  input: BulkAssignInput,
  actorId?: string,
) {
  const orgNode = await prisma.orgNode.findUnique({
    where: { id: input.orgNodeId },
  });
  if (!orgNode) throw new NotFoundError('OrgNode', input.orgNodeId);
  if (!orgNode.isActive) throw new ValidationError('Cannot assign to an inactive node');

  const results: { success: string[]; failed: Array<{ employeeId: string; error: string }> } = {
    success: [],
    failed: [],
  };

  for (const employeeId of input.employeeIds) {
    try {
      await assignEmployeeToNode(
        { employeeId, orgNodeId: input.orgNodeId, effectiveStart: input.effectiveStart },
        actorId,
      );
      results.success.push(employeeId);
    } catch (err) {
      results.failed.push({
        employeeId,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return results;
}

export async function endMembership(membershipId: string, actorId?: string) {
  const membership = await prisma.orgMembership.findUnique({
    where: { id: membershipId },
  });
  if (!membership) throw new NotFoundError('OrgMembership', membershipId);
  if (membership.effectiveEnd) {
    throw new ValidationError('Membership is already ended');
  }

  const updated = await prisma.orgMembership.update({
    where: { id: membershipId },
    data: { effectiveEnd: new Date() },
    include: {
      employee: { select: { id: true, name: true } },
      orgNode: { select: { id: true, name: true, code: true } },
    },
  });

  if (actorId) {
    await logAuditEvent({
      actorId,
      entityType: 'OrgMembership',
      entityId: membershipId,
      action: 'END',
      payload: { employeeId: membership.employeeId, orgNodeId: membership.orgNodeId },
    });
  }

  return updated;
}

// ============================================================================
// Membership Queries
// ============================================================================

export async function listMemberships(filters?: {
  orgNodeId?: string;
  employeeId?: string;
  activeOnly?: boolean;
  page?: number;
  limit?: number;
}) {
  const {
    orgNodeId,
    employeeId,
    activeOnly = true,
    page = 1,
    limit = 50,
  } = filters ?? {};

  const where: Record<string, unknown> = {};
  if (orgNodeId) where.orgNodeId = orgNodeId;
  if (employeeId) where.employeeId = employeeId;
  if (activeOnly) where.effectiveEnd = null;

  const skip = (page - 1) * limit;

  const [memberships, total] = await Promise.all([
    prisma.orgMembership.findMany({
      where,
      skip,
      take: limit,
      include: {
        employee: { select: { id: true, name: true, role: true, employmentType: true } },
        orgNode: { select: { id: true, name: true, code: true, type: true } },
      },
      orderBy: { effectiveStart: 'desc' },
    }),
    prisma.orgMembership.count({ where }),
  ]);

  return {
    data: memberships,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getActiveMembership(employeeId: string) {
  const membership = await prisma.orgMembership.findFirst({
    where: { employeeId, effectiveEnd: null },
    include: {
      employee: { select: { id: true, name: true } },
      orgNode: { select: { id: true, name: true, code: true, type: true, path: true } },
    },
  });
  return membership;
}

export async function getMembershipHistory(employeeId: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
  });
  if (!employee) throw new NotFoundError('Employee', employeeId);

  return prisma.orgMembership.findMany({
    where: { employeeId },
    include: {
      orgNode: { select: { id: true, name: true, code: true, type: true } },
    },
    orderBy: { effectiveStart: 'desc' },
  });
}
