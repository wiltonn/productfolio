import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ScenariosService } from '../services/scenarios.service.js';
import { AllocationService } from '../services/allocation.service.js';
import { NotFoundError, ValidationError, WorkflowError } from '../lib/errors.js';
import type { CreateScenario, UpdateScenario, CreateAllocation, UpdateAllocation } from '../schemas/scenarios.schema.js';

// Mock Prisma Client
vi.mock('../lib/prisma.js', () => {
  const mockPrisma = {
    scenario: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    allocation: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    employee: {
      findUnique: vi.fn(),
    },
    initiative: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    allocationPeriod: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    period: {
      findMany: vi.fn(),
    },
  };

  return {
    prisma: mockPrisma,
  };
});

import { prisma } from '../lib/prisma.js';

const mockPrisma = prisma as any;

describe('ScenariosService', () => {
  let scenariosService: ScenariosService;

  beforeEach(() => {
    scenariosService = new ScenariosService();
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should list scenarios with pagination', async () => {
      const mockScenarios = [
        {
          id: '00000000-0000-0000-0000-000000000001',
          name: 'Scenario 1',
          periodIds: [],
          assumptions: null,
          priorityRankings: null,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { allocations: 2 },
        },
        {
          id: '00000000-0000-0000-0000-000000000002',
          name: 'Scenario 2',
          periodIds: [],
          assumptions: null,
          priorityRankings: null,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { allocations: 1 },
        },
      ];

      mockPrisma.scenario.findMany.mockResolvedValue(mockScenarios);
      mockPrisma.scenario.count.mockResolvedValue(2);

      const result = await scenariosService.list({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(2);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.totalPages).toBe(1);
    });

    it('should apply pagination correctly', async () => {
      mockPrisma.scenario.findMany.mockResolvedValue([]);
      mockPrisma.scenario.count.mockResolvedValue(100);

      await scenariosService.list({ page: 2, limit: 25 });

      expect(mockPrisma.scenario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 25,
          take: 25,
        })
      );
    });
  });

  describe('getById', () => {
    it('should get a scenario by id', async () => {
      const scenarioId = '00000000-0000-0000-0000-000000000001';
      const mockScenario = {
        id: scenarioId,
        name: 'Test Scenario',
        periodIds: [],
        assumptions: null,
        priorityRankings: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { allocations: 3 },
      };

      mockPrisma.scenario.findUnique.mockResolvedValue(mockScenario);

      const result = await scenariosService.getById(scenarioId);

      expect(result.id).toBe(scenarioId);
      expect(result.allocationsCount).toBe(3);
    });

    it('should throw NotFoundError when scenario does not exist', async () => {
      mockPrisma.scenario.findUnique.mockResolvedValue(null);

      await expect(scenariosService.getById('non-existent-id')).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('create', () => {
    it('should create a new scenario', async () => {
      const scenarioId = '00000000-0000-0000-0000-000000000001';
      const createData: CreateScenario = {
        name: 'New Scenario',
        periodIds: [],
        assumptions: { budget: 100000 },
        priorityRankings: [
          {
            initiativeId: '00000000-0000-0000-0000-000000000010',
            rank: 1,
          },
        ],
      };

      const mockScenario = {
        id: scenarioId,
        ...createData,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { allocations: 0 },
      };

      mockPrisma.scenario.create.mockResolvedValue(mockScenario);

      const result = await scenariosService.create(createData);

      expect(result.id).toBe(scenarioId);
      expect(result.name).toBe(createData.name);
      expect(result.assumptions).toEqual(createData.assumptions);
    });

    it('should create scenario with minimal data', async () => {
      const createData: CreateScenario = {
        name: 'Simple Scenario',
        periodIds: [],
      };

      const mockScenario = {
        id: '00000000-0000-0000-0000-000000000001',
        ...createData,
        assumptions: null,
        priorityRankings: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { allocations: 0 },
      };

      mockPrisma.scenario.create.mockResolvedValue(mockScenario);

      const result = await scenariosService.create(createData);

      expect(result.name).toBe('Simple Scenario');
      expect(result.assumptions).toBeNull();
      expect(result.priorityRankings).toBeNull();
    });
  });

  describe('update', () => {
    it('should update a scenario', async () => {
      const scenarioId = '00000000-0000-0000-0000-000000000001';
      const updateData: UpdateScenario = {
        name: 'Updated Scenario',
      };

      const mockScenario = {
        id: scenarioId,
        name: 'Updated Scenario',
        periodIds: [],
        assumptions: null,
        priorityRankings: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { allocations: 0 },
      };

      mockPrisma.scenario.findUnique.mockResolvedValue(mockScenario);
      mockPrisma.scenario.update.mockResolvedValue(mockScenario);

      const result = await scenariosService.update(scenarioId, updateData);

      expect(result.name).toBe('Updated Scenario');
    });

    it('should throw NotFoundError when scenario does not exist', async () => {
      mockPrisma.scenario.findUnique.mockResolvedValue(null);

      await expect(
        scenariosService.update('non-existent-id', { name: 'Updated' })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('delete', () => {
    it('should delete a scenario', async () => {
      const scenarioId = '00000000-0000-0000-0000-000000000001';
      const mockScenario = {
        id: scenarioId,
        name: 'Test Scenario',
        periodIds: [],
        assumptions: null,
        priorityRankings: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { allocations: 0 },
      };

      mockPrisma.scenario.findUnique.mockResolvedValue(mockScenario);
      mockPrisma.scenario.delete.mockResolvedValue(mockScenario);

      await scenariosService.delete(scenarioId);

      expect(mockPrisma.scenario.delete).toHaveBeenCalledWith({
        where: { id: scenarioId },
      });
    });

    it('should throw NotFoundError when scenario does not exist', async () => {
      mockPrisma.scenario.findUnique.mockResolvedValue(null);

      await expect(scenariosService.delete('non-existent-id')).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('updatePriorities', () => {
    it('should update scenario priorities', async () => {
      const scenarioId = '00000000-0000-0000-0000-000000000001';
      const priorities = [
        { initiativeId: '00000000-0000-0000-0000-000000000010', rank: 1 },
        { initiativeId: '00000000-0000-0000-0000-000000000011', rank: 2 },
      ];

      const mockScenario = {
        id: scenarioId,
        name: 'Test Scenario',
        periodIds: [],
        assumptions: null,
        priorityRankings: priorities,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { allocations: 0 },
      };

      mockPrisma.scenario.findUnique.mockResolvedValue(mockScenario);
      mockPrisma.scenario.update.mockResolvedValue(mockScenario);

      const result = await scenariosService.updatePriorities(scenarioId, {
        priorities,
      });

      expect(result.priorityRankings).toEqual(priorities);
    });
  });
});

describe('AllocationService', () => {
  let allocationService: AllocationService;

  beforeEach(() => {
    allocationService = new AllocationService();
    vi.clearAllMocks();
  });

  describe('listByScenario', () => {
    it('should list allocations for a scenario', async () => {
      const scenarioId = '00000000-0000-0000-0000-000000000001';
      const mockScenario = {
        id: scenarioId,
        name: 'Test Scenario',
        periodIds: [],
        assumptions: null,
        priorityRankings: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockAllocations = [
        {
          id: '00000000-0000-0000-0000-000000000001',
          scenarioId,
          employeeId: '00000000-0000-0000-0000-000000000020',
          initiativeId: '00000000-0000-0000-0000-000000000010',
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-03-31'),
          percentage: 100,
          createdAt: new Date(),
          updatedAt: new Date(),
          employee: { id: '00000000-0000-0000-0000-000000000020', name: 'John Doe' },
          initiative: { id: '00000000-0000-0000-0000-000000000010', title: 'Initiative A' },
        },
      ];

      mockPrisma.scenario.findUnique.mockResolvedValue(mockScenario);
      mockPrisma.allocation.findMany.mockResolvedValue(mockAllocations);

      const result = await allocationService.listByScenario(scenarioId);

      expect(result).toHaveLength(1);
      expect(result[0].employeeName).toBe('John Doe');
      expect(result[0].initiativeTitle).toBe('Initiative A');
    });

    it('should throw NotFoundError when scenario does not exist', async () => {
      mockPrisma.scenario.findUnique.mockResolvedValue(null);

      await expect(
        allocationService.listByScenario('non-existent-id')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('create', () => {
    it('should create an allocation', async () => {
      const scenarioId = '00000000-0000-0000-0000-000000000001';
      const allocationId = '00000000-0000-0000-0000-000000000002';
      const employeeId = '00000000-0000-0000-0000-000000000020';
      const initiativeId = '00000000-0000-0000-0000-000000000010';

      const createData: CreateAllocation = {
        employeeId,
        initiativeId,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-03-31'),
        percentage: 100,
      };

      const mockScenario = {
        id: scenarioId,
        name: 'Test Scenario',
        periodIds: [],
        assumptions: null,
        priorityRankings: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockEmployee = {
        id: employeeId,
        name: 'John Doe',
        role: 'Developer',
        managerId: null,
        employmentType: 'FULL_TIME',
        hoursPerWeek: 40,
        activeStart: new Date(),
        activeEnd: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockInitiative = {
        id: initiativeId,
        title: 'Initiative A',
        description: null,
        businessOwnerId: '00000000-0000-0000-0000-000000000100',
        productOwnerId: '00000000-0000-0000-0000-000000000101',
        status: 'DRAFT',
        targetPeriodId: null,
        customFields: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockAllocation = {
        id: allocationId,
        ...createData,
        createdAt: new Date(),
        updatedAt: new Date(),
        employee: { id: employeeId, name: 'John Doe' },
        initiative: { id: initiativeId, title: 'Initiative A' },
      };

      mockPrisma.scenario.findUnique.mockResolvedValue(mockScenario);
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee);
      mockPrisma.initiative.findUnique.mockResolvedValue(mockInitiative);
      mockPrisma.allocation.create.mockResolvedValue(mockAllocation);

      const result = await allocationService.create(scenarioId, createData);

      expect(result.id).toBe(allocationId);
      expect(result.employeeName).toBe('John Doe');
      expect(result.percentage).toBe(100);
    });

    it('should create allocation without initiative', async () => {
      const scenarioId = '00000000-0000-0000-0000-000000000001';
      const employeeId = '00000000-0000-0000-0000-000000000020';

      const createData: CreateAllocation = {
        employeeId,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-03-31'),
      };

      const mockScenario = {
        id: scenarioId,
        name: 'Test Scenario',
        periodIds: [],
        assumptions: null,
        priorityRankings: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockEmployee = {
        id: employeeId,
        name: 'John Doe',
        role: 'Developer',
        managerId: null,
        employmentType: 'FULL_TIME',
        hoursPerWeek: 40,
        activeStart: new Date(),
        activeEnd: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockAllocation = {
        id: '00000000-0000-0000-0000-000000000002',
        scenarioId,
        ...createData,
        initiativeId: null,
        percentage: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
        employee: { id: employeeId, name: 'John Doe' },
        initiative: null,
      };

      mockPrisma.scenario.findUnique.mockResolvedValue(mockScenario);
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee);
      mockPrisma.allocation.create.mockResolvedValue(mockAllocation);

      const result = await allocationService.create(scenarioId, createData);

      expect(result.initiativeId).toBeNull();
      expect(result.initiativeTitle).toBeNull();
    });

    it('should throw NotFoundError when scenario does not exist', async () => {
      mockPrisma.scenario.findUnique.mockResolvedValue(null);

      await expect(
        allocationService.create('non-existent-id', {
          employeeId: '00000000-0000-0000-0000-000000000020',
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-03-31'),
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when employee does not exist', async () => {
      const mockScenario = {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Test Scenario',
        periodIds: [],
        assumptions: null,
        priorityRankings: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.scenario.findUnique.mockResolvedValue(mockScenario);
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        allocationService.create('00000000-0000-0000-0000-000000000001', {
          employeeId: 'non-existent-id',
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-03-31'),
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when initiative does not exist', async () => {
      const mockScenario = {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Test Scenario',
        periodIds: [],
        assumptions: null,
        priorityRankings: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockEmployee = {
        id: '00000000-0000-0000-0000-000000000020',
        name: 'John Doe',
        role: 'Developer',
        managerId: null,
        employmentType: 'FULL_TIME',
        hoursPerWeek: 40,
        activeStart: new Date(),
        activeEnd: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.scenario.findUnique.mockResolvedValue(mockScenario);
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee);
      mockPrisma.initiative.findUnique.mockResolvedValue(null);

      await expect(
        allocationService.create('00000000-0000-0000-0000-000000000001', {
          employeeId: '00000000-0000-0000-0000-000000000020',
          initiativeId: 'non-existent-id',
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-03-31'),
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('update', () => {
    it('should update an allocation', async () => {
      const allocationId = '00000000-0000-0000-0000-000000000001';
      const updateData: UpdateAllocation = {
        percentage: 50,
      };

      const mockAllocation = {
        id: allocationId,
        scenarioId: '00000000-0000-0000-0000-000000000001',
        employeeId: '00000000-0000-0000-0000-000000000020',
        initiativeId: '00000000-0000-0000-0000-000000000010',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-03-31'),
        percentage: 50,
        createdAt: new Date(),
        updatedAt: new Date(),
        employee: { id: '00000000-0000-0000-0000-000000000020', name: 'John Doe' },
        initiative: { id: '00000000-0000-0000-0000-000000000010', title: 'Initiative A' },
      };

      mockPrisma.allocation.findUnique.mockResolvedValue({
        ...mockAllocation,
        employee: undefined,
        initiative: undefined,
      });
      mockPrisma.allocation.update.mockResolvedValue(mockAllocation);

      const result = await allocationService.update(allocationId, updateData);

      expect(result.percentage).toBe(50);
    });

    it('should throw NotFoundError when allocation does not exist', async () => {
      mockPrisma.allocation.findUnique.mockResolvedValue(null);

      await expect(
        allocationService.update('non-existent-id', { percentage: 50 })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('delete', () => {
    it('should delete an allocation', async () => {
      const allocationId = '00000000-0000-0000-0000-000000000001';
      const mockAllocation = {
        id: allocationId,
        scenarioId: '00000000-0000-0000-0000-000000000001',
        employeeId: '00000000-0000-0000-0000-000000000020',
        initiativeId: '00000000-0000-0000-0000-000000000010',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-03-31'),
        percentage: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.allocation.findUnique.mockResolvedValue(mockAllocation);
      mockPrisma.allocation.delete.mockResolvedValue(mockAllocation);

      await allocationService.delete(allocationId);

      expect(mockPrisma.allocation.delete).toHaveBeenCalledWith({
        where: { id: allocationId },
      });
    });

    it('should throw NotFoundError when allocation does not exist', async () => {
      mockPrisma.allocation.findUnique.mockResolvedValue(null);

      await expect(allocationService.delete('non-existent-id')).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('calculateCapacityDemand', () => {
    it('should calculate capacity and demand for a scenario', async () => {
      const scenarioId = '00000000-0000-0000-0000-000000000001';

      const mockScenario = {
        id: scenarioId,
        name: 'Test Scenario',
        periodIds: [],
        assumptions: null,
        priorityRankings: [
          { initiativeId: '00000000-0000-0000-0000-000000000010', rank: 1 },
        ],
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        allocations: [
          {
            id: '00000000-0000-0000-0000-000000000001',
            scenarioId,
            employeeId: '00000000-0000-0000-0000-000000000020',
            initiativeId: null,
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-06-30'),
            percentage: 100,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };

      const mockInitiatives = [
        {
          id: '00000000-0000-0000-0000-000000000010',
          title: 'Initiative A',
          description: null,
          businessOwnerId: '00000000-0000-0000-0000-000000000100',
          productOwnerId: '00000000-0000-0000-0000-000000000101',
          status: 'DRAFT',
          targetPeriodId: null,
          customFields: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          scopeItems: [
            {
              id: '00000000-0000-0000-0000-000000000030',
              initiativeId: '00000000-0000-0000-0000-000000000010',
              name: 'Scope Item 1',
              description: null,
              skillDemand: { frontend: 100, backend: 150 },
              estimateP50: 250,
              estimateP90: 350,
              periodDistributions: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        },
      ];

      const mockAllocations = [
        {
          id: '00000000-0000-0000-0000-000000000001',
          scenarioId,
          employeeId: '00000000-0000-0000-0000-000000000020',
          initiativeId: null,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-06-30'),
          percentage: 100,
          createdAt: new Date(),
          updatedAt: new Date(),
          employee: {
            id: '00000000-0000-0000-0000-000000000020',
            name: 'John Doe',
            role: 'Developer',
            managerId: null,
            employmentType: 'FULL_TIME',
            hoursPerWeek: 40,
            activeStart: new Date(),
            activeEnd: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            skills: [
              {
                id: '00000000-0000-0000-0000-000000000040',
                name: 'frontend',
                employeeId: '00000000-0000-0000-0000-000000000020',
                proficiency: 5,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              {
                id: '00000000-0000-0000-0000-000000000041',
                name: 'backend',
                employeeId: '00000000-0000-0000-0000-000000000020',
                proficiency: 4,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
          },
        },
      ];

      mockPrisma.scenario.findUnique.mockResolvedValue(mockScenario);
      mockPrisma.initiative.findMany.mockResolvedValue(mockInitiatives);
      mockPrisma.allocation.findMany.mockResolvedValue(mockAllocations);

      const result = await allocationService.calculateCapacityDemand(scenarioId);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      // Check structure of results
      for (const item of result) {
        expect(item).toHaveProperty('quarter');
        expect(item).toHaveProperty('skill');
        expect(item).toHaveProperty('demand');
        expect(item).toHaveProperty('capacity');
        expect(item).toHaveProperty('gap');
      }
    });

    it('should throw NotFoundError when scenario does not exist', async () => {
      mockPrisma.scenario.findUnique.mockResolvedValue(null);

      await expect(
        allocationService.calculateCapacityDemand('non-existent-id')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('compareScenarios', () => {
    it('should compare multiple scenarios', async () => {
      const scenarioIds = [
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002',
      ];

      const mockScenarios = [
        {
          id: scenarioIds[0],
          name: 'Scenario 1',
          periodIds: [],
          assumptions: null,
          priorityRankings: [
            { initiativeId: '00000000-0000-0000-0000-000000000010', rank: 1 },
          ],
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          allocations: [
            {
              id: '00000000-0000-0000-0000-000000000001',
              scenarioId: scenarioIds[0],
              employeeId: '00000000-0000-0000-0000-000000000020',
              initiativeId: null,
              startDate: new Date('2024-01-01'),
              endDate: new Date('2024-12-31'),
              percentage: 100,
              createdAt: new Date(),
              updatedAt: new Date(),
              employee: {
                id: '00000000-0000-0000-0000-000000000020',
                name: 'John Doe',
                role: 'Developer',
                managerId: null,
                employmentType: 'FULL_TIME',
                hoursPerWeek: 40,
                activeStart: new Date(),
                activeEnd: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                skills: [
                  {
                    id: '00000000-0000-0000-0000-000000000040',
                    name: 'frontend',
                    employeeId: '00000000-0000-0000-0000-000000000020',
                    proficiency: 5,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                ],
              },
            },
          ],
        },
        {
          id: scenarioIds[1],
          name: 'Scenario 2',
          periodIds: [],
          assumptions: null,
          priorityRankings: [
            { initiativeId: '00000000-0000-0000-0000-000000000011', rank: 1 },
          ],
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          allocations: [],
        },
      ];

      mockPrisma.scenario.findMany.mockResolvedValue(mockScenarios);
      mockPrisma.initiative.findMany
        .mockResolvedValueOnce([
          {
            id: '00000000-0000-0000-0000-000000000010',
            title: 'Initiative A',
            description: null,
            businessOwnerId: '00000000-0000-0000-0000-000000000100',
            productOwnerId: '00000000-0000-0000-0000-000000000101',
            status: 'DRAFT',
            targetPeriodId: null,
            customFields: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            scopeItems: [
              {
                id: '00000000-0000-0000-0000-000000000030',
                initiativeId: '00000000-0000-0000-0000-000000000010',
                name: 'Scope Item 1',
                description: null,
                skillDemand: { frontend: 100 },
                estimateP50: 100,
                estimateP90: 150,
                periodDistributions: [],
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
          },
        ])
        .mockResolvedValueOnce([
          {
            id: '00000000-0000-0000-0000-000000000011',
            title: 'Initiative B',
            description: null,
            businessOwnerId: '00000000-0000-0000-0000-000000000100',
            productOwnerId: '00000000-0000-0000-0000-000000000101',
            status: 'DRAFT',
            targetPeriodId: null,
            customFields: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            scopeItems: [],
          },
        ]);

      const result = await allocationService.compareScenarios(scenarioIds);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('scenarioId');
      expect(result[0]).toHaveProperty('scenarioName');
      expect(result[0]).toHaveProperty('totalAllocatedHours');
      expect(result[0]).toHaveProperty('capacityGapsBySkill');
      expect(result[0]).toHaveProperty('priorities');
    });

    it('should throw ValidationError when scenarios do not exist', async () => {
      const scenarioIds = [
        '00000000-0000-0000-0000-000000000001',
        'non-existent-id',
      ];

      mockPrisma.scenario.findMany.mockResolvedValue([
        {
          id: scenarioIds[0],
          name: 'Scenario 1',
          periodIds: [],
          assumptions: null,
          priorityRankings: null,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          allocations: [],
        },
      ]);

      await expect(
        allocationService.compareScenarios(scenarioIds)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('allocation locking', () => {
    it('should reject create when initiative is APPROVED', async () => {
      const scenarioId = '00000000-0000-0000-0000-000000000001';
      const employeeId = '00000000-0000-0000-0000-000000000020';
      const initiativeId = '00000000-0000-0000-0000-000000000010';

      mockPrisma.scenario.findUnique.mockResolvedValue({
        id: scenarioId,
        name: 'Test Scenario',
      });
      mockPrisma.employee.findUnique.mockResolvedValue({
        id: employeeId,
        name: 'John Doe',
        hoursPerWeek: 40,
      });
      mockPrisma.initiative.findUnique.mockResolvedValue({
        id: initiativeId,
        title: 'Locked Initiative',
        status: 'APPROVED',
      });

      await expect(
        allocationService.create(scenarioId, {
          employeeId,
          initiativeId,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-03-31'),
          percentage: 100,
        })
      ).rejects.toThrow(WorkflowError);
    });

    it('should reject update when initiative is IN_PROGRESS', async () => {
      const allocationId = '00000000-0000-0000-0000-000000000001';
      const initiativeId = '00000000-0000-0000-0000-000000000010';

      mockPrisma.allocation.findUnique.mockResolvedValue({
        id: allocationId,
        scenarioId: '00000000-0000-0000-0000-000000000001',
        employeeId: '00000000-0000-0000-0000-000000000020',
        initiativeId,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-03-31'),
        percentage: 100,
      });
      mockPrisma.initiative.findUnique.mockResolvedValue({
        id: initiativeId,
        title: 'In Progress Initiative',
        status: 'IN_PROGRESS',
      });

      await expect(
        allocationService.update(allocationId, { percentage: 50 })
      ).rejects.toThrow(WorkflowError);
    });

    it('should reject delete when initiative is COMPLETED', async () => {
      const allocationId = '00000000-0000-0000-0000-000000000001';
      const initiativeId = '00000000-0000-0000-0000-000000000010';

      mockPrisma.allocation.findUnique.mockResolvedValue({
        id: allocationId,
        scenarioId: '00000000-0000-0000-0000-000000000001',
        initiativeId,
      });
      mockPrisma.initiative.findUnique.mockResolvedValue({
        id: initiativeId,
        title: 'Completed Initiative',
        status: 'COMPLETED',
      });

      await expect(
        allocationService.delete(allocationId)
      ).rejects.toThrow(WorkflowError);
    });

    it('should allow create when initiative is DRAFT', async () => {
      const scenarioId = '00000000-0000-0000-0000-000000000001';
      const employeeId = '00000000-0000-0000-0000-000000000020';
      const initiativeId = '00000000-0000-0000-0000-000000000010';
      const allocationId = '00000000-0000-0000-0000-000000000002';

      mockPrisma.scenario.findUnique.mockResolvedValue({
        id: scenarioId,
        name: 'Test Scenario',
      });
      mockPrisma.employee.findUnique.mockResolvedValue({
        id: employeeId,
        name: 'John Doe',
        hoursPerWeek: 40,
      });
      // findUnique is called twice: once for existence check, once for lock check
      mockPrisma.initiative.findUnique
        .mockResolvedValueOnce({
          id: initiativeId,
          title: 'Draft Initiative',
          status: 'DRAFT',
        })
        .mockResolvedValueOnce({
          id: initiativeId,
          title: 'Draft Initiative',
          status: 'DRAFT',
        });

      mockPrisma.allocation.create.mockResolvedValue({
        id: allocationId,
        scenarioId,
        employeeId,
        initiativeId,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-03-31'),
        percentage: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
        employee: { id: employeeId, name: 'John Doe' },
        initiative: { id: initiativeId, title: 'Draft Initiative', status: 'DRAFT' },
      });

      // Mock period and allocationPeriod for computeAllocationPeriods
      mockPrisma.allocationPeriod.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.period.findMany.mockResolvedValue([]);

      const result = await allocationService.create(scenarioId, {
        employeeId,
        initiativeId,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-03-31'),
        percentage: 100,
      });

      expect(result.id).toBe(allocationId);
      expect(result.initiativeStatus).toBe('DRAFT');
    });

    it('should allow create with null initiativeId (never locked)', async () => {
      const scenarioId = '00000000-0000-0000-0000-000000000001';
      const employeeId = '00000000-0000-0000-0000-000000000020';
      const allocationId = '00000000-0000-0000-0000-000000000002';

      mockPrisma.scenario.findUnique.mockResolvedValue({
        id: scenarioId,
        name: 'Test Scenario',
      });
      mockPrisma.employee.findUnique.mockResolvedValue({
        id: employeeId,
        name: 'John Doe',
        hoursPerWeek: 40,
      });

      mockPrisma.allocation.create.mockResolvedValue({
        id: allocationId,
        scenarioId,
        employeeId,
        initiativeId: null,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-03-31'),
        percentage: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
        employee: { id: employeeId, name: 'John Doe' },
        initiative: null,
      });

      // Mock period and allocationPeriod for computeAllocationPeriods
      mockPrisma.allocationPeriod.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.period.findMany.mockResolvedValue([]);

      const result = await allocationService.create(scenarioId, {
        employeeId,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-03-31'),
      });

      expect(result.initiativeId).toBeNull();
      expect(result.initiativeStatus).toBeNull();
    });
  });

  describe('listByInitiative', () => {
    it('should return filtered allocations for a specific initiative', async () => {
      const scenarioId = '00000000-0000-0000-0000-000000000001';
      const initiativeId = '00000000-0000-0000-0000-000000000010';

      mockPrisma.scenario.findUnique.mockResolvedValue({
        id: scenarioId,
        name: 'Test Scenario',
      });

      mockPrisma.allocation.findMany.mockResolvedValue([
        {
          id: '00000000-0000-0000-0000-000000000001',
          scenarioId,
          employeeId: '00000000-0000-0000-0000-000000000020',
          initiativeId,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-03-31'),
          percentage: 100,
          createdAt: new Date(),
          updatedAt: new Date(),
          employee: { id: '00000000-0000-0000-0000-000000000020', name: 'John Doe' },
          initiative: { id: initiativeId, title: 'Initiative A', status: 'DRAFT' },
        },
      ]);

      const result = await allocationService.listByInitiative(scenarioId, initiativeId);

      expect(result).toHaveLength(1);
      expect(result[0].initiativeId).toBe(initiativeId);
      expect(result[0].initiativeStatus).toBe('DRAFT');
      expect(mockPrisma.allocation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { scenarioId, initiativeId },
        })
      );
    });
  });

  describe('listByEmployee', () => {
    it('should return allocations across scenarios for an employee', async () => {
      const employeeId = '00000000-0000-0000-0000-000000000020';

      mockPrisma.employee.findUnique.mockResolvedValue({
        id: employeeId,
        name: 'John Doe',
      });

      mockPrisma.allocation.findMany.mockResolvedValue([
        {
          id: '00000000-0000-0000-0000-000000000001',
          scenarioId: '00000000-0000-0000-0000-000000000050',
          employeeId,
          initiativeId: '00000000-0000-0000-0000-000000000010',
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-03-31'),
          percentage: 50,
          createdAt: new Date(),
          updatedAt: new Date(),
          scenario: { id: '00000000-0000-0000-0000-000000000050', name: 'Scenario A' },
          initiative: { id: '00000000-0000-0000-0000-000000000010', title: 'Initiative X', status: 'IN_PROGRESS' },
        },
        {
          id: '00000000-0000-0000-0000-000000000002',
          scenarioId: '00000000-0000-0000-0000-000000000051',
          employeeId,
          initiativeId: '00000000-0000-0000-0000-000000000011',
          startDate: new Date('2024-04-01'),
          endDate: new Date('2024-06-30'),
          percentage: 100,
          createdAt: new Date(),
          updatedAt: new Date(),
          scenario: { id: '00000000-0000-0000-0000-000000000051', name: 'Scenario B' },
          initiative: { id: '00000000-0000-0000-0000-000000000011', title: 'Initiative Y', status: 'DRAFT' },
        },
      ]);

      const result = await allocationService.listByEmployee(employeeId);

      expect(result).toHaveLength(2);
      expect(result[0].scenarioName).toBe('Scenario A');
      expect(result[0].initiativeTitle).toBe('Initiative X');
      expect(result[0].initiativeStatus).toBe('IN_PROGRESS');
      expect(result[1].scenarioName).toBe('Scenario B');
    });
  });
});
