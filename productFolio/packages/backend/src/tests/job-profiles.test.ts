import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildTestApp, testUuid } from './setup.js';
import { NotFoundError, ConflictError } from '../lib/errors.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRedis = {
  get: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
};

vi.mock('../lib/redis.js', () => ({
  getRedisClient: () => mockRedis,
  getCachedData: vi.fn(),
  setCachedData: vi.fn(),
  deleteKey: vi.fn(),
  CACHE_KEYS: { scenarioCalculation: (id: string) => `scenario:${id}:calculations` },
  CACHE_TTL: { CALCULATION: 300 },
}));

vi.mock('../lib/prisma.js', () => {
  const mockTx = {
    jobProfileSkill: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    costBand: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    jobProfile: {
      update: vi.fn(),
    },
  };

  const mockPrisma = {
    jobProfile: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    jobProfileSkill: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    costBand: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    employee: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    scenario: {
      findUnique: vi.fn(),
    },
    featureFlag: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn((fn: any) => fn(mockTx)),
  };

  return { prisma: mockPrisma };
});

vi.mock('../services/feature-flag.service.js', async (importOriginal) => {
  const orig: any = await importOriginal();
  return {
    ...orig,
    isEnabled: vi.fn(),
  };
});

import { prisma } from '../lib/prisma.js';
import { isEnabled } from '../services/feature-flag.service.js';

const mockPrisma = prisma as any;
const mockIsEnabled = isEnabled as any;

// ---------------------------------------------------------------------------
// Helper: build profile mock
// ---------------------------------------------------------------------------

function mockProfile(overrides: Record<string, any> = {}) {
  return {
    id: testUuid('500'),
    name: 'Senior Engineer',
    level: 'Senior',
    band: 'IC4',
    description: 'A senior engineer profile',
    isActive: true,
    skills: [{ id: testUuid('501'), jobProfileId: testUuid('500'), skillName: 'backend', expectedProficiency: 4 }],
    costBand: {
      id: testUuid('502'),
      jobProfileId: testUuid('500'),
      annualCostMin: 100000,
      annualCostMax: 150000,
      hourlyRate: 75,
      currency: 'USD',
      effectiveDate: new Date('2024-01-01'),
    },
    _count: { employees: 0 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// JobProfileService unit tests
// ---------------------------------------------------------------------------

describe('JobProfileService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    let list: Function;

    beforeEach(async () => {
      const mod = await import('../services/job-profile.service.js');
      list = mod.list;
    });

    it('returns paginated response with profiles, skills, costBand, _count', async () => {
      const profiles = [mockProfile()];
      mockPrisma.jobProfile.findMany.mockResolvedValue(profiles);
      mockPrisma.jobProfile.count.mockResolvedValue(1);

      const result = await list({});
      expect(result.data).toEqual(profiles);
      expect(result.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    });

    it('filters by search (case-insensitive)', async () => {
      mockPrisma.jobProfile.findMany.mockResolvedValue([]);
      mockPrisma.jobProfile.count.mockResolvedValue(0);

      await list({ search: 'senior' });

      const where = mockPrisma.jobProfile.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { name: { contains: 'senior', mode: 'insensitive' } },
        { level: { contains: 'senior', mode: 'insensitive' } },
        { band: { contains: 'senior', mode: 'insensitive' } },
      ]);
    });

    it('filters active only when isActive: true', async () => {
      mockPrisma.jobProfile.findMany.mockResolvedValue([]);
      mockPrisma.jobProfile.count.mockResolvedValue(0);

      await list({ isActive: true });

      const where = mockPrisma.jobProfile.findMany.mock.calls[0][0].where;
      expect(where.isActive).toBe(true);
    });
  });

  describe('getById', () => {
    let getById: Function;

    beforeEach(async () => {
      const mod = await import('../services/job-profile.service.js');
      getById = mod.getById;
    });

    it('returns profile with full includes', async () => {
      const profile = mockProfile();
      mockPrisma.jobProfile.findUnique.mockResolvedValue(profile);

      const result = await getById(testUuid('500'));
      expect(result).toEqual(profile);
    });

    it('throws NotFoundError when missing', async () => {
      mockPrisma.jobProfile.findUnique.mockResolvedValue(null);

      await expect(getById(testUuid('404'))).rejects.toThrow('not found');
    });
  });

  describe('create', () => {
    let create: Function;

    beforeEach(async () => {
      const mod = await import('../services/job-profile.service.js');
      create = mod.create;
    });

    it('creates profile with nested skills + costBand', async () => {
      mockPrisma.jobProfile.findUnique.mockResolvedValue(null); // no duplicate
      mockPrisma.jobProfile.create.mockResolvedValue(mockProfile());

      const result = await create({
        name: 'Senior Engineer',
        isActive: true,
        skills: [{ skillName: 'backend', expectedProficiency: 4 }],
        costBand: {
          hourlyRate: 75,
          currency: 'USD',
          effectiveDate: new Date('2024-01-01'),
        },
      });

      expect(result.name).toBe('Senior Engineer');
      expect(mockPrisma.jobProfile.create).toHaveBeenCalled();
    });

    it('throws ConflictError when name already exists', async () => {
      mockPrisma.jobProfile.findUnique.mockResolvedValue(mockProfile());

      await expect(
        create({ name: 'Senior Engineer', isActive: true, skills: [] })
      ).rejects.toThrow(/already exists/);
    });

    it('handles empty skills array', async () => {
      mockPrisma.jobProfile.findUnique.mockResolvedValue(null);
      mockPrisma.jobProfile.create.mockResolvedValue(mockProfile({ skills: [] }));

      const result = await create({ name: 'New', isActive: true, skills: [] });
      expect(result).toBeDefined();
    });

    it('handles null costBand', async () => {
      mockPrisma.jobProfile.findUnique.mockResolvedValue(null);
      mockPrisma.jobProfile.create.mockResolvedValue(mockProfile({ costBand: null }));

      const result = await create({ name: 'NoCost', isActive: true, skills: [], costBand: null });
      expect(result.costBand).toBeNull();
    });
  });

  describe('update', () => {
    let update: Function;

    beforeEach(async () => {
      const mod = await import('../services/job-profile.service.js');
      update = mod.update;
    });

    it('updates profile fields', async () => {
      const updatedProfile = mockProfile({ name: 'Staff Engineer' });
      // First call: find by id (exists), second call: find by name (no conflict)
      mockPrisma.jobProfile.findUnique
        .mockResolvedValueOnce(mockProfile()) // where: { id }
        .mockResolvedValueOnce(null);         // where: { name: 'Staff Engineer' } -> no conflict
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          jobProfileSkill: { deleteMany: vi.fn(), createMany: vi.fn() },
          costBand: { upsert: vi.fn(), deleteMany: vi.fn() },
          jobProfile: { update: vi.fn().mockResolvedValue(updatedProfile) },
        };
        return fn(tx);
      });

      const result = await update(testUuid('500'), { name: 'Staff Engineer' });
      expect(result.name).toBe('Staff Engineer');
    });

    it('throws NotFoundError when missing', async () => {
      mockPrisma.jobProfile.findUnique.mockResolvedValue(null);

      await expect(update(testUuid('404'), { name: 'X' })).rejects.toThrow('not found');
    });

    it('throws ConflictError when renaming to existing name', async () => {
      mockPrisma.jobProfile.findUnique
        .mockResolvedValueOnce(mockProfile()) // first call: profile exists
        .mockResolvedValueOnce(mockProfile({ id: testUuid('510'), name: 'Taken' })); // second call: name conflict

      await expect(
        update(testUuid('500'), { name: 'Taken' })
      ).rejects.toThrow(/already exists/);
    });

    it('replaces skills (deleteMany + createMany in transaction)', async () => {
      mockPrisma.jobProfile.findUnique.mockResolvedValue(mockProfile());

      const mockDeleteMany = vi.fn();
      const mockCreateMany = vi.fn();
      const mockTxUpdate = vi.fn().mockResolvedValue(mockProfile());

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          jobProfileSkill: { deleteMany: mockDeleteMany, createMany: mockCreateMany },
          costBand: { upsert: vi.fn(), deleteMany: vi.fn() },
          jobProfile: { update: mockTxUpdate },
        };
        return fn(tx);
      });

      await update(testUuid('500'), {
        skills: [{ skillName: 'frontend', expectedProficiency: 3 }],
      });

      expect(mockDeleteMany).toHaveBeenCalledWith({ where: { jobProfileId: testUuid('500') } });
      expect(mockCreateMany).toHaveBeenCalled();
    });

    it('upserts cost band in transaction', async () => {
      mockPrisma.jobProfile.findUnique.mockResolvedValue(mockProfile());

      const mockUpsert = vi.fn();
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          jobProfileSkill: { deleteMany: vi.fn(), createMany: vi.fn() },
          costBand: { upsert: mockUpsert, deleteMany: vi.fn() },
          jobProfile: { update: vi.fn().mockResolvedValue(mockProfile()) },
        };
        return fn(tx);
      });

      await update(testUuid('500'), {
        costBand: { hourlyRate: 80, currency: 'USD', effectiveDate: new Date('2024-06-01') },
      });

      expect(mockUpsert).toHaveBeenCalled();
    });

    it('removes cost band when costBand: null', async () => {
      mockPrisma.jobProfile.findUnique.mockResolvedValue(mockProfile());

      const mockCostDelete = vi.fn();
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          jobProfileSkill: { deleteMany: vi.fn(), createMany: vi.fn() },
          costBand: { upsert: vi.fn(), deleteMany: mockCostDelete },
          jobProfile: { update: vi.fn().mockResolvedValue(mockProfile({ costBand: null })) },
        };
        return fn(tx);
      });

      await update(testUuid('500'), { costBand: null });

      expect(mockCostDelete).toHaveBeenCalledWith({ where: { jobProfileId: testUuid('500') } });
    });
  });

  describe('deleteProfile', () => {
    let deleteProfile: Function;

    beforeEach(async () => {
      const mod = await import('../services/job-profile.service.js');
      deleteProfile = mod.deleteProfile;
    });

    it('soft-deletes (isActive=false) when no employees assigned', async () => {
      mockPrisma.jobProfile.findUnique.mockResolvedValue(mockProfile({ _count: { employees: 0 } }));
      mockPrisma.jobProfile.update.mockResolvedValue({});

      const result = await deleteProfile(testUuid('500'));
      expect(result).toEqual({ success: true });
      expect(mockPrisma.jobProfile.update).toHaveBeenCalledWith({
        where: { id: testUuid('500') },
        data: { isActive: false },
      });
    });

    it('throws NotFoundError when missing', async () => {
      mockPrisma.jobProfile.findUnique.mockResolvedValue(null);

      await expect(deleteProfile(testUuid('404'))).rejects.toThrow('not found');
    });

    it('throws ConflictError when employees still assigned', async () => {
      mockPrisma.jobProfile.findUnique.mockResolvedValue(mockProfile({ _count: { employees: 3 } }));

      await expect(deleteProfile(testUuid('500'))).rejects.toThrow(/Cannot delete/);
    });
  });
});

// ---------------------------------------------------------------------------
// Employee Job Profile Assignment tests
// ---------------------------------------------------------------------------

describe('Employee Job Profile Assignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function buildResourcesApp() {
    const app = await buildTestApp();
    const { default: featureFlagPlugin } = await import('../plugins/feature-flag.plugin.js');
    await app.register(featureFlagPlugin);

    app.decorate('authenticate', async () => {});
    app.decorate('authorize', () => async () => {});
    app.decorateRequest('user', { sub: testUuid('999'), role: 'ADMIN' });

    const { resourcesRoutes } = await import('../routes/resources.js');
    await app.register(resourcesRoutes);
    await app.ready();
    return app;
  }

  it('PUT /api/employees/:id/job-profile assigns jobProfileId when flag enabled', async () => {
    mockIsEnabled.mockResolvedValue(true);
    mockPrisma.employee.findUnique.mockResolvedValue({ id: testUuid('e1'), name: 'Alice' });
    mockPrisma.jobProfile.findUnique.mockResolvedValue(mockProfile());
    mockPrisma.employee.update.mockResolvedValue({
      id: testUuid('e1'),
      name: 'Alice',
      jobProfile: mockProfile(),
    });

    const app = await buildResourcesApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/employees/${testUuid('e1')}/job-profile`,
      payload: { jobProfileId: testUuid('500') },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).jobProfile).toBeDefined();
    await app.close();
  });

  it('PUT /api/employees/:id/job-profile returns 404 when flag disabled', async () => {
    mockIsEnabled.mockResolvedValue(false);

    const app = await buildResourcesApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/employees/${testUuid('e1')}/job-profile`,
      payload: { jobProfileId: testUuid('500') },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('PUT /api/employees/:id/job-profile { jobProfileId: null } removes assignment', async () => {
    mockIsEnabled.mockResolvedValue(true);
    mockPrisma.employee.findUnique.mockResolvedValue({ id: testUuid('e1'), name: 'Alice' });
    mockPrisma.employee.update.mockResolvedValue({
      id: testUuid('e1'),
      name: 'Alice',
      jobProfile: null,
    });

    const app = await buildResourcesApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/employees/${testUuid('e1')}/job-profile`,
      payload: { jobProfileId: null },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).jobProfile).toBeNull();
    await app.close();
  });

  it('PUT /api/employees/:id/job-profile returns 404 when employee missing', async () => {
    mockIsEnabled.mockResolvedValue(true);
    mockPrisma.employee.findUnique.mockResolvedValue(null);

    const app = await buildResourcesApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/employees/${testUuid('404')}/job-profile`,
      payload: { jobProfileId: testUuid('500') },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('PUT /api/employees/:id/job-profile returns 404 when jobProfile missing', async () => {
    mockIsEnabled.mockResolvedValue(true);
    mockPrisma.employee.findUnique.mockResolvedValue({ id: testUuid('e1'), name: 'Alice' });
    mockPrisma.jobProfile.findUnique.mockResolvedValue(null);

    const app = await buildResourcesApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/employees/${testUuid('e1')}/job-profile`,
      payload: { jobProfileId: testUuid('404') },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// Budget Report Service tests
// ---------------------------------------------------------------------------

describe('BudgetReportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  let generateBudgetReport: Function;

  beforeEach(async () => {
    const mod = await import('../services/budget-report.service.js');
    generateBudgetReport = mod.generateBudgetReport;
  });

  it('returns grouped budget by initiative', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('600'),
      name: 'Q1 Plan',
      allocations: [
        {
          employeeId: testUuid('e1'),
          initiativeId: testUuid('i1'),
          employee: {
            name: 'Alice',
            jobProfile: {
              id: testUuid('500'),
              name: 'Senior Engineer',
              costBand: { hourlyRate: 75 },
            },
          },
          initiative: { id: testUuid('i1'), title: 'Project Alpha' },
          allocationPeriods: [{ hoursInPeriod: 200 }],
        },
      ],
    });

    const result = await generateBudgetReport(testUuid('600'));
    expect(result.scenarioId).toBe(testUuid('600'));
    expect(result.initiatives).toHaveLength(1);
    expect(result.initiatives[0].initiativeTitle).toBe('Project Alpha');
    expect(result.initiatives[0].totalEstimatedCost).toBe(15000); // 75 * 200
  });

  it('throws NotFoundError when scenario missing', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue(null);

    await expect(generateBudgetReport(testUuid('404'))).rejects.toThrow('not found');
  });

  it('employees without jobProfile: hourlyRate null, estimatedCost null', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('600'),
      name: 'Q1 Plan',
      allocations: [
        {
          employeeId: testUuid('e1'),
          initiativeId: testUuid('i1'),
          employee: { name: 'Bob', jobProfile: null },
          initiative: { id: testUuid('i1'), title: 'Project Beta' },
          allocationPeriods: [{ hoursInPeriod: 100 }],
        },
      ],
    });

    const result = await generateBudgetReport(testUuid('600'));
    const emp = result.initiatives[0].employees[0];
    expect(emp.hourlyRate).toBeNull();
    expect(emp.estimatedCost).toBeNull();
  });

  it('employees with jobProfile but no costBand: hourlyRate null', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('600'),
      name: 'Q1 Plan',
      allocations: [
        {
          employeeId: testUuid('e1'),
          initiativeId: testUuid('i1'),
          employee: {
            name: 'Carol',
            jobProfile: { id: testUuid('500'), name: 'Junior Dev', costBand: null },
          },
          initiative: { id: testUuid('i1'), title: 'Project Gamma' },
          allocationPeriods: [{ hoursInPeriod: 80 }],
        },
      ],
    });

    const result = await generateBudgetReport(testUuid('600'));
    const emp = result.initiatives[0].employees[0];
    expect(emp.hourlyRate).toBeNull();
    expect(emp.estimatedCost).toBeNull();
  });

  it('computes estimatedCost = hourlyRate * allocatedHours', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('600'),
      name: 'Q1 Plan',
      allocations: [
        {
          employeeId: testUuid('e1'),
          initiativeId: testUuid('i1'),
          employee: {
            name: 'Dave',
            jobProfile: { id: testUuid('500'), name: 'Mid', costBand: { hourlyRate: 50 } },
          },
          initiative: { id: testUuid('i1'), title: 'Project Delta' },
          allocationPeriods: [{ hoursInPeriod: 120 }, { hoursInPeriod: 80 }],
        },
      ],
    });

    const result = await generateBudgetReport(testUuid('600'));
    const emp = result.initiatives[0].employees[0];
    expect(emp.allocatedHours).toBe(200); // 120 + 80
    expect(emp.estimatedCost).toBe(10000); // 50 * 200
  });

  it('unallocated (no initiativeId) go to unallocatedCost bucket', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('600'),
      name: 'Q1 Plan',
      allocations: [
        {
          employeeId: testUuid('e1'),
          initiativeId: null,
          employee: {
            name: 'Eve',
            jobProfile: { id: testUuid('500'), name: 'Bench', costBand: { hourlyRate: 60 } },
          },
          initiative: null,
          allocationPeriods: [{ hoursInPeriod: 100 }],
        },
      ],
    });

    const result = await generateBudgetReport(testUuid('600'));
    expect(result.initiatives).toHaveLength(0);
    expect(result.unallocatedCost.employees).toHaveLength(1);
    expect(result.unallocatedCost.totalEstimatedCost).toBe(6000); // 60 * 100
  });

  it('summary.employeesWithCostBand and employeesWithoutCostBand counts', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('600'),
      name: 'Q1 Plan',
      allocations: [
        {
          employeeId: testUuid('e1'),
          initiativeId: testUuid('i1'),
          employee: {
            name: 'Alice',
            jobProfile: { id: testUuid('500'), name: 'Sr', costBand: { hourlyRate: 75 } },
          },
          initiative: { id: testUuid('i1'), title: 'Alpha' },
          allocationPeriods: [{ hoursInPeriod: 100 }],
        },
        {
          employeeId: testUuid('e2'),
          initiativeId: testUuid('i1'),
          employee: { name: 'Bob', jobProfile: null },
          initiative: { id: testUuid('i1'), title: 'Alpha' },
          allocationPeriods: [{ hoursInPeriod: 100 }],
        },
      ],
    });

    const result = await generateBudgetReport(testUuid('600'));
    expect(result.summary.employeesWithCostBand).toBe(1);
    expect(result.summary.employeesWithoutCostBand).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Job Profiles Route Integration (behind job_profiles flag)
// ---------------------------------------------------------------------------

describe('Job Profiles Route Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function buildJobProfilesApp() {
    const app = await buildTestApp();
    const { default: featureFlagPlugin } = await import('../plugins/feature-flag.plugin.js');
    await app.register(featureFlagPlugin);

    app.decorate('authenticate', async () => {});
    app.decorate('authorize', () => async () => {});
    app.decorateRequest('user', { sub: testUuid('999'), role: 'ADMIN' });

    const { jobProfilesRoutes } = await import('../routes/job-profiles.js');
    await app.register(jobProfilesRoutes);
    await app.ready();
    return app;
  }

  it('GET /api/job-profiles returns 404 when flag disabled', async () => {
    mockIsEnabled.mockResolvedValue(false);

    const app = await buildJobProfilesApp();
    const res = await app.inject({ method: 'GET', url: '/api/job-profiles' });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('GET /api/job-profiles returns data when flag enabled', async () => {
    mockIsEnabled.mockResolvedValue(true);
    mockPrisma.jobProfile.findMany.mockResolvedValue([mockProfile()]);
    mockPrisma.jobProfile.count.mockResolvedValue(1);

    const app = await buildJobProfilesApp();
    const res = await app.inject({ method: 'GET', url: '/api/job-profiles' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    await app.close();
  });

  it('POST /api/job-profiles creates profile when flag enabled', async () => {
    mockIsEnabled.mockResolvedValue(true);
    mockPrisma.jobProfile.findUnique.mockResolvedValue(null); // no duplicate
    mockPrisma.jobProfile.create.mockResolvedValue(mockProfile());

    const app = await buildJobProfilesApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/job-profiles',
      payload: {
        name: 'Senior Engineer',
        skills: [{ skillName: 'backend', expectedProficiency: 4 }],
      },
    });

    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it('GET /api/job-profiles/:id returns profile when flag enabled', async () => {
    mockIsEnabled.mockResolvedValue(true);
    mockPrisma.jobProfile.findUnique.mockResolvedValue(mockProfile());

    const app = await buildJobProfilesApp();
    const res = await app.inject({ method: 'GET', url: `/api/job-profiles/${testUuid('500')}` });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).name).toBe('Senior Engineer');
    await app.close();
  });

  it('PUT /api/job-profiles/:id updates profile when flag enabled', async () => {
    mockIsEnabled.mockResolvedValue(true);
    const profile = mockProfile();
    // First call: find by id (exists), second call: find by name (no conflict)
    mockPrisma.jobProfile.findUnique
      .mockResolvedValueOnce(profile)  // where: { id }
      .mockResolvedValueOnce(null);    // where: { name: 'Updated' } -> no conflict
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        jobProfileSkill: { deleteMany: vi.fn(), createMany: vi.fn() },
        costBand: { upsert: vi.fn(), deleteMany: vi.fn() },
        jobProfile: { update: vi.fn().mockResolvedValue({ ...profile, name: 'Updated' }) },
      };
      return fn(tx);
    });

    const app = await buildJobProfilesApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/job-profiles/${testUuid('500')}`,
      payload: { name: 'Updated' },
    });

    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('DELETE /api/job-profiles/:id soft-deletes when flag enabled', async () => {
    mockIsEnabled.mockResolvedValue(true);
    mockPrisma.jobProfile.findUnique.mockResolvedValue(mockProfile({ _count: { employees: 0 } }));
    mockPrisma.jobProfile.update.mockResolvedValue({});

    const app = await buildJobProfilesApp();
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/job-profiles/${testUuid('500')}`,
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
    await app.close();
  });

  it('GET /api/budget/scenario/:id returns budget report when flag enabled', async () => {
    mockIsEnabled.mockResolvedValue(true);
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('600'),
      name: 'Q1',
      allocations: [],
    });

    const app = await buildJobProfilesApp();
    const res = await app.inject({ method: 'GET', url: `/api/budget/scenario/${testUuid('600')}` });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.scenarioId).toBe(testUuid('600'));
    await app.close();
  });
});
