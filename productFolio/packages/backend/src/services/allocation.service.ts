import { prisma } from '../lib/prisma.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { scenarioCalculatorService } from './scenario-calculator.service.js';
import { enqueueScenarioRecompute, enqueueViewRefresh } from '../jobs/index.js';
import type { CreateAllocation, UpdateAllocation } from '../schemas/scenarios.schema.js';
import type { CapacityDemandResult, ScenarioComparison, SkillDemand, QuarterDistribution } from '../types/index.js';

interface AllocationWithDetails {
  id: string;
  scenarioId: string;
  employeeId: string;
  employeeName: string;
  initiativeId: string | null;
  initiativeTitle: string | null;
  startDate: Date;
  endDate: Date;
  percentage: number;
  createdAt: Date;
  updatedAt: Date;
}

export class AllocationService {
  async listByScenario(scenarioId: string): Promise<AllocationWithDetails[]> {
    // Check if scenario exists
    const scenario = await prisma.scenario.findUnique({
      where: { id: scenarioId },
    });

    if (!scenario) {
      throw new NotFoundError('Scenario', scenarioId);
    }

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
      orderBy: {
        createdAt: 'desc',
      },
    });

    return allocations.map((allocation) => ({
      id: allocation.id,
      scenarioId: allocation.scenarioId,
      employeeId: allocation.employeeId,
      employeeName: allocation.employee.name,
      initiativeId: allocation.initiativeId,
      initiativeTitle: allocation.initiative?.title ?? null,
      startDate: allocation.startDate,
      endDate: allocation.endDate,
      percentage: allocation.percentage,
      createdAt: allocation.createdAt,
      updatedAt: allocation.updatedAt,
    }));
  }

  async create(scenarioId: string, data: CreateAllocation): Promise<AllocationWithDetails> {
    // Check if scenario exists
    const scenario = await prisma.scenario.findUnique({
      where: { id: scenarioId },
    });

    if (!scenario) {
      throw new NotFoundError('Scenario', scenarioId);
    }

    // Check if employee exists
    const employee = await prisma.employee.findUnique({
      where: { id: data.employeeId },
    });

    if (!employee) {
      throw new NotFoundError('Employee', data.employeeId);
    }

    // Check if initiative exists (if provided)
    if (data.initiativeId) {
      const initiative = await prisma.initiative.findUnique({
        where: { id: data.initiativeId },
      });

      if (!initiative) {
        throw new NotFoundError('Initiative', data.initiativeId);
      }
    }

    const allocation = await prisma.allocation.create({
      data: {
        scenarioId,
        employeeId: data.employeeId,
        initiativeId: data.initiativeId || null,
        startDate: data.startDate,
        endDate: data.endDate,
        percentage: data.percentage,
      },
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

    // Invalidate calculator cache and enqueue background recomputation
    await scenarioCalculatorService.invalidateCache(scenarioId);
    await enqueueScenarioRecompute(scenarioId, 'allocation_change');
    await enqueueViewRefresh('all', 'allocation_change', [scenarioId]);

    return {
      id: allocation.id,
      scenarioId: allocation.scenarioId,
      employeeId: allocation.employeeId,
      employeeName: allocation.employee.name,
      initiativeId: allocation.initiativeId,
      initiativeTitle: allocation.initiative?.title ?? null,
      startDate: allocation.startDate,
      endDate: allocation.endDate,
      percentage: allocation.percentage,
      createdAt: allocation.createdAt,
      updatedAt: allocation.updatedAt,
    };
  }

  async update(id: string, data: UpdateAllocation): Promise<AllocationWithDetails> {
    // Check if allocation exists
    const allocation = await prisma.allocation.findUnique({
      where: { id },
    });

    if (!allocation) {
      throw new NotFoundError('Allocation', id);
    }

    // Check if initiative exists (if provided)
    if (data.initiativeId) {
      const initiative = await prisma.initiative.findUnique({
        where: { id: data.initiativeId },
      });

      if (!initiative) {
        throw new NotFoundError('Initiative', data.initiativeId);
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.initiativeId !== undefined) updateData.initiativeId = data.initiativeId;
    if (data.startDate !== undefined) updateData.startDate = data.startDate;
    if (data.endDate !== undefined) updateData.endDate = data.endDate;
    if (data.percentage !== undefined) updateData.percentage = data.percentage;

    const updated = await prisma.allocation.update({
      where: { id },
      data: updateData,
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

    // Invalidate calculator cache and enqueue background recomputation
    await scenarioCalculatorService.invalidateCache(updated.scenarioId);
    await enqueueScenarioRecompute(updated.scenarioId, 'allocation_change');
    await enqueueViewRefresh('all', 'allocation_change', [updated.scenarioId]);

    return {
      id: updated.id,
      scenarioId: updated.scenarioId,
      employeeId: updated.employeeId,
      employeeName: updated.employee.name,
      initiativeId: updated.initiativeId,
      initiativeTitle: updated.initiative?.title ?? null,
      startDate: updated.startDate,
      endDate: updated.endDate,
      percentage: updated.percentage,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async delete(id: string): Promise<void> {
    const allocation = await prisma.allocation.findUnique({
      where: { id },
    });

    if (!allocation) {
      throw new NotFoundError('Allocation', id);
    }

    await prisma.allocation.delete({
      where: { id },
    });

    // Invalidate calculator cache and enqueue background recomputation
    await scenarioCalculatorService.invalidateCache(allocation.scenarioId);
    await enqueueScenarioRecompute(allocation.scenarioId, 'allocation_change');
    await enqueueViewRefresh('all', 'allocation_change', [allocation.scenarioId]);
  }

  async calculateCapacityDemand(scenarioId: string): Promise<CapacityDemandResult[]> {
    // Get scenario with priority rankings
    const scenario = await prisma.scenario.findUnique({
      where: { id: scenarioId },
      include: {
        allocations: true,
      },
    });

    if (!scenario) {
      throw new NotFoundError('Scenario', scenarioId);
    }

    const priorityRankings = (scenario.priorityRankings as Array<{ initiativeId: string; rank: number }>) || [];

    // Parse quarter range
    const [startQuarter, endQuarter] = scenario.quarterRange.split(':');
    const quarters = this.getQuartersInRange(startQuarter, endQuarter);

    // Get initiatives in priority order with their scope items
    const initiatives = await prisma.initiative.findMany({
      where: {
        id: { in: priorityRankings.map((p) => p.initiativeId) },
      },
      include: {
        scopeItems: true,
      },
    });

    // Create a map of initiative data for easier access
    const initiativeMap = new Map(
      initiatives.map((init) => [
        init.id,
        {
          title: init.title,
          scopeItems: init.scopeItems,
        },
      ])
    );

    // Get all employees with their skills for this scenario
    const allocations = await prisma.allocation.findMany({
      where: { scenarioId },
      include: {
        employee: {
          include: {
            skills: true,
          },
        },
      },
    });

    // Group skills by name
    const skillMap = new Map<string, Array<{ employeeId: string; proficiency: number }>>();
    for (const allocation of allocations) {
      for (const skill of allocation.employee.skills) {
        if (!skillMap.has(skill.name)) {
          skillMap.set(skill.name, []);
        }
        skillMap.get(skill.name)!.push({
          employeeId: allocation.employeeId,
          proficiency: skill.proficiency,
        });
      }
    }

    const results: CapacityDemandResult[] = [];

    // Calculate demand and capacity for each quarter and skill
    for (const quarter of quarters) {
      // Collect all skills and their demands
      const skillDemands = new Map<string, number>();

      for (const priorityRanking of priorityRankings) {
        const initiativeData = initiativeMap.get(priorityRanking.initiativeId);
        if (!initiativeData) continue;

        for (const scopeItem of initiativeData.scopeItems) {
          const skillDemand = (scopeItem.skillDemand as SkillDemand) || {};
          const quarterDist = (scopeItem.quarterDistribution as QuarterDistribution) || {};

          const quarterDistribution = quarterDist[quarter] || 0;

          for (const [skill, demandHours] of Object.entries(skillDemand)) {
            const currentDemand = skillDemands.get(skill) || 0;
            skillDemands.set(skill, currentDemand + (demandHours as number) * quarterDistribution);
          }
        }
      }

      // Calculate capacity for each skill in this quarter
      for (const [skill, demand] of skillDemands.entries()) {
        const skillEmployees = skillMap.get(skill) || [];

        // Calculate capacity: sum of employees' available hours weighted by proficiency
        let capacity = 0;
        for (const employee of skillEmployees) {
          const allocation = allocations.find((a) => a.employeeId === employee.employeeId);
          if (allocation) {
            // Approximate available hours: assuming 160 hours per quarter (40 weeks * 4 weeks/month)
            const baseHours = 160 * (allocation.percentage / 100);
            const proficiencyMultiplier = employee.proficiency / 5; // Normalize proficiency (1-5 scale)
            capacity += baseHours * proficiencyMultiplier;
          }
        }

        const gap = capacity - demand;

        results.push({
          quarter,
          skill,
          demand,
          capacity,
          gap,
        });
      }
    }

    return results;
  }

  async compareScenarios(scenarioIds: string[]): Promise<ScenarioComparison[]> {
    const scenarios = await prisma.scenario.findMany({
      where: { id: { in: scenarioIds } },
      include: {
        allocations: {
          include: {
            employee: {
              include: {
                skills: true,
              },
            },
          },
        },
      },
    });

    const missingIds = scenarioIds.filter(
      (id) => !scenarios.find((s) => s.id === id)
    );
    if (missingIds.length > 0) {
      throw new ValidationError(`Scenarios not found: ${missingIds.join(', ')}`);
    }

    const comparisons: ScenarioComparison[] = [];

    for (const scenario of scenarios) {
      // Calculate total allocated hours
      let totalAllocatedHours = 0;
      for (const allocation of scenario.allocations) {
        // Assuming 160 hours per quarter
        totalAllocatedHours += 160 * (allocation.percentage / 100);
      }

      // Calculate capacity gaps by skill
      const capacityGapsBySkill = new Map<string, number>();

      // Get all skill requirements from initiatives in this scenario's priority rankings
      const priorityRankings = (scenario.priorityRankings as Array<{ initiativeId: string; rank: number }>) || [];
      const initiatives = await prisma.initiative.findMany({
        where: { id: { in: priorityRankings.map((p) => p.initiativeId) } },
        include: { scopeItems: true },
      });

      // Calculate total demand by skill
      const demandBySkill = new Map<string, number>();
      for (const initiative of initiatives) {
        for (const scopeItem of initiative.scopeItems) {
          const skillDemand = (scopeItem.skillDemand as SkillDemand) || {};
          for (const [skill, hours] of Object.entries(skillDemand)) {
            const current = demandBySkill.get(skill) || 0;
            demandBySkill.set(skill, current + (hours as number));
          }
        }
      }

      // Calculate capacity by skill
      const capacityBySkill = new Map<string, number>();
      for (const allocation of scenario.allocations) {
        for (const skill of allocation.employee.skills) {
          const baseHours = 160 * (allocation.percentage / 100);
          const proficiencyMultiplier = skill.proficiency / 5;
          const currentCapacity = capacityBySkill.get(skill.name) || 0;
          capacityBySkill.set(skill.name, currentCapacity + baseHours * proficiencyMultiplier);
        }
      }

      // Calculate gaps
      for (const [skill, demand] of demandBySkill.entries()) {
        const capacity = capacityBySkill.get(skill) || 0;
        capacityGapsBySkill.set(skill, capacity - demand);
      }

      comparisons.push({
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        totalAllocatedHours,
        capacityGapsBySkill: Object.fromEntries(capacityGapsBySkill),
        priorities: priorityRankings,
      });
    }

    return comparisons;
  }

  private getQuartersInRange(startQuarter: string, endQuarter: string): string[] {
    const quarters: string[] = [];

    const [startYear, startQ] = startQuarter.split('-Q');
    const [endYear, endQ] = endQuarter.split('-Q');

    const startYearNum = parseInt(startYear, 10);
    const startQNum = parseInt(startQ, 10);
    const endYearNum = parseInt(endYear, 10);
    const endQNum = parseInt(endQ, 10);

    let currentYear = startYearNum;
    let currentQ = startQNum;

    while (currentYear < endYearNum || (currentYear === endYearNum && currentQ <= endQNum)) {
      quarters.push(`${currentYear}-Q${currentQ}`);
      currentQ++;
      if (currentQ > 4) {
        currentQ = 1;
        currentYear++;
      }
    }

    return quarters;
  }
}

export const allocationService = new AllocationService();
