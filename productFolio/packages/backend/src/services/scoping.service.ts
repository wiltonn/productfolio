import { prisma } from '../lib/prisma.js';
import { NotFoundError, ValidationError, WorkflowError } from '../lib/errors.js';
import { PaginationParams, PaginatedResponse, ApprovalHistoryEntry, SkillDemand } from '../types/index.js';
import type { ScopeItem, Approval, Initiative } from '@prisma/client';
import { CreateScopeItemInput, UpdateScopeItemInput } from '../schemas/scoping.schema.js';

export class ScopingService {
  /**
   * List scope items for an initiative with pagination
   */
  async listByInitiative(
    initiativeId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResponse<ScopeItem>> {
    // Verify initiative exists
    const initiative = await prisma.initiative.findUnique({
      where: { id: initiativeId },
    });

    if (!initiative) {
      throw new NotFoundError('Initiative', initiativeId);
    }

    const page = pagination?.page || 1;
    const limit = pagination?.limit || 10;
    const skip = (page - 1) * limit;

    const [scopeItems, total] = await Promise.all([
      prisma.scopeItem.findMany({
        where: { initiativeId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.scopeItem.count({
        where: { initiativeId },
      }),
    ]);

    return {
      data: scopeItems,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a single scope item by ID
   */
  async getById(id: string): Promise<ScopeItem> {
    const scopeItem = await prisma.scopeItem.findUnique({
      where: { id },
    });

    if (!scopeItem) {
      throw new NotFoundError('ScopeItem', id);
    }

    return scopeItem;
  }

  /**
   * Create a new scope item under an initiative
   */
  async create(initiativeId: string, data: CreateScopeItemInput): Promise<ScopeItem> {
    // Verify initiative exists
    const initiative = await prisma.initiative.findUnique({
      where: { id: initiativeId },
    });

    if (!initiative) {
      throw new NotFoundError('Initiative', initiativeId);
    }

    const scopeItem = await prisma.scopeItem.create({
      data: {
        initiativeId,
        name: data.name,
        description: data.description,
        skillDemand: data.skillDemand || null,
        estimateP50: data.estimateP50 || null,
        estimateP90: data.estimateP90 || null,
        periodDistributions: data.periodDistributions
          ? {
              create: data.periodDistributions.map((pd) => ({
                periodId: pd.periodId,
                distribution: pd.distribution,
              })),
            }
          : undefined,
      },
      include: {
        periodDistributions: true,
      },
    });

    return scopeItem;
  }

  /**
   * Update a scope item
   */
  async update(id: string, data: UpdateScopeItemInput): Promise<ScopeItem> {
    // Verify scope item exists
    const scopeItem = await prisma.scopeItem.findUnique({
      where: { id },
    });

    if (!scopeItem) {
      throw new NotFoundError('ScopeItem', id);
    }

    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.skillDemand !== undefined) updateData.skillDemand = data.skillDemand;
    if (data.estimateP50 !== undefined) updateData.estimateP50 = data.estimateP50;
    if (data.estimateP90 !== undefined) updateData.estimateP90 = data.estimateP90;

    // Handle period distributions update
    if (data.periodDistributions !== undefined) {
      // Delete existing distributions and create new ones
      await prisma.scopeItemPeriodDistribution.deleteMany({
        where: { scopeItemId: id },
      });

      if (data.periodDistributions.length > 0) {
        await prisma.scopeItemPeriodDistribution.createMany({
          data: data.periodDistributions.map((pd) => ({
            scopeItemId: id,
            periodId: pd.periodId,
            distribution: pd.distribution,
          })),
        });
      }
    }

    const updated = await prisma.scopeItem.update({
      where: { id },
      data: updateData,
      include: {
        periodDistributions: true,
      },
    });

    return updated;
  }

  /**
   * Delete a scope item
   */
  async delete(id: string): Promise<void> {
    // Verify scope item exists
    const scopeItem = await prisma.scopeItem.findUnique({
      where: { id },
    });

    if (!scopeItem) {
      throw new NotFoundError('ScopeItem', id);
    }

    await prisma.scopeItem.delete({
      where: { id },
    });
  }

  /**
   * Submit initiative for scoping
   * Can only submit from PROPOSED status
   */
  async submitForApproval(initiativeId: string, notes?: string): Promise<Initiative> {
    const initiative = await prisma.initiative.findUnique({
      where: { id: initiativeId },
    });

    if (!initiative) {
      throw new NotFoundError('Initiative', initiativeId);
    }

    if (initiative.status !== 'PROPOSED') {
      throw new WorkflowError(
        `Cannot begin scoping from ${initiative.status} status`,
        initiative.status,
        'SCOPING',
      );
    }

    const updated = await prisma.initiative.update({
      where: { id: initiativeId },
      data: {
        status: 'SCOPING',
      },
    });

    return updated;
  }

  /**
   * Approve an initiative (advance from SCOPING to RESOURCING)
   * Creates an Approval record with version
   */
  async approve(initiativeId: string, approverId: string, notes?: string): Promise<{
    initiative: Initiative;
    approval: Approval;
  }> {
    const initiative = await prisma.initiative.findUnique({
      where: { id: initiativeId },
    });

    if (!initiative) {
      throw new NotFoundError('Initiative', initiativeId);
    }

    if (initiative.status !== 'SCOPING') {
      throw new WorkflowError(
        `Cannot approve from ${initiative.status} status`,
        initiative.status,
        'RESOURCING',
      );
    }

    // Verify approver exists
    const approver = await prisma.user.findUnique({
      where: { id: approverId },
    });

    if (!approver) {
      throw new NotFoundError('User', approverId);
    }

    // Get the next version number
    const lastApproval = await prisma.approval.findFirst({
      where: { initiativeId },
      orderBy: { version: 'desc' },
    });

    const nextVersion = (lastApproval?.version || 0) + 1;

    // Create approval record and update initiative in transaction
    const [updatedInitiative, approval] = await Promise.all([
      prisma.initiative.update({
        where: { id: initiativeId },
        data: {
          status: 'RESOURCING',
        },
      }),
      prisma.approval.create({
        data: {
          initiativeId,
          approverId,
          version: nextVersion,
          notes: notes || null,
        },
      }),
    ]);

    return {
      initiative: updatedInitiative,
      approval,
    };
  }

  /**
   * Reject an initiative
   * Changes status back to PROPOSED
   */
  async reject(initiativeId: string, notes?: string): Promise<Initiative> {
    const initiative = await prisma.initiative.findUnique({
      where: { id: initiativeId },
    });

    if (!initiative) {
      throw new NotFoundError('Initiative', initiativeId);
    }

    if (initiative.status !== 'SCOPING') {
      throw new WorkflowError(
        `Cannot reject from ${initiative.status} status`,
        initiative.status,
        'PROPOSED',
      );
    }

    const updated = await prisma.initiative.update({
      where: { id: initiativeId },
      data: {
        status: 'PROPOSED',
      },
    });

    return updated;
  }

  /**
   * Get approval history for an initiative
   */
  async getApprovalHistory(initiativeId: string): Promise<ApprovalHistoryEntry[]> {
    const initiative = await prisma.initiative.findUnique({
      where: { id: initiativeId },
    });

    if (!initiative) {
      throw new NotFoundError('Initiative', initiativeId);
    }

    const approvals = await prisma.approval.findMany({
      where: { initiativeId },
      include: {
        approver: true,
      },
      orderBy: { approvedAt: 'desc' },
    });

    return approvals.map((approval) => ({
      id: approval.id,
      version: approval.version,
      approverId: approval.approverId,
      approverName: approval.approver.name,
      notes: approval.notes,
      approvedAt: approval.approvedAt,
    }));
  }
}

export const scopingService = new ScopingService();
