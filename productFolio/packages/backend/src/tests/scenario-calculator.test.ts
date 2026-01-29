import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScenarioCalculatorService } from '../services/scenario-calculator.service.js';
import { NotFoundError } from '../lib/errors.js';

// Mock Prisma Client
vi.mock('../lib/prisma.js', () => {
  const mockPrisma = {
    scenario: {
      findUnique: vi.fn(),
    },
    initiative: {
      findMany: vi.fn(),
    },
    allocation: {
      findMany: vi.fn(),
    },
  };

  return {
    prisma: mockPrisma,
  };
});

// Mock Redis
vi.mock('../lib/redis.js', () => {
  const cache = new Map<string, unknown>();

  return {
    getCachedData: vi.fn(async (key: string) => cache.get(key) || null),
    setCachedData: vi.fn(async (key: string, data: unknown) => {
      cache.set(key, data);
      return true;
    }),
    deleteKey: vi.fn(async (key: string) => {
      cache.delete(key);
      return true;
    }),
    CACHE_KEYS: {
      scenarioCalculation: (id: string) => `scenario:${id}:calculations`,
    },
    CACHE_TTL: {
      CALCULATION: 300,
    },
  };
});

import { prisma } from '../lib/prisma.js';
import { getCachedData, setCachedData, deleteKey } from '../lib/redis.js';

const mockPrisma = prisma as unknown as {
  scenario: { findUnique: ReturnType<typeof vi.fn> };
  initiative: { findMany: ReturnType<typeof vi.fn> };
  allocation: { findMany: ReturnType<typeof vi.fn> };
};

const mockGetCachedData = getCachedData as ReturnType<typeof vi.fn>;
const mockSetCachedData = setCachedData as ReturnType<typeof vi.fn>;
const mockDeleteKey = deleteKey as ReturnType<typeof vi.fn>;

describe('ScenarioCalculatorService', () => {
  let calculatorService: ScenarioCalculatorService;

  const scenarioId = '00000000-0000-0000-0000-000000000001';
  const initiativeId = '00000000-0000-0000-0000-000000000010';
  const employeeId = '00000000-0000-0000-0000-000000000020';

  const mockScenario = {
    id: scenarioId,
    name: 'Test Scenario',
    periodIds: [],
    assumptions: {
      allocationCapPercentage: 100,
      bufferPercentage: 0,
      proficiencyWeightEnabled: true,
    },
    priorityRankings: [{ initiativeId, rank: 1 }],
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    allocations: [
      {
        id: '00000000-0000-0000-0000-000000000030',
        scenarioId,
        employeeId,
        initiativeId,
        percentage: 100,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-06-30'),
        createdAt: new Date(),
        updatedAt: new Date(),
        employee: {
          id: employeeId,
          name: 'John Doe',
          hoursPerWeek: 40,
          employmentType: 'FULL_TIME',
          skills: [
            { name: 'frontend', proficiency: 5 },
            { name: 'backend', proficiency: 4 },
          ],
          capacityCalendar: [],
        },
        initiative: {
          id: initiativeId,
          title: 'Test Initiative',
          scopeItems: [
            {
              id: '00000000-0000-0000-0000-000000000040',
              name: 'Feature A',
              skillDemand: { frontend: 100, backend: 150 },
              periodDistributions: [],
            },
          ],
        },
      },
    ],
  };

  const mockApprovedInitiatives = [
    {
      id: initiativeId,
      title: 'Test Initiative',
      status: 'RESOURCING',
      scopeItems: [
        {
          id: '00000000-0000-0000-0000-000000000040',
          name: 'Feature A',
          skillDemand: { frontend: 100, backend: 150 },
          periodDistributions: [],
        },
      ],
    },
  ];

  // Allocation data for identifySkillMismatches (includes scopeItems in initiative)
  const mockAllocationsWithScopeItems = [
    {
      id: '00000000-0000-0000-0000-000000000030',
      scenarioId,
      employeeId,
      initiativeId,
      percentage: 100,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-06-30'),
      createdAt: new Date(),
      updatedAt: new Date(),
      employee: {
        id: employeeId,
        name: 'John Doe',
        skills: [
          { name: 'frontend', proficiency: 5 },
          { name: 'backend', proficiency: 4 },
        ],
      },
      initiative: {
        id: initiativeId,
        title: 'Test Initiative',
        scopeItems: [
          {
            id: '00000000-0000-0000-0000-000000000040',
            name: 'Feature A',
            skillDemand: { frontend: 100, backend: 150 },
          },
        ],
      },
    },
  ];

  // Allocation data for identifyOverallocations (simpler structure)
  const mockAllocationsForOverallocation = [
    {
      id: '00000000-0000-0000-0000-000000000030',
      scenarioId,
      employeeId,
      initiativeId,
      percentage: 100,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-06-30'),
      createdAt: new Date(),
      updatedAt: new Date(),
      employee: { id: employeeId, name: 'John Doe' },
      initiative: { id: initiativeId, title: 'Test Initiative' },
    },
  ];

  beforeEach(() => {
    calculatorService = new ScenarioCalculatorService();
    vi.clearAllMocks();

    // Reset mocks with default values
    mockPrisma.scenario.findUnique.mockResolvedValue(mockScenario);
    mockPrisma.initiative.findMany.mockResolvedValue(mockApprovedInitiatives);
    // Mock allocation.findMany to handle both calls (overallocation and skill mismatch)
    mockPrisma.allocation.findMany.mockImplementation((args: { where?: { initiativeId?: unknown } }) => {
      // If querying for allocations with initiatives (skill mismatch check)
      if (args?.where?.initiativeId) {
        return Promise.resolve(mockAllocationsWithScopeItems);
      }
      // Default: return allocations for overallocation check
      return Promise.resolve(mockAllocationsForOverallocation);
    });
    mockGetCachedData.mockResolvedValue(null);
  });

  describe('calculate', () => {
    it('should return full calculation result', async () => {
      const result = await calculatorService.calculate(scenarioId);

      expect(result).toBeDefined();
      expect(result.scenarioId).toBe(scenarioId);
      expect(result.scenarioName).toBe('Test Scenario');
      expect(result.periods).toEqual([]);
      expect(result.calculatedAt).toBeInstanceOf(Date);
      expect(result.cacheHit).toBe(false);
    });

    it('should include demand by skill/quarter', async () => {
      const result = await calculatorService.calculate(scenarioId);

      expect(result.demandBySkillQuarter).toBeDefined();
      expect(Array.isArray(result.demandBySkillQuarter)).toBe(true);

      // Check for frontend demand in Q1
      const frontendQ1 = result.demandBySkillQuarter.find(
        (d) => d.skill === 'frontend' && d.quarter === '2024-Q1'
      );
      expect(frontendQ1).toBeDefined();
      expect(frontendQ1!.totalHours).toBe(60); // 100 * 0.6
    });

    it('should include capacity by skill/quarter', async () => {
      const result = await calculatorService.calculate(scenarioId);

      expect(result.capacityBySkillQuarter).toBeDefined();
      expect(Array.isArray(result.capacityBySkillQuarter)).toBe(true);
    });

    it('should include gap analysis', async () => {
      const result = await calculatorService.calculate(scenarioId);

      expect(result.gapAnalysis).toBeDefined();
      expect(Array.isArray(result.gapAnalysis)).toBe(true);

      for (const gap of result.gapAnalysis) {
        expect(gap).toHaveProperty('quarter');
        expect(gap).toHaveProperty('skill');
        expect(gap).toHaveProperty('demandHours');
        expect(gap).toHaveProperty('capacityHours');
        expect(gap).toHaveProperty('gap');
        expect(gap).toHaveProperty('utilizationPercentage');
      }
    });

    it('should include issues', async () => {
      const result = await calculatorService.calculate(scenarioId);

      expect(result.issues).toBeDefined();
      expect(result.issues).toHaveProperty('shortages');
      expect(result.issues).toHaveProperty('overallocations');
      expect(result.issues).toHaveProperty('skillMismatches');
    });

    it('should include summary', async () => {
      const result = await calculatorService.calculate(scenarioId);

      expect(result.summary).toBeDefined();
      expect(result.summary).toHaveProperty('totalDemandHours');
      expect(result.summary).toHaveProperty('totalCapacityHours');
      expect(result.summary).toHaveProperty('overallGap');
      expect(result.summary).toHaveProperty('overallUtilization');
      expect(result.summary).toHaveProperty('totalShortages');
      expect(result.summary).toHaveProperty('totalOverallocations');
      expect(result.summary).toHaveProperty('totalSkillMismatches');
      expect(result.summary).toHaveProperty('quarterCount');
      expect(result.summary).toHaveProperty('skillCount');
      expect(result.summary).toHaveProperty('employeeCount');
      expect(result.summary).toHaveProperty('initiativeCount');
    });

    it('should throw NotFoundError when scenario does not exist', async () => {
      mockPrisma.scenario.findUnique.mockResolvedValue(null);

      await expect(calculatorService.calculate('non-existent-id')).rejects.toThrow(
        NotFoundError
      );
    });

    it('should return cached result when available', async () => {
      const cachedResult = {
        scenarioId,
        scenarioName: 'Cached Scenario',
        periodIds: [],
        calculatedAt: new Date(),
        demandBySkillQuarter: [],
        capacityBySkillQuarter: [],
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
          quarterCount: 2,
          skillCount: 0,
          employeeCount: 0,
          initiativeCount: 0,
        },
        cacheHit: false,
      };
      mockGetCachedData.mockResolvedValue(cachedResult);

      const result = await calculatorService.calculate(scenarioId);

      expect(result.cacheHit).toBe(true);
      expect(result.scenarioName).toBe('Cached Scenario');
      expect(mockPrisma.scenario.findUnique).not.toHaveBeenCalled();
    });

    it('should skip cache when skipCache option is true', async () => {
      const cachedResult = {
        scenarioId,
        scenarioName: 'Cached Scenario',
        cacheHit: false,
      };
      mockGetCachedData.mockResolvedValue(cachedResult);

      const result = await calculatorService.calculate(scenarioId, {
        skipCache: true,
      });

      expect(result.cacheHit).toBe(false);
      expect(result.scenarioName).toBe('Test Scenario');
      expect(mockGetCachedData).not.toHaveBeenCalled();
    });

    it('should cache result after calculation', async () => {
      await calculatorService.calculate(scenarioId);

      expect(mockSetCachedData).toHaveBeenCalledWith(
        expect.stringContaining(scenarioId),
        expect.any(Object),
        expect.any(Number)
      );
    });
  });

  describe('calculateDemand', () => {
    it('should only include RESOURCING/IN_EXECUTION initiatives', async () => {
      const result = await calculatorService.calculate(scenarioId);

      // Verify that initiative.findMany was called with APPROVED status filter
      expect(mockPrisma.initiative.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'RESOURCING',
          }),
        })
      );

      expect(result.demandBySkillQuarter.length).toBeGreaterThan(0);
    });

    it('should distribute demand across quarters', async () => {
      const result = await calculatorService.calculate(scenarioId);

      // frontend: 100 hours total, 60% in Q1, 40% in Q2
      const frontendQ1 = result.demandBySkillQuarter.find(
        (d) => d.skill === 'frontend' && d.quarter === '2024-Q1'
      );
      const frontendQ2 = result.demandBySkillQuarter.find(
        (d) => d.skill === 'frontend' && d.quarter === '2024-Q2'
      );

      expect(frontendQ1?.totalHours).toBe(60); // 100 * 0.6
      expect(frontendQ2?.totalHours).toBe(40); // 100 * 0.4
    });

    it('should include initiative breakdown sorted by rank', async () => {
      const result = await calculatorService.calculate(scenarioId);

      const frontendQ1 = result.demandBySkillQuarter.find(
        (d) => d.skill === 'frontend' && d.quarter === '2024-Q1'
      );

      expect(frontendQ1?.initiativeBreakdown.length).toBeGreaterThan(0);
      expect(frontendQ1?.initiativeBreakdown[0]).toHaveProperty('rank');
      expect(frontendQ1?.initiativeBreakdown[0]).toHaveProperty('initiativeId');
      expect(frontendQ1?.initiativeBreakdown[0]).toHaveProperty('initiativeTitle');
      expect(frontendQ1?.initiativeBreakdown[0]).toHaveProperty('hours');
    });

    it('should return empty array when no priority rankings', async () => {
      mockPrisma.scenario.findUnique.mockResolvedValue({
        ...mockScenario,
        priorityRankings: [],
      });

      const result = await calculatorService.calculate(scenarioId);

      expect(result.demandBySkillQuarter).toEqual([]);
    });
  });

  describe('calculateCapacity', () => {
    it('should apply proficiency weighting', async () => {
      const result = await calculatorService.calculate(scenarioId);

      // With proficiency enabled, frontend (prof 5) should have higher effective hours
      // than backend (prof 4) for the same base hours
      const frontendQ1 = result.capacityBySkillQuarter.find(
        (c) => c.skill === 'frontend' && c.quarter === '2024-Q1'
      );
      const backendQ1 = result.capacityBySkillQuarter.find(
        (c) => c.skill === 'backend' && c.quarter === '2024-Q1'
      );

      if (frontendQ1 && backendQ1) {
        // Same base hours, but frontend has proficiency 5/5 = 1.0
        // backend has proficiency 4/5 = 0.8
        expect(frontendQ1.effectiveHours).toBeGreaterThan(backendQ1.effectiveHours);
      }
    });

    it('should apply buffer percentage', async () => {
      mockPrisma.scenario.findUnique.mockResolvedValue({
        ...mockScenario,
        assumptions: {
          bufferPercentage: 20,
          proficiencyWeightEnabled: false,
        },
      });

      const result = await calculatorService.calculate(scenarioId);

      const frontendQ1 = result.capacityBySkillQuarter.find(
        (c) => c.skill === 'frontend' && c.quarter === '2024-Q1'
      );

      if (frontendQ1) {
        // With 20% buffer, effective hours should be 80% of total
        expect(frontendQ1.effectiveHours).toBeLessThan(frontendQ1.totalHours);
      }
    });

    it('should use capacity calendar when available', async () => {
      const capacityCalendarEntry = {
        period: new Date('2024-01-15'),
        hoursAvailable: 200,
      };

      mockPrisma.scenario.findUnique.mockResolvedValue({
        ...mockScenario,
        allocations: [
          {
            ...mockScenario.allocations[0],
            employee: {
              ...mockScenario.allocations[0].employee,
              capacityCalendar: [capacityCalendarEntry],
            },
          },
        ],
      });

      const result = await calculatorService.calculate(scenarioId);

      expect(result.capacityBySkillQuarter.length).toBeGreaterThan(0);
    });
  });

  describe('identifyShortages', () => {
    it('should detect shortages when demand exceeds capacity', async () => {
      // Create scenario with high demand and low capacity
      mockPrisma.initiative.findMany.mockResolvedValue([
        {
          ...mockApprovedInitiatives[0],
          scopeItems: [
            {
              id: '00000000-0000-0000-0000-000000000040',
              name: 'Feature A',
              skillDemand: { frontend: 10000 }, // Very high demand
              periodDistributions: [],
            },
          ],
        },
      ]);

      const result = await calculatorService.calculate(scenarioId);

      expect(result.issues.shortages.length).toBeGreaterThan(0);

      const shortage = result.issues.shortages[0];
      expect(shortage).toHaveProperty('quarter');
      expect(shortage).toHaveProperty('skill');
      expect(shortage).toHaveProperty('shortageHours');
      expect(shortage).toHaveProperty('severity');
      expect(shortage.shortageHours).toBeGreaterThan(0);
    });

    it('should calculate severity based on shortage percentage', async () => {
      mockPrisma.initiative.findMany.mockResolvedValue([
        {
          ...mockApprovedInitiatives[0],
          scopeItems: [
            {
              id: '00000000-0000-0000-0000-000000000040',
              name: 'Feature A',
              skillDemand: { frontend: 50000 }, // Massive demand for critical shortage
              periodDistributions: [],
            },
          ],
        },
      ]);

      const result = await calculatorService.calculate(scenarioId);

      const criticalShortage = result.issues.shortages.find(
        (s) => s.severity === 'critical'
      );
      expect(criticalShortage).toBeDefined();
    });
  });

  describe('identifyOverallocations', () => {
    it('should detect overallocations when employee is over 100%', async () => {
      // Create scenario with overlapping allocations for overallocation check
      const overallocatedAllocations = [
        {
          id: '00000000-0000-0000-0000-000000000030',
          scenarioId,
          employeeId,
          initiativeId,
          percentage: 80,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-03-31'),
          createdAt: new Date(),
          updatedAt: new Date(),
          employee: { id: employeeId, name: 'John Doe' },
          initiative: { id: initiativeId, title: 'Initiative A' },
        },
        {
          id: '00000000-0000-0000-0000-000000000031',
          scenarioId,
          employeeId,
          initiativeId: '00000000-0000-0000-0000-000000000011',
          percentage: 50, // 80 + 50 = 130% (overallocated)
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-03-31'),
          createdAt: new Date(),
          updatedAt: new Date(),
          employee: { id: employeeId, name: 'John Doe' },
          initiative: { id: '00000000-0000-0000-0000-000000000011', title: 'Initiative B' },
        },
      ];

      // Same allocations but with scopeItems for skill mismatch check
      const allocationsWithScopeItems = overallocatedAllocations.map((a) => ({
        ...a,
        employee: {
          ...a.employee,
          skills: [
            { name: 'frontend', proficiency: 5 },
            { name: 'backend', proficiency: 4 },
          ],
        },
        initiative: {
          ...a.initiative,
          scopeItems: [
            {
              id: '00000000-0000-0000-0000-000000000040',
              name: 'Feature A',
              skillDemand: { frontend: 100, backend: 150 },
            },
          ],
        },
      }));

      mockPrisma.allocation.findMany.mockImplementation((args: { where?: { initiativeId?: unknown } }) => {
        if (args?.where?.initiativeId) {
          return Promise.resolve(allocationsWithScopeItems);
        }
        return Promise.resolve(overallocatedAllocations);
      });

      const result = await calculatorService.calculate(scenarioId);

      expect(result.issues.overallocations.length).toBeGreaterThan(0);

      const overallocation = result.issues.overallocations[0];
      expect(overallocation.employeeId).toBe(employeeId);
      expect(overallocation.totalAllocationPercentage).toBeGreaterThan(100);
      expect(overallocation.overallocationPercentage).toBeGreaterThan(0);
    });
  });

  describe('identifySkillMismatches', () => {
    it('should detect skill mismatches', async () => {
      // Create allocation where employee lacks required skill
      const mismatchedAllocations = [
        {
          id: '00000000-0000-0000-0000-000000000030',
          scenarioId,
          employeeId,
          initiativeId,
          percentage: 100,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-03-31'),
          createdAt: new Date(),
          updatedAt: new Date(),
          employee: {
            id: employeeId,
            name: 'John Doe',
            skills: [{ name: 'frontend', proficiency: 5 }], // Only frontend
          },
          initiative: {
            id: initiativeId,
            title: 'Test Initiative',
            scopeItems: [
              {
                id: '00000000-0000-0000-0000-000000000040',
                skillDemand: { frontend: 100, devops: 50 }, // Requires devops
              },
            ],
          },
        },
      ];

      mockPrisma.allocation.findMany.mockResolvedValue(mismatchedAllocations);

      const result = await calculatorService.calculate(scenarioId);

      expect(result.issues.skillMismatches.length).toBeGreaterThan(0);

      const mismatch = result.issues.skillMismatches[0];
      expect(mismatch.employeeId).toBe(employeeId);
      expect(mismatch.missingSkills).toContain('devops');
    });
  });

  describe('invalidateCache', () => {
    it('should delete cache key for scenario', async () => {
      await calculatorService.invalidateCache(scenarioId);

      expect(mockDeleteKey).toHaveBeenCalledWith(
        expect.stringContaining(scenarioId)
      );
    });
  });

  describe('edge cases', () => {
    it('should handle empty allocations', async () => {
      mockPrisma.scenario.findUnique.mockResolvedValue({
        ...mockScenario,
        allocations: [],
      });

      const result = await calculatorService.calculate(scenarioId);

      expect(result.capacityBySkillQuarter).toEqual([]);
      expect(result.summary.employeeCount).toBe(0);
    });

    it('should handle null assumptions', async () => {
      mockPrisma.scenario.findUnique.mockResolvedValue({
        ...mockScenario,
        assumptions: null,
      });

      const result = await calculatorService.calculate(scenarioId);

      expect(result).toBeDefined();
    });

    it('should handle initiatives without scope items', async () => {
      mockPrisma.initiative.findMany.mockResolvedValue([
        {
          ...mockApprovedInitiatives[0],
          scopeItems: [],
        },
      ]);

      const result = await calculatorService.calculate(scenarioId);

      expect(result.demandBySkillQuarter).toEqual([]);
    });

    it('should exclude breakdown when includeBreakdown is false', async () => {
      const result = await calculatorService.calculate(scenarioId, {
        includeBreakdown: false,
      });

      for (const demand of result.demandBySkillQuarter) {
        expect(demand.initiativeBreakdown).toEqual([]);
      }

      for (const capacity of result.capacityBySkillQuarter) {
        expect(capacity.employeeBreakdown).toEqual([]);
      }
    });
  });
});
