import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';
import {
  getCachedData,
  setCachedData,
  deleteKey,
  CACHE_KEYS,
  CACHE_TTL,
} from '../lib/redis.js';
import type {
  CalculatorResult,
  CalculatorOptions,
  DemandBySkillPeriod,
  CapacityBySkillPeriod,
  Shortage,
  Overallocation,
  SkillMismatch,
  ScenarioAssumptions,
  SkillDemand,
  PriorityRanking,
  PeriodInfo,
} from '../types/index.js';
import { InitiativeStatus } from '@prisma/client';

const DEFAULT_HOURS_PER_PERIOD = 520; // 40 hours/week * 13 weeks (quarter default)

export class ScenarioCalculatorService {
  /**
   * Main entry point - returns full CalculatorResult
   */
  async calculate(
    scenarioId: string,
    options: CalculatorOptions = {}
  ): Promise<CalculatorResult> {
    const { skipCache = false, includeBreakdown = true } = options;

    // Check cache first (unless skipCache is true)
    if (!skipCache) {
      const cacheKey = CACHE_KEYS.scenarioCalculation(scenarioId);
      const cached = await getCachedData<CalculatorResult>(cacheKey);
      if (cached) {
        return {
          ...cached,
          cacheHit: true,
          cacheExpiry: new Date(Date.now() + CACHE_TTL.CALCULATION * 1000),
        };
      }
    }

    // Get scenario with all related data
    const scenario = await prisma.scenario.findUnique({
      where: { id: scenarioId },
      include: {
        period: true,
        allocations: {
          include: {
            employee: {
              include: {
                skills: true,
                capacityCalendar: {
                  include: {
                    period: true,
                  },
                },
              },
            },
            initiative: true,
            allocationPeriods: {
              include: {
                period: true,
              },
            },
          },
        },
      },
    });

    if (!scenario) {
      throw new NotFoundError('Scenario', scenarioId);
    }

    const assumptions = this.parseAssumptions(scenario.assumptions);
    const priorityRankings = (scenario.priorityRankings as unknown as PriorityRanking[]) || [];

    // Build period info from scenario's single period
    const periods: PeriodInfo[] = [{
      periodId: scenario.period.id,
      periodLabel: scenario.period.label,
      periodType: scenario.period.type,
      startDate: scenario.period.startDate,
      endDate: scenario.period.endDate,
    }];

    // Sort periods chronologically
    periods.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

    const periodIds = periods.map((p) => p.periodId);
    const periodLabelMap = new Map(periods.map((p) => [p.periodId, p.periodLabel]));

    // Calculate demand and capacity
    const demandBySkillPeriod = await this.calculateDemand(
      priorityRankings,
      periodIds,
      periodLabelMap,
      includeBreakdown
    );
    const capacityBySkillPeriod = await this.calculateCapacity(
      scenario.allocations,
      periodIds,
      periodLabelMap,
      assumptions,
      includeBreakdown
    );

    // Calculate gap analysis
    const gapAnalysis = this.calculateGapAnalysis(
      demandBySkillPeriod,
      capacityBySkillPeriod
    );

    // Identify issues
    const issues = await this.identifyIssues(
      scenarioId,
      demandBySkillPeriod,
      capacityBySkillPeriod,
      periodIds,
      periodLabelMap
    );

    // Calculate summary
    const summary = this.calculateSummary(
      demandBySkillPeriod,
      capacityBySkillPeriod,
      issues,
      periods,
      priorityRankings,
      scenario.allocations
    );

    const result: CalculatorResult = {
      scenarioId,
      scenarioName: scenario.name,
      periods,
      calculatedAt: new Date(),
      demandBySkillPeriod,
      capacityBySkillPeriod,
      gapAnalysis,
      issues,
      summary,
      cacheHit: false,
    };

    // Cache the result
    const cacheKey = CACHE_KEYS.scenarioCalculation(scenarioId);
    await setCachedData(cacheKey, result, CACHE_TTL.CALCULATION);

    return result;
  }

  /**
   * Calculate demand by skill/period from approved scope items
   */
  private async calculateDemand(
    priorityRankings: PriorityRanking[],
    periodIds: string[],
    periodLabelMap: Map<string, string>,
    includeBreakdown: boolean
  ): Promise<DemandBySkillPeriod[]> {
    if (priorityRankings.length === 0) {
      return [];
    }

    // Create a map of initiative ID to rank
    const rankMap = new Map(
      priorityRankings.map((pr) => [pr.initiativeId, pr.rank])
    );

    // Fetch only APPROVED initiatives that are in the priority list, with their period distributions
    const initiatives = await prisma.initiative.findMany({
      where: {
        id: { in: priorityRankings.map((pr) => pr.initiativeId) },
        status: { in: [InitiativeStatus.RESOURCING, InitiativeStatus.IN_EXECUTION] },
      },
      include: {
        scopeItems: {
          include: {
            periodDistributions: true,
          },
        },
      },
    });

    // Build demand aggregation: Map<periodId, Map<skill, { total, breakdown }>>
    const demandMap = new Map<
      string,
      Map<
        string,
        {
          totalHours: number;
          breakdown: Array<{
            initiativeId: string;
            initiativeTitle: string;
            hours: number;
            rank: number;
          }>;
        }
      >
    >();

    // Initialize the map for all periods
    for (const periodId of periodIds) {
      demandMap.set(periodId, new Map());
    }

    // Process each initiative's scope items
    for (const initiative of initiatives) {
      const rank = rankMap.get(initiative.id) || 0;

      for (const scopeItem of initiative.scopeItems) {
        const skillDemand = (scopeItem.skillDemand as SkillDemand) || {};

        // Build a distribution map for this scope item
        const distributionMap = new Map<string, number>();
        for (const pd of scopeItem.periodDistributions) {
          distributionMap.set(pd.periodId, pd.distribution);
        }

        for (const periodId of periodIds) {
          const distribution = distributionMap.get(periodId) || 0;
          if (distribution === 0) continue;

          const periodMap = demandMap.get(periodId)!;

          for (const [skill, hours] of Object.entries(skillDemand)) {
            const hoursForPeriod = (hours as number) * distribution;

            if (!periodMap.has(skill)) {
              periodMap.set(skill, { totalHours: 0, breakdown: [] });
            }

            const skillData = periodMap.get(skill)!;
            skillData.totalHours += hoursForPeriod;
            skillData.breakdown.push({
              initiativeId: initiative.id,
              initiativeTitle: initiative.title,
              hours: hoursForPeriod,
              rank,
            });
          }
        }
      }
    }

    // Convert to array format
    const result: DemandBySkillPeriod[] = [];

    for (const [periodId, skillMap] of demandMap) {
      for (const [skill, data] of skillMap) {
        result.push({
          periodId,
          periodLabel: periodLabelMap.get(periodId) || '',
          skill,
          totalHours: data.totalHours,
          initiativeBreakdown: includeBreakdown
            ? data.breakdown.sort((a, b) => a.rank - b.rank)
            : [],
        });
      }
    }

    return result.sort((a, b) => {
      const periodCompare = a.periodLabel.localeCompare(b.periodLabel);
      if (periodCompare !== 0) return periodCompare;
      return a.skill.localeCompare(b.skill);
    });
  }

  /**
   * Calculate capacity by skill/period from employees
   */
  private async calculateCapacity(
    allocations: Array<{
      id: string;
      employeeId: string;
      percentage: number;
      startDate: Date;
      endDate: Date;
      employee: {
        id: string;
        name: string;
        hoursPerWeek: number;
        employmentType: string;
        skills: Array<{ name: string; proficiency: number }>;
        capacityCalendar: Array<{ periodId: string; hoursAvailable: number; period: { id: string } }>;
      };
      allocationPeriods: Array<{
        periodId: string;
        hoursInPeriod: number;
        overlapRatio: number;
        period: { id: string; label: string };
      }>;
    }>,
    periodIds: string[],
    periodLabelMap: Map<string, string>,
    assumptions: ScenarioAssumptions,
    includeBreakdown: boolean
  ): Promise<CapacityBySkillPeriod[]> {
    const {
      allocationCapPercentage = 100,
      bufferPercentage = 0,
      proficiencyWeightEnabled = true,
      includeContractors = true,
      hoursPerPeriod = DEFAULT_HOURS_PER_PERIOD,
    } = assumptions;

    // Build capacity aggregation: Map<periodId, Map<skill, { total, effective, breakdown }>>
    const capacityMap = new Map<
      string,
      Map<
        string,
        {
          totalHours: number;
          effectiveHours: number;
          breakdown: Array<{
            employeeId: string;
            employeeName: string;
            baseHours: number;
            proficiency: number;
            effectiveHours: number;
            allocationPercentage: number;
          }>;
        }
      >
    >();

    // Initialize the map for all periods
    for (const periodId of periodIds) {
      capacityMap.set(periodId, new Map());
    }

    // Get unique employees from allocations
    const employeeAllocations = new Map<
      string,
      {
        employee: (typeof allocations)[0]['employee'];
        allocations: Array<{
          percentage: number;
          allocationPeriods: (typeof allocations)[0]['allocationPeriods'];
        }>;
      }
    >();

    for (const allocation of allocations) {
      // Skip contractors if not included
      if (
        !includeContractors &&
        allocation.employee.employmentType === 'CONTRACTOR'
      ) {
        continue;
      }

      if (!employeeAllocations.has(allocation.employeeId)) {
        employeeAllocations.set(allocation.employeeId, {
          employee: allocation.employee,
          allocations: [],
        });
      }

      employeeAllocations.get(allocation.employeeId)!.allocations.push({
        percentage: allocation.percentage,
        allocationPeriods: allocation.allocationPeriods,
      });
    }

    // Process each employee
    for (const [employeeId, data] of employeeAllocations) {
      const { employee, allocations: empAllocations } = data;

      for (const periodId of periodIds) {
        // Calculate total allocation percentage for this period using AllocationPeriod junction
        let totalAllocationPercentage = 0;
        for (const alloc of empAllocations) {
          const periodAlloc = alloc.allocationPeriods.find((ap) => ap.periodId === periodId);
          if (periodAlloc) {
            totalAllocationPercentage += alloc.percentage * periodAlloc.overlapRatio;
          }
        }

        // Cap at allocationCapPercentage
        const effectiveAllocationPercentage = Math.min(
          totalAllocationPercentage,
          allocationCapPercentage
        );

        if (effectiveAllocationPercentage === 0) continue;

        // Calculate base hours from capacity calendar or default
        const baseHours = this.getBaseHoursForPeriod(
          employee.capacityCalendar,
          periodId,
          employee.hoursPerWeek,
          hoursPerPeriod
        );

        const periodMap = capacityMap.get(periodId)!;

        // Add capacity for each skill
        for (const skill of employee.skills) {
          const proficiencyMultiplier = proficiencyWeightEnabled
            ? skill.proficiency / 5
            : 1;
          const bufferMultiplier = 1 - bufferPercentage / 100;

          const allocatedHours =
            baseHours * (effectiveAllocationPercentage / 100);
          const effectiveHours =
            allocatedHours * proficiencyMultiplier * bufferMultiplier;

          if (!periodMap.has(skill.name)) {
            periodMap.set(skill.name, {
              totalHours: 0,
              effectiveHours: 0,
              breakdown: [],
            });
          }

          const skillData = periodMap.get(skill.name)!;
          skillData.totalHours += allocatedHours;
          skillData.effectiveHours += effectiveHours;
          skillData.breakdown.push({
            employeeId,
            employeeName: employee.name,
            baseHours: allocatedHours,
            proficiency: skill.proficiency,
            effectiveHours,
            allocationPercentage: effectiveAllocationPercentage,
          });
        }
      }
    }

    // Convert to array format
    const result: CapacityBySkillPeriod[] = [];

    for (const [periodId, skillMap] of capacityMap) {
      for (const [skill, data] of skillMap) {
        result.push({
          periodId,
          periodLabel: periodLabelMap.get(periodId) || '',
          skill,
          totalHours: data.totalHours,
          effectiveHours: data.effectiveHours,
          employeeBreakdown: includeBreakdown ? data.breakdown : [],
        });
      }
    }

    return result.sort((a, b) => {
      const periodCompare = a.periodLabel.localeCompare(b.periodLabel);
      if (periodCompare !== 0) return periodCompare;
      return a.skill.localeCompare(b.skill);
    });
  }

  /**
   * Calculate gap analysis between demand and capacity
   */
  private calculateGapAnalysis(
    demand: DemandBySkillPeriod[],
    capacity: CapacityBySkillPeriod[]
  ): Array<{
    periodId: string;
    periodLabel: string;
    skill: string;
    demandHours: number;
    capacityHours: number;
    gap: number;
    utilizationPercentage: number;
  }> {
    // Create a map of capacity by period/skill
    const capacityMap = new Map<string, number>();
    for (const cap of capacity) {
      capacityMap.set(`${cap.periodId}:${cap.skill}`, cap.effectiveHours);
    }

    // Create a map of demand by period/skill
    const demandMap = new Map<string, number>();
    for (const dem of demand) {
      demandMap.set(`${dem.periodId}:${dem.skill}`, dem.totalHours);
    }

    // Build label map from both datasets
    const labelMap = new Map<string, string>();
    for (const d of demand) labelMap.set(d.periodId, d.periodLabel);
    for (const c of capacity) labelMap.set(c.periodId, c.periodLabel);

    // Get all unique period/skill combinations
    const allKeys = new Set([...capacityMap.keys(), ...demandMap.keys()]);

    const result: Array<{
      periodId: string;
      periodLabel: string;
      skill: string;
      demandHours: number;
      capacityHours: number;
      gap: number;
      utilizationPercentage: number;
    }> = [];

    for (const key of allKeys) {
      const [periodId, skill] = key.split(':');
      const demandHours = demandMap.get(key) || 0;
      const capacityHours = capacityMap.get(key) || 0;
      const gap = capacityHours - demandHours;
      const utilizationPercentage =
        capacityHours > 0 ? (demandHours / capacityHours) * 100 : demandHours > 0 ? Infinity : 0;

      result.push({
        periodId,
        periodLabel: labelMap.get(periodId) || '',
        skill,
        demandHours,
        capacityHours,
        gap,
        utilizationPercentage:
          utilizationPercentage === Infinity ? 100 : utilizationPercentage,
      });
    }

    return result.sort((a, b) => {
      const periodCompare = a.periodLabel.localeCompare(b.periodLabel);
      if (periodCompare !== 0) return periodCompare;
      return a.skill.localeCompare(b.skill);
    });
  }

  /**
   * Identify issues: shortages, overallocations, skill mismatches
   */
  private async identifyIssues(
    scenarioId: string,
    demand: DemandBySkillPeriod[],
    capacity: CapacityBySkillPeriod[],
    periodIds: string[],
    periodLabelMap: Map<string, string>
  ): Promise<{
    shortages: Shortage[];
    overallocations: Overallocation[];
    skillMismatches: SkillMismatch[];
  }> {
    const shortages = this.identifyShortages(demand, capacity);
    const overallocations = await this.identifyOverallocations(
      scenarioId,
      periodIds,
      periodLabelMap
    );
    const skillMismatches = await this.identifySkillMismatches(scenarioId);

    return {
      shortages,
      overallocations,
      skillMismatches,
    };
  }

  /**
   * Identify skill shortages
   */
  private identifyShortages(
    demand: DemandBySkillPeriod[],
    capacity: CapacityBySkillPeriod[]
  ): Shortage[] {
    const capacityMap = new Map<string, number>();
    for (const cap of capacity) {
      capacityMap.set(`${cap.periodId}:${cap.skill}`, cap.effectiveHours);
    }

    const shortages: Shortage[] = [];

    for (const dem of demand) {
      const key = `${dem.periodId}:${dem.skill}`;
      const capacityHours = capacityMap.get(key) || 0;
      const gap = capacityHours - dem.totalHours;

      if (gap < 0) {
        const shortageHours = Math.abs(gap);
        const shortagePercentage =
          dem.totalHours > 0 ? (shortageHours / dem.totalHours) * 100 : 0;

        shortages.push({
          periodId: dem.periodId,
          periodLabel: dem.periodLabel,
          skill: dem.skill,
          demandHours: dem.totalHours,
          capacityHours,
          shortageHours,
          shortagePercentage,
          severity: this.calculateSeverity(shortagePercentage),
          affectedInitiatives: dem.initiativeBreakdown.map((init) => ({
            initiativeId: init.initiativeId,
            initiativeTitle: init.initiativeTitle,
            demandHours: init.hours,
          })),
        });
      }
    }

    return shortages.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const severityCompare =
        severityOrder[a.severity] - severityOrder[b.severity];
      if (severityCompare !== 0) return severityCompare;
      return b.shortagePercentage - a.shortagePercentage;
    });
  }

  /**
   * Identify employee overallocations (>100% in a period)
   */
  private async identifyOverallocations(
    scenarioId: string,
    periodIds: string[],
    periodLabelMap: Map<string, string>
  ): Promise<Overallocation[]> {
    const allocations = await prisma.allocation.findMany({
      where: { scenarioId },
      include: {
        employee: {
          select: {
            id: true,
            name: true,
          },
        },
        initiative: {
          select: {
            id: true,
            title: true,
          },
        },
        allocationPeriods: true,
      },
    });

    // Group allocations by employee and period
    const employeePeriodAllocations = new Map<
      string,
      {
        employeeId: string;
        employeeName: string;
        periodId: string;
        totalPercentage: number;
        allocations: Array<{
          initiativeId: string | null;
          initiativeTitle: string | null;
          percentage: number;
          startDate: Date;
          endDate: Date;
        }>;
      }
    >();

    for (const allocation of allocations) {
      for (const periodId of periodIds) {
        const ap = allocation.allocationPeriods.find((a) => a.periodId === periodId);
        if (!ap || ap.overlapRatio === 0) continue;

        const key = `${allocation.employeeId}:${periodId}`;
        if (!employeePeriodAllocations.has(key)) {
          employeePeriodAllocations.set(key, {
            employeeId: allocation.employeeId,
            employeeName: allocation.employee.name,
            periodId,
            totalPercentage: 0,
            allocations: [],
          });
        }

        const data = employeePeriodAllocations.get(key)!;
        const effectivePercentage = allocation.percentage * ap.overlapRatio;
        data.totalPercentage += effectivePercentage;
        data.allocations.push({
          initiativeId: allocation.initiativeId,
          initiativeTitle: allocation.initiative?.title || null,
          percentage: effectivePercentage,
          startDate: allocation.startDate,
          endDate: allocation.endDate,
        });
      }
    }

    // Find overallocations (>100%)
    const overallocations: Overallocation[] = [];

    for (const data of employeePeriodAllocations.values()) {
      if (data.totalPercentage > 100) {
        overallocations.push({
          employeeId: data.employeeId,
          employeeName: data.employeeName,
          periodId: data.periodId,
          periodLabel: periodLabelMap.get(data.periodId) || '',
          totalAllocationPercentage: data.totalPercentage,
          overallocationPercentage: data.totalPercentage - 100,
          allocations: data.allocations,
        });
      }
    }

    return overallocations.sort(
      (a, b) => b.overallocationPercentage - a.overallocationPercentage
    );
  }

  /**
   * Identify skill mismatches (allocations to initiatives without required skills)
   */
  private async identifySkillMismatches(
    scenarioId: string
  ): Promise<SkillMismatch[]> {
    const allocations = await prisma.allocation.findMany({
      where: {
        scenarioId,
        initiativeId: { not: null },
      },
      include: {
        employee: {
          include: {
            skills: true,
          },
        },
        initiative: {
          include: {
            scopeItems: true,
          },
        },
      },
    });

    const mismatches: SkillMismatch[] = [];

    for (const allocation of allocations) {
      if (!allocation.initiative) continue;

      // Get required skills from initiative's scope items
      const requiredSkills = new Set<string>();
      for (const scopeItem of allocation.initiative.scopeItems) {
        const skillDemand = (scopeItem.skillDemand as SkillDemand) || {};
        for (const skill of Object.keys(skillDemand)) {
          requiredSkills.add(skill);
        }
      }

      if (requiredSkills.size === 0) continue;

      // Get employee skills
      const employeeSkills = new Set(
        allocation.employee.skills.map((s) => s.name)
      );

      // Find missing skills
      const missingSkills = [...requiredSkills].filter(
        (skill) => !employeeSkills.has(skill)
      );

      if (missingSkills.length > 0) {
        mismatches.push({
          employeeId: allocation.employeeId,
          employeeName: allocation.employee.name,
          initiativeId: allocation.initiative.id,
          initiativeTitle: allocation.initiative.title,
          requiredSkills: [...requiredSkills],
          employeeSkills: [...employeeSkills],
          missingSkills,
        });
      }
    }

    return mismatches;
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(
    demand: DemandBySkillPeriod[],
    capacity: CapacityBySkillPeriod[],
    issues: {
      shortages: Shortage[];
      overallocations: Overallocation[];
      skillMismatches: SkillMismatch[];
    },
    periods: PeriodInfo[],
    priorityRankings: PriorityRanking[],
    allocations: Array<{ employeeId: string }>
  ): CalculatorResult['summary'] {
    const totalDemandHours = demand.reduce((sum, d) => sum + d.totalHours, 0);
    const totalCapacityHours = capacity.reduce(
      (sum, c) => sum + c.effectiveHours,
      0
    );
    const overallGap = totalCapacityHours - totalDemandHours;
    const overallUtilization =
      totalCapacityHours > 0
        ? (totalDemandHours / totalCapacityHours) * 100
        : 0;

    // Count unique skills
    const allSkills = new Set([
      ...demand.map((d) => d.skill),
      ...capacity.map((c) => c.skill),
    ]);

    // Count unique employees
    const uniqueEmployees = new Set(allocations.map((a) => a.employeeId));

    return {
      totalDemandHours,
      totalCapacityHours,
      overallGap,
      overallUtilization,
      totalShortages: issues.shortages.length,
      totalOverallocations: issues.overallocations.length,
      totalSkillMismatches: issues.skillMismatches.length,
      periodCount: periods.length,
      skillCount: allSkills.size,
      employeeCount: uniqueEmployees.size,
      initiativeCount: priorityRankings.length,
    };
  }

  /**
   * Invalidate cached calculations for a scenario
   */
  async invalidateCache(scenarioId: string): Promise<void> {
    const cacheKey = CACHE_KEYS.scenarioCalculation(scenarioId);
    await deleteKey(cacheKey);
  }

  // Helper methods

  private parseAssumptions(
    assumptions: unknown
  ): ScenarioAssumptions {
    if (!assumptions || typeof assumptions !== 'object') {
      return {};
    }
    return assumptions as ScenarioAssumptions;
  }

  private getBaseHoursForPeriod(
    capacityCalendar: Array<{ periodId: string; hoursAvailable: number }>,
    periodId: string,
    hoursPerWeek: number,
    defaultHoursPerPeriod: number
  ): number {
    // Find capacity calendar entry for this period
    const entry = capacityCalendar.find((e) => e.periodId === periodId);

    if (entry) {
      return entry.hoursAvailable;
    }

    // Fall back to calculated hours: hoursPerWeek * 13 weeks (quarter default)
    return hoursPerWeek * 13 || defaultHoursPerPeriod;
  }

  private calculateSeverity(
    shortagePercentage: number
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (shortagePercentage >= 50) return 'critical';
    if (shortagePercentage >= 30) return 'high';
    if (shortagePercentage >= 15) return 'medium';
    return 'low';
  }
}

export const scenarioCalculatorService = new ScenarioCalculatorService();
