import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ValidationError, NotFoundError } from '../lib/errors.js';

// Mock Prisma Client
vi.mock('../lib/prisma.js', () => {
  const mockPrisma = {
    orgNode: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    orgMembership: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    employee: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    approvalPolicy: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    auditEvent: {
      create: vi.fn(),
    },
    $transaction: vi.fn((input: unknown) => {
      if (typeof input === 'function') return input(mockPrisma);
      if (Array.isArray(input)) return Promise.all(input);
      return Promise.resolve(input);
    }),
  };
  return { prisma: mockPrisma };
});

// Mock audit service
vi.mock('../services/audit.service.js', () => ({
  logAuditEvent: vi.fn(),
}));

import { prisma } from '../lib/prisma.js';
import {
  createNode,
  updateNode,
  deleteNode,
  getNodeById,
  getFullTree,
  getAncestors,
  getCoverageReport,
} from '../services/org-tree.service.js';

const mockPrisma = prisma as any;

function makeNode(overrides: Record<string, unknown> = {}) {
  return {
    id: 'node-1',
    name: 'Test Node',
    code: 'TEST',
    type: 'TEAM',
    parentId: 'root-1',
    path: '/root-1/node-1/',
    depth: 1,
    managerId: null,
    sortOrder: 0,
    isActive: true,
    metadata: {},
    ...overrides,
  };
}

describe('OrgTreeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // createNode
  // ==========================================================================

  describe('createNode', () => {
    it('should create a ROOT node when no parent is given', async () => {
      mockPrisma.orgNode.findFirst.mockResolvedValue(null);
      const createdNode = makeNode({ id: 'root-1', type: 'ROOT', parentId: null, path: '/', depth: 0 });
      mockPrisma.orgNode.create.mockResolvedValue(createdNode);
      mockPrisma.orgNode.update.mockResolvedValue({ ...createdNode, path: '/root-1/' });

      const result = await createNode({
        name: 'Acme Corp',
        code: 'ACME',
        type: 'ROOT',
      });

      expect(mockPrisma.orgNode.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should reject ROOT node if one already exists', async () => {
      mockPrisma.orgNode.findFirst.mockResolvedValue(makeNode({ type: 'ROOT' }));

      await expect(
        createNode({ name: 'Second Root', code: 'ROOT2', type: 'ROOT' }),
      ).rejects.toThrow(ValidationError);
    });

    it('should reject ROOT node with a parentId', async () => {
      await expect(
        createNode({ name: 'Bad Root', code: 'BR', type: 'ROOT', parentId: 'some-id' }),
      ).rejects.toThrow(ValidationError);
    });

    it('should reject non-ROOT node without a parentId', async () => {
      await expect(
        createNode({ name: 'Orphan Team', code: 'OT', type: 'TEAM' }),
      ).rejects.toThrow(ValidationError);
    });

    it('should reject when parent does not exist', async () => {
      mockPrisma.orgNode.findUnique.mockResolvedValue(null);

      await expect(
        createNode({ name: 'Team', code: 'T', type: 'TEAM', parentId: 'missing-id' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('should reject when parent is inactive', async () => {
      mockPrisma.orgNode.findUnique.mockResolvedValue(makeNode({ isActive: false }));

      await expect(
        createNode({ name: 'Team', code: 'T', type: 'TEAM', parentId: 'inactive-id' }),
      ).rejects.toThrow(ValidationError);
    });

    it('should create child node with correct path and depth', async () => {
      const parent = makeNode({ id: 'parent-1', path: '/root-1/parent-1/', depth: 1 });
      mockPrisma.orgNode.findUnique.mockResolvedValue(parent);

      const child = makeNode({ id: 'child-1', parentId: 'parent-1', path: '/root-1/parent-1/', depth: 2 });
      mockPrisma.orgNode.create.mockResolvedValue(child);
      mockPrisma.orgNode.update.mockResolvedValue({ ...child, path: '/root-1/parent-1/child-1/' });

      const result = await createNode({
        name: 'Frontend',
        code: 'FE',
        type: 'TEAM',
        parentId: 'parent-1',
      });

      expect(result).toBeDefined();
      expect(mockPrisma.orgNode.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            parentId: 'parent-1',
            depth: 2,
          }),
        }),
      );
    });

    it('should verify manager exists when managerId is provided', async () => {
      const parent = makeNode({ id: 'parent-1', path: '/root-1/parent-1/', depth: 1 });
      // First call: findUnique for parent, second call: findUnique for manager
      mockPrisma.orgNode.findUnique.mockResolvedValue(parent);
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        createNode({ name: 'Team', code: 'T', type: 'TEAM', parentId: 'parent-1', managerId: 'no-such-manager' }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ==========================================================================
  // updateNode
  // ==========================================================================

  describe('updateNode', () => {
    it('should update node name and code', async () => {
      const existing = makeNode();
      mockPrisma.orgNode.findUnique.mockResolvedValue(existing);
      mockPrisma.orgNode.update.mockResolvedValue({ ...existing, name: 'Updated' });

      const result = await updateNode('node-1', { name: 'Updated' });

      expect(mockPrisma.orgNode.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'node-1' },
          data: expect.objectContaining({ name: 'Updated' }),
        }),
      );
      expect(result.name).toBe('Updated');
    });

    it('should throw NotFoundError when node does not exist', async () => {
      mockPrisma.orgNode.findUnique.mockResolvedValue(null);

      await expect(
        updateNode('missing-id', { name: 'X' }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ==========================================================================
  // deleteNode (soft delete)
  // ==========================================================================

  describe('deleteNode', () => {
    it('should reject deleting a ROOT node', async () => {
      mockPrisma.orgNode.findUnique.mockResolvedValue(makeNode({ type: 'ROOT' }));

      await expect(deleteNode('root-1')).rejects.toThrow(ValidationError);
    });

    it('should reject deleting node with active children', async () => {
      mockPrisma.orgNode.findUnique.mockResolvedValue(makeNode());
      mockPrisma.orgNode.count.mockResolvedValue(2); // 2 active children

      await expect(deleteNode('node-1')).rejects.toThrow(ValidationError);
    });

    it('should reject deleting node with active memberships', async () => {
      const node = makeNode();
      mockPrisma.orgNode.findUnique.mockResolvedValue(node);
      mockPrisma.orgNode.count.mockResolvedValue(0); // no children
      mockPrisma.orgMembership.count.mockResolvedValue(3); // active memberships

      await expect(deleteNode('node-1')).rejects.toThrow(ValidationError);
    });

    it('should soft-delete when no children or memberships', async () => {
      const node = makeNode();
      mockPrisma.orgNode.findUnique.mockResolvedValue(node);
      mockPrisma.orgNode.count.mockResolvedValue(0);
      mockPrisma.orgMembership.count.mockResolvedValue(0);
      mockPrisma.approvalPolicy.findMany.mockResolvedValue([]);
      mockPrisma.approvalPolicy.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.orgNode.update.mockResolvedValue({ ...node, isActive: false });

      const result = await deleteNode('node-1');

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual({ id: 'node-1' });
    });
  });

  // ==========================================================================
  // getNodeById
  // ==========================================================================

  describe('getNodeById', () => {
    it('should return node with includes', async () => {
      const node = makeNode();
      mockPrisma.orgNode.findUnique.mockResolvedValue(node);

      const result = await getNodeById('node-1');

      expect(result).toEqual(node);
      expect(mockPrisma.orgNode.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'node-1' } }),
      );
    });

    it('should throw NotFoundError when node missing', async () => {
      mockPrisma.orgNode.findUnique.mockResolvedValue(null);

      await expect(getNodeById('missing')).rejects.toThrow(NotFoundError);
    });
  });

  // ==========================================================================
  // getFullTree
  // ==========================================================================

  describe('getFullTree', () => {
    it('should assemble flat nodes into a tree', async () => {
      const root = makeNode({ id: 'root-1', type: 'ROOT', parentId: null, depth: 0 });
      const child = makeNode({ id: 'child-1', parentId: 'root-1', depth: 1 });
      const grandchild = makeNode({ id: 'gc-1', parentId: 'child-1', depth: 2 });

      mockPrisma.orgNode.findMany.mockResolvedValue([root, child, grandchild]);

      const result = await getFullTree();

      expect(result).toHaveLength(1); // one root
      expect(result[0].id).toBe('root-1');
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children![0].id).toBe('child-1');
      expect(result[0].children![0].children).toHaveLength(1);
      expect(result[0].children![0].children![0].id).toBe('gc-1');
    });

    it('should return empty array when no nodes', async () => {
      mockPrisma.orgNode.findMany.mockResolvedValue([]);

      const result = await getFullTree();
      expect(result).toEqual([]);
    });
  });

  // ==========================================================================
  // getAncestors
  // ==========================================================================

  describe('getAncestors', () => {
    it('should parse materialized path into ancestors', async () => {
      const node = makeNode({ id: 'child-1', path: '/root-1/parent-1/child-1/' });
      mockPrisma.orgNode.findUnique.mockResolvedValueOnce(node);

      const root = makeNode({ id: 'root-1', type: 'ROOT', depth: 0, parentId: null });
      const parent = makeNode({ id: 'parent-1', depth: 1 });
      // The second findMany call fetches the ancestors
      mockPrisma.orgNode.findMany.mockResolvedValue([root, parent]);

      const result = await getAncestors('child-1');

      expect(mockPrisma.orgNode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: expect.arrayContaining(['root-1', 'parent-1']) } },
        }),
      );
      expect(result).toHaveLength(2);
    });
  });

  // ==========================================================================
  // getCoverageReport
  // ==========================================================================

  describe('getCoverageReport', () => {
    it('should calculate coverage stats', async () => {
      mockPrisma.employee.count
        .mockResolvedValueOnce(10)  // totalEmployees
        .mockResolvedValueOnce(8);  // assignedCount
      mockPrisma.orgNode.count.mockResolvedValue(5);
      mockPrisma.orgNode.findMany.mockResolvedValue([]); // nodesMissingPolicies (not used in simple test)
      mockPrisma.employee.findMany.mockResolvedValue([
        { id: 'emp-1', name: 'Unassigned 1' },
        { id: 'emp-2', name: 'Unassigned 2' },
      ]);

      const result = await getCoverageReport();

      expect(result).toBeDefined();
      expect(result.totalEmployees).toBe(10);
      expect(result.unassignedCount).toBe(2);
    });
  });
});
