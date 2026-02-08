import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ValidationError, NotFoundError, ConflictError } from '../lib/errors.js';

// ============================================================================
// Mock Prisma Client
// ============================================================================

vi.mock('../lib/prisma.js', () => {
  const mockPrisma = {
    employee: {
      findUnique: vi.fn(),
    },
    orgNode: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    orgMembership: {
      findMany: vi.fn(),
    },
    employeeOrgUnitLink: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
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

vi.mock('../services/audit.service.js', () => ({
  logAuditEvent: vi.fn(),
}));

import { prisma } from '../lib/prisma.js';
import {
  createLink,
  updateLink,
  endLink,
  reassignPrimaryReporting,
  listLinks,
  getHomeOrg,
  getActiveLinks,
  getOrgNodeMembers,
  getCapacityConsumingLinks,
  getEmployeesInSubtreeByLink,
  migrateFromMemberships,
  getLinkHistory,
} from '../services/employee-org-link.service.js';

const mockPrisma = prisma as any;

// ============================================================================
// Test Helpers
// ============================================================================

function makeEmployee(overrides: Record<string, unknown> = {}) {
  return {
    id: 'emp-1',
    name: 'Alice Dev',
    role: 'Developer',
    employmentType: 'FULL_TIME',
    hoursPerWeek: 40,
    ...overrides,
  };
}

function makeOrgNode(overrides: Record<string, unknown> = {}) {
  return {
    id: 'node-1',
    name: 'Engineering',
    code: 'ENG',
    type: 'DEPARTMENT',
    parentId: 'root-1',
    path: '/root-1/node-1/',
    depth: 1,
    isActive: true,
    ...overrides,
  };
}

function makeLink(overrides: Record<string, unknown> = {}) {
  return {
    id: 'link-1',
    employeeId: 'emp-1',
    orgNodeId: 'node-1',
    relationshipType: 'PRIMARY_REPORTING',
    allocationPct: null,
    consumeCapacity: false,
    startDate: new Date('2024-01-01'),
    endDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    employee: { id: 'emp-1', name: 'Alice Dev' },
    orgNode: { id: 'node-1', name: 'Engineering', code: 'ENG', type: 'DEPARTMENT' },
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('EmployeeOrgLinkService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // createLink
  // ==========================================================================

  describe('createLink', () => {
    it('creates a PRIMARY_REPORTING link with consumeCapacity=false', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(makeEmployee());
      mockPrisma.orgNode.findUnique.mockResolvedValue(makeOrgNode());
      mockPrisma.employeeOrgUnitLink.findFirst.mockResolvedValue(null); // no existing primary
      mockPrisma.employeeOrgUnitLink.create.mockResolvedValue(makeLink());

      const result = await createLink({
        employeeId: 'emp-1',
        orgNodeId: 'node-1',
        relationshipType: 'PRIMARY_REPORTING',
      });

      expect(result.relationshipType).toBe('PRIMARY_REPORTING');
      expect(mockPrisma.employeeOrgUnitLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            consumeCapacity: false,
            relationshipType: 'PRIMARY_REPORTING',
          }),
        }),
      );
    });

    it('creates a DELIVERY_ASSIGNMENT link with consumeCapacity=true by default', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(makeEmployee());
      mockPrisma.orgNode.findUnique.mockResolvedValue(makeOrgNode());
      mockPrisma.employeeOrgUnitLink.findMany.mockResolvedValue([]); // no existing capacity links
      mockPrisma.employeeOrgUnitLink.create.mockResolvedValue(
        makeLink({
          relationshipType: 'DELIVERY_ASSIGNMENT',
          allocationPct: 60,
          consumeCapacity: true,
        }),
      );

      const result = await createLink({
        employeeId: 'emp-1',
        orgNodeId: 'node-1',
        relationshipType: 'DELIVERY_ASSIGNMENT',
        allocationPct: 60,
      });

      expect(mockPrisma.employeeOrgUnitLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            consumeCapacity: true,
            allocationPct: 60,
          }),
        }),
      );
    });

    it('creates a FUNCTIONAL_ALIGNMENT link with consumeCapacity=false (forced)', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(makeEmployee());
      mockPrisma.orgNode.findUnique.mockResolvedValue(makeOrgNode());
      mockPrisma.employeeOrgUnitLink.create.mockResolvedValue(
        makeLink({
          relationshipType: 'FUNCTIONAL_ALIGNMENT',
          consumeCapacity: false,
        }),
      );

      // Even if caller passes consumeCapacity=true, it should be forced to false
      const result = await createLink({
        employeeId: 'emp-1',
        orgNodeId: 'node-1',
        relationshipType: 'FUNCTIONAL_ALIGNMENT',
        consumeCapacity: true, // ignored for FUNCTIONAL_ALIGNMENT
      });

      expect(mockPrisma.employeeOrgUnitLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ consumeCapacity: false }),
        }),
      );
    });

    it('throws NotFoundError for non-existent employee', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        createLink({
          employeeId: 'emp-999',
          orgNodeId: 'node-1',
          relationshipType: 'PRIMARY_REPORTING',
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError for non-existent org node', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(makeEmployee());
      mockPrisma.orgNode.findUnique.mockResolvedValue(null);

      await expect(
        createLink({
          employeeId: 'emp-1',
          orgNodeId: 'node-999',
          relationshipType: 'PRIMARY_REPORTING',
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ValidationError for inactive org node', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(makeEmployee());
      mockPrisma.orgNode.findUnique.mockResolvedValue(makeOrgNode({ isActive: false }));

      await expect(
        createLink({
          employeeId: 'emp-1',
          orgNodeId: 'node-1',
          relationshipType: 'PRIMARY_REPORTING',
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('throws ConflictError when employee already has active PRIMARY_REPORTING', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(makeEmployee());
      mockPrisma.orgNode.findUnique.mockResolvedValue(makeOrgNode());
      mockPrisma.employeeOrgUnitLink.findFirst.mockResolvedValue(
        makeLink(), // existing active PRIMARY_REPORTING
      );

      await expect(
        createLink({
          employeeId: 'emp-1',
          orgNodeId: 'node-2',
          relationshipType: 'PRIMARY_REPORTING',
        }),
      ).rejects.toThrow(ConflictError);
    });
  });

  // ==========================================================================
  // Allocation total validation (>100% check)
  // ==========================================================================

  describe('allocation total validation', () => {
    it('throws ValidationError when total allocationPct exceeds 100%', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(makeEmployee());
      mockPrisma.orgNode.findUnique.mockResolvedValue(makeOrgNode());
      // Existing capacity-consuming links totaling 70%
      mockPrisma.employeeOrgUnitLink.findMany.mockResolvedValue([
        makeLink({ allocationPct: 40, consumeCapacity: true }),
        makeLink({ allocationPct: 30, consumeCapacity: true }),
      ]);

      await expect(
        createLink({
          employeeId: 'emp-1',
          orgNodeId: 'node-1',
          relationshipType: 'DELIVERY_ASSIGNMENT',
          allocationPct: 50, // 70 + 50 = 120 > 100
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('allows allocation when total is within 100%', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(makeEmployee());
      mockPrisma.orgNode.findUnique.mockResolvedValue(makeOrgNode());
      // Existing capacity-consuming links totaling 60%
      mockPrisma.employeeOrgUnitLink.findMany.mockResolvedValue([
        makeLink({ allocationPct: 30, consumeCapacity: true }),
        makeLink({ allocationPct: 30, consumeCapacity: true }),
      ]);
      mockPrisma.employeeOrgUnitLink.create.mockResolvedValue(
        makeLink({
          relationshipType: 'DELIVERY_ASSIGNMENT',
          allocationPct: 40,
          consumeCapacity: true,
        }),
      );

      const result = await createLink({
        employeeId: 'emp-1',
        orgNodeId: 'node-1',
        relationshipType: 'DELIVERY_ASSIGNMENT',
        allocationPct: 40, // 60 + 40 = 100, exactly at limit
      });

      expect(mockPrisma.employeeOrgUnitLink.create).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // updateLink
  // ==========================================================================

  describe('updateLink', () => {
    it('updates allocationPct on an active link', async () => {
      const existingLink = makeLink({
        relationshipType: 'DELIVERY_ASSIGNMENT',
        consumeCapacity: true,
        allocationPct: 50,
        endDate: null,
      });
      mockPrisma.employeeOrgUnitLink.findUnique.mockResolvedValue(existingLink);
      // No other capacity links
      mockPrisma.employeeOrgUnitLink.findMany.mockResolvedValue([]);
      mockPrisma.employeeOrgUnitLink.update.mockResolvedValue({
        ...existingLink,
        allocationPct: 60,
      });

      const result = await updateLink('link-1', { allocationPct: 60 });

      expect(mockPrisma.employeeOrgUnitLink.update).toHaveBeenCalled();
    });

    it('throws ValidationError when updating ended link', async () => {
      mockPrisma.employeeOrgUnitLink.findUnique.mockResolvedValue(
        makeLink({ endDate: new Date() }),
      );

      await expect(
        updateLink('link-1', { allocationPct: 50 }),
      ).rejects.toThrow(ValidationError);
    });

    it('throws NotFoundError for missing link', async () => {
      mockPrisma.employeeOrgUnitLink.findUnique.mockResolvedValue(null);

      await expect(
        updateLink('link-999', { allocationPct: 50 }),
      ).rejects.toThrow(NotFoundError);
    });

    it('rejects consumeCapacity=true on FUNCTIONAL_ALIGNMENT', async () => {
      mockPrisma.employeeOrgUnitLink.findUnique.mockResolvedValue(
        makeLink({
          relationshipType: 'FUNCTIONAL_ALIGNMENT',
          consumeCapacity: false,
          endDate: null,
        }),
      );

      await expect(
        updateLink('link-1', { consumeCapacity: true }),
      ).rejects.toThrow(ValidationError);
    });
  });

  // ==========================================================================
  // endLink
  // ==========================================================================

  describe('endLink', () => {
    it('sets endDate on an active link', async () => {
      mockPrisma.employeeOrgUnitLink.findUnique.mockResolvedValue(
        makeLink({ endDate: null }),
      );
      mockPrisma.employeeOrgUnitLink.update.mockResolvedValue(
        makeLink({ endDate: new Date() }),
      );

      const result = await endLink('link-1');

      expect(mockPrisma.employeeOrgUnitLink.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ endDate: expect.any(Date) }),
        }),
      );
    });

    it('throws ValidationError when ending already-ended link', async () => {
      mockPrisma.employeeOrgUnitLink.findUnique.mockResolvedValue(
        makeLink({ endDate: new Date() }),
      );

      await expect(endLink('link-1')).rejects.toThrow(ValidationError);
    });

    it('throws NotFoundError for non-existent link', async () => {
      mockPrisma.employeeOrgUnitLink.findUnique.mockResolvedValue(null);

      await expect(endLink('link-999')).rejects.toThrow(NotFoundError);
    });
  });

  // ==========================================================================
  // reassignPrimaryReporting
  // ==========================================================================

  describe('reassignPrimaryReporting', () => {
    it('ends existing PRIMARY_REPORTING and creates new one', async () => {
      const existingLink = makeLink({
        id: 'old-link',
        relationshipType: 'PRIMARY_REPORTING',
        endDate: null,
      });

      mockPrisma.employee.findUnique.mockResolvedValue(makeEmployee());
      mockPrisma.orgNode.findUnique.mockResolvedValue(makeOrgNode({ id: 'node-2' }));
      mockPrisma.employeeOrgUnitLink.findFirst.mockResolvedValue(existingLink);
      mockPrisma.employeeOrgUnitLink.update.mockResolvedValue({
        ...existingLink,
        endDate: new Date(),
      });
      mockPrisma.employeeOrgUnitLink.create.mockResolvedValue(
        makeLink({
          id: 'new-link',
          orgNodeId: 'node-2',
          relationshipType: 'PRIMARY_REPORTING',
        }),
      );

      const result = await reassignPrimaryReporting('emp-1', 'node-2');

      // Should have ended old and created new
      expect(mockPrisma.employeeOrgUnitLink.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'old-link' },
          data: expect.objectContaining({ endDate: expect.any(Date) }),
        }),
      );
      expect(mockPrisma.employeeOrgUnitLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            employeeId: 'emp-1',
            orgNodeId: 'node-2',
            relationshipType: 'PRIMARY_REPORTING',
            consumeCapacity: false,
          }),
        }),
      );
    });

    it('creates PRIMARY_REPORTING when employee has none', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(makeEmployee());
      mockPrisma.orgNode.findUnique.mockResolvedValue(makeOrgNode({ id: 'node-2' }));
      mockPrisma.employeeOrgUnitLink.findFirst.mockResolvedValue(null);
      mockPrisma.employeeOrgUnitLink.create.mockResolvedValue(
        makeLink({
          orgNodeId: 'node-2',
          relationshipType: 'PRIMARY_REPORTING',
        }),
      );

      const result = await reassignPrimaryReporting('emp-1', 'node-2');

      expect(mockPrisma.employeeOrgUnitLink.update).not.toHaveBeenCalled();
      expect(mockPrisma.employeeOrgUnitLink.create).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Query functions
  // ==========================================================================

  describe('getHomeOrg', () => {
    it('returns active PRIMARY_REPORTING link', async () => {
      const link = makeLink({
        relationshipType: 'PRIMARY_REPORTING',
        endDate: null,
      });
      mockPrisma.employeeOrgUnitLink.findFirst.mockResolvedValue(link);

      const result = await getHomeOrg('emp-1');

      expect(result).toEqual(link);
      expect(mockPrisma.employeeOrgUnitLink.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employeeId: 'emp-1',
            relationshipType: 'PRIMARY_REPORTING',
            endDate: null,
          }),
        }),
      );
    });

    it('returns null when employee has no PRIMARY_REPORTING', async () => {
      mockPrisma.employeeOrgUnitLink.findFirst.mockResolvedValue(null);

      const result = await getHomeOrg('emp-1');
      expect(result).toBeNull();
    });
  });

  describe('getActiveLinks', () => {
    it('returns all active links for employee', async () => {
      const links = [
        makeLink({ id: 'link-1', relationshipType: 'PRIMARY_REPORTING' }),
        makeLink({ id: 'link-2', relationshipType: 'DELIVERY_ASSIGNMENT' }),
        makeLink({ id: 'link-3', relationshipType: 'FUNCTIONAL_ALIGNMENT' }),
      ];
      mockPrisma.employeeOrgUnitLink.findMany.mockResolvedValue(links);

      const result = await getActiveLinks('emp-1');

      expect(result).toHaveLength(3);
      expect(mockPrisma.employeeOrgUnitLink.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { employeeId: 'emp-1', endDate: null },
        }),
      );
    });
  });

  describe('getCapacityConsumingLinks', () => {
    it('returns only capacity-consuming active links', async () => {
      const links = [
        makeLink({
          id: 'link-1',
          relationshipType: 'DELIVERY_ASSIGNMENT',
          consumeCapacity: true,
          allocationPct: 60,
        }),
      ];
      mockPrisma.employeeOrgUnitLink.findMany.mockResolvedValue(links);

      const result = await getCapacityConsumingLinks('emp-1');

      expect(result).toHaveLength(1);
      expect(mockPrisma.employeeOrgUnitLink.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employeeId: 'emp-1',
            consumeCapacity: true,
            endDate: null,
          }),
        }),
      );
    });
  });

  describe('getOrgNodeMembers', () => {
    it('returns all active members of org node', async () => {
      const members = [
        makeLink({ id: 'link-1', relationshipType: 'PRIMARY_REPORTING' }),
        makeLink({ id: 'link-2', relationshipType: 'DELIVERY_ASSIGNMENT' }),
      ];
      mockPrisma.employeeOrgUnitLink.findMany.mockResolvedValue(members);

      const result = await getOrgNodeMembers('node-1');
      expect(result).toHaveLength(2);
    });

    it('filters by relationship type', async () => {
      mockPrisma.employeeOrgUnitLink.findMany.mockResolvedValue([
        makeLink({ relationshipType: 'DELIVERY_ASSIGNMENT' }),
      ]);

      const result = await getOrgNodeMembers('node-1', 'DELIVERY_ASSIGNMENT');

      expect(mockPrisma.employeeOrgUnitLink.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            orgNodeId: 'node-1',
            relationshipType: 'DELIVERY_ASSIGNMENT',
            endDate: null,
          }),
        }),
      );
    });
  });

  describe('getEmployeesInSubtreeByLink', () => {
    it('returns unique employee IDs across subtree', async () => {
      const node = makeOrgNode({ id: 'root', path: '/root/' });
      mockPrisma.orgNode.findUnique.mockResolvedValue(node);
      mockPrisma.orgNode.findMany.mockResolvedValue([
        { id: 'root' },
        { id: 'child-1' },
        { id: 'child-2' },
      ]);
      mockPrisma.employeeOrgUnitLink.findMany.mockResolvedValue([
        { employeeId: 'emp-1' },
        { employeeId: 'emp-2' },
        { employeeId: 'emp-1' }, // duplicate
      ]);

      const result = await getEmployeesInSubtreeByLink('root');

      expect(result).toHaveLength(2);
      expect(result).toContain('emp-1');
      expect(result).toContain('emp-2');
    });

    it('throws NotFoundError for non-existent node', async () => {
      mockPrisma.orgNode.findUnique.mockResolvedValue(null);

      await expect(getEmployeesInSubtreeByLink('node-999')).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  // ==========================================================================
  // listLinks
  // ==========================================================================

  describe('listLinks', () => {
    it('returns paginated results with filters', async () => {
      const links = [makeLink()];
      mockPrisma.employeeOrgUnitLink.findMany.mockResolvedValue(links);
      mockPrisma.employeeOrgUnitLink.count.mockResolvedValue(1);

      const result = await listLinks({
        employeeId: 'emp-1',
        activeOnly: true,
        page: 1,
        limit: 50,
      });

      expect(result.data).toHaveLength(1);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 50,
        total: 1,
        totalPages: 1,
      });
    });

    it('applies consumeCapacityOnly filter', async () => {
      mockPrisma.employeeOrgUnitLink.findMany.mockResolvedValue([]);
      mockPrisma.employeeOrgUnitLink.count.mockResolvedValue(0);

      await listLinks({
        consumeCapacityOnly: true,
        page: 1,
        limit: 50,
      });

      expect(mockPrisma.employeeOrgUnitLink.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ consumeCapacity: true }),
        }),
      );
    });
  });

  // ==========================================================================
  // migrateFromMemberships
  // ==========================================================================

  describe('migrateFromMemberships', () => {
    it('returns dry-run preview without creating links', async () => {
      mockPrisma.orgMembership.findMany.mockResolvedValue([
        {
          employeeId: 'emp-1',
          orgNodeId: 'node-1',
          effectiveStart: new Date(),
          employee: { id: 'emp-1', name: 'Alice' },
          orgNode: { id: 'node-1', name: 'Engineering', code: 'ENG' },
        },
        {
          employeeId: 'emp-2',
          orgNodeId: 'node-2',
          effectiveStart: new Date(),
          employee: { id: 'emp-2', name: 'Bob' },
          orgNode: { id: 'node-2', name: 'Product', code: 'PROD' },
        },
      ]);
      mockPrisma.employeeOrgUnitLink.findMany.mockResolvedValue([]); // no existing links

      const result = await migrateFromMemberships(true);

      expect(result.dryRun).toBe(true);
      expect(result.toCreate).toBe(2);
      expect(result.preview).toHaveLength(2);
      expect(mockPrisma.employeeOrgUnitLink.create).not.toHaveBeenCalled();
    });

    it('creates links when dryRun=false', async () => {
      mockPrisma.orgMembership.findMany.mockResolvedValue([
        {
          employeeId: 'emp-1',
          orgNodeId: 'node-1',
          effectiveStart: new Date('2024-01-01'),
          employee: { id: 'emp-1', name: 'Alice' },
          orgNode: { id: 'node-1', name: 'Engineering', code: 'ENG' },
        },
      ]);
      mockPrisma.employeeOrgUnitLink.findMany.mockResolvedValue([]); // no existing links
      mockPrisma.employeeOrgUnitLink.create.mockResolvedValue(makeLink());

      const result = await migrateFromMemberships(false);

      expect(result.dryRun).toBe(false);
      expect(result.created).toBe(1);
      expect(mockPrisma.employeeOrgUnitLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            employeeId: 'emp-1',
            orgNodeId: 'node-1',
            relationshipType: 'PRIMARY_REPORTING',
            consumeCapacity: false,
          }),
        }),
      );
    });

    it('skips employees who already have PRIMARY_REPORTING links', async () => {
      mockPrisma.orgMembership.findMany.mockResolvedValue([
        {
          employeeId: 'emp-1',
          orgNodeId: 'node-1',
          effectiveStart: new Date(),
          employee: { id: 'emp-1', name: 'Alice' },
          orgNode: { id: 'node-1', name: 'Engineering', code: 'ENG' },
        },
      ]);
      mockPrisma.employeeOrgUnitLink.findMany.mockResolvedValue([
        { employeeId: 'emp-1' }, // already has link
      ]);

      const result = await migrateFromMemberships(true);

      expect(result.toCreate).toBe(0);
      expect(result.alreadyHaveLink).toBe(1);
    });
  });

  // ==========================================================================
  // getLinkHistory
  // ==========================================================================

  describe('getLinkHistory', () => {
    it('returns all links (active and ended) for employee', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(makeEmployee());
      mockPrisma.employeeOrgUnitLink.findMany.mockResolvedValue([
        makeLink({ id: 'link-1', endDate: null }),
        makeLink({ id: 'link-2', endDate: new Date() }),
      ]);

      const result = await getLinkHistory('emp-1');
      expect(result).toHaveLength(2);
    });

    it('throws NotFoundError for non-existent employee', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      await expect(getLinkHistory('emp-999')).rejects.toThrow(NotFoundError);
    });
  });

  // ==========================================================================
  // Capacity consumption rules
  // ==========================================================================

  describe('capacity consumption rules', () => {
    it('PRIMARY_REPORTING never consumes capacity', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(makeEmployee());
      mockPrisma.orgNode.findUnique.mockResolvedValue(makeOrgNode());
      mockPrisma.employeeOrgUnitLink.findFirst.mockResolvedValue(null);
      mockPrisma.employeeOrgUnitLink.create.mockResolvedValue(makeLink());

      await createLink({
        employeeId: 'emp-1',
        orgNodeId: 'node-1',
        relationshipType: 'PRIMARY_REPORTING',
        consumeCapacity: true, // should be overridden
      });

      expect(mockPrisma.employeeOrgUnitLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ consumeCapacity: false }),
        }),
      );
    });

    it('CAPABILITY_POOL never consumes capacity', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(makeEmployee());
      mockPrisma.orgNode.findUnique.mockResolvedValue(makeOrgNode());
      mockPrisma.employeeOrgUnitLink.create.mockResolvedValue(
        makeLink({ relationshipType: 'CAPABILITY_POOL', consumeCapacity: false }),
      );

      await createLink({
        employeeId: 'emp-1',
        orgNodeId: 'node-1',
        relationshipType: 'CAPABILITY_POOL',
        consumeCapacity: true, // should be overridden
      });

      expect(mockPrisma.employeeOrgUnitLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ consumeCapacity: false }),
        }),
      );
    });

    it('TEMPORARY_ROTATION consumes capacity by default', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(makeEmployee());
      mockPrisma.orgNode.findUnique.mockResolvedValue(makeOrgNode());
      mockPrisma.employeeOrgUnitLink.findMany.mockResolvedValue([]); // no existing links
      mockPrisma.employeeOrgUnitLink.create.mockResolvedValue(
        makeLink({
          relationshipType: 'TEMPORARY_ROTATION',
          consumeCapacity: true,
          allocationPct: 100,
        }),
      );

      await createLink({
        employeeId: 'emp-1',
        orgNodeId: 'node-1',
        relationshipType: 'TEMPORARY_ROTATION',
        allocationPct: 100,
      });

      expect(mockPrisma.employeeOrgUnitLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ consumeCapacity: true }),
        }),
      );
    });

    it('TEMPORARY_ROTATION can opt-out of capacity consumption', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(makeEmployee());
      mockPrisma.orgNode.findUnique.mockResolvedValue(makeOrgNode());
      mockPrisma.employeeOrgUnitLink.create.mockResolvedValue(
        makeLink({
          relationshipType: 'TEMPORARY_ROTATION',
          consumeCapacity: false,
        }),
      );

      await createLink({
        employeeId: 'emp-1',
        orgNodeId: 'node-1',
        relationshipType: 'TEMPORARY_ROTATION',
        consumeCapacity: false,
      });

      expect(mockPrisma.employeeOrgUnitLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ consumeCapacity: false }),
        }),
      );
    });
  });
});
