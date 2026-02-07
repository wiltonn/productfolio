import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildTestApp, testUuid } from './setup.js';
import { NotFoundError } from '../lib/errors.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRedis = {
  get: vi.fn().mockResolvedValue(null),
  setex: vi.fn(),
  del: vi.fn(),
};

vi.mock('../lib/redis.js', () => ({
  getRedisClient: () => mockRedis,
  getCachedData: vi.fn().mockResolvedValue(null),
  setCachedData: vi.fn().mockResolvedValue(true),
  deleteKey: vi.fn(),
  CACHE_KEYS: { scenarioCalculation: (id: string) => `scenario:${id}:calculations` },
  CACHE_TTL: { CALCULATION: 300 },
}));

vi.mock('../lib/prisma.js', () => {
  const mockPrisma = {
    orgNode: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    orgMembership: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    employee: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    scenario: {
      findUnique: vi.fn(),
    },
    allocation: {
      findMany: vi.fn(),
    },
    initiative: {
      findMany: vi.fn(),
    },
    featureFlag: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    approvalPolicy: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn((fn: any) => {
      if (Array.isArray(fn)) return Promise.all(fn);
      return fn(mockPrisma);
    }),
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

vi.mock('../services/audit.service.js', () => ({
  logAuditEvent: vi.fn(),
}));

import { prisma } from '../lib/prisma.js';
import { isEnabled } from '../services/feature-flag.service.js';

const mockPrisma = prisma as any;
const mockIsEnabled = isEnabled as any;

// ---------------------------------------------------------------------------
// getEmployeesInSubtree unit tests
// ---------------------------------------------------------------------------

describe('getEmployeesInSubtree', () => {
  let getEmployeesInSubtree: (nodeId: string) => Promise<string[]>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../services/org-tree.service.js');
    getEmployeesInSubtree = mod.getEmployeesInSubtree;
  });

  it('returns employee IDs for members of the given node', async () => {
    const node = { id: testUuid('n1'), path: `/${testUuid('n1')}/`, isActive: true };
    mockPrisma.orgNode.findUnique.mockResolvedValue(node);
    mockPrisma.orgNode.findMany.mockResolvedValue([{ id: testUuid('n1') }]);
    mockPrisma.orgMembership.findMany.mockResolvedValue([
      { employeeId: testUuid('e1') },
      { employeeId: testUuid('e2') },
    ]);

    const result = await getEmployeesInSubtree(testUuid('n1'));
    expect(result).toEqual(expect.arrayContaining([testUuid('e1'), testUuid('e2')]));
    expect(result).toHaveLength(2);
  });

  it('returns employee IDs from descendant nodes (path startsWith query)', async () => {
    const parentPath = `/${testUuid('n1')}/`;
    mockPrisma.orgNode.findUnique.mockResolvedValue({ id: testUuid('n1'), path: parentPath, isActive: true });
    mockPrisma.orgNode.findMany.mockResolvedValue([
      { id: testUuid('n1') },
      { id: testUuid('n2') }, // descendant
    ]);
    mockPrisma.orgMembership.findMany.mockResolvedValue([
      { employeeId: testUuid('e1') },
      { employeeId: testUuid('e3') },
    ]);

    const result = await getEmployeesInSubtree(testUuid('n1'));
    expect(result).toHaveLength(2);

    // Verify the query uses startsWith
    expect(mockPrisma.orgNode.findMany).toHaveBeenCalledWith({
      where: { path: { startsWith: parentPath }, isActive: true },
      select: { id: true },
    });
  });

  it('returns empty array when no active memberships exist', async () => {
    mockPrisma.orgNode.findUnique.mockResolvedValue({ id: testUuid('n1'), path: `/${testUuid('n1')}/`, isActive: true });
    mockPrisma.orgNode.findMany.mockResolvedValue([{ id: testUuid('n1') }]);
    mockPrisma.orgMembership.findMany.mockResolvedValue([]);

    const result = await getEmployeesInSubtree(testUuid('n1'));
    expect(result).toEqual([]);
  });

  it('throws NotFoundError when node does not exist', async () => {
    mockPrisma.orgNode.findUnique.mockResolvedValue(null);

    await expect(getEmployeesInSubtree(testUuid('404'))).rejects.toThrow('not found');
  });

  it('deduplicates employees in multiple nodes', async () => {
    mockPrisma.orgNode.findUnique.mockResolvedValue({ id: testUuid('n1'), path: `/${testUuid('n1')}/`, isActive: true });
    mockPrisma.orgNode.findMany.mockResolvedValue([{ id: testUuid('n1') }, { id: testUuid('n2') }]);
    // Same employee in both nodes
    mockPrisma.orgMembership.findMany.mockResolvedValue([
      { employeeId: testUuid('e1') },
      { employeeId: testUuid('e1') }, // duplicate
      { employeeId: testUuid('e2') },
    ]);

    const result = await getEmployeesInSubtree(testUuid('n1'));
    expect(result).toHaveLength(2);
    expect(new Set(result).size).toBe(2);
  });

  it('only includes active memberships (effectiveEnd: null)', async () => {
    mockPrisma.orgNode.findUnique.mockResolvedValue({ id: testUuid('n1'), path: `/${testUuid('n1')}/`, isActive: true });
    mockPrisma.orgNode.findMany.mockResolvedValue([{ id: testUuid('n1') }]);
    mockPrisma.orgMembership.findMany.mockResolvedValue([{ employeeId: testUuid('e1') }]);

    await getEmployeesInSubtree(testUuid('n1'));

    expect(mockPrisma.orgMembership.findMany).toHaveBeenCalledWith({
      where: {
        orgNodeId: { in: [testUuid('n1')] },
        effectiveEnd: null,
      },
      select: { employeeId: true },
    });
  });
});

// ---------------------------------------------------------------------------
// Org-Scoped Scenario Calculator tests
// ---------------------------------------------------------------------------

describe('Org-Scoped Scenario Calculator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calculate(scenarioId, { orgNodeId }) filters allocations to org subtree employees', async () => {
    // Setup: org subtree has only e1
    mockPrisma.orgNode.findUnique.mockResolvedValue({ id: testUuid('n1'), path: `/${testUuid('n1')}/`, isActive: true });
    mockPrisma.orgNode.findMany.mockResolvedValue([{ id: testUuid('n1') }]);
    mockPrisma.orgMembership.findMany.mockResolvedValue([{ employeeId: testUuid('e1') }]);

    const periodId = testUuid('p1');
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('sc1'),
      name: 'Test Scenario',
      assumptions: {},
      priorityRankings: [],
      period: { id: periodId, label: 'Q1 2024', type: 'QUARTER', startDate: new Date('2024-01-01'), endDate: new Date('2024-03-31') },
      allocations: [
        {
          id: testUuid('a1'),
          employeeId: testUuid('e1'), // in subtree
          percentage: 100,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-03-31'),
          employee: {
            id: testUuid('e1'),
            name: 'Alice',
            hoursPerWeek: 40,
            employmentType: 'FULL_TIME',
            skills: [{ name: 'backend', proficiency: 4 }],
            capacityCalendar: [],
          },
          initiative: null,
          allocationPeriods: [{ periodId, hoursInPeriod: 520, overlapRatio: 1, period: { id: periodId, label: 'Q1 2024' } }],
        },
        {
          id: testUuid('a2'),
          employeeId: testUuid('e2'), // NOT in subtree
          percentage: 100,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-03-31'),
          employee: {
            id: testUuid('e2'),
            name: 'Bob',
            hoursPerWeek: 40,
            employmentType: 'FULL_TIME',
            skills: [{ name: 'frontend', proficiency: 3 }],
            capacityCalendar: [],
          },
          initiative: null,
          allocationPeriods: [{ periodId, hoursInPeriod: 520, overlapRatio: 1, period: { id: periodId, label: 'Q1 2024' } }],
        },
      ],
    });

    // Mock the additional prisma calls inside identifyIssues
    mockPrisma.allocation.findMany.mockResolvedValue([]);
    mockPrisma.initiative.findMany.mockResolvedValue([]);

    const { ScenarioCalculatorService } = await import('../services/scenario-calculator.service.js');
    const calculator = new ScenarioCalculatorService();
    const result = await calculator.calculate(testUuid('sc1'), {
      orgNodeId: testUuid('n1'),
      skipCache: true,
    });

    // Only Alice's allocation should remain (e1 in subtree, e2 filtered out)
    expect(result.summary.employeeCount).toBe(1);
  });

  it('calculate(scenarioId) without orgNodeId does not filter (backward compat)', async () => {
    const periodId = testUuid('p1');
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('sc1'),
      name: 'Test Scenario',
      assumptions: {},
      priorityRankings: [],
      period: { id: periodId, label: 'Q1 2024', type: 'QUARTER', startDate: new Date('2024-01-01'), endDate: new Date('2024-03-31') },
      allocations: [
        {
          id: testUuid('a1'),
          employeeId: testUuid('e1'),
          percentage: 100,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-03-31'),
          employee: {
            id: testUuid('e1'),
            name: 'Alice',
            hoursPerWeek: 40,
            employmentType: 'FULL_TIME',
            skills: [],
            capacityCalendar: [],
          },
          initiative: null,
          allocationPeriods: [{ periodId, hoursInPeriod: 520, overlapRatio: 1, period: { id: periodId, label: 'Q1 2024' } }],
        },
        {
          id: testUuid('a2'),
          employeeId: testUuid('e2'),
          percentage: 100,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-03-31'),
          employee: {
            id: testUuid('e2'),
            name: 'Bob',
            hoursPerWeek: 40,
            employmentType: 'FULL_TIME',
            skills: [],
            capacityCalendar: [],
          },
          initiative: null,
          allocationPeriods: [{ periodId, hoursInPeriod: 520, overlapRatio: 1, period: { id: periodId, label: 'Q1 2024' } }],
        },
      ],
    });

    mockPrisma.allocation.findMany.mockResolvedValue([]);
    mockPrisma.initiative.findMany.mockResolvedValue([]);

    const { ScenarioCalculatorService } = await import('../services/scenario-calculator.service.js');
    const calculator = new ScenarioCalculatorService();
    const result = await calculator.calculate(testUuid('sc1'), { skipCache: true });

    // Both employees should be present (no filtering)
    expect(result.summary.employeeCount).toBe(2);
  });

  it('cache key includes orgNodeId suffix when provided', async () => {
    // Use the CACHE_KEYS helper to verify the suffix pattern
    const { getCachedData } = await import('../lib/redis.js');
    const mockGetCached = getCachedData as any;

    // Return cached data to short-circuit
    mockGetCached.mockResolvedValue({
      scenarioId: testUuid('sc1'),
      scenarioName: 'Cached',
      periods: [],
      calculatedAt: new Date(),
      demandBySkillPeriod: [],
      capacityBySkillPeriod: [],
      gapAnalysis: [],
      issues: { shortages: [], overallocations: [], skillMismatches: [] },
      summary: {
        totalDemandHours: 0,
        totalCapacityHours: 0,
        overallGap: 0,
        overallUtilization: 0,
        totalShortages: 0,
        totalOverallocations: 0,
        totalSkillMismatches: 0,
        periodCount: 0,
        skillCount: 0,
        employeeCount: 0,
        initiativeCount: 0,
        rampCostHours: 0,
      },
      cacheHit: false,
    });

    const { ScenarioCalculatorService } = await import('../services/scenario-calculator.service.js');
    const calculator = new ScenarioCalculatorService();
    await calculator.calculate(testUuid('sc1'), { orgNodeId: testUuid('n1') });

    // getCachedData should be called with the org-suffixed cache key
    const expectedKey = `scenario:${testUuid('sc1')}:org:${testUuid('n1')}:calculations`;
    expect(mockGetCached).toHaveBeenCalledWith(expectedKey);
  });

  it('demand from initiatives remains unfiltered even with orgNodeId', async () => {
    // Setup: org subtree filtering only applies to allocations, not to initiative demand
    mockPrisma.orgNode.findUnique.mockResolvedValue({ id: testUuid('n1'), path: `/${testUuid('n1')}/`, isActive: true });
    mockPrisma.orgNode.findMany.mockResolvedValue([{ id: testUuid('n1') }]);
    mockPrisma.orgMembership.findMany.mockResolvedValue([{ employeeId: testUuid('e1') }]);

    const periodId = testUuid('p1');
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('sc1'),
      name: 'Test',
      assumptions: {},
      priorityRankings: [{ initiativeId: testUuid('i1'), rank: 1 }],
      period: { id: periodId, label: 'Q1 2024', type: 'QUARTER', startDate: new Date('2024-01-01'), endDate: new Date('2024-03-31') },
      allocations: [],
    });

    // Mock initiative demand query (not filtered by org)
    mockPrisma.initiative.findMany.mockResolvedValue([
      {
        id: testUuid('i1'),
        title: 'Big Project',
        status: 'RESOURCING',
        scopeItems: [
          {
            skillDemand: { backend: 200 },
            periodDistributions: [{ periodId, distribution: 1.0 }],
          },
        ],
      },
    ]);
    mockPrisma.allocation.findMany.mockResolvedValue([]);

    const { ScenarioCalculatorService } = await import('../services/scenario-calculator.service.js');
    const calculator = new ScenarioCalculatorService();
    const result = await calculator.calculate(testUuid('sc1'), {
      orgNodeId: testUuid('n1'),
      skipCache: true,
    });

    // Demand should still appear (initiative demand is not org-filtered)
    expect(result.summary.totalDemandHours).toBeGreaterThan(0);
  });

  it('summary.employeeCount reflects filtered employee set', async () => {
    // This is already covered by the first test in this block.
    // Additional verification: 0 employees when none in subtree.
    mockPrisma.orgNode.findUnique.mockResolvedValue({ id: testUuid('n1'), path: `/${testUuid('n1')}/`, isActive: true });
    mockPrisma.orgNode.findMany.mockResolvedValue([{ id: testUuid('n1') }]);
    mockPrisma.orgMembership.findMany.mockResolvedValue([]); // no employees in subtree

    const periodId = testUuid('p1');
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('sc1'),
      name: 'Test',
      assumptions: {},
      priorityRankings: [],
      period: { id: periodId, label: 'Q1 2024', type: 'QUARTER', startDate: new Date('2024-01-01'), endDate: new Date('2024-03-31') },
      allocations: [
        {
          id: testUuid('a1'),
          employeeId: testUuid('e1'), // NOT in subtree
          percentage: 100,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-03-31'),
          employee: {
            id: testUuid('e1'),
            name: 'Alice',
            hoursPerWeek: 40,
            employmentType: 'FULL_TIME',
            skills: [],
            capacityCalendar: [],
          },
          initiative: null,
          allocationPeriods: [{ periodId, hoursInPeriod: 520, overlapRatio: 1, period: { id: periodId, label: 'Q1 2024' } }],
        },
      ],
    });

    mockPrisma.allocation.findMany.mockResolvedValue([]);
    mockPrisma.initiative.findMany.mockResolvedValue([]);

    const { ScenarioCalculatorService } = await import('../services/scenario-calculator.service.js');
    const calculator = new ScenarioCalculatorService();
    const result = await calculator.calculate(testUuid('sc1'), {
      orgNodeId: testUuid('n1'),
      skipCache: true,
    });

    // All allocations filtered out -> 0 employees
    expect(result.summary.employeeCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Org Capacity Route Integration (behind org_capacity_view flag)
// ---------------------------------------------------------------------------

describe('Org Capacity Route Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function buildOrgCapacityApp() {
    const app = await buildTestApp();
    const { default: featureFlagPlugin } = await import('../plugins/feature-flag.plugin.js');
    await app.register(featureFlagPlugin);

    app.decorate('authenticate', async () => {});
    app.decorate('authorize', () => async () => {});
    app.decorateRequest('user', { sub: testUuid('999'), role: 'ADMIN' });

    const { orgTreeRoutes } = await import('../routes/org-tree.js');
    await app.register(orgTreeRoutes);
    await app.ready();
    return app;
  }

  it('GET /api/org/nodes/:id/employees returns 404 when flag disabled', async () => {
    mockIsEnabled.mockResolvedValue(false);

    const app = await buildOrgCapacityApp();
    const res = await app.inject({ method: 'GET', url: `/api/org/nodes/${testUuid('n1')}/employees` });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('GET /api/org/nodes/:id/employees returns employees when flag enabled', async () => {
    mockIsEnabled.mockResolvedValue(true);

    const node = { id: testUuid('n1'), path: `/${testUuid('n1')}/`, isActive: true };
    mockPrisma.orgNode.findUnique.mockResolvedValue(node);
    mockPrisma.orgNode.findMany.mockResolvedValue([{ id: testUuid('n1') }]);
    mockPrisma.orgMembership.findMany.mockResolvedValue([{ employeeId: testUuid('e1') }]);
    mockPrisma.employee.findMany.mockResolvedValue([
      {
        id: testUuid('e1'),
        name: 'Alice',
        skills: [],
        jobProfile: null,
        allocations: [],
      },
    ]);

    const app = await buildOrgCapacityApp();
    const res = await app.inject({ method: 'GET', url: `/api/org/nodes/${testUuid('n1')}/employees` });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.employeeCount).toBe(1);
    expect(body.employees).toHaveLength(1);
    await app.close();
  });

  it('GET /api/org/nodes/:id/capacity returns 404 when flag disabled', async () => {
    mockIsEnabled.mockResolvedValue(false);

    const app = await buildOrgCapacityApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/org/nodes/${testUuid('n1')}/capacity?scenarioId=${testUuid('sc1')}`,
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('GET /api/org/nodes/:id/capacity returns org-scoped calculation when enabled', async () => {
    mockIsEnabled.mockResolvedValue(true);

    // Setup org subtree
    mockPrisma.orgNode.findUnique.mockResolvedValue({ id: testUuid('n1'), path: `/${testUuid('n1')}/`, isActive: true });
    mockPrisma.orgNode.findMany.mockResolvedValue([{ id: testUuid('n1') }]);
    mockPrisma.orgMembership.findMany.mockResolvedValue([]);

    const periodId = testUuid('p1');
    mockPrisma.scenario.findUnique.mockResolvedValue({
      id: testUuid('sc1'),
      name: 'Test',
      assumptions: {},
      priorityRankings: [],
      period: { id: periodId, label: 'Q1 2024', type: 'QUARTER', startDate: new Date('2024-01-01'), endDate: new Date('2024-03-31') },
      allocations: [],
    });
    mockPrisma.allocation.findMany.mockResolvedValue([]);
    mockPrisma.initiative.findMany.mockResolvedValue([]);

    const app = await buildOrgCapacityApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/org/nodes/${testUuid('n1')}/capacity?scenarioId=${testUuid('sc1')}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.scenarioId).toBe(testUuid('sc1'));
    await app.close();
  });

  it('GET /api/org/nodes/:id/capacity returns 400 when scenarioId missing', async () => {
    mockIsEnabled.mockResolvedValue(true);

    const app = await buildOrgCapacityApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/org/nodes/${testUuid('n1')}/capacity`,
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
