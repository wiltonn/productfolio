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
  DemandBySkillQuarter,
  CapacityBySkillQuarter,
  Shortage,
  Overallocation,
  SkillMismatch,
  ScenarioAssumptions,
  SkillDemand,
  QuarterDistribution,
  PriorityRanking,
} from '../types/index.js';
import { InitiativeStatus } from '@prisma/client';

const DEFAULT_HOURS_PER_QUARTER = 520; // 40 hours/week * 13 weeks

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
        allocations: {
          include: {
            employee: {
              include: {
                skills: true,
                capacityCalendar: true,
              },
            },
            initiative: true,
          },
        },
      },
    });

    if (!scenario) {
      throw new NotFoundError('Scenario', scenarioId);
    }

    const assumptions = this.parseAssumptions(scenario.assumptions);
    const quarters = this.getQuartersInRange(scenario.quarterRange);
    const priorityRankings = (scenario.priorityRankings as unknown as PriorityRanking[]) || [];

    // Calculate demand and capacity
    const demandBySkillQuarter = await this.calculateDemand(
      priorityRankings,
      quarters,
      includeBreakdown
    );
    const capacityBySkillQuarter = await this.calculateCapacity(
      scenario.allocations,
      quarters,
      assumptions,
      includeBreakdown
    );

    // Calculate gap analysis
    const gapAnalysis = this.calculateGapAnalysis(
      demandBySkillQuarter,
      capacityBySkillQuarter
    );

    // Identify issues
    const issues = await this.identifyIssues(
      scenarioId,
      demandBySkillQuarter,
      capacityBySkillQuarter,
      quarters
    );

    // Calculate summary
    const summary = this.calculateSummary(
      demandBySkillQuarter,
      capacityBySkillQuarter,
      issues,
      quarters,
      priorityRankings,
      scenario.allocations
    );

    const result: CalculatorResult = {
      scenarioId,
      scenarioName: scenario.name,
      quarterRange: scenario.quarterRange,
      calculatedAt: new Date(),
      demandBySkillQuarter,
      capacityBySkillQuarter,
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
   * Calculate demand by skill/quarter from approved scope items
   */
  private async calculateDemand(
    priorityRankings: PriorityRanking[],
    quarters: string[],
    includeBreakdown: boolean
  ): Promise<DemandBySkillQuarter[]> {
    if (priorityRankings.length === 0) {
      return [];
    }

    // Create a map of initiative ID to rank
    const rankMap = new Map(
      priorityRankings.map((pr) => [pr.initiativeId, pr.rank])
    );

    // Fetch only APPROVED initiatives that are in the priority list
    const initiatives = await prisma.initiative.findMany({
      where: {
        id: { in: priorityRankings.map((pr) => pr.initiativeId) },
        status: InitiativeStatus.APPROVED,
      },
      include: {
        scopeItems: true,
      },
    });

    // Build demand aggregation: Map<quarter, Map<skill, { total, breakdown }>>
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

    // Initialize the map for all quarters
    for (const quarter of quarters) {
      demandMap.set(quarter, new Map());
    }

    // Process each initiative's scope items
    for (const initiative of initiatives) {
      const rank = rankMap.get(initiative.id) || 0;

      for (const scopeItem of initiative.scopeItems) {
        const skillDemand = (scopeItem.skillDemand as SkillDemand) || {};
        const quarterDistribution =
          (scopeItem.quarterDistribution as QuarterDistribution) || {};

        for (const quarter of quarters) {
          const distribution = quarterDistribution[quarter] || 0;
          if (distribution === 0) continue;

          const quarterMap = demandMap.get(quarter)!;

          for (const [skill, hours] of Object.entries(skillDemand)) {
            const hoursForQuarter = (hours as number) * distribution;

            if (!quarterMap.has(skill)) {
              quarterMap.set(skill, { totalHours: 0, breakdown: [] });
            }

            const skillData = quarterMap.get(skill)!;
            skillData.totalHours += hoursForQuarter;
            skillData.breakdown.push({
              initiativeId: initiative.id,
              initiativeTitle: initiative.title,
              hours: hoursForQuarter,
              rank,
            });
          }
        }
      }
    }

    // Convert to array format
    const result: DemandBySkillQuarter[] = [];

    for (const [quarter, skillMap] of demandMap) {
      for (const [skill, data] of skillMap) {
        result.push({
          quarter,
          skill,
          totalHours: data.totalHours,
          initiativeBreakdown: includeBreakdown
            ? data.breakdown.sort((a, b) => a.rank - b.rank)
            : [],
        });
      }
    }

    return result.sort((a, b) => {
      const quarterCompare = a.quarter.localeCompare(b.quarter);
      if (quarterCompare !== 0) return quarterCompare;
      return a.skill.localeCompare(b.skill);
    });
  }

  /**
   * Calculate capacity by skill/quarter from employees
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
        capacityCalendar: Array<{ period: Date; hoursAvailable: number }>;
      };
    }>,
    quarters: string[],
    assumptions: ScenarioAssumptions,
    includeBreakdown: boolean
  ): Promise<CapacityBySkillQuarter[]> {
    const {
      allocationCapPercentage = 100,
      bufferPercentage = 0,
      proficiencyWeightEnabled = true,
      includeContractors = true,
      hoursPerQuarter = DEFAULT_HOURS_PER_QUARTER,
    } = assumptions;

    // Build capacity aggregation: Map<quarter, Map<skill, { total, effective, breakdown }>>
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

    // Initialize the map for all quarters
    for (const quarter of quarters) {
      capacityMap.set(quarter, new Map());
    }

    // Get unique employees from allocations
    const employeeAllocations = new Map<
      string,
      {
        employee: (typeof allocations)[0]['employee'];
        allocations: Array<{
          percentage: number;
          startDate: Date;
          endDate: Date;
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
        startDate: allocation.startDate,
        endDate: allocation.endDate,
      });
    }

    // Process each employee
    for (const [employeeId, data] of employeeAllocations) {
      const { employee, allocations: empAllocations } = data;

      for (const quarter of quarters) {
        const quarterDates = this.getQuarterDates(quarter);

        // Calculate total allocation percentage for this quarter
        let totalAllocationPercentage = 0;
        for (const alloc of empAllocations) {
          const overlap = this.calculateDateOverlap(
            alloc.startDate,
            alloc.endDate,
            quarterDates.start,
            quarterDates.end
          );
          if (overlap > 0) {
            totalAllocationPercentage += alloc.percentage * overlap;
          }
        }

        // Cap at allocationCapPercentage
        const effectiveAllocationPercentage = Math.min(
          totalAllocationPercentage,
          allocationCapPercentage
        );

        if (effectiveAllocationPercentage === 0) continue;

        // Calculate base hours from capacity calendar or default
        const baseHours = this.getBaseHoursForQuarter(
          employee.capacityCalendar,
          quarterDates,
          employee.hoursPerWeek,
          hoursPerQuarter
        );

        const quarterMap = capacityMap.get(quarter)!;

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

          if (!quarterMap.has(skill.name)) {
            quarterMap.set(skill.name, {
              totalHours: 0,
              effectiveHours: 0,
              breakdown: [],
            });
          }

          const skillData = quarterMap.get(skill.name)!;
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
    const result: CapacityBySkillQuarter[] = [];

    for (const [quarter, skillMap] of capacityMap) {
      for (const [skill, data] of skillMap) {
        result.push({
          quarter,
          skill,
          totalHours: data.totalHours,
          effectiveHours: data.effectiveHours,
          employeeBreakdown: includeBreakdown ? data.breakdown : [],
        });
      }
    }

    return result.sort((a, b) => {
      const quarterCompare = a.quarter.localeCompare(b.quarter);
      if (quarterCompare !== 0) return quarterCompare;
      return a.skill.localeCompare(b.skill);
    });
  }

  /**
   * Calculate gap analysis between demand and capacity
   */
  private calculateGapAnalysis(
    demand: DemandBySkillQuarter[],
    capacity: CapacityBySkillQuarter[]
  ): Array<{
    quarter: string;
    skill: string;
    demandHours: number;
    capacityHours: number;
    gap: number;
    utilizationPercentage: number;
  }> {
    // Create a map of capacity by quarter/skill
    const capacityMap = new Map<string, number>();
    for (const cap of capacity) {
      capacityMap.set(`${cap.quarter}:${cap.skill}`, cap.effectiveHours);
    }

    // Create a map of demand by quarter/skill
    const demandMap = new Map<string, number>();
    for (const dem of demand) {
      demandMap.set(`${dem.quarter}:${dem.skill}`, dem.totalHours);
    }

    // Get all unique quarter/skill combinations
    const allKeys = new Set([...capacityMap.keys(), ...demandMap.keys()]);

    const result: Array<{
      quarter: string;
      skill: string;
      demandHours: number;
      capacityHours: number;
      gap: number;
      utilizationPercentage: number;
    }> = [];

    for (const key of allKeys) {
      const [quarter, skill] = key.split(':');
      const demandHours = demandMap.get(key) || 0;
      const capacityHours = capacityMap.get(key) || 0;
      const gap = capacityHours - demandHours;
      const utilizationPercentage =
        capacityHours > 0 ? (demandHours / capacityHours) * 100 : demandHours > 0 ? Infinity : 0;

      result.push({
        quarter,
        skill,
        demandHours,
        capacityHours,
        gap,
        utilizationPercentage:
          utilizationPercentage === Infinity ? 100 : utilizationPercentage,
      });
    }

    return result.sort((a, b) => {
      const quarterCompare = a.quarter.localeCompare(b.quarter);
      if (quarterCompare !== 0) return quarterCompare;
      return a.skill.localeCompare(b.skill);
    });
  }

  /**
   * Identify issues: shortages, overallocations, skill mismatches
   */
  private async identifyIssues(
    scenarioId: string,
    demand: DemandBySkillQuarter[],
    capacity: CapacityBySkillQuarter[],
    quarters: string[]
  ): Promise<{
    shortages: Shortage[];
    overallocations: Overallocation[];
    skillMismatches: SkillMismatch[];
  }> {
    const shortages = this.identifyShortages(demand, capacity);
    const overallocations = await this.identifyOverallocations(
      scenarioId,
      quarters
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
    demand: DemandBySkillQuarter[],
    capacity: CapacityBySkillQuarter[]
  ): Shortage[] {
    const capacityMap = new Map<string, number>();
    for (const cap of capacity) {
      capacityMap.set(`${cap.quarter}:${cap.skill}`, cap.effectiveHours);
    }

    const shortages: Shortage[] = [];

    for (const dem of demand) {
      const key = `${dem.quarter}:${dem.skill}`;
      const capacityHours = capacityMap.get(key) || 0;
      const gap = capacityHours - dem.totalHours;

      if (gap < 0) {
        const shortageHours = Math.abs(gap);
        const shortagePercentage =
          dem.totalHours > 0 ? (shortageHours / dem.totalHours) * 100 : 0;

        shortages.push({
          quarter: dem.quarter,
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
      // Sort by severity (critical first), then by shortage percentage
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const severityCompare =
        severityOrder[a.severity] - severityOrder[b.severity];
      if (severityCompare !== 0) return severityCompare;
      return b.shortagePercentage - a.shortagePercentage;
    });
  }

  /**
   * Identify employee overallocations (>100% in a quarter)
   */
  private async identifyOverallocations(
    scenarioId: string,
    quarters: string[]
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
      },
    });

    // Group allocations by employee and quarter
    const employeeQuarterAllocations = new Map<
      string,
      {
        employeeId: string;
        employeeName: string;
        quarter: string;
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
      for (const quarter of quarters) {
        const quarterDates = this.getQuarterDates(quarter);
        const overlap = this.calculateDateOverlap(
          allocation.startDate,
          allocation.endDate,
          quarterDates.start,
          quarterDates.end
        );

        if (overlap === 0) continue;

        const key = `${allocation.employeeId}:${quarter}`;
        if (!employeeQuarterAllocations.has(key)) {
          employeeQuarterAllocations.set(key, {
            employeeId: allocation.employeeId,
            employeeName: allocation.employee.name,
            quarter,
            totalPercentage: 0,
            allocations: [],
          });
        }

        const data = employeeQuarterAllocations.get(key)!;
        const effectivePercentage = allocation.percentage * overlap;
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

    for (const data of employeeQuarterAllocations.values()) {
      if (data.totalPercentage > 100) {
        overallocations.push({
          employeeId: data.employeeId,
          employeeName: data.employeeName,
          quarter: data.quarter,
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
    demand: DemandBySkillQuarter[],
    capacity: CapacityBySkillQuarter[],
    issues: {
      shortages: Shortage[];
      overallocations: Overallocation[];
      skillMismatches: SkillMismatch[];
    },
    quarters: string[],
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
      quarterCount: quarters.length,
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

  private getQuartersInRange(quarterRange: string): string[] {
    const [startQuarter, endQuarter] = quarterRange.split(':');
    const quarters: string[] = [];

    const [startYear, startQ] = startQuarter.split('-Q');
    const [endYear, endQ] = endQuarter.split('-Q');

    const startYearNum = parseInt(startYear, 10);
    const startQNum = parseInt(startQ, 10);
    const endYearNum = parseInt(endYear, 10);
    const endQNum = parseInt(endQ, 10);

    let currentYear = startYearNum;
    let currentQ = startQNum;

    while (
      currentYear < endYearNum ||
      (currentYear === endYearNum && currentQ <= endQNum)
    ) {
      quarters.push(`${currentYear}-Q${currentQ}`);
      currentQ++;
      if (currentQ > 4) {
        currentQ = 1;
        currentYear++;
      }
    }

    return quarters;
  }

  private getQuarterDates(quarter: string): { start: Date; end: Date } {
    const [year, q] = quarter.split('-Q');
    const yearNum = parseInt(year, 10);
    const qNum = parseInt(q, 10);

    const startMonth = (qNum - 1) * 3;
    const endMonth = startMonth + 2;

    const start = new Date(yearNum, startMonth, 1);
    const end = new Date(yearNum, endMonth + 1, 0); // Last day of end month

    return { start, end };
  }

  private calculateDateOverlap(
    allocStart: Date,
    allocEnd: Date,
    quarterStart: Date,
    quarterEnd: Date
  ): number {
    const overlapStart = new Date(
      Math.max(allocStart.getTime(), quarterStart.getTime())
    );
    const overlapEnd = new Date(
      Math.min(allocEnd.getTime(), quarterEnd.getTime())
    );

    if (overlapStart > overlapEnd) {
      return 0;
    }

    const overlapDays =
      (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24) +
      1;
    const quarterDays =
      (quarterEnd.getTime() - quarterStart.getTime()) / (1000 * 60 * 60 * 24) +
      1;

    return overlapDays / quarterDays;
  }

  private getBaseHoursForQuarter(
    capacityCalendar: Array<{ period: Date; hoursAvailable: number }>,
    quarterDates: { start: Date; end: Date },
    hoursPerWeek: number,
    defaultHoursPerQuarter: number
  ): number {
    // Filter capacity calendar entries that fall within the quarter
    const relevantEntries = capacityCalendar.filter((entry) => {
      const entryDate = new Date(entry.period);
      return entryDate >= quarterDates.start && entryDate <= quarterDates.end;
    });

    if (relevantEntries.length > 0) {
      // Sum up hours from capacity calendar
      return relevantEntries.reduce(
        (sum, entry) => sum + entry.hoursAvailable,
        0
      );
    }

    // Fall back to calculated hours: hoursPerWeek * 13 weeks
    return hoursPerWeek * 13 || defaultHoursPerQuarter;
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
