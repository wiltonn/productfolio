import { prisma } from '../lib/prisma.js';
import { NotFoundError, ValidationError, ConflictError } from '../lib/errors.js';
import { logAuditEvent } from './audit.service.js';
import type { EmployeeOrgRelationshipType, Prisma } from '@prisma/client';
import type {
  CreateEmployeeOrgLink,
  UpdateEmployeeOrgLink,
  LinkListFilters,
} from '../schemas/employee-org-link.schema.js';

// ============================================================================
// Constants
// ============================================================================

/** Relationship types that consume capacity by default */
const DEFAULT_CONSUME_CAPACITY: Record<EmployeeOrgRelationshipType, boolean> = {
  PRIMARY_REPORTING: false,
  DELIVERY_ASSIGNMENT: true,
  FUNCTIONAL_ALIGNMENT: false,
  CAPABILITY_POOL: false,
  TEMPORARY_ROTATION: true,
};

/** Relationship types that NEVER consume capacity (hard rule) */
const NEVER_CONSUMES = new Set<EmployeeOrgRelationshipType>([
  'PRIMARY_REPORTING',
  'FUNCTIONAL_ALIGNMENT',
  'CAPABILITY_POOL',
]);

// ============================================================================
// Create
// ============================================================================

export async function createLink(
  input: CreateEmployeeOrgLink,
  actorId?: string,
) {
  // Validate employee exists
  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
  });
  if (!employee) throw new NotFoundError('Employee', input.employeeId);

  // Validate org node exists and is active
  const orgNode = await prisma.orgNode.findUnique({
    where: { id: input.orgNodeId },
  });
  if (!orgNode) throw new NotFoundError('OrgNode', input.orgNodeId);
  if (!orgNode.isActive) throw new ValidationError('Cannot link to an inactive org node');

  // Determine effective consumeCapacity
  const relType = input.relationshipType as EmployeeOrgRelationshipType;
  let consumeCapacity: boolean;
  if (NEVER_CONSUMES.has(relType)) {
    consumeCapacity = false; // hard rule
  } else {
    consumeCapacity = input.consumeCapacity ?? DEFAULT_CONSUME_CAPACITY[relType];
  }

  // PRIMARY_REPORTING: check for existing active link (DB enforces this too)
  if (relType === 'PRIMARY_REPORTING') {
    const existing = await prisma.employeeOrgUnitLink.findFirst({
      where: {
        employeeId: input.employeeId,
        relationshipType: 'PRIMARY_REPORTING',
        endDate: null,
      },
    });
    if (existing) {
      throw new ConflictError(
        `Employee already has an active PRIMARY_REPORTING link (id: ${existing.id}). End it first or use reassignPrimaryReporting.`,
      );
    }
  }

  // Validate allocation totals for capacity-consuming links
  if (consumeCapacity && input.allocationPct) {
    await validateAllocationTotal(
      input.employeeId,
      input.allocationPct,
      undefined, // no link to exclude
    );
  }

  const startDate = input.startDate ?? new Date();

  const link = await prisma.employeeOrgUnitLink.create({
    data: {
      employeeId: input.employeeId,
      orgNodeId: input.orgNodeId,
      relationshipType: relType,
      allocationPct: input.allocationPct ?? null,
      consumeCapacity,
      startDate,
      endDate: input.endDate ?? null,
    },
    include: {
      employee: { select: { id: true, name: true } },
      orgNode: { select: { id: true, name: true, code: true, type: true } },
    },
  });

  if (actorId) {
    await logAuditEvent({
      actorId,
      entityType: 'EmployeeOrgUnitLink',
      entityId: link.id,
      action: 'CREATE',
      payload: {
        employeeId: input.employeeId,
        orgNodeId: input.orgNodeId,
        relationshipType: relType,
        allocationPct: input.allocationPct,
        consumeCapacity,
      },
    });
  }

  return link;
}

// ============================================================================
// Update
// ============================================================================

export async function updateLink(
  linkId: string,
  input: UpdateEmployeeOrgLink,
  actorId?: string,
) {
  const link = await prisma.employeeOrgUnitLink.findUnique({
    where: { id: linkId },
  });
  if (!link) throw new NotFoundError('EmployeeOrgUnitLink', linkId);
  if (link.endDate) throw new ValidationError('Cannot update an ended link');

  // Enforce hard capacity rules
  const data: Prisma.EmployeeOrgUnitLinkUpdateInput = {};

  if (input.consumeCapacity !== undefined) {
    if (NEVER_CONSUMES.has(link.relationshipType)) {
      if (input.consumeCapacity) {
        throw new ValidationError(
          `Cannot set consumeCapacity=true for ${link.relationshipType} links`,
        );
      }
    }
    data.consumeCapacity = input.consumeCapacity;
  }

  if (input.allocationPct !== undefined) {
    data.allocationPct = input.allocationPct;

    // Validate totals if link consumes capacity
    const effectiveConsume = input.consumeCapacity ?? link.consumeCapacity;
    if (effectiveConsume && input.allocationPct !== null) {
      await validateAllocationTotal(
        link.employeeId,
        input.allocationPct,
        linkId,
      );
    }
  }

  if (input.endDate !== undefined) {
    data.endDate = input.endDate;
  }

  const updated = await prisma.employeeOrgUnitLink.update({
    where: { id: linkId },
    data,
    include: {
      employee: { select: { id: true, name: true } },
      orgNode: { select: { id: true, name: true, code: true, type: true } },
    },
  });

  if (actorId) {
    await logAuditEvent({
      actorId,
      entityType: 'EmployeeOrgUnitLink',
      entityId: linkId,
      action: 'UPDATE',
      payload: { ...input },
    });
  }

  return updated;
}

// ============================================================================
// End Link (soft delete via endDate)
// ============================================================================

export async function endLink(linkId: string, actorId?: string) {
  const link = await prisma.employeeOrgUnitLink.findUnique({
    where: { id: linkId },
  });
  if (!link) throw new NotFoundError('EmployeeOrgUnitLink', linkId);
  if (link.endDate) throw new ValidationError('Link is already ended');

  const updated = await prisma.employeeOrgUnitLink.update({
    where: { id: linkId },
    data: { endDate: new Date() },
    include: {
      employee: { select: { id: true, name: true } },
      orgNode: { select: { id: true, name: true, code: true, type: true } },
    },
  });

  if (actorId) {
    await logAuditEvent({
      actorId,
      entityType: 'EmployeeOrgUnitLink',
      entityId: linkId,
      action: 'END',
      payload: {
        employeeId: link.employeeId,
        orgNodeId: link.orgNodeId,
        relationshipType: link.relationshipType,
      },
    });
  }

  return updated;
}

// ============================================================================
// Reassign PRIMARY_REPORTING (atomically end old + create new)
// ============================================================================

export async function reassignPrimaryReporting(
  employeeId: string,
  newOrgNodeId: string,
  actorId?: string,
) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
  });
  if (!employee) throw new NotFoundError('Employee', employeeId);

  const orgNode = await prisma.orgNode.findUnique({
    where: { id: newOrgNodeId },
  });
  if (!orgNode) throw new NotFoundError('OrgNode', newOrgNodeId);
  if (!orgNode.isActive) throw new ValidationError('Cannot assign to an inactive org node');

  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    // End current active PRIMARY_REPORTING
    const current = await tx.employeeOrgUnitLink.findFirst({
      where: {
        employeeId,
        relationshipType: 'PRIMARY_REPORTING',
        endDate: null,
      },
    });

    if (current) {
      await tx.employeeOrgUnitLink.update({
        where: { id: current.id },
        data: { endDate: now },
      });
    }

    // Create new PRIMARY_REPORTING link
    return tx.employeeOrgUnitLink.create({
      data: {
        employeeId,
        orgNodeId: newOrgNodeId,
        relationshipType: 'PRIMARY_REPORTING',
        consumeCapacity: false,
        startDate: now,
      },
      include: {
        employee: { select: { id: true, name: true } },
        orgNode: { select: { id: true, name: true, code: true, type: true } },
      },
    });
  });

  if (actorId) {
    await logAuditEvent({
      actorId,
      entityType: 'EmployeeOrgUnitLink',
      entityId: result.id,
      action: 'REASSIGN_PRIMARY',
      payload: { employeeId, newOrgNodeId },
    });
  }

  return result;
}

// ============================================================================
// Query: List Links
// ============================================================================

export async function listLinks(filters: LinkListFilters) {
  const {
    employeeId,
    orgNodeId,
    relationshipType,
    activeOnly = true,
    consumeCapacityOnly,
    page = 1,
    limit = 50,
  } = filters;

  const where: Prisma.EmployeeOrgUnitLinkWhereInput = {};
  if (employeeId) where.employeeId = employeeId;
  if (orgNodeId) where.orgNodeId = orgNodeId;
  if (relationshipType) where.relationshipType = relationshipType;
  if (activeOnly) where.endDate = null;
  if (consumeCapacityOnly) where.consumeCapacity = true;

  const skip = (page - 1) * limit;

  const [links, total] = await Promise.all([
    prisma.employeeOrgUnitLink.findMany({
      where,
      skip,
      take: limit,
      include: {
        employee: { select: { id: true, name: true, role: true, employmentType: true } },
        orgNode: { select: { id: true, name: true, code: true, type: true } },
      },
      orderBy: [{ relationshipType: 'asc' }, { startDate: 'desc' }],
    }),
    prisma.employeeOrgUnitLink.count({ where }),
  ]);

  return {
    data: links,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ============================================================================
// Query: Get Home Org (PRIMARY_REPORTING) — backward compat
// ============================================================================

export async function getHomeOrg(employeeId: string) {
  const link = await prisma.employeeOrgUnitLink.findFirst({
    where: {
      employeeId,
      relationshipType: 'PRIMARY_REPORTING',
      endDate: null,
    },
    include: {
      orgNode: { select: { id: true, name: true, code: true, type: true, path: true } },
    },
  });
  return link;
}

// ============================================================================
// Query: Get Active Links for Employee
// ============================================================================

export async function getActiveLinks(employeeId: string) {
  return prisma.employeeOrgUnitLink.findMany({
    where: { employeeId, endDate: null },
    include: {
      orgNode: { select: { id: true, name: true, code: true, type: true } },
    },
    orderBy: { relationshipType: 'asc' },
  });
}

// ============================================================================
// Query: Get Members of Org Node by Relationship Type
// ============================================================================

export async function getOrgNodeMembers(
  orgNodeId: string,
  relationshipType?: EmployeeOrgRelationshipType,
) {
  const where: Prisma.EmployeeOrgUnitLinkWhereInput = {
    orgNodeId,
    endDate: null,
  };
  if (relationshipType) where.relationshipType = relationshipType;

  return prisma.employeeOrgUnitLink.findMany({
    where,
    include: {
      employee: {
        select: {
          id: true,
          name: true,
          role: true,
          employmentType: true,
          hoursPerWeek: true,
          skills: { select: { name: true, proficiency: true } },
        },
      },
    },
    orderBy: [{ relationshipType: 'asc' }, { startDate: 'desc' }],
  });
}

// ============================================================================
// Query: Get Capacity-Consuming Links (for scenario planning integration)
// ============================================================================

export async function getCapacityConsumingLinks(employeeId: string) {
  return prisma.employeeOrgUnitLink.findMany({
    where: {
      employeeId,
      consumeCapacity: true,
      endDate: null,
    },
    include: {
      orgNode: { select: { id: true, name: true, code: true, type: true } },
    },
    orderBy: { startDate: 'desc' },
  });
}

// ============================================================================
// Query: Get Employees in Subtree (extended to use org unit links)
// ============================================================================

export async function getEmployeesInSubtreeByLink(
  nodeId: string,
  relationshipType?: EmployeeOrgRelationshipType,
): Promise<string[]> {
  const node = await prisma.orgNode.findUnique({ where: { id: nodeId } });
  if (!node) throw new NotFoundError('OrgNode', nodeId);

  // Get all descendant nodes (inclusive)
  const descendants = await prisma.orgNode.findMany({
    where: {
      path: { startsWith: node.path },
      isActive: true,
    },
    select: { id: true },
  });

  const nodeIds = descendants.map((n) => n.id);

  const where: Prisma.EmployeeOrgUnitLinkWhereInput = {
    orgNodeId: { in: nodeIds },
    endDate: null,
  };
  if (relationshipType) where.relationshipType = relationshipType;

  const links = await prisma.employeeOrgUnitLink.findMany({
    where,
    select: { employeeId: true },
  });

  return [...new Set(links.map((l) => l.employeeId))];
}

// ============================================================================
// Migration: Create PRIMARY_REPORTING links from existing OrgMemberships
// ============================================================================

export async function migrateFromMemberships(dryRun = true) {
  // Find all active OrgMemberships that don't have a corresponding EmployeeOrgUnitLink
  const activeMemberships = await prisma.orgMembership.findMany({
    where: { effectiveEnd: null },
    include: {
      employee: { select: { id: true, name: true } },
      orgNode: { select: { id: true, name: true, code: true } },
    },
  });

  // Check which employees already have a PRIMARY_REPORTING link
  const existingPrimaryLinks = await prisma.employeeOrgUnitLink.findMany({
    where: {
      relationshipType: 'PRIMARY_REPORTING',
      endDate: null,
    },
    select: { employeeId: true },
  });
  const hasLink = new Set(existingPrimaryLinks.map((l) => l.employeeId));

  const toCreate = activeMemberships.filter((m) => !hasLink.has(m.employeeId));

  if (dryRun) {
    return {
      dryRun: true,
      totalActiveMemberships: activeMemberships.length,
      alreadyHaveLink: hasLink.size,
      toCreate: toCreate.length,
      preview: toCreate.map((m) => ({
        employeeId: m.employeeId,
        employeeName: m.employee.name,
        orgNodeId: m.orgNodeId,
        orgNodeName: m.orgNode.name,
      })),
    };
  }

  // Create links
  const created = [];
  for (const membership of toCreate) {
    const link = await prisma.employeeOrgUnitLink.create({
      data: {
        employeeId: membership.employeeId,
        orgNodeId: membership.orgNodeId,
        relationshipType: 'PRIMARY_REPORTING',
        consumeCapacity: false,
        startDate: membership.effectiveStart,
      },
    });
    created.push(link);
  }

  return {
    dryRun: false,
    totalActiveMemberships: activeMemberships.length,
    alreadyHaveLink: hasLink.size,
    created: created.length,
  };
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate that adding allocationPct to an employee's active capacity-consuming
 * links does not exceed 100%.
 */
async function validateAllocationTotal(
  employeeId: string,
  newPct: number,
  excludeLinkId?: string,
) {
  const activeLinks = await prisma.employeeOrgUnitLink.findMany({
    where: {
      employeeId,
      consumeCapacity: true,
      endDate: null,
      ...(excludeLinkId ? { id: { not: excludeLinkId } } : {}),
    },
    select: { allocationPct: true },
  });

  const currentTotal = activeLinks.reduce(
    (sum, l) => sum + (l.allocationPct ?? 0),
    0,
  );

  const projectedTotal = currentTotal + newPct;

  if (projectedTotal > 100) {
    throw new ValidationError(
      `Total capacity-consuming allocation would be ${projectedTotal}% (current: ${currentTotal}% + new: ${newPct}%). Maximum is 100%.`,
      {
        currentTotal,
        newPct,
        projectedTotal,
        maximum: 100,
      },
    );
  }
}

// ============================================================================
// Link History for Employee
// ============================================================================

export async function getLinkHistory(employeeId: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
  });
  if (!employee) throw new NotFoundError('Employee', employeeId);

  return prisma.employeeOrgUnitLink.findMany({
    where: { employeeId },
    include: {
      orgNode: { select: { id: true, name: true, code: true, type: true } },
    },
    orderBy: [{ startDate: 'desc' }],
  });
}
