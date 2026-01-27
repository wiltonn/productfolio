import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, testUuid, mockData } from './setup.js';
import * as resourcesService from '../services/resources.service.js';
import * as capacityService from '../services/capacity.service.js';
import { resourcesRoutes } from '../routes/resources.js';
import { NotFoundError, ConflictError, ValidationError } from '../lib/errors.js';
import { CreateEmployeeSchema } from '../schemas/resources.schema.js';

// Mock prisma
vi.mock('../lib/prisma.js', () => {
  const mockPrisma = {
    employee: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    skill: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    capacityCalendar: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    allocation: {
      findMany: vi.fn(),
    },
  };

  return { prisma: mockPrisma };
});

import { prisma } from '../lib/prisma.js';

// ============================================================================
// Employee CRUD Tests
// ============================================================================

describe('Employee CRUD Operations', () => {
  const employeeId = testUuid('001');
  const managerId = testUuid('002');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listEmployees', () => {
    it('should list employees with default pagination', async () => {
      const mockEmployees = [
        mockData.employee({ id: employeeId, name: 'Alice' }),
        mockData.employee({ id: testUuid('003'), name: 'Bob' }),
      ];

      vi.mocked(prisma.employee.findMany).mockResolvedValueOnce(mockEmployees as any);
      vi.mocked(prisma.employee.count).mockResolvedValueOnce(2);

      const result = await resourcesService.listEmployees(
        { page: 1, limit: 20 },
        { page: 1, limit: 20 }
      );

      expect(result.employees).toHaveLength(2);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        pages: 1,
      });
    });

    it('should filter employees by role', async () => {
      const mockEmployees = [
        mockData.employee({ id: employeeId, role: 'Developer' }),
      ];

      vi.mocked(prisma.employee.findMany).mockResolvedValueOnce(mockEmployees as any);
      vi.mocked(prisma.employee.count).mockResolvedValueOnce(1);

      const result = await resourcesService.listEmployees(
        { role: 'Developer', page: 1, limit: 20 },
        { page: 1, limit: 20 }
      );

      expect(result.employees).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
    });

    it('should filter employees by employment type', async () => {
      const mockEmployees = [
        mockData.employee({ id: employeeId, employmentType: 'FULL_TIME' }),
      ];

      vi.mocked(prisma.employee.findMany).mockResolvedValueOnce(mockEmployees as any);
      vi.mocked(prisma.employee.count).mockResolvedValueOnce(1);

      const result = await resourcesService.listEmployees(
        { employmentType: 'FULL_TIME', page: 1, limit: 20 },
        { page: 1, limit: 20 }
      );

      expect(result.pagination.total).toBe(1);
    });

    it('should search by name', async () => {
      const mockEmployees = [
        mockData.employee({ id: employeeId, name: 'Alice Johnson' }),
      ];

      vi.mocked(prisma.employee.findMany).mockResolvedValueOnce(mockEmployees as any);
      vi.mocked(prisma.employee.count).mockResolvedValueOnce(1);

      const result = await resourcesService.listEmployees(
        { search: 'Alice', page: 1, limit: 20 },
        { page: 1, limit: 20 }
      );

      expect(result.employees).toHaveLength(1);
    });
  });

  describe('getEmployeeById', () => {
    it('should return employee by ID', async () => {
      const mockEmployee = mockData.employee({ id: employeeId });

      vi.mocked(prisma.employee.findUnique).mockResolvedValueOnce(
        mockEmployee as any
      );

      const employee = await resourcesService.getEmployeeById(employeeId);

      expect(employee.id).toBe(employeeId);
      expect(prisma.employee.findUnique).toHaveBeenCalledWith({
        where: { id: employeeId },
        include: expect.any(Object),
      });
    });

    it('should throw NotFoundError if employee does not exist', async () => {
      vi.mocked(prisma.employee.findUnique).mockResolvedValueOnce(null);

      await expect(
        resourcesService.getEmployeeById(employeeId)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('createEmployee', () => {
    it('should create an employee with required fields', async () => {
      const mockEmployee = mockData.employee({ id: employeeId });

      vi.mocked(prisma.employee.create).mockResolvedValueOnce(
        mockEmployee as any
      );

      const result = await resourcesService.createEmployee(
        CreateEmployeeSchema.parse({
          name: 'Alice',
          role: 'Developer',
        })
      );

      expect(result.id).toBe(employeeId);
      expect(prisma.employee.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Alice',
            role: 'Developer',
          }),
        })
      );
    });

    it('should create employee with manager', async () => {
      const mockManager = mockData.employee({ id: managerId });
      const mockEmployee = mockData.employee({
        id: employeeId,
        name: 'Bob',
      });

      vi.mocked(prisma.employee.findUnique).mockResolvedValueOnce(
        mockManager as any
      );
      vi.mocked(prisma.employee.create).mockResolvedValueOnce(
        mockEmployee as any
      );

      const result = await resourcesService.createEmployee(
        CreateEmployeeSchema.parse({
          name: 'Bob',
          role: 'Developer',
          managerId,
        })
      );

      expect(result.id).toBe(employeeId);
    });

    it('should throw NotFoundError if manager does not exist', async () => {
      vi.mocked(prisma.employee.findUnique).mockResolvedValueOnce(null);

      await expect(
        resourcesService.createEmployee(
          CreateEmployeeSchema.parse({
            name: 'Charlie',
            role: 'Developer',
            managerId,
          })
        )
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateEmployee', () => {
    it('should update employee fields', async () => {
      const mockEmployee = mockData.employee({ id: employeeId, name: 'Alice' });
      const updatedMock = {
        ...mockEmployee,
        name: 'Alice Updated',
      };

      vi.mocked(prisma.employee.findUnique).mockResolvedValueOnce(
        mockEmployee as any
      );
      vi.mocked(prisma.employee.update).mockResolvedValueOnce(
        updatedMock as any
      );

      const result = await resourcesService.updateEmployee(employeeId, {
        name: 'Alice Updated',
      });

      expect(result.name).toBe('Alice Updated');
    });

    it('should throw NotFoundError if employee does not exist', async () => {
      vi.mocked(prisma.employee.findUnique).mockResolvedValueOnce(null);

      await expect(
        resourcesService.updateEmployee(employeeId, { name: 'Updated' })
      ).rejects.toThrow(NotFoundError);
    });

    it('should prevent employee from being their own manager', async () => {
      const mockEmployee = mockData.employee({ id: employeeId });

      vi.mocked(prisma.employee.findUnique).mockResolvedValueOnce(
        mockEmployee as any
      );

      await expect(
        resourcesService.updateEmployee(employeeId, { managerId: employeeId })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('deleteEmployee', () => {
    it('should delete an employee', async () => {
      const mockEmployee = mockData.employee({ id: employeeId });

      vi.mocked(prisma.employee.findUnique).mockResolvedValueOnce(
        mockEmployee as any
      );
      vi.mocked(prisma.employee.delete).mockResolvedValueOnce(
        mockEmployee as any
      );

      const result = await resourcesService.deleteEmployee(employeeId);

      expect(result.id).toBe(employeeId);
    });

    it('should throw NotFoundError if employee does not exist', async () => {
      vi.mocked(prisma.employee.findUnique).mockResolvedValueOnce(null);

      await expect(
        resourcesService.deleteEmployee(employeeId)
      ).rejects.toThrow(NotFoundError);
    });
  });
});

// ============================================================================
// Skill Management Tests
// ============================================================================

describe('Skill Management', () => {
  const employeeId = testUuid('001');
  const skillId = testUuid('100');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getEmployeeSkills', () => {
    it('should get all skills for an employee', async () => {
      const mockEmployee = mockData.employee({ id: employeeId });
      const mockSkills = [
        { id: skillId, name: 'JavaScript', proficiency: 5, employeeId },
        { id: testUuid('101'), name: 'TypeScript', proficiency: 4, employeeId },
      ];

      vi.mocked(prisma.employee.findUnique).mockResolvedValueOnce(
        mockEmployee as any
      );
      vi.mocked(prisma.skill.findMany).mockResolvedValueOnce(mockSkills as any);

      const skills = await resourcesService.getEmployeeSkills(employeeId);

      expect(skills).toHaveLength(2);
      expect(skills[0].name).toBe('JavaScript');
    });

    it('should throw NotFoundError if employee does not exist', async () => {
      vi.mocked(prisma.employee.findUnique).mockResolvedValueOnce(null);

      await expect(
        resourcesService.getEmployeeSkills(employeeId)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('addSkill', () => {
    it('should add a new skill to an employee', async () => {
      const mockEmployee = mockData.employee({ id: employeeId });
      const mockSkill = {
        id: skillId,
        name: 'JavaScript',
        proficiency: 3,
        employeeId,
      };

      vi.mocked(prisma.employee.findUnique).mockResolvedValueOnce(
        mockEmployee as any
      );
      vi.mocked(prisma.skill.findUnique).mockResolvedValueOnce(null);
      vi.mocked(prisma.skill.create).mockResolvedValueOnce(mockSkill as any);

      const skill = await resourcesService.addSkill(employeeId, {
        name: 'JavaScript',
        proficiency: 3,
      });

      expect(skill.name).toBe('JavaScript');
      expect(skill.proficiency).toBe(3);
    });

    it('should throw ConflictError if skill already exists', async () => {
      const mockEmployee = mockData.employee({ id: employeeId });
      const existingSkill = {
        id: skillId,
        name: 'JavaScript',
        proficiency: 5,
        employeeId,
      };

      vi.mocked(prisma.employee.findUnique).mockResolvedValueOnce(
        mockEmployee as any
      );
      vi.mocked(prisma.skill.findUnique).mockResolvedValueOnce(
        existingSkill as any
      );

      await expect(
        resourcesService.addSkill(employeeId, {
          name: 'JavaScript',
          proficiency: 3,
        })
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('updateSkill', () => {
    it('should update skill proficiency', async () => {
      const mockEmployee = mockData.employee({ id: employeeId });
      const mockSkill = {
        id: skillId,
        name: 'JavaScript',
        proficiency: 5,
        employeeId,
      };

      vi.mocked(prisma.employee.findUnique).mockResolvedValueOnce(
        mockEmployee as any
      );
      vi.mocked(prisma.skill.findUnique).mockResolvedValueOnce(
        mockSkill as any
      );
      vi.mocked(prisma.skill.update).mockResolvedValueOnce(mockSkill as any);

      const updated = await resourcesService.updateSkill(employeeId, skillId, {
        proficiency: 5,
      });

      expect(updated.proficiency).toBe(5);
    });

    it('should throw NotFoundError if skill does not exist', async () => {
      const mockEmployee = mockData.employee({ id: employeeId });

      vi.mocked(prisma.employee.findUnique).mockResolvedValueOnce(
        mockEmployee as any
      );
      vi.mocked(prisma.skill.findUnique).mockResolvedValueOnce(null);

      await expect(
        resourcesService.updateSkill(employeeId, skillId, { proficiency: 5 })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('removeSkill', () => {
    it('should remove a skill', async () => {
      const mockEmployee = mockData.employee({ id: employeeId });
      const mockSkill = {
        id: skillId,
        name: 'JavaScript',
        proficiency: 5,
        employeeId,
      };

      vi.mocked(prisma.employee.findUnique).mockResolvedValueOnce(
        mockEmployee as any
      );
      vi.mocked(prisma.skill.findUnique).mockResolvedValueOnce(
        mockSkill as any
      );
      vi.mocked(prisma.skill.delete).mockResolvedValueOnce(mockSkill as any);

      const result = await resourcesService.removeSkill(employeeId, skillId);

      expect(result.id).toBe(skillId);
    });
  });
});

// ============================================================================
// Capacity Calendar Tests
// ============================================================================

describe('Capacity Calendar', () => {
  const employeeId = testUuid('001');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCapacityCalendar', () => {
    it('should get capacity calendar entries', async () => {
      const mockEmployee = mockData.employee({ id: employeeId });
      const mockCapacity = [
        {
          employeeId,
          period: new Date('2024-01-01'),
          hoursAvailable: 8,
        },
        {
          employeeId,
          period: new Date('2024-01-08'),
          hoursAvailable: 0,
        },
      ];

      vi.mocked(prisma.employee.findUnique).mockResolvedValueOnce(
        mockEmployee as any
      );
      vi.mocked(prisma.capacityCalendar.findMany).mockResolvedValueOnce(
        mockCapacity as any
      );

      const capacity = await capacityService.getCapacityCalendar(employeeId);

      expect(capacity).toHaveLength(2);
    });
  });

  describe('updateCapacity', () => {
    it('should upsert capacity entries', async () => {
      const mockEmployee = mockData.employee({ id: employeeId });
      const entries = [
        { period: new Date('2024-01-01'), hoursAvailable: 8 },
      ];

      vi.mocked(prisma.employee.findUnique).mockResolvedValueOnce(
        mockEmployee as any
      );
      vi.mocked(prisma.capacityCalendar.upsert).mockResolvedValueOnce({
        employeeId,
        period: new Date('2024-01-01'),
        hoursAvailable: 8,
      } as any);

      const updated = await capacityService.updateCapacity(employeeId, entries);

      expect(updated).toHaveLength(1);
      expect(prisma.capacityCalendar.upsert).toHaveBeenCalled();
    });

    it('should throw ValidationError if no entries provided', async () => {
      const mockEmployee = mockData.employee({ id: employeeId });

      vi.mocked(prisma.employee.findUnique).mockResolvedValueOnce(
        mockEmployee as any
      );

      await expect(
        capacityService.updateCapacity(employeeId, [])
      ).rejects.toThrow(ValidationError);
    });
  });
});

// ============================================================================
// Availability Calculation Tests
// ============================================================================

describe('Availability Calculation', () => {
  const employeeId = testUuid('001');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateAvailability', () => {
    it('should calculate availability with no allocations', async () => {
      const mockEmployee = mockData.employee({
        id: employeeId,
        hoursPerWeek: 40,
      });
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-14');

      vi.mocked(prisma.employee.findUnique).mockResolvedValueOnce(
        mockEmployee as any
      );
      vi.mocked(prisma.capacityCalendar.findMany).mockResolvedValueOnce([]);
      vi.mocked(prisma.allocation.findMany).mockResolvedValueOnce([]);

      const availability = await capacityService.calculateAvailability(
        employeeId,
        startDate,
        endDate
      );

      expect(availability.length).toBeGreaterThan(0);
      availability.forEach((period) => {
        expect(period.baseHours).toBe(40);
        expect(period.allocatedHours).toBe(0);
        expect(period.ptoHours).toBe(0);
        expect(period.availableHours).toBe(40);
      });
    });

    it('should calculate availability with allocations', async () => {
      const mockEmployee = mockData.employee({
        id: employeeId,
        hoursPerWeek: 40,
      });
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-14');

      const allocation = {
        id: testUuid('100'),
        scenarioId: testUuid('10'),
        employeeId,
        initiativeId: testUuid('20'),
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-14'),
        percentage: 50,
      };

      vi.mocked(prisma.employee.findUnique).mockResolvedValueOnce(
        mockEmployee as any
      );
      vi.mocked(prisma.capacityCalendar.findMany).mockResolvedValueOnce([]);
      vi.mocked(prisma.allocation.findMany).mockResolvedValueOnce(
        [allocation] as any
      );

      const availability = await capacityService.calculateAvailability(
        employeeId,
        startDate,
        endDate
      );

      expect(availability.length).toBeGreaterThan(0);
      availability.forEach((period) => {
        expect(period.allocatedHours).toBeLessThanOrEqual(period.baseHours);
        expect(period.availableHours).toBeGreaterThan(0);
      });
    });

    it('should throw ValidationError if dates are invalid', async () => {
      const startDate = new Date('2024-01-14');
      const endDate = new Date('2024-01-01');

      vi.mocked(prisma.employee.findUnique).mockResolvedValueOnce(
        mockData.employee({ id: employeeId }) as any
      );

      await expect(
        capacityService.calculateAvailability(employeeId, startDate, endDate)
      ).rejects.toThrow(ValidationError);
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Resources Routes Integration', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
    await app.register(resourcesRoutes);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Employee Endpoints', () => {
    it('GET /api/employees should list employees', async () => {
      const mockEmployees = [
        mockData.employee({ id: testUuid('001') }),
      ];

      vi.mocked(prisma.employee.findMany).mockResolvedValueOnce(
        mockEmployees as any
      );
      vi.mocked(prisma.employee.count).mockResolvedValueOnce(1);

      const response = await app.inject({
        method: 'GET',
        url: '/api/employees',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.employees).toBeDefined();
      expect(body.pagination).toBeDefined();
    });

    it('POST /api/employees should create employee', async () => {
      const newEmployee = mockData.employee({ id: testUuid('001') });

      vi.mocked(prisma.employee.create).mockResolvedValueOnce(
        newEmployee as any
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/employees',
        payload: {
          name: 'New Employee',
          role: 'Developer',
        },
      });

      expect(response.statusCode).toBe(201);
    });

    it('GET /api/employees/:id should get employee', async () => {
      const employee = mockData.employee({ id: testUuid('001') });

      vi.mocked(prisma.employee.findUnique).mockResolvedValueOnce(
        employee as any
      );

      const response = await app.inject({
        method: 'GET',
        url: `/api/employees/${testUuid('001')}`,
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Skill Endpoints', () => {
    it('GET /api/employees/:id/skills should list skills', async () => {
      const employee = mockData.employee({ id: testUuid('001') });

      vi.mocked(prisma.employee.findUnique).mockResolvedValueOnce(
        employee as any
      );
      vi.mocked(prisma.skill.findMany).mockResolvedValueOnce([]);

      const response = await app.inject({
        method: 'GET',
        url: `/api/employees/${testUuid('001')}/skills`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.skills).toBeDefined();
    });

    it('POST /api/employees/:id/skills should add skill', async () => {
      const employee = mockData.employee({ id: testUuid('001') });
      const skill = {
        id: testUuid('100'),
        name: 'JavaScript',
        proficiency: 3,
        employeeId: testUuid('001'),
      };

      vi.mocked(prisma.employee.findUnique).mockResolvedValueOnce(
        employee as any
      );
      vi.mocked(prisma.skill.findUnique).mockResolvedValueOnce(null);
      vi.mocked(prisma.skill.create).mockResolvedValueOnce(skill as any);

      const response = await app.inject({
        method: 'POST',
        url: `/api/employees/${testUuid('001')}/skills`,
        payload: {
          name: 'JavaScript',
          proficiency: 3,
        },
      });

      expect(response.statusCode).toBe(201);
    });
  });

  describe('Capacity Endpoints', () => {
    it('GET /api/employees/:id/capacity should get capacity calendar', async () => {
      const employee = mockData.employee({ id: testUuid('001') });

      vi.mocked(prisma.employee.findUnique).mockResolvedValueOnce(
        employee as any
      );
      vi.mocked(prisma.capacityCalendar.findMany).mockResolvedValueOnce([]);

      const response = await app.inject({
        method: 'GET',
        url: `/api/employees/${testUuid('001')}/capacity`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.capacity).toBeDefined();
    });

    it('GET /api/employees/:id/availability should calculate availability', async () => {
      const employee = mockData.employee({
        id: testUuid('001'),
        hoursPerWeek: 40,
      });

      vi.mocked(prisma.employee.findUnique).mockResolvedValueOnce(
        employee as any
      );
      vi.mocked(prisma.capacityCalendar.findMany).mockResolvedValueOnce([]);
      vi.mocked(prisma.allocation.findMany).mockResolvedValueOnce([]);

      const response = await app.inject({
        method: 'GET',
        url: `/api/employees/${testUuid('001')}/availability?startDate=2024-01-01&endDate=2024-01-31`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.availability).toBeDefined();
    });
  });
});
