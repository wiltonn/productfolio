import { Prisma, ScenarioStatus, UserRole, PeriodType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { NotFoundError, ValidationError, WorkflowError, ForbiddenError } from '../lib/errors.js';
import { scenarioCalculatorService } from './scenario-calculator.service.js';
import { enqueueScenarioRecompute, enqueueViewRefresh } from '../jobs/index.js';
import type { CreateScenario, UpdateScenario, UpdatePriorities, Pagination, PriorityRanking } from '../schemas/scenarios.schema.js';
import type { PaginatedResponse } from '../types/index.js';

interface ScenarioWithMetadata {
  id: string;
  name: string;
  assumptions: Record<string, unknown> | null;
  priorityRankings: PriorityRanking[] | null;
  periodId: string;
  periodLabel: string;
  periodStartDate: Date;
  periodEndDate: Date;
  status: ScenarioStatus;
  planLockDate: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  allocationsCount: number;
}

// Valid status transitions
const VALID_TRANSITIONS: Record<ScenarioStatus, ScenarioStatus[]> = {
  DRAFT: [ScenarioStatus.REVIEW],
  REVIEW: [ScenarioStatus.DRAFT, ScenarioStatus.APPROVED],
  APPROVED: [ScenarioStatus.REVIEW, ScenarioStatus.LOCKED],
  LOCKED: [], // ADMIN can override to DRAFT
};

const MUTATION_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.PRODUCT_OWNER, UserRole.BUSINESS_OWNER];

export class ScenariosService {
  async list(pagination: Pagination): Promise<PaginatedResponse<ScenarioWithMetadata>> {
    const page = pagination.page || 1;
    const limit = pagination.limit || 10;
    const skip = (page - 1) * limit;

    const [scenarios, total] = await Promise.all([
      prisma.scenario.findMany({
        skip,
        take: limit,
        include: {
          _count: {
            select: {
              allocations: true,
            },
          },
          period: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      prisma.scenario.count(),
    ]);

    const data: ScenarioWithMetadata[] = scenarios.map((scenario) => ({
      ...scenario,
      priorityRankings: scenario.priorityRankings as PriorityRanking[] | null,
      assumptions: scenario.assumptions as Record<string, unknown> | null,
      periodId: scenario.periodId,
      periodLabel: scenario.period.label,
      periodStartDate: scenario.period.startDate,
      periodEndDate: scenario.period.endDate,
      allocationsCount: scenario._count.allocations,
    }));

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getById(id: string): Promise<ScenarioWithMetadata> {
    const scenario = await prisma.scenario.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            allocations: true,
          },
        },
        period: true,
      },
    });

    if (!scenario) {
      throw new NotFoundError('Scenario', id);
    }

    return {
      ...scenario,
      priorityRankings: scenario.priorityRankings as PriorityRanking[] | null,
      assumptions: scenario.assumptions as Record<string, unknown> | null,
      periodId: scenario.periodId,
      periodLabel: scenario.period.label,
      periodStartDate: scenario.period.startDate,
      periodEndDate: scenario.period.endDate,
      allocationsCount: scenario._count.allocations,
    };
  }

  async create(data: CreateScenario): Promise<ScenarioWithMetadata> {
    // Validate period exists and is a QUARTER
    const period = await prisma.period.findUnique({
      where: { id: data.periodId },
    });

    if (!period) {
      throw new ValidationError(`Period not found: ${data.periodId}`);
    }

    if (period.type !== PeriodType.QUARTER) {
      throw new ValidationError(`Period must be of type QUARTER, got ${period.type}`);
    }

    const created = await prisma.scenario.create({
      data: {
        name: data.name,
        periodId: data.periodId,
        status: ScenarioStatus.DRAFT,
        assumptions: (data.assumptions ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        priorityRankings: (data.priorityRankings ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    return this.getById(created.id);
  }

  async update(id: string, data: UpdateScenario): Promise<ScenarioWithMetadata> {
    const scenario = await this.getById(id);

    // Block updates when LOCKED
    if (scenario.status === ScenarioStatus.LOCKED) {
      throw new WorkflowError(
        'Cannot update a LOCKED scenario. It must be unlocked first.',
        scenario.status
      );
    }

    // Block demand/allocation-related edits when APPROVED (assumptions and priorityRankings)
    if (scenario.status === ScenarioStatus.APPROVED) {
      if (data.assumptions !== undefined || data.priorityRankings !== undefined) {
        throw new WorkflowError(
          'Cannot modify assumptions or priority rankings of an APPROVED scenario. Return to REVIEW first.',
          scenario.status
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.assumptions !== undefined) updateData.assumptions = data.assumptions;
    if (data.priorityRankings !== undefined) updateData.priorityRankings = data.priorityRankings;

    await prisma.scenario.update({
      where: { id },
      data: updateData,
    });

    // Invalidate calculator cache and enqueue background recomputation
    await scenarioCalculatorService.invalidateCache(id);
    await enqueueScenarioRecompute(id, 'priority_change');
    await enqueueViewRefresh('all', 'allocation_change', [id]);

    return this.getById(id);
  }

  async delete(id: string): Promise<void> {
    const scenario = await this.getById(id);

    // Block deletion of LOCKED scenarios
    if (scenario.status === ScenarioStatus.LOCKED) {
      throw new WorkflowError(
        'Cannot delete a LOCKED scenario.',
        scenario.status
      );
    }

    await prisma.scenario.delete({
      where: { id },
    });
  }

  async transitionStatus(
    id: string,
    newStatus: ScenarioStatus,
    userRole: UserRole
  ): Promise<ScenarioWithMetadata> {
    const scenario = await this.getById(id);
    const currentStatus = scenario.status;

    this.validateTransition(currentStatus, newStatus, userRole);

    const updateData: Record<string, unknown> = {
      status: newStatus,
    };

    // Set planLockDate when transitioning to LOCKED
    if (newStatus === ScenarioStatus.LOCKED) {
      updateData.planLockDate = new Date();
    }

    // Clear planLockDate when leaving LOCKED
    if (currentStatus === ScenarioStatus.LOCKED && newStatus !== ScenarioStatus.LOCKED) {
      updateData.planLockDate = null;
    }

    await prisma.scenario.update({
      where: { id },
      data: updateData,
    });

    // Invalidate cache
    await scenarioCalculatorService.invalidateCache(id);

    return this.getById(id);
  }

  private validateTransition(
    current: ScenarioStatus,
    target: ScenarioStatus,
    userRole: UserRole
  ): void {
    // ADMIN can always override LOCKED -> DRAFT
    if (
      current === ScenarioStatus.LOCKED &&
      target === ScenarioStatus.DRAFT &&
      userRole === UserRole.ADMIN
    ) {
      return;
    }

    const validTargets = VALID_TRANSITIONS[current];
    if (!validTargets.includes(target)) {
      throw new WorkflowError(
        `Cannot transition from ${current} to ${target}`,
        current,
        target
      );
    }

    // Ensure user has a mutation role
    if (!MUTATION_ROLES.includes(userRole)) {
      throw new ForbiddenError(
        `Role ${userRole} cannot transition scenario status. Required: ${MUTATION_ROLES.join(', ')}`
      );
    }
  }

  async updatePriorities(id: string, data: UpdatePriorities): Promise<ScenarioWithMetadata> {
    const scenario = await this.getById(id);

    // Block when LOCKED
    if (scenario.status === ScenarioStatus.LOCKED) {
      throw new WorkflowError(
        'Cannot update priorities of a LOCKED scenario.',
        scenario.status
      );
    }

    // Block when APPROVED
    if (scenario.status === ScenarioStatus.APPROVED) {
      throw new WorkflowError(
        'Cannot update priorities of an APPROVED scenario. Return to REVIEW first.',
        scenario.status
      );
    }

    await prisma.scenario.update({
      where: { id },
      data: {
        priorityRankings: data.priorities,
      },
    });

    // Invalidate calculator cache and enqueue background recomputation
    await scenarioCalculatorService.invalidateCache(id);
    await enqueueScenarioRecompute(id, 'priority_change');
    await enqueueViewRefresh('all', 'allocation_change', [id]);

    return this.getById(id);
  }
}

export const scenariosService = new ScenariosService();
