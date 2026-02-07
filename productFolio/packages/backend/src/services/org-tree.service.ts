import { prisma } from '../lib/prisma.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { logAuditEvent } from './audit.service.js';
import type { OrgNodeType, Prisma } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

export interface CreateNodeInput {
  name: string;
  code: string;
  type: OrgNodeType;
  parentId?: string | null;
  managerId?: string | null;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
}

export interface UpdateNodeInput {
  name?: string;
  code?: string;
  managerId?: string | null;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
}

export interface OrgTreeNode {
  id: string;
  name: string;
  code: string;
  type: OrgNodeType;
  parentId: string | null;
  path: string;
  depth: number;
  managerId: string | null;
  sortOrder: number;
  isActive: boolean;
  metadata: unknown;
  manager?: { id: string; name: string } | null;
  children?: OrgTreeNode[];
  _count?: { memberships: number; approvalPolicies: number };
}

// ============================================================================
// Tree CRUD
// ============================================================================

export async function createNode(
  input: CreateNodeInput,
  actorId?: string,
) {
  // ROOT node: parentId must be null
  if (input.type === 'ROOT') {
    if (input.parentId) {
      throw new ValidationError('ROOT node cannot have a parent');
    }
    const existingRoot = await prisma.orgNode.findFirst({
      where: { type: 'ROOT', isActive: true },
    });
    if (existingRoot) {
      throw new ValidationError('An active ROOT node already exists');
    }
  } else {
    // Non-root nodes must have a parent
    if (!input.parentId) {
      throw new ValidationError('Non-ROOT nodes must have a parentId');
    }
  }

  let parentPath = '/';
  let parentDepth = -1;

  if (input.parentId) {
    const parent = await prisma.orgNode.findUnique({
      where: { id: input.parentId },
    });
    if (!parent) {
      throw new NotFoundError('Parent OrgNode', input.parentId);
    }
    if (!parent.isActive) {
      throw new ValidationError('Cannot add child to an inactive node');
    }
    parentPath = parent.path;
    parentDepth = parent.depth;
  }

  if (input.managerId) {
    const manager = await prisma.employee.findUnique({
      where: { id: input.managerId },
    });
    if (!manager) {
      throw new NotFoundError('Employee (manager)', input.managerId);
    }
  }

  // Use a temporary path, then update after we have the id
  const node = await prisma.orgNode.create({
    data: {
      name: input.name,
      code: input.code,
      type: input.type,
      parentId: input.parentId ?? null,
      path: '', // placeholder
      depth: parentDepth + 1,
      managerId: input.managerId ?? null,
      sortOrder: input.sortOrder ?? 0,
      metadata: (input.metadata as Prisma.InputJsonValue) ?? undefined,
    },
  });

  // Now set the real path
  const path = parentPath === '/'
    ? `/${node.id}/`
    : `${parentPath}${node.id}/`;

  const updated = await prisma.orgNode.update({
    where: { id: node.id },
    data: { path },
    include: {
      manager: { select: { id: true, name: true } },
      _count: { select: { memberships: true, approvalPolicies: true } },
    },
  });

  if (actorId) {
    await logAuditEvent({
      actorId,
      entityType: 'OrgNode',
      entityId: node.id,
      action: 'CREATE',
      payload: { name: input.name, code: input.code, type: input.type, parentId: input.parentId },
    });
  }

  return updated;
}

export async function updateNode(
  id: string,
  input: UpdateNodeInput,
  actorId?: string,
) {
  const node = await prisma.orgNode.findUnique({ where: { id } });
  if (!node) throw new NotFoundError('OrgNode', id);
  if (!node.isActive) throw new ValidationError('Cannot update an inactive node');

  if (input.managerId) {
    const manager = await prisma.employee.findUnique({
      where: { id: input.managerId },
    });
    if (!manager) throw new NotFoundError('Employee (manager)', input.managerId);
  }

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.code !== undefined) data.code = input.code;
  if (input.managerId !== undefined) data.managerId = input.managerId;
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
  if (input.metadata !== undefined) data.metadata = input.metadata;

  const updated = await prisma.orgNode.update({
    where: { id },
    data,
    include: {
      manager: { select: { id: true, name: true } },
      _count: { select: { memberships: true, approvalPolicies: true } },
    },
  });

  if (actorId) {
    await logAuditEvent({
      actorId,
      entityType: 'OrgNode',
      entityId: id,
      action: 'UPDATE',
      payload: { before: { name: node.name, code: node.code, managerId: node.managerId }, after: { ...input } } as Prisma.InputJsonValue,
    });
  }

  return updated;
}

export async function moveNode(
  nodeId: string,
  newParentId: string,
  actorId?: string,
) {
  const node = await prisma.orgNode.findUnique({ where: { id: nodeId } });
  if (!node) throw new NotFoundError('OrgNode', nodeId);
  if (node.type === 'ROOT') throw new ValidationError('Cannot move the ROOT node');

  const newParent = await prisma.orgNode.findUnique({ where: { id: newParentId } });
  if (!newParent) throw new NotFoundError('New parent OrgNode', newParentId);
  if (!newParent.isActive) throw new ValidationError('Cannot move under an inactive node');

  // Cycle detection: newParent must not be a descendant of nodeId
  if (newParent.path.includes(`/${nodeId}/`)) {
    throw new ValidationError(
      'Cannot move a node under one of its own descendants (would create a cycle)',
    );
  }

  const oldParentId = node.parentId;
  const oldPath = node.path;
  const newPath = `${newParent.path}${nodeId}/`;
  const newDepth = newParent.depth + 1;
  const depthDelta = newDepth - node.depth;

  // Update the node and all descendants in a transaction
  await prisma.$transaction(async (tx) => {
    // Update the moved node itself
    await tx.orgNode.update({
      where: { id: nodeId },
      data: {
        parentId: newParentId,
        path: newPath,
        depth: newDepth,
      },
    });

    // Update all descendants: replace the old path prefix with the new one
    const descendants = await tx.orgNode.findMany({
      where: {
        path: { startsWith: oldPath },
        id: { not: nodeId },
      },
    });

    for (const desc of descendants) {
      const updatedPath = desc.path.replace(oldPath, newPath);
      await tx.orgNode.update({
        where: { id: desc.id },
        data: {
          path: updatedPath,
          depth: desc.depth + depthDelta,
        },
      });
    }
  });

  if (actorId) {
    await logAuditEvent({
      actorId,
      entityType: 'OrgNode',
      entityId: nodeId,
      action: 'MOVE',
      payload: { oldParentId, newParentId },
    });
  }

  return prisma.orgNode.findUnique({
    where: { id: nodeId },
    include: {
      manager: { select: { id: true, name: true } },
      _count: { select: { memberships: true, approvalPolicies: true } },
    },
  });
}

export async function deleteNode(nodeId: string, actorId?: string) {
  const node = await prisma.orgNode.findUnique({
    where: { id: nodeId },
    include: {
      _count: { select: { children: true, memberships: true } },
    },
  });

  if (!node) throw new NotFoundError('OrgNode', nodeId);
  if (node.type === 'ROOT') throw new ValidationError('Cannot delete the ROOT node');

  // Check for active children
  const activeChildren = await prisma.orgNode.count({
    where: { parentId: nodeId, isActive: true },
  });
  if (activeChildren > 0) {
    throw new ValidationError(
      `Cannot delete node with ${activeChildren} active child node(s). Move or delete children first.`,
    );
  }

  // Check for active memberships
  const activeMemberships = await prisma.orgMembership.count({
    where: { orgNodeId: nodeId, effectiveEnd: null },
  });
  if (activeMemberships > 0) {
    throw new ValidationError(
      `Cannot delete node with ${activeMemberships} active employee membership(s). Reassign employees first.`,
    );
  }

  // Soft delete: deactivate node and its policies
  await prisma.$transaction([
    prisma.orgNode.update({
      where: { id: nodeId },
      data: { isActive: false },
    }),
    prisma.approvalPolicy.updateMany({
      where: { orgNodeId: nodeId, isActive: true },
      data: { isActive: false },
    }),
  ]);

  if (actorId) {
    await logAuditEvent({
      actorId,
      entityType: 'OrgNode',
      entityId: nodeId,
      action: 'DELETE',
      payload: { name: node.name, code: node.code },
    });
  }

  return { id: nodeId };
}

// ============================================================================
// Tree Queries
// ============================================================================

export async function getNodeById(id: string) {
  const node = await prisma.orgNode.findUnique({
    where: { id },
    include: {
      parent: { select: { id: true, name: true, code: true } },
      manager: { select: { id: true, name: true } },
      children: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, code: true, type: true },
      },
      _count: { select: { memberships: true, approvalPolicies: true } },
    },
  });

  if (!node) throw new NotFoundError('OrgNode', id);
  return node;
}

export async function listNodes(filters?: {
  parentId?: string;
  type?: OrgNodeType;
  isActive?: boolean;
  search?: string;
}) {
  const where: Record<string, unknown> = {};

  if (filters?.parentId !== undefined) where.parentId = filters.parentId;
  if (filters?.type) where.type = filters.type;
  if (filters?.isActive !== undefined) where.isActive = filters.isActive;
  else where.isActive = true; // default to active only

  if (filters?.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { code: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  return prisma.orgNode.findMany({
    where,
    include: {
      manager: { select: { id: true, name: true } },
      _count: { select: { memberships: true, approvalPolicies: true } },
    },
    orderBy: [{ depth: 'asc' }, { sortOrder: 'asc' }],
  });
}

export async function getFullTree() {
  const nodes = await prisma.orgNode.findMany({
    where: { isActive: true },
    include: {
      manager: { select: { id: true, name: true } },
      _count: { select: { memberships: true, approvalPolicies: true } },
    },
    orderBy: [{ depth: 'asc' }, { sortOrder: 'asc' }],
  });

  // Build nested tree from flat list
  const nodeMap = new Map<string, OrgTreeNode>();
  const roots: OrgTreeNode[] = [];

  for (const n of nodes) {
    const treeNode: OrgTreeNode = {
      id: n.id,
      name: n.name,
      code: n.code,
      type: n.type,
      parentId: n.parentId,
      path: n.path,
      depth: n.depth,
      managerId: n.managerId,
      sortOrder: n.sortOrder,
      isActive: n.isActive,
      metadata: n.metadata,
      manager: n.manager,
      children: [],
      _count: n._count,
    };
    nodeMap.set(n.id, treeNode);
  }

  for (const n of nodeMap.values()) {
    if (n.parentId && nodeMap.has(n.parentId)) {
      nodeMap.get(n.parentId)!.children!.push(n);
    } else {
      roots.push(n);
    }
  }

  return roots;
}

export async function getAncestors(nodeId: string) {
  const node = await prisma.orgNode.findUnique({
    where: { id: nodeId },
  });
  if (!node) throw new NotFoundError('OrgNode', nodeId);

  // Parse the materialized path to get ancestor IDs
  const ancestorIds = node.path
    .split('/')
    .filter((segment) => segment.length > 0 && segment !== nodeId);

  if (ancestorIds.length === 0) return [];

  const ancestors = await prisma.orgNode.findMany({
    where: { id: { in: ancestorIds } },
    include: {
      manager: { select: { id: true, name: true } },
    },
    orderBy: { depth: 'asc' },
  });

  return ancestors;
}

export async function getDescendants(nodeId: string) {
  const node = await prisma.orgNode.findUnique({
    where: { id: nodeId },
  });
  if (!node) throw new NotFoundError('OrgNode', nodeId);

  return prisma.orgNode.findMany({
    where: {
      path: { startsWith: node.path },
      id: { not: nodeId },
      isActive: true,
    },
    include: {
      manager: { select: { id: true, name: true } },
      _count: { select: { memberships: true } },
    },
    orderBy: [{ depth: 'asc' }, { sortOrder: 'asc' }],
  });
}

// ============================================================================
// Coverage Analysis
// ============================================================================

export async function getCoverageReport() {
  // Employees with no active membership
  const unassignedEmployees = await prisma.employee.findMany({
    where: {
      orgMemberships: {
        none: { effectiveEnd: null },
      },
    },
    select: { id: true, name: true, role: true, employmentType: true },
  });

  // Active nodes with no approval policies per scope
  const nodesWithoutPolicies = await prisma.orgNode.findMany({
    where: {
      isActive: true,
      approvalPolicies: { none: { isActive: true } },
    },
    select: { id: true, name: true, code: true, type: true },
  });

  const totalEmployees = await prisma.employee.count();
  const assignedEmployees = await prisma.employee.count({
    where: {
      orgMemberships: { some: { effectiveEnd: null } },
    },
  });

  const totalActiveNodes = await prisma.orgNode.count({ where: { isActive: true } });

  return {
    totalEmployees,
    assignedEmployees,
    unassignedCount: totalEmployees - assignedEmployees,
    coveragePercentage: totalEmployees > 0
      ? Math.round((assignedEmployees / totalEmployees) * 100)
      : 100,
    unassignedEmployees,
    totalActiveNodes,
    nodesWithoutPolicies,
  };
}

// ============================================================================
// Org-Scoped Employee Lookup
// ============================================================================

/**
 * Get all employee IDs within an org subtree (the node itself + all descendants).
 * Uses active OrgMemberships to find employees assigned to those nodes.
 */
export async function getEmployeesInSubtree(nodeId: string): Promise<string[]> {
  const node = await prisma.orgNode.findUnique({ where: { id: nodeId } });
  if (!node) throw new NotFoundError('OrgNode', nodeId);

  // Get all descendant nodes
  const descendants = await prisma.orgNode.findMany({
    where: {
      path: { startsWith: node.path },
      isActive: true,
    },
    select: { id: true },
  });

  const nodeIds = descendants.map((n) => n.id);

  // Find all active memberships in those nodes
  const memberships = await prisma.orgMembership.findMany({
    where: {
      orgNodeId: { in: nodeIds },
      effectiveEnd: null, // active memberships only
    },
    select: { employeeId: true },
  });

  // Deduplicate (an employee could be in multiple nodes)
  const employeeIds = [...new Set(memberships.map((m) => m.employeeId))];
  return employeeIds;
}
