import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testUuid } from './setup.js';

// ============================================================================
// Mock Setup
// ============================================================================

const mockPrisma = {
  scenario: { findUnique: vi.fn() },
  tokenDemand: { findMany: vi.fn() },
  orgNode: { findMany: vi.fn() },
};
vi.mock('../lib/prisma.js', () => ({ prisma: mockPrisma }));

const mockIsEnabled = vi.fn();
vi.mock('../services/feature-flag.service.js', () => ({
  isEnabled: (...args: unknown[]) => mockIsEnabled(...args),
}));

// Import after mocks
const { rollupService, computeOverlapRatio } = await import('../services/rollup.service.js');

// ============================================================================
// Mock Data Factories
// ============================================================================

function mockPeriod(id = testUuid('200')) {
  return {
    id,
    label: '2026-Q1',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-03-31'),
  };
}

function mockEmployee(
  id: string,
  opts: {
    hourlyRate?: number | null;
    orgMemberships?: Array<{
      orgNodeId: string;
      effectiveStart: Date;
      effectiveEnd: Date | null;
    }>;
    orgUnitLinks?: Array<{
      orgNodeId: string;
      relationshipType: string;
      startDate: Date;
      endDate: Date | null;
    }>;
  } = {}
) {
  return {
    id,
    name: `Employee ${id.slice(-3)}`,
    jobProfile:
      opts.hourlyRate !== undefined
        ? {
            costBand:
              opts.hourlyRate !== null ? { hourlyRate: opts.hourlyRate } : null,
          }
        : { costBand: { hourlyRate: 100 } },
    orgMemberships: opts.orgMemberships ?? [
      {
        orgNodeId: testUuid('600'),
        effectiveStart: new Date('2025-01-01'),
        effectiveEnd: null,
      },
    ],
    orgUnitLinks: opts.orgUnitLinks ?? [],
  };
}

function mockInitiative(
  id: string,
  opts: {
    portfolioAreaId?: string | null;
    portfolioAreaName?: string;
    businessOwnerId?: string;
    businessOwnerName?: string;
  } = {}
) {
  const paId =
    opts.portfolioAreaId !== undefined
      ? opts.portfolioAreaId
      : testUuid('700');
  return {
    id,
    title: `Initiative ${id.slice(-3)}`,
    portfolioAreaId: paId,
    portfolioArea: paId
      ? { id: paId, name: opts.portfolioAreaName ?? 'Growth' }
      : null,
    businessOwnerId: opts.businessOwnerId ?? testUuid('800'),
    businessOwner: {
      id: opts.businessOwnerId ?? testUuid('800'),
      name: opts.businessOwnerName ?? 'Bob Owner',
    },
  };
}

function mockAllocation(
  overrides: Partial<{
    id: string;
    scenarioId: string;
    employeeId: string;
    initiativeId: string | null;
    startDate: Date;
    endDate: Date;
    percentage: number;
    employee: ReturnType<typeof mockEmployee>;
    initiative: ReturnType<typeof mockInitiative> | null;
    allocationPeriods: Array<{
      periodId: string;
      hoursInPeriod: number;
      period: ReturnType<typeof mockPeriod>;
    }>;
  }> = {}
) {
  return {
    id: overrides.id ?? testUuid('300'),
    scenarioId: overrides.scenarioId ?? testUuid('100'),
    employeeId: overrides.employeeId ?? testUuid('400'),
    initiativeId: overrides.initiativeId ?? testUuid('500'),
    startDate: overrides.startDate ?? new Date('2026-01-01'),
    endDate: overrides.endDate ?? new Date('2026-03-31'),
    percentage: overrides.percentage ?? 100,
    employee: overrides.employee ?? mockEmployee(testUuid('400')),
    initiative:
      overrides.initiative !== undefined
        ? overrides.initiative
        : mockInitiative(testUuid('500')),
    allocationPeriods: overrides.allocationPeriods ?? [
      {
        periodId: testUuid('900'),
        hoursInPeriod: 480,
        period: mockPeriod(testUuid('900')),
      },
    ],
  };
}

function mockScenarioResult(
  overrides: Partial<{
    id: string;
    name: string;
    planningMode: string;
    period: ReturnType<typeof mockPeriod>;
    allocations: ReturnType<typeof mockAllocation>[];
  }> = {}
) {
  return {
    id: overrides.id ?? testUuid('100'),
    name: overrides.name ?? 'Q1 Plan',
    planningMode: overrides.planningMode ?? 'LEGACY',
    period: overrides.period ?? mockPeriod(),
    allocations: overrides.allocations ?? [mockAllocation()],
  };
}

// ============================================================================
// Tests
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  mockIsEnabled.mockResolvedValue(false);
  // Default: token demand returns nothing
  mockPrisma.tokenDemand.findMany.mockResolvedValue([]);
});

// ============================================================================
// computeOverlapRatio
// ============================================================================

describe('computeOverlapRatio', () => {
  const periodStart = new Date('2026-01-01');
  const periodEnd = new Date('2026-03-31');

  it('returns 1.0 when membership covers the entire period', () => {
    const ratio = computeOverlapRatio(
      new Date('2025-01-01'), // memberStart before period
      new Date('2026-06-30'), // memberEnd after period
      periodStart,
      periodEnd
    );
    expect(ratio).toBe(1.0);
  });

  it('returns 0.0 when membership ends before the period starts', () => {
    const ratio = computeOverlapRatio(
      new Date('2025-01-01'),
      new Date('2025-12-31'), // ends before periodStart
      periodStart,
      periodEnd
    );
    expect(ratio).toBe(0.0);
  });

  it('returns partial overlap when membership starts mid-period', () => {
    // Period: Jan 1 - Mar 31 (89 days)
    // Membership starts Feb 14 - after period end
    // Overlap: Feb 14 - Mar 31 (45 days)
    // Ratio: 45/89 ≈ 0.5056
    const ratio = computeOverlapRatio(
      new Date('2026-02-14'),
      new Date('2026-06-30'),
      periodStart,
      periodEnd
    );
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.6);
  });

  it('returns 1.0 when memberEnd is null and membership started before the period', () => {
    const ratio = computeOverlapRatio(
      new Date('2025-06-01'),
      null, // still active
      periodStart,
      periodEnd
    );
    expect(ratio).toBe(1.0);
  });

  it('returns 0.0 when memberStart equals periodEnd (zero-width overlap)', () => {
    const ratio = computeOverlapRatio(
      new Date('2026-03-31'), // starts exactly at periodEnd
      null,
      periodStart,
      periodEnd
    );
    expect(ratio).toBe(0.0);
  });
});

// ============================================================================
// rollupByPortfolioArea
// ============================================================================

describe('rollupByPortfolioArea', () => {
  it('groups initiatives by portfolioAreaId', async () => {
    const scenario = mockScenarioResult({
      allocations: [
        mockAllocation({
          id: testUuid('301'),
          initiative: mockInitiative(testUuid('501'), {
            portfolioAreaId: testUuid('701'),
            portfolioAreaName: 'Growth',
          }),
        }),
        mockAllocation({
          id: testUuid('302'),
          initiative: mockInitiative(testUuid('502'), {
            portfolioAreaId: testUuid('702'),
            portfolioAreaName: 'Platform',
          }),
        }),
      ],
    });
    mockPrisma.scenario.findUnique.mockResolvedValue(scenario);

    const result = await rollupService.rollupByPortfolioArea(testUuid('100'));

    expect(result.lens).toBe('PORTFOLIO_AREA');
    expect(result.groups).toHaveLength(2);
    const names = result.groups.map((g) => g.groupName).sort();
    expect(names).toEqual(['Growth', 'Platform']);
  });

  it('aggregates multiple initiatives in the same portfolio area', async () => {
    const paId = testUuid('701');
    const scenario = mockScenarioResult({
      allocations: [
        mockAllocation({
          id: testUuid('301'),
          initiative: mockInitiative(testUuid('501'), {
            portfolioAreaId: paId,
            portfolioAreaName: 'Growth',
          }),
          allocationPeriods: [
            { periodId: testUuid('901'), hoursInPeriod: 200, period: mockPeriod(testUuid('901')) },
          ],
        }),
        mockAllocation({
          id: testUuid('302'),
          initiative: mockInitiative(testUuid('502'), {
            portfolioAreaId: paId,
            portfolioAreaName: 'Growth',
          }),
          allocationPeriods: [
            { periodId: testUuid('902'), hoursInPeriod: 300, period: mockPeriod(testUuid('902')) },
          ],
        }),
      ],
    });
    mockPrisma.scenario.findUnique.mockResolvedValue(scenario);

    const result = await rollupService.rollupByPortfolioArea(testUuid('100'));

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].groupId).toBe(paId);
    expect(result.groups[0].initiativeCount).toBe(2);
    expect(result.groups[0].initiativeIds).toContain(testUuid('501'));
    expect(result.groups[0].initiativeIds).toContain(testUuid('502'));
    expect(result.groups[0].budget.totalHours).toBe(500);
  });

  it('places initiatives with null portfolioAreaId into unattributed bucket', async () => {
    const scenario = mockScenarioResult({
      allocations: [
        mockAllocation({
          id: testUuid('301'),
          initiative: mockInitiative(testUuid('501'), {
            portfolioAreaId: null,
          }),
        }),
      ],
    });
    mockPrisma.scenario.findUnique.mockResolvedValue(scenario);

    const result = await rollupService.rollupByPortfolioArea(testUuid('100'));

    expect(result.groups).toHaveLength(0);
    expect(result.unattributed.initiativeCount).toBe(1);
    expect(result.unattributed.initiativeIds).toContain(testUuid('501'));
  });

  it('computes budget totalHours and totalEstimatedCost correctly', async () => {
    const emp = mockEmployee(testUuid('401'), { hourlyRate: 150 });
    const scenario = mockScenarioResult({
      allocations: [
        mockAllocation({
          id: testUuid('301'),
          employee: emp,
          employeeId: testUuid('401'),
          allocationPeriods: [
            { periodId: testUuid('901'), hoursInPeriod: 200, period: mockPeriod(testUuid('901')) },
          ],
        }),
      ],
    });
    mockPrisma.scenario.findUnique.mockResolvedValue(scenario);

    const result = await rollupService.rollupByPortfolioArea(testUuid('100'));

    const group = result.groups[0];
    expect(group.budget.totalHours).toBe(200);
    expect(group.budget.totalEstimatedCost).toBe(200 * 150);
  });

  it('tracks costCoverage for employees with and without cost bands', async () => {
    const empWithCost = mockEmployee(testUuid('401'), { hourlyRate: 100 });
    const empWithoutCost = mockEmployee(testUuid('402'), { hourlyRate: null });

    const paId = testUuid('701');
    const scenario = mockScenarioResult({
      allocations: [
        mockAllocation({
          id: testUuid('301'),
          employeeId: testUuid('401'),
          employee: empWithCost,
          initiative: mockInitiative(testUuid('501'), { portfolioAreaId: paId }),
          allocationPeriods: [
            { periodId: testUuid('901'), hoursInPeriod: 300, period: mockPeriod(testUuid('901')) },
          ],
        }),
        mockAllocation({
          id: testUuid('302'),
          employeeId: testUuid('402'),
          employee: empWithoutCost,
          initiative: mockInitiative(testUuid('502'), { portfolioAreaId: paId }),
          allocationPeriods: [
            { periodId: testUuid('902'), hoursInPeriod: 200, period: mockPeriod(testUuid('902')) },
          ],
        }),
      ],
    });
    mockPrisma.scenario.findUnique.mockResolvedValue(scenario);

    const result = await rollupService.rollupByPortfolioArea(testUuid('100'));

    const budget = result.groups[0].budget;
    expect(budget.costCoverage.hoursWithCostBand).toBe(300);
    expect(budget.costCoverage.hoursWithoutCostBand).toBe(200);
    expect(budget.costCoverage.employeesWithCostBand).toBe(1);
    expect(budget.costCoverage.employeesWithoutCostBand).toBe(1);
  });

  it('computes timeline earliestStart and latestEnd correctly', async () => {
    const paId = testUuid('701');
    const scenario = mockScenarioResult({
      allocations: [
        mockAllocation({
          id: testUuid('301'),
          startDate: new Date('2026-01-15'),
          endDate: new Date('2026-02-28'),
          initiative: mockInitiative(testUuid('501'), { portfolioAreaId: paId }),
        }),
        mockAllocation({
          id: testUuid('302'),
          startDate: new Date('2026-02-01'),
          endDate: new Date('2026-04-15'),
          initiative: mockInitiative(testUuid('502'), { portfolioAreaId: paId }),
        }),
      ],
    });
    mockPrisma.scenario.findUnique.mockResolvedValue(scenario);

    const result = await rollupService.rollupByPortfolioArea(testUuid('100'));

    const timeline = result.groups[0].timeline;
    expect(timeline.earliestStart).toBe(new Date('2026-01-15').toISOString());
    expect(timeline.latestEnd).toBe(new Date('2026-04-15').toISOString());
  });

  it('returns null scope when planningMode is LEGACY', async () => {
    const scenario = mockScenarioResult({ planningMode: 'LEGACY' });
    mockPrisma.scenario.findUnique.mockResolvedValue(scenario);

    const result = await rollupService.rollupByPortfolioArea(testUuid('100'));

    expect(result.groups[0].scope).toBeNull();
    expect(result.totals.scope).toBeNull();
  });

  it('aggregates token demands by skill pool when planningMode is TOKEN', async () => {
    const initId = testUuid('501');
    const scenario = mockScenarioResult({
      planningMode: 'TOKEN',
      allocations: [
        mockAllocation({
          id: testUuid('301'),
          initiative: mockInitiative(initId, { portfolioAreaId: testUuid('701') }),
        }),
      ],
    });
    mockPrisma.scenario.findUnique.mockResolvedValue(scenario);
    mockPrisma.tokenDemand.findMany.mockResolvedValue([
      {
        initiativeId: initId,
        skillPoolId: testUuid('a01'),
        tokensP50: 50,
        tokensP90: 80,
        skillPool: { id: testUuid('a01'), name: 'Backend' },
      },
      {
        initiativeId: initId,
        skillPoolId: testUuid('a02'),
        tokensP50: 30,
        tokensP90: 45,
        skillPool: { id: testUuid('a02'), name: 'Frontend' },
      },
    ]);

    const result = await rollupService.rollupByPortfolioArea(testUuid('100'));

    const scope = result.groups[0].scope;
    expect(scope).not.toBeNull();
    expect(scope!.totalTokensP50).toBe(80);
    expect(scope!.totalTokensP90).toBe(125);
    expect(scope!.bySkillPool).toHaveLength(2);

    // Totals scope should also be populated
    expect(result.totals.scope).not.toBeNull();
    expect(result.totals.scope!.totalTokensP50).toBe(80);
  });

  it('returns empty groups and zero totals for empty scenario', async () => {
    const scenario = mockScenarioResult({ allocations: [] });
    mockPrisma.scenario.findUnique.mockResolvedValue(scenario);

    const result = await rollupService.rollupByPortfolioArea(testUuid('100'));

    expect(result.groups).toHaveLength(0);
    expect(result.unattributed.initiativeCount).toBe(0);
    expect(result.totals.budget.totalHours).toBe(0);
    expect(result.totals.budget.totalEstimatedCost).toBe(0);
    expect(result.totals.timeline.earliestStart).toBeNull();
    expect(result.totals.timeline.latestEnd).toBeNull();
    expect(result.totals.timeline.totalAllocatedHours).toBe(0);
  });

  it('computes totals that sum across all groups correctly', async () => {
    const scenario = mockScenarioResult({
      allocations: [
        mockAllocation({
          id: testUuid('301'),
          initiative: mockInitiative(testUuid('501'), {
            portfolioAreaId: testUuid('701'),
            portfolioAreaName: 'Growth',
          }),
          allocationPeriods: [
            { periodId: testUuid('901'), hoursInPeriod: 200, period: mockPeriod(testUuid('901')) },
          ],
        }),
        mockAllocation({
          id: testUuid('302'),
          initiative: mockInitiative(testUuid('502'), {
            portfolioAreaId: testUuid('702'),
            portfolioAreaName: 'Platform',
          }),
          allocationPeriods: [
            { periodId: testUuid('902'), hoursInPeriod: 300, period: mockPeriod(testUuid('902')) },
          ],
        }),
      ],
    });
    mockPrisma.scenario.findUnique.mockResolvedValue(scenario);

    const result = await rollupService.rollupByPortfolioArea(testUuid('100'));

    expect(result.totals.budget.totalHours).toBe(500);
    expect(result.totals.budget.totalEstimatedCost).toBe(500 * 100); // default hourlyRate = 100
    expect(result.totals.timeline.totalAllocatedHours).toBe(500);
  });
});

// ============================================================================
// rollupByBusinessOwner
// ============================================================================

describe('rollupByBusinessOwner', () => {
  it('groups allocations by businessOwnerId', async () => {
    const scenario = mockScenarioResult({
      allocations: [
        mockAllocation({
          id: testUuid('301'),
          initiative: mockInitiative(testUuid('501'), {
            businessOwnerId: testUuid('801'),
            businessOwnerName: 'Alice',
          }),
        }),
        mockAllocation({
          id: testUuid('302'),
          initiative: mockInitiative(testUuid('502'), {
            businessOwnerId: testUuid('802'),
            businessOwnerName: 'Charlie',
          }),
        }),
      ],
    });
    mockPrisma.scenario.findUnique.mockResolvedValue(scenario);

    const result = await rollupService.rollupByBusinessOwner(testUuid('100'));

    expect(result.lens).toBe('BUSINESS_OWNER');
    expect(result.groups).toHaveLength(2);
    const groupNames = result.groups.map((g) => g.groupName).sort();
    expect(groupNames).toEqual(['Alice', 'Charlie']);
  });

  it('uses businessOwner.name for groupName', async () => {
    const scenario = mockScenarioResult({
      allocations: [
        mockAllocation({
          id: testUuid('301'),
          initiative: mockInitiative(testUuid('501'), {
            businessOwnerId: testUuid('801'),
            businessOwnerName: 'Diana Prince',
          }),
        }),
      ],
    });
    mockPrisma.scenario.findUnique.mockResolvedValue(scenario);

    const result = await rollupService.rollupByBusinessOwner(testUuid('100'));

    expect(result.groups[0].groupName).toBe('Diana Prince');
    expect(result.groups[0].groupId).toBe(testUuid('801'));
  });

  it('aggregates multiple initiatives per owner', async () => {
    const ownerId = testUuid('801');
    const scenario = mockScenarioResult({
      allocations: [
        mockAllocation({
          id: testUuid('301'),
          initiative: mockInitiative(testUuid('501'), {
            businessOwnerId: ownerId,
            businessOwnerName: 'Owner A',
          }),
          allocationPeriods: [
            { periodId: testUuid('901'), hoursInPeriod: 100, period: mockPeriod(testUuid('901')) },
          ],
        }),
        mockAllocation({
          id: testUuid('302'),
          initiative: mockInitiative(testUuid('502'), {
            businessOwnerId: ownerId,
            businessOwnerName: 'Owner A',
          }),
          allocationPeriods: [
            { periodId: testUuid('902'), hoursInPeriod: 150, period: mockPeriod(testUuid('902')) },
          ],
        }),
      ],
    });
    mockPrisma.scenario.findUnique.mockResolvedValue(scenario);

    const result = await rollupService.rollupByBusinessOwner(testUuid('100'));

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].initiativeCount).toBe(2);
    expect(result.groups[0].budget.totalHours).toBe(250);
  });

  it('places allocations without initiatives into unattributed', async () => {
    const scenario = mockScenarioResult({
      allocations: [
        mockAllocation({
          id: testUuid('301'),
          initiative: null,
          initiativeId: null,
        }),
      ],
    });
    mockPrisma.scenario.findUnique.mockResolvedValue(scenario);

    const result = await rollupService.rollupByBusinessOwner(testUuid('100'));

    expect(result.groups).toHaveLength(0);
    expect(result.unattributed.budget.totalHours).toBe(480); // default 480 hours
  });

  it('returns empty groups for empty scenario', async () => {
    const scenario = mockScenarioResult({ allocations: [] });
    mockPrisma.scenario.findUnique.mockResolvedValue(scenario);

    const result = await rollupService.rollupByBusinessOwner(testUuid('100'));

    expect(result.groups).toHaveLength(0);
    expect(result.unattributed.initiativeCount).toBe(0);
    expect(result.totals.budget.totalHours).toBe(0);
  });
});

// ============================================================================
// rollupByOrgNode
// ============================================================================

describe('rollupByOrgNode', () => {
  const orgNodeId1 = testUuid('601');
  const orgNodeId2 = testUuid('602');

  beforeEach(() => {
    mockPrisma.orgNode.findMany.mockResolvedValue([
      { id: orgNodeId1, name: 'Engineering' },
      { id: orgNodeId2, name: 'Design' },
    ]);
  });

  it('groups allocations by employee org membership', async () => {
    const emp1 = mockEmployee(testUuid('401'), {
      orgMemberships: [
        { orgNodeId: orgNodeId1, effectiveStart: new Date('2025-01-01'), effectiveEnd: null },
      ],
    });
    const emp2 = mockEmployee(testUuid('402'), {
      orgMemberships: [
        { orgNodeId: orgNodeId2, effectiveStart: new Date('2025-01-01'), effectiveEnd: null },
      ],
    });

    const scenario = mockScenarioResult({
      allocations: [
        mockAllocation({
          id: testUuid('301'),
          employeeId: testUuid('401'),
          employee: emp1,
        }),
        mockAllocation({
          id: testUuid('302'),
          employeeId: testUuid('402'),
          employee: emp2,
        }),
      ],
    });
    mockPrisma.scenario.findUnique.mockResolvedValue(scenario);

    const result = await rollupService.rollupByOrgNode(testUuid('100'));

    expect(result.lens).toBe('ORG_NODE');
    expect(result.groups).toHaveLength(2);
    const names = result.groups.map((g) => g.groupName).sort();
    expect(names).toEqual(['Design', 'Engineering']);
  });

  it('uses OrgMembership when matrix_org_v1 is disabled', async () => {
    mockIsEnabled.mockResolvedValue(false);

    const emp = mockEmployee(testUuid('401'), {
      orgMemberships: [
        { orgNodeId: orgNodeId1, effectiveStart: new Date('2025-01-01'), effectiveEnd: null },
      ],
      orgUnitLinks: [
        {
          orgNodeId: orgNodeId2,
          relationshipType: 'PRIMARY_REPORTING',
          startDate: new Date('2025-01-01'),
          endDate: null,
        },
      ],
    });

    const scenario = mockScenarioResult({
      allocations: [
        mockAllocation({
          id: testUuid('301'),
          employeeId: testUuid('401'),
          employee: emp,
        }),
      ],
    });
    mockPrisma.scenario.findUnique.mockResolvedValue(scenario);

    const result = await rollupService.rollupByOrgNode(testUuid('100'));

    // Should use orgMemberships (orgNodeId1 = Engineering), not orgUnitLinks (orgNodeId2 = Design)
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].groupId).toBe(orgNodeId1);
    expect(result.groups[0].groupName).toBe('Engineering');
  });

  it('uses EmployeeOrgUnitLink with PRIMARY_REPORTING when matrix_org_v1 is enabled', async () => {
    mockIsEnabled.mockResolvedValue(true);

    const emp = mockEmployee(testUuid('401'), {
      orgMemberships: [
        { orgNodeId: orgNodeId1, effectiveStart: new Date('2025-01-01'), effectiveEnd: null },
      ],
      orgUnitLinks: [
        {
          orgNodeId: orgNodeId2,
          relationshipType: 'PRIMARY_REPORTING',
          startDate: new Date('2025-01-01'),
          endDate: null,
        },
        {
          orgNodeId: orgNodeId1,
          relationshipType: 'DELIVERY_ASSIGNMENT',
          startDate: new Date('2025-01-01'),
          endDate: null,
        },
      ],
    });

    const scenario = mockScenarioResult({
      allocations: [
        mockAllocation({
          id: testUuid('301'),
          employeeId: testUuid('401'),
          employee: emp,
        }),
      ],
    });
    mockPrisma.scenario.findUnique.mockResolvedValue(scenario);

    const result = await rollupService.rollupByOrgNode(testUuid('100'));

    // Should use orgUnitLinks with PRIMARY_REPORTING only (orgNodeId2 = Design)
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].groupId).toBe(orgNodeId2);
    expect(result.groups[0].groupName).toBe('Design');
  });

  it('splits hours proportionally when employee changes org mid-period', async () => {
    // Period: Jan 1 - Mar 31
    // Employee in Engineering until Feb 14, then in Design from Feb 14 onward
    const periodStart = new Date('2026-01-01');
    const periodEnd = new Date('2026-03-31');

    const emp = mockEmployee(testUuid('401'), {
      orgMemberships: [
        {
          orgNodeId: orgNodeId1, // Engineering
          effectiveStart: new Date('2025-01-01'),
          effectiveEnd: new Date('2026-02-14'),
        },
        {
          orgNodeId: orgNodeId2, // Design
          effectiveStart: new Date('2026-02-14'),
          effectiveEnd: null,
        },
      ],
    });

    const scenario = mockScenarioResult({
      period: {
        id: testUuid('200'),
        label: '2026-Q1',
        startDate: periodStart,
        endDate: periodEnd,
      },
      allocations: [
        mockAllocation({
          id: testUuid('301'),
          employeeId: testUuid('401'),
          employee: emp,
          startDate: periodStart,
          endDate: periodEnd,
          allocationPeriods: [
            {
              periodId: testUuid('901'),
              hoursInPeriod: 480,
              period: mockPeriod(testUuid('901')),
            },
          ],
        }),
      ],
    });
    mockPrisma.scenario.findUnique.mockResolvedValue(scenario);

    const result = await rollupService.rollupByOrgNode(testUuid('100'));

    // Both org nodes should appear
    expect(result.groups).toHaveLength(2);

    const engGroup = result.groups.find((g) => g.groupId === orgNodeId1);
    const designGroup = result.groups.find((g) => g.groupId === orgNodeId2);

    expect(engGroup).toBeDefined();
    expect(designGroup).toBeDefined();

    // Total hours should sum to 480 (within floating-point tolerance)
    const totalSplitHours =
      engGroup!.budget.totalHours + designGroup!.budget.totalHours;
    expect(totalSplitHours).toBeCloseTo(480, 0);

    // Engineering should have roughly half (Jan 1 - Feb 14 = 44 days out of 89)
    expect(engGroup!.budget.totalHours).toBeGreaterThan(200);
    expect(engGroup!.budget.totalHours).toBeLessThan(280);
  });

  it('places employees with no org membership into unattributed', async () => {
    const emp = mockEmployee(testUuid('401'), {
      orgMemberships: [],
      orgUnitLinks: [],
    });

    const scenario = mockScenarioResult({
      allocations: [
        mockAllocation({
          id: testUuid('301'),
          employeeId: testUuid('401'),
          employee: emp,
        }),
      ],
    });
    mockPrisma.scenario.findUnique.mockResolvedValue(scenario);

    const result = await rollupService.rollupByOrgNode(testUuid('100'));

    expect(result.groups).toHaveLength(0);
    expect(result.unattributed.budget.totalHours).toBe(480);
  });

  it('aggregates hours when multiple employees are in the same org', async () => {
    const emp1 = mockEmployee(testUuid('401'), {
      orgMemberships: [
        { orgNodeId: orgNodeId1, effectiveStart: new Date('2025-01-01'), effectiveEnd: null },
      ],
    });
    const emp2 = mockEmployee(testUuid('402'), {
      orgMemberships: [
        { orgNodeId: orgNodeId1, effectiveStart: new Date('2025-01-01'), effectiveEnd: null },
      ],
    });

    const scenario = mockScenarioResult({
      allocations: [
        mockAllocation({
          id: testUuid('301'),
          employeeId: testUuid('401'),
          employee: emp1,
          allocationPeriods: [
            { periodId: testUuid('901'), hoursInPeriod: 200, period: mockPeriod(testUuid('901')) },
          ],
        }),
        mockAllocation({
          id: testUuid('302'),
          employeeId: testUuid('402'),
          employee: emp2,
          allocationPeriods: [
            { periodId: testUuid('902'), hoursInPeriod: 300, period: mockPeriod(testUuid('902')) },
          ],
        }),
      ],
    });
    mockPrisma.scenario.findUnique.mockResolvedValue(scenario);

    const result = await rollupService.rollupByOrgNode(testUuid('100'));

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].groupId).toBe(orgNodeId1);
    expect(result.groups[0].budget.totalHours).toBe(500);
  });

  it('includes budget cost computed as hourlyRate times split hours', async () => {
    const emp = mockEmployee(testUuid('401'), {
      hourlyRate: 200,
      orgMemberships: [
        { orgNodeId: orgNodeId1, effectiveStart: new Date('2025-01-01'), effectiveEnd: null },
      ],
    });

    const scenario = mockScenarioResult({
      allocations: [
        mockAllocation({
          id: testUuid('301'),
          employeeId: testUuid('401'),
          employee: emp,
          allocationPeriods: [
            { periodId: testUuid('901'), hoursInPeriod: 100, period: mockPeriod(testUuid('901')) },
          ],
        }),
      ],
    });
    mockPrisma.scenario.findUnique.mockResolvedValue(scenario);

    const result = await rollupService.rollupByOrgNode(testUuid('100'));

    // Full overlap → ratio = 1.0, so 100 hours * $200/hr = $20,000
    expect(result.groups[0].budget.totalHours).toBe(100);
    expect(result.groups[0].budget.totalEstimatedCost).toBe(20000);
  });

  it('loads org node names from prisma.orgNode.findMany', async () => {
    mockPrisma.orgNode.findMany.mockResolvedValue([
      { id: orgNodeId1, name: 'Custom Team Alpha' },
    ]);

    const emp = mockEmployee(testUuid('401'), {
      orgMemberships: [
        { orgNodeId: orgNodeId1, effectiveStart: new Date('2025-01-01'), effectiveEnd: null },
      ],
    });

    const scenario = mockScenarioResult({
      allocations: [
        mockAllocation({
          id: testUuid('301'),
          employeeId: testUuid('401'),
          employee: emp,
        }),
      ],
    });
    mockPrisma.scenario.findUnique.mockResolvedValue(scenario);

    const result = await rollupService.rollupByOrgNode(testUuid('100'));

    expect(mockPrisma.orgNode.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      select: { id: true, name: true },
    });
    expect(result.groups[0].groupName).toBe('Custom Team Alpha');
  });
});

// ============================================================================
// Error handling
// ============================================================================

describe('error handling', () => {
  it('throws NotFoundError when scenario does not exist', async () => {
    mockPrisma.scenario.findUnique.mockResolvedValue(null);

    await expect(
      rollupService.rollupByPortfolioArea(testUuid('999'))
    ).rejects.toThrow('not found');
  });

  it('passes the correct scenarioId to findUnique', async () => {
    const scenarioId = testUuid('abc');
    mockPrisma.scenario.findUnique.mockResolvedValue(null);

    try {
      await rollupService.rollupByPortfolioArea(scenarioId);
    } catch {
      // expected
    }

    expect(mockPrisma.scenario.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: scenarioId },
      })
    );
  });
});
