import { prisma } from '../lib/prisma.js';
import { NotFoundError, ValidationError, WorkflowError } from '../lib/errors.js';
import { scenarioCalculatorService } from './scenario-calculator.service.js';
import { periodService } from './period.service.js';
import { enqueueScenarioRecompute, enqueueViewRefresh } from '../jobs/index.js';
import type { CreateAllocation, UpdateAllocation } from '../schemas/scenarios.schema.js';
import type {
  CapacityDemandResult,
  ScenarioComparison,
  SkillDemand,
  ProposedAllocation,
  AutoAllocateResult,
  InitiativeCoverage,
  AutoAllocateOptions,
} from '../types/index.js';
import { PeriodType, ScenarioStatus } from '@prisma/client';

const LOCKED_STATUSES = ['RESOURCING', 'IN_EXECUTION', 'COMPLETE'];

interface AllocationWithDetails {
  id: string;
  scenarioId: string;
  employeeId: string;
  employeeName: string;
  initiativeId: string | null;
  initiativeTitle: string | null;
  initiativeStatus: string | null;
  startDate: Date;
  endDate: Date;
  percentage: number;
  createdAt: Date;
  updatedAt: Date;
}

interface EmployeeAllocationDetail {
  id: string;
  scenarioId: string;
  scenarioName: string;
  initiativeId: string | null;
  initiativeTitle: string | null;
  initiativeStatus: string | null;
  startDate: Date;
  endDate: Date;
  percentage: number;
}

interface AllocationSummaryItem {
  id: string;
  scenarioId: string;
  scenarioName: string;
  initiativeId: string | null;
  initiativeTitle: string | null;
  initiativeStatus: string | null;
  startDate: Date;
  endDate: Date;
  percentage: number;
}

export interface EmployeeAllocationSummary {
  currentQuarterPct: number;
  nextQuarterPct: number;
  allocations: AllocationSummaryItem[];
}

export class AllocationService {
  private async assertInitiativeNotLocked(initiativeId: string): Promise<void> {
    const initiative = await prisma.initiative.findUnique({
      where: { id: initiativeId },
      select: { status: true, title: true },
    });

    if (initiative && LOCKED_STATUSES.includes(initiative.status)) {
      throw new WorkflowError(
        `Cannot modify allocations for initiative "${initiative.title}" with status ${initiative.status}. Allocations are locked for approved, in-progress, and completed initiatives.`,
        initiative.status
      );
    }
  }

  private async assertScenarioEditable(scenarioId: string): Promise<void> {
    const scenario = await prisma.scenario.findUnique({
      where: { id: scenarioId },
      select: { status: true, name: true },
    });

    if (!scenario) {
      throw new NotFoundError('Scenario', scenarioId);
    }

    if (scenario.status === ScenarioStatus.LOCKED || scenario.status === ScenarioStatus.APPROVED) {
      throw new WorkflowError(
        `Cannot modify allocations for scenario "${scenario.name}" with status ${scenario.status}.`,
        scenario.status
      );
    }
  }

  private async assertDatesWithinQuarter(
    scenarioId: string,
    startDate: Date,
    endDate: Date
  ): Promise<void> {
    const scenario = await prisma.scenario.findUnique({
      where: { id: scenarioId },
      include: { period: true },
    });

    if (!scenario) {
      throw new NotFoundError('Scenario', scenarioId);
    }

    const qStart = scenario.period.startDate;
    const qEnd = scenario.period.endDate;

    if (startDate < qStart || endDate > qEnd) {
      throw new ValidationError(
        `Allocation dates (${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}) must fall within the scenario's quarter (${scenario.period.label}: ${qStart.toISOString().split('T')[0]} to ${qEnd.toISOString().split('T')[0]}).`
      );
    }
  }

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
            status: true,
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
      initiativeStatus: allocation.initiative?.status ?? null,
      startDate: allocation.startDate,
      endDate: allocation.endDate,
      percentage: allocation.percentage,
      createdAt: allocation.createdAt,
      updatedAt: allocation.updatedAt,
    }));
  }

  async listByInitiative(scenarioId: string, initiativeId: string): Promise<AllocationWithDetails[]> {
    // Check if scenario exists
    const scenario = await prisma.scenario.findUnique({
      where: { id: scenarioId },
    });

    if (!scenario) {
      throw new NotFoundError('Scenario', scenarioId);
    }

    const allocations = await prisma.allocation.findMany({
      where: { scenarioId, initiativeId },
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
            status: true,
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
      initiativeStatus: allocation.initiative?.status ?? null,
      startDate: allocation.startDate,
      endDate: allocation.endDate,
      percentage: allocation.percentage,
      createdAt: allocation.createdAt,
      updatedAt: allocation.updatedAt,
    }));
  }

  async listByEmployee(employeeId: string): Promise<EmployeeAllocationDetail[]> {
    // Check if employee exists
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
    });

    if (!employee) {
      throw new NotFoundError('Employee', employeeId);
    }

    const allocations = await prisma.allocation.findMany({
      where: { employeeId },
      include: {
        scenario: {
          select: {
            id: true,
            name: true,
          },
        },
        initiative: {
          select: {
            id: true,
            title: true,
            status: true,
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
      scenarioName: allocation.scenario.name,
      initiativeId: allocation.initiativeId,
      initiativeTitle: allocation.initiative?.title ?? null,
      initiativeStatus: allocation.initiative?.status ?? null,
      startDate: allocation.startDate,
      endDate: allocation.endDate,
      percentage: allocation.percentage,
    }));
  }

  async listAllocationSummaries(
    employeeIds: string[],
    currentQStart: Date,
    currentQEnd: Date,
    nextQStart: Date,
    nextQEnd: Date
  ): Promise<Record<string, EmployeeAllocationSummary>> {
    // Fetch all allocations for these employees where date range overlaps either quarter
    const allocations = await prisma.allocation.findMany({
      where: {
        employeeId: { in: employeeIds },
        OR: [
          // Overlaps current quarter
          { startDate: { lte: currentQEnd }, endDate: { gte: currentQStart } },
          // Overlaps next quarter
          { startDate: { lte: nextQEnd }, endDate: { gte: nextQStart } },
        ],
      },
      include: {
        scenario: { select: { id: true, name: true } },
        initiative: { select: { id: true, title: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Initialize result for all requested employees
    const result: Record<string, EmployeeAllocationSummary> = {};
    for (const id of employeeIds) {
      result[id] = { currentQuarterPct: 0, nextQuarterPct: 0, allocations: [] };
    }

    for (const alloc of allocations) {
      const summary = result[alloc.employeeId];
      if (!summary) continue;

      // Check overlap with current quarter
      if (alloc.startDate <= currentQEnd && alloc.endDate >= currentQStart) {
        summary.currentQuarterPct += alloc.percentage;
      }

      // Check overlap with next quarter
      if (alloc.startDate <= nextQEnd && alloc.endDate >= nextQStart) {
        summary.nextQuarterPct += alloc.percentage;
      }

      summary.allocations.push({
        id: alloc.id,
        scenarioId: alloc.scenarioId,
        scenarioName: alloc.scenario.name,
        initiativeId: alloc.initiativeId,
        initiativeTitle: alloc.initiative?.title ?? null,
        initiativeStatus: alloc.initiative?.status ?? null,
        startDate: alloc.startDate,
        endDate: alloc.endDate,
        percentage: alloc.percentage,
      });
    }

    return result;
  }

  async create(scenarioId: string, data: CreateAllocation): Promise<AllocationWithDetails> {
    // Check if scenario exists
    const scenario = await prisma.scenario.findUnique({
      where: { id: scenarioId },
    });

    if (!scenario) {
      throw new NotFoundError('Scenario', scenarioId);
    }

    // Guard: scenario must be editable (not LOCKED or APPROVED)
    await this.assertScenarioEditable(scenarioId);

    // Guard: dates must fall within the scenario's quarter
    await this.assertDatesWithinQuarter(scenarioId, data.startDate, data.endDate);

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

      // Check if initiative is locked
      await this.assertInitiativeNotLocked(data.initiativeId);
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
            status: true,
          },
        },
      },
    });

    // Compute AllocationPeriod rows
    await this.computeAllocationPeriods(allocation.id, data.startDate, data.endDate);

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
      initiativeStatus: allocation.initiative?.status ?? null,
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

    // Guard: scenario must be editable
    await this.assertScenarioEditable(allocation.scenarioId);

    // Guard: re-validate dates if changed
    if (data.startDate !== undefined || data.endDate !== undefined) {
      const startDate = data.startDate ?? allocation.startDate;
      const endDate = data.endDate ?? allocation.endDate;
      await this.assertDatesWithinQuarter(allocation.scenarioId, startDate, endDate);
    }

    // Check if current initiative is locked
    if (allocation.initiativeId) {
      await this.assertInitiativeNotLocked(allocation.initiativeId);
    }

    // Check if initiative exists (if provided)
    if (data.initiativeId) {
      const initiative = await prisma.initiative.findUnique({
        where: { id: data.initiativeId },
      });

      if (!initiative) {
        throw new NotFoundError('Initiative', data.initiativeId);
      }

      // Check if new initiative is locked
      await this.assertInitiativeNotLocked(data.initiativeId);
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
            status: true,
          },
        },
      },
    });

    // If dates changed, recompute AllocationPeriod rows
    if (data.startDate !== undefined || data.endDate !== undefined) {
      await this.computeAllocationPeriods(
        id,
        updated.startDate,
        updated.endDate
      );
    }

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
      initiativeStatus: updated.initiative?.status ?? null,
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
      select: {
        id: true,
        scenarioId: true,
        initiativeId: true,
      },
    });

    if (!allocation) {
      throw new NotFoundError('Allocation', id);
    }

    // Guard: scenario must be editable
    await this.assertScenarioEditable(allocation.scenarioId);

    // Check if initiative is locked
    if (allocation.initiativeId) {
      await this.assertInitiativeNotLocked(allocation.initiativeId);
    }

    // AllocationPeriod rows are cascade-deleted
    await prisma.allocation.delete({
      where: { id },
    });

    // Invalidate calculator cache and enqueue background recomputation
    await scenarioCalculatorService.invalidateCache(allocation.scenarioId);
    await enqueueScenarioRecompute(allocation.scenarioId, 'allocation_change');
    await enqueueViewRefresh('all', 'allocation_change', [allocation.scenarioId]);
  }

  async calculateCapacityDemand(scenarioId: string): Promise<CapacityDemandResult[]> {
    // Get scenario with period info
    const scenario = await prisma.scenario.findUnique({
      where: { id: scenarioId },
      include: {
        period: true,
        allocations: true,
      },
    });

    if (!scenario) {
      throw new NotFoundError('Scenario', scenarioId);
    }

    const priorityRankings = (scenario.priorityRankings as Array<{ initiativeId: string; rank: number }>) || [];
    const periodIds = [scenario.periodId];
    const periodLabelMap = new Map([[scenario.period.id, scenario.period.label]]);

    // Get initiatives in priority order with their scope items and distributions
    const initiatives = await prisma.initiative.findMany({
      where: {
        id: { in: priorityRankings.map((p) => p.initiativeId) },
      },
      include: {
        scopeItems: {
          include: {
            periodDistributions: true,
          },
        },
      },
    });

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
        allocationPeriods: true,
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

    // Calculate demand and capacity for each period and skill
    for (const periodId of periodIds) {
      const skillDemands = new Map<string, number>();

      for (const priorityRanking of priorityRankings) {
        const initiativeData = initiativeMap.get(priorityRanking.initiativeId);
        if (!initiativeData) continue;

        for (const scopeItem of initiativeData.scopeItems) {
          const skillDemand = (scopeItem.skillDemand as SkillDemand) || {};
          const distribution = scopeItem.periodDistributions.find(
            (pd) => pd.periodId === periodId
          )?.distribution || 0;

          for (const [skill, demandHours] of Object.entries(skillDemand)) {
            const currentDemand = skillDemands.get(skill) || 0;
            skillDemands.set(skill, currentDemand + (demandHours as number) * distribution);
          }
        }
      }

      // Calculate capacity for each skill in this period
      for (const [skill, demand] of skillDemands.entries()) {
        const skillEmployees = skillMap.get(skill) || [];

        let capacity = 0;
        for (const employee of skillEmployees) {
          const alloc = allocations.find((a) => a.employeeId === employee.employeeId);
          if (alloc) {
            const periodAlloc = alloc.allocationPeriods.find((ap) => ap.periodId === periodId);
            if (periodAlloc) {
              const baseHours = periodAlloc.hoursInPeriod;
              const proficiencyMultiplier = employee.proficiency / 5;
              capacity += baseHours * proficiencyMultiplier;
            }
          }
        }

        const gap = capacity - demand;

        results.push({
          periodId,
          periodLabel: periodLabelMap.get(periodId) || '',
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
            allocationPeriods: true,
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
      // Calculate total allocated hours from AllocationPeriod junction
      let totalAllocatedHours = 0;
      for (const allocation of scenario.allocations) {
        for (const ap of allocation.allocationPeriods) {
          totalAllocatedHours += ap.hoursInPeriod;
        }
      }

      // Calculate capacity gaps by skill
      const priorityRankings = (scenario.priorityRankings as Array<{ initiativeId: string; rank: number }>) || [];
      const initiatives = await prisma.initiative.findMany({
        where: { id: { in: priorityRankings.map((p) => p.initiativeId) } },
        include: {
          scopeItems: true,
        },
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

      // Calculate capacity by skill from AllocationPeriod data
      const capacityBySkill = new Map<string, number>();
      for (const allocation of scenario.allocations) {
        const totalHoursForAllocation = allocation.allocationPeriods.reduce(
          (sum, ap) => sum + ap.hoursInPeriod, 0
        );
        for (const skill of allocation.employee.skills) {
          const proficiencyMultiplier = skill.proficiency / 5;
          const currentCapacity = capacityBySkill.get(skill.name) || 0;
          capacityBySkill.set(
            skill.name,
            currentCapacity + totalHoursForAllocation * proficiencyMultiplier
          );
        }
      }

      // Calculate gaps
      const capacityGapsBySkill = new Map<string, number>();
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

  /**
   * Compute optimal auto-allocations based on priority rankings and skill matching.
   * Returns a preview result without persisting anything.
   */
  async autoAllocate(scenarioId: string, options: AutoAllocateOptions = {}): Promise<AutoAllocateResult> {
    const maxPct = options.maxAllocationPercentage ?? 100;

    // 1. Fetch scenario with period and priority rankings
    const scenario = await prisma.scenario.findUnique({
      where: { id: scenarioId },
      include: {
        period: true,
      },
    });

    if (!scenario) {
      throw new NotFoundError('Scenario', scenarioId);
    }

    const priorityRankings = (scenario.priorityRankings as Array<{ initiativeId: string; rank: number }>) || [];
    if (priorityRankings.length === 0) {
      throw new ValidationError('Scenario has no priority rankings. Add initiative rankings before auto-allocating.');
    }

    const sortedRankings = [...priorityRankings].sort((a, b) => a.rank - b.rank);
    const periodIds = [scenario.periodId];
    const periodsMap = new Map([[scenario.period.id, scenario.period]]);

    // 2. Fetch ranked initiatives with scope items + period distributions
    const initiatives = await prisma.initiative.findMany({
      where: {
        id: { in: sortedRankings.map((r) => r.initiativeId) },
      },
      include: {
        scopeItems: {
          include: {
            periodDistributions: true,
          },
        },
      },
    });

    const initiativeMap = new Map(initiatives.map((init) => [init.id, init]));

    // 3. Fetch all active employees with skills and capacity calendars
    const employees = await prisma.employee.findMany({
      where: {
        activeEnd: { equals: null },
      },
      include: {
        skills: true,
        capacityCalendar: {
          where: {
            periodId: { in: periodIds },
          },
        },
      },
    });

    // 4. Build employee capacity tracker: Map<employeeId, remainingPercentage>
    // Simplified: track remaining allocation percentage per employee (across all periods)
    const employeeCapacity = new Map<string, number>();
    const employeeMap = new Map(employees.map((e) => [e.id, e]));

    for (const emp of employees) {
      employeeCapacity.set(emp.id, maxPct);
    }

    // 5. Build skill-to-employee index sorted by proficiency descending
    const skillIndex = new Map<string, Array<{ employeeId: string; proficiency: number }>>();
    for (const emp of employees) {
      for (const skill of emp.skills) {
        if (!skillIndex.has(skill.name)) {
          skillIndex.set(skill.name, []);
        }
        skillIndex.get(skill.name)!.push({
          employeeId: emp.id,
          proficiency: skill.proficiency,
        });
      }
    }
    // Sort each skill's employees by proficiency descending
    for (const [, emps] of skillIndex) {
      emps.sort((a, b) => b.proficiency - a.proficiency);
    }

    // 6. Determine scenario date range from periods
    let scenarioStartDate: Date | null = null;
    let scenarioEndDate: Date | null = null;
    for (const [, period] of periodsMap) {
      if (!scenarioStartDate || period.startDate < scenarioStartDate) {
        scenarioStartDate = period.startDate;
      }
      if (!scenarioEndDate || period.endDate > scenarioEndDate) {
        scenarioEndDate = period.endDate;
      }
    }

    if (!scenarioStartDate || !scenarioEndDate) {
      throw new ValidationError('Scenario has no periods configured.');
    }

    // 7. Iterate initiatives by priority
    const proposedAllocations: ProposedAllocation[] = [];
    const coverage: InitiativeCoverage[] = [];
    const warnings: string[] = [];

    for (const ranking of sortedRankings) {
      const initiative = initiativeMap.get(ranking.initiativeId);
      if (!initiative) {
        warnings.push(`Initiative ${ranking.initiativeId} not found (rank ${ranking.rank})`);
        continue;
      }

      // Aggregate skill demand hours for this initiative across periods
      const skillDemandHours = new Map<string, number>();
      for (const scopeItem of initiative.scopeItems) {
        const demand = (scopeItem.skillDemand as SkillDemand) || {};
        for (const [skill, hours] of Object.entries(demand)) {
          // Use estimateP50 weighted by distribution, or raw hours from skillDemand
          const totalForSkill = hours as number;
          const currentDemand = skillDemandHours.get(skill) || 0;
          skillDemandHours.set(skill, currentDemand + totalForSkill);
        }
      }

      const skillCoverageEntries: InitiativeCoverage['skills'] = [];

      // For each required skill, assign employees
      for (const [skill, demandHours] of skillDemandHours) {
        const availableEmployees = skillIndex.get(skill);
        if (!availableEmployees || availableEmployees.length === 0) {
          warnings.push(`No employees with skill "${skill}" for initiative "${initiative.title}" (rank ${ranking.rank})`);
          skillCoverageEntries.push({
            skill,
            demandHours,
            allocatedHours: 0,
            coveragePercent: 0,
          });
          continue;
        }

        let remainingDemand = demandHours;
        let allocatedHours = 0;

        for (const empEntry of availableEmployees) {
          if (remainingDemand <= 0) break;

          const remainingPct = employeeCapacity.get(empEntry.employeeId) || 0;
          if (remainingPct <= 0) continue;

          const emp = employeeMap.get(empEntry.employeeId)!;
          // Calculate total hours this employee could provide across scenario periods
          const hoursPerQuarter = emp.hoursPerWeek * 13;
          const totalPeriods = periodIds.length;
          const totalPossibleHours = hoursPerQuarter * totalPeriods;

          // What fraction of capacity would we need?
          const pctNeeded = Math.min(remainingPct, Math.ceil((remainingDemand / totalPossibleHours) * 100));
          const actualPct = Math.min(pctNeeded, remainingPct);
          const actualHours = totalPossibleHours * (actualPct / 100);

          if (actualPct <= 0) continue;

          proposedAllocations.push({
            employeeId: empEntry.employeeId,
            employeeName: emp.name,
            initiativeId: initiative.id,
            initiativeTitle: initiative.title,
            skill,
            percentage: actualPct,
            hours: Math.round(actualHours),
            startDate: scenarioStartDate!,
            endDate: scenarioEndDate!,
          });

          // Deduct capacity
          employeeCapacity.set(empEntry.employeeId, remainingPct - actualPct);
          remainingDemand -= actualHours;
          allocatedHours += actualHours;
        }

        if (remainingDemand > 0) {
          warnings.push(`Insufficient capacity for skill "${skill}" on initiative "${initiative.title}" (rank ${ranking.rank}): ${Math.round(remainingDemand)}h shortage`);
        }

        skillCoverageEntries.push({
          skill,
          demandHours,
          allocatedHours: Math.round(allocatedHours),
          coveragePercent: demandHours > 0 ? Math.min(100, Math.round((allocatedHours / demandHours) * 100)) : 100,
        });
      }

      const totalDemand = skillCoverageEntries.reduce((sum, s) => sum + s.demandHours, 0);
      const totalAllocated = skillCoverageEntries.reduce((sum, s) => sum + s.allocatedHours, 0);

      coverage.push({
        initiativeId: initiative.id,
        initiativeTitle: initiative.title,
        rank: ranking.rank,
        skills: skillCoverageEntries,
        overallCoveragePercent: totalDemand > 0 ? Math.min(100, Math.round((totalAllocated / totalDemand) * 100)) : 100,
      });
    }

    // 8. Consolidate duplicate employee+initiative pairs
    const consolidationKey = (a: ProposedAllocation) => `${a.employeeId}:${a.initiativeId}`;
    const consolidated = new Map<string, ProposedAllocation>();

    for (const alloc of proposedAllocations) {
      const key = consolidationKey(alloc);
      if (consolidated.has(key)) {
        const existing = consolidated.get(key)!;
        existing.percentage += alloc.percentage;
        existing.hours += alloc.hours;
        existing.skill = `${existing.skill}, ${alloc.skill}`;
      } else {
        consolidated.set(key, { ...alloc });
      }
    }

    const finalAllocations = Array.from(consolidated.values());
    const uniqueEmployees = new Set(finalAllocations.map((a) => a.employeeId));
    const uniqueInitiatives = new Set(finalAllocations.map((a) => a.initiativeId));

    return {
      proposedAllocations: finalAllocations,
      coverage,
      warnings,
      summary: {
        totalAllocations: finalAllocations.length,
        employeesUsed: uniqueEmployees.size,
        initiativesCovered: uniqueInitiatives.size,
        totalHoursAllocated: finalAllocations.reduce((sum, a) => sum + a.hours, 0),
      },
    };
  }

  /**
   * Apply auto-allocated assignments: delete existing allocations and create new ones.
   */
  async applyAutoAllocate(
    scenarioId: string,
    proposedAllocations: ProposedAllocation[]
  ): Promise<{ created: number }> {
    const scenario = await prisma.scenario.findUnique({
      where: { id: scenarioId },
    });

    if (!scenario) {
      throw new NotFoundError('Scenario', scenarioId);
    }

    // Guard: scenario must be editable
    await this.assertScenarioEditable(scenarioId);

    if (proposedAllocations.length === 0) {
      throw new ValidationError('No proposed allocations to apply.');
    }

    // Transaction: delete all existing allocations, create new ones
    const result = await prisma.$transaction(async (tx) => {
      // Delete all existing allocation periods for this scenario
      await tx.allocationPeriod.deleteMany({
        where: {
          allocation: { scenarioId },
        },
      });

      // Delete all existing allocations for this scenario
      await tx.allocation.deleteMany({
        where: { scenarioId },
      });

      // Create new allocations
      const createdAllocations = [];
      for (const proposed of proposedAllocations) {
        const allocation = await tx.allocation.create({
          data: {
            scenarioId,
            employeeId: proposed.employeeId,
            initiativeId: proposed.initiativeId,
            startDate: new Date(proposed.startDate),
            endDate: new Date(proposed.endDate),
            percentage: Math.min(proposed.percentage, 100),
          },
        });
        createdAllocations.push(allocation);
      }

      return createdAllocations;
    });

    // Compute AllocationPeriod rows for each new allocation
    for (const allocation of result) {
      await this.computeAllocationPeriods(
        allocation.id,
        allocation.startDate,
        allocation.endDate
      );
    }

    // Invalidate cache and enqueue background jobs
    await scenarioCalculatorService.invalidateCache(scenarioId);
    await enqueueScenarioRecompute(scenarioId, 'allocation_change');
    await enqueueViewRefresh('all', 'allocation_change', [scenarioId]);

    return { created: result.length };
  }

  /**
   * Compute AllocationPeriod junction rows for a given allocation's date range.
   * Deletes existing rows and re-creates them.
   */
  private async computeAllocationPeriods(
    allocationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<void> {
    // Delete existing allocation period rows
    await prisma.allocationPeriod.deleteMany({
      where: { allocationId },
    });

    // Map the date range to quarter periods with overlap
    const periodOverlaps = await periodService.mapDateRangeToPeriods(
      startDate,
      endDate,
      PeriodType.QUARTER
    );

    if (periodOverlaps.length === 0) return;

    // Get the allocation to calculate hours
    const allocation = await prisma.allocation.findUnique({
      where: { id: allocationId },
      include: {
        employee: true,
      },
    });

    if (!allocation) return;

    // Default hours per quarter: hoursPerWeek * 13
    const hoursPerQuarter = allocation.employee.hoursPerWeek * 13;

    // Create AllocationPeriod rows
    await prisma.allocationPeriod.createMany({
      data: periodOverlaps.map((po) => ({
        allocationId,
        periodId: po.periodId,
        hoursInPeriod: hoursPerQuarter * po.overlapRatio * (allocation.percentage / 100),
        overlapRatio: po.overlapRatio,
      })),
    });
  }
}

export const allocationService = new AllocationService();
