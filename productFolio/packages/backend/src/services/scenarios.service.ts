import { Prisma, ScenarioStatus, ScenarioType, RevisionReason, UserRole, PeriodType, AllocationType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { NotFoundError, ValidationError, WorkflowError, ForbiddenError } from '../lib/errors.js';
import { scenarioCalculatorService } from './scenario-calculator.service.js';
import { allocationService } from './allocation.service.js';
import { baselineService } from './baseline.service.js';
import { freezePolicyService } from './freeze-policy.service.js';
import { enqueueScenarioRecompute, enqueueViewRefresh } from '../jobs/index.js';
import type { CreateScenario, UpdateScenario, UpdatePriorities, Pagination, PriorityRanking, CloneScenario } from '../schemas/scenarios.schema.js';
import type { CreateRevision } from '../schemas/baseline.schema.js';
import type { PaginatedResponse } from '../types/index.js';
import { approvalEnforcementService } from './approval-enforcement.service.js';

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
  isPrimary: boolean;
  planLockDate: Date | null;
  version: number;
  scenarioType: ScenarioType;
  revisionOfScenarioId: string | null;
  revisionReason: RevisionReason | null;
  changeLog: string | null;
  needsReconciliation: boolean;
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
  async list(pagination: Pagination, periodIds?: string[], orgNodeId?: string): Promise<PaginatedResponse<ScenarioWithMetadata>> {
    const page = pagination.page || 1;
    const limit = pagination.limit || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.ScenarioWhereInput = {};
    if (periodIds && periodIds.length > 0) {
      where.periodId = { in: periodIds };
    }
    if (orgNodeId) {
      where.orgNodeId = orgNodeId;
    }

    const [scenarios, total] = await Promise.all([
      prisma.scenario.findMany({
        where,
        skip,
        take: limit,
        include: {
          _count: {
            select: {
              allocations: true,
            },
          },
          period: true,
          orgNode: { select: { id: true, name: true, code: true, type: true } },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      prisma.scenario.count({ where }),
    ]);

    const data: ScenarioWithMetadata[] = scenarios.map((scenario) => ({
      ...scenario,
      priorityRankings: scenario.priorityRankings as PriorityRanking[] | null,
      assumptions: scenario.assumptions as Record<string, unknown> | null,
      periodId: scenario.periodId,
      periodLabel: scenario.period.label,
      periodStartDate: scenario.period.startDate,
      periodEndDate: scenario.period.endDate,
      scenarioType: scenario.scenarioType,
      revisionOfScenarioId: scenario.revisionOfScenarioId,
      revisionReason: scenario.revisionReason,
      changeLog: scenario.changeLog,
      needsReconciliation: scenario.needsReconciliation,
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
        orgNode: { select: { id: true, name: true, code: true, type: true } },
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
      scenarioType: scenario.scenarioType,
      revisionOfScenarioId: scenario.revisionOfScenarioId,
      revisionReason: scenario.revisionReason,
      changeLog: scenario.changeLog,
      needsReconciliation: scenario.needsReconciliation,
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

    // Validate orgNodeId if provided
    if (data.orgNodeId) {
      const orgNode = await prisma.orgNode.findUnique({ where: { id: data.orgNodeId } });
      if (!orgNode) throw new ValidationError(`OrgNode not found: ${data.orgNodeId}`);
      if (!orgNode.isActive) throw new ValidationError('Cannot assign scenario to an inactive org node');
    }

    const scenarioType = (data.scenarioType as ScenarioType) ?? ScenarioType.WHAT_IF;

    const created = await prisma.scenario.create({
      data: {
        name: data.name,
        periodId: data.periodId,
        orgNodeId: data.orgNodeId ?? null,
        status: ScenarioStatus.DRAFT,
        assumptions: (data.assumptions ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        priorityRankings: (data.priorityRankings ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        scenarioType,
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

    // Validate orgNodeId if provided
    if (data.orgNodeId !== undefined && data.orgNodeId !== null) {
      const orgNode = await prisma.orgNode.findUnique({ where: { id: data.orgNodeId } });
      if (!orgNode) throw new ValidationError(`OrgNode not found: ${data.orgNodeId}`);
      if (!orgNode.isActive) throw new ValidationError('Cannot assign scenario to an inactive org node');
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.orgNodeId !== undefined) updateData.orgNodeId = data.orgNodeId;
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
    userRole: UserRole,
    actorId?: string
  ): Promise<ScenarioWithMetadata> {
    const scenario = await this.getById(id);
    const currentStatus = scenario.status;

    // Check approval enforcement
    const approvalResult = await approvalEnforcementService.checkApproval({
      scope: 'SCENARIO',
      subjectType: 'scenario',
      subjectId: id,
      actorId: actorId || 'system',
    });
    if (!approvalResult.allowed) {
      throw new WorkflowError(
        `Approval required: pending request created (${approvalResult.pendingRequestId})`,
        currentStatus,
        newStatus
      );
    }

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

    // Auto-set as primary when LOCKED, if no other primary exists for the quarter
    if (newStatus === ScenarioStatus.LOCKED) {
      const existingPrimary = await prisma.scenario.findFirst({
        where: {
          periodId: scenario.periodId,
          isPrimary: true,
          id: { not: id },
        },
      });
      if (!existingPrimary) {
        await prisma.scenario.update({
          where: { id },
          data: { isPrimary: true },
        });
      }

      // Capture baseline snapshot when locking a BASELINE scenario
      if (scenario.scenarioType === ScenarioType.BASELINE) {
        await baselineService.captureSnapshot(id);
      }
    }

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

  async setPrimary(scenarioId: string): Promise<ScenarioWithMetadata> {
    const scenario = await this.getById(scenarioId);

    // Transaction: unset all isPrimary for same periodId, set target as primary
    await prisma.$transaction([
      prisma.scenario.updateMany({
        where: {
          periodId: scenario.periodId,
          isPrimary: true,
        },
        data: { isPrimary: false },
      }),
      prisma.scenario.update({
        where: { id: scenarioId },
        data: { isPrimary: true },
      }),
    ]);

    return this.getById(scenarioId);
  }

  async cloneScenario(sourceId: string, data: CloneScenario): Promise<ScenarioWithMetadata> {
    const source = await prisma.scenario.findUnique({
      where: { id: sourceId },
      include: {
        allocations: true,
        period: true,
      },
    });

    if (!source) {
      throw new NotFoundError('Scenario', sourceId);
    }

    // Validate target period exists and is a QUARTER
    const targetPeriod = await prisma.period.findUnique({
      where: { id: data.targetPeriodId },
    });

    if (!targetPeriod) {
      throw new ValidationError(`Target period not found: ${data.targetPeriodId}`);
    }

    if (targetPeriod.type !== PeriodType.QUARTER) {
      throw new ValidationError(`Target period must be of type QUARTER, got ${targetPeriod.type}`);
    }

    // Create the new scenario as DRAFT
    const newScenario = await prisma.scenario.create({
      data: {
        name: data.name,
        periodId: data.targetPeriodId,
        status: ScenarioStatus.DRAFT,
        assumptions: (source.assumptions ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        priorityRankings: data.includePriorityRankings
          ? (source.priorityRankings ?? Prisma.JsonNull) as Prisma.InputJsonValue
          : Prisma.JsonNull,
      },
      select: { id: true },
    });

    // Filter allocations to clone based on type
    const allocationsToClone = source.allocations.filter((alloc) => {
      if (alloc.allocationType === AllocationType.PROJECT) {
        return data.includeProjectAllocations;
      }
      // RUN and SUPPORT are included if includeRunSupportAllocations is true
      return data.includeRunSupportAllocations;
    });

    // Compute date offset between source and target quarter
    const sourceStart = source.period.startDate.getTime();
    const targetStart = targetPeriod.startDate.getTime();
    const offset = targetStart - sourceStart;

    // Clone allocations with adjusted dates
    for (const alloc of allocationsToClone) {
      const newStartDate = new Date(alloc.startDate.getTime() + offset);
      const newEndDate = new Date(alloc.endDate.getTime() + offset);

      // Clamp to target quarter bounds
      const clampedStart = new Date(Math.max(newStartDate.getTime(), targetPeriod.startDate.getTime()));
      const clampedEnd = new Date(Math.min(newEndDate.getTime(), targetPeriod.endDate.getTime()));

      if (clampedStart > clampedEnd) continue;

      const created = await prisma.allocation.create({
        data: {
          scenarioId: newScenario.id,
          employeeId: alloc.employeeId,
          initiativeId: alloc.initiativeId,
          allocationType: alloc.allocationType,
          startDate: clampedStart,
          endDate: clampedEnd,
          percentage: alloc.percentage,
        },
      });

      // Compute allocation period rows
      await allocationService.computeAllocationPeriods(created.id, clampedStart, clampedEnd);
    }

    return this.getById(newScenario.id);
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

  /**
   * Create a revision scenario from a locked baseline.
   * Clones allocations from the baseline into a new DRAFT REVISION scenario.
   */
  async createRevision(
    baselineScenarioId: string,
    data: CreateRevision,
    userRole: UserRole
  ): Promise<ScenarioWithMetadata> {
    const baseline = await prisma.scenario.findUnique({
      where: { id: baselineScenarioId },
      include: {
        period: true,
        allocations: true,
      },
    });

    if (!baseline) {
      throw new NotFoundError('Scenario', baselineScenarioId);
    }

    // Validate source is LOCKED BASELINE
    if (baseline.status !== ScenarioStatus.LOCKED) {
      throw new WorkflowError(
        'Can only create revisions from a LOCKED scenario.',
        baseline.status
      );
    }

    if (baseline.scenarioType !== ScenarioType.BASELINE) {
      throw new WorkflowError(
        'Can only create revisions from a BASELINE scenario.',
        baseline.scenarioType
      );
    }

    // Validate freeze policy
    const freezeResult = await freezePolicyService.validateRevisionAllowed(
      baseline.periodId,
      data.reason
    );
    if (!freezeResult.allowed) {
      throw new WorkflowError(
        freezeResult.message ?? 'Period is frozen and revision reason is required.'
      );
    }

    // Create the revision scenario
    const revisionName = data.name ?? `Revision of ${baseline.name}`;

    const newScenario = await prisma.scenario.create({
      data: {
        name: revisionName,
        periodId: baseline.periodId,
        status: ScenarioStatus.DRAFT,
        scenarioType: ScenarioType.REVISION,
        revisionOfScenarioId: baselineScenarioId,
        revisionReason: data.reason as RevisionReason,
        changeLog: data.changeLog ?? null,
        needsReconciliation: true,
        assumptions: (baseline.assumptions ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        priorityRankings: (baseline.priorityRankings ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    // Clone allocations from baseline (same quarter, no date offset)
    for (const alloc of baseline.allocations) {
      const created = await prisma.allocation.create({
        data: {
          scenarioId: newScenario.id,
          employeeId: alloc.employeeId,
          initiativeId: alloc.initiativeId,
          allocationType: alloc.allocationType,
          startDate: alloc.startDate,
          endDate: alloc.endDate,
          percentage: alloc.percentage,
        },
      });

      // Compute AllocationPeriod rows
      await allocationService.computeAllocationPeriods(created.id, alloc.startDate, alloc.endDate);
    }

    // Enqueue recompute for new scenario
    await enqueueScenarioRecompute(newScenario.id, 'allocation_change');

    return this.getById(newScenario.id);
  }

  /**
   * Mark a revision scenario as reconciled.
   */
  async markReconciled(scenarioId: string): Promise<ScenarioWithMetadata> {
    const scenario = await this.getById(scenarioId);

    if (scenario.scenarioType !== ScenarioType.REVISION) {
      throw new WorkflowError(
        'Only REVISION scenarios can be reconciled.',
        scenario.scenarioType
      );
    }

    await prisma.scenario.update({
      where: { id: scenarioId },
      data: { needsReconciliation: false },
    });

    return this.getById(scenarioId);
  }
}

export const scenariosService = new ScenariosService();
