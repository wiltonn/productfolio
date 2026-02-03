import { IntakeRequestStatus, InitiativeOrigin, InitiativeStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  NotFoundError,
  ValidationError,
  WorkflowError,
} from '../lib/errors.js';
import {
  isValidIntakeTransition,
  type CreateIntakeRequestInput,
  type UpdateIntakeRequestInput,
  type IntakeRequestStatusTransitionInput,
  type IntakeRequestFiltersInput,
  type ConvertToInitiativeInput,
} from '../schemas/intake-request.schema.js';
import type { Prisma } from '@prisma/client';

// Statuses where full editing is allowed
const EDITABLE_STATUSES: IntakeRequestStatus[] = [
  IntakeRequestStatus.DRAFT,
  IntakeRequestStatus.TRIAGE,
  IntakeRequestStatus.ASSESSED,
];

// Statuses where only notes can be edited
const NOTES_ONLY_STATUSES: IntakeRequestStatus[] = [
  IntakeRequestStatus.APPROVED,
];

const INCLUDE_RELATIONS = {
  requestedBy: { select: { id: true, name: true, email: true } },
  sponsor: { select: { id: true, name: true, email: true } },
  portfolioArea: { select: { id: true, name: true } },
  initiative: { select: { id: true, title: true, status: true } },
  intakeItem: {
    select: {
      id: true,
      jiraIssueKey: true,
      jiraIssueUrl: true,
      summary: true,
      statusCategory: true,
      priorityName: true,
    },
  },
};

/**
 * List intake requests with filtering and pagination.
 */
export async function list(filters: Partial<IntakeRequestFiltersInput> = {}) {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;

  const where: Prisma.IntakeRequestWhereInput = {};

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.portfolioAreaId) {
    where.portfolioAreaId = filters.portfolioAreaId;
  }

  if (filters.targetQuarter) {
    where.targetQuarter = filters.targetQuarter;
  }

  if (filters.requestedById) {
    where.requestedById = filters.requestedById;
  }

  if (filters.sponsorId) {
    where.sponsorId = filters.sponsorId;
  }

  if (filters.sourceType) {
    where.sourceType = filters.sourceType;
  }

  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
      { customerName: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    prisma.intakeRequest.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: INCLUDE_RELATIONS,
    }),
    prisma.intakeRequest.count({ where }),
  ]);

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

/**
 * Get a single intake request by ID.
 */
export async function getById(id: string) {
  const item = await prisma.intakeRequest.findUnique({
    where: { id },
    include: INCLUDE_RELATIONS,
  });

  if (!item) {
    throw new NotFoundError('IntakeRequest', id);
  }

  return item;
}

/**
 * Create a new intake request.
 */
export async function create(data: CreateIntakeRequestInput, createdBy?: string) {
  // Validate referenced entities
  if (data.intakeItemId) {
    const existing = await prisma.intakeRequest.findUnique({
      where: { intakeItemId: data.intakeItemId },
    });
    if (existing) {
      throw new ValidationError(
        'This Jira item already has an associated intake request'
      );
    }
    const intakeItem = await prisma.intakeItem.findUnique({
      where: { id: data.intakeItemId },
    });
    if (!intakeItem) {
      throw new NotFoundError('IntakeItem', data.intakeItemId);
    }
  }

  if (data.portfolioAreaId) {
    const area = await prisma.portfolioArea.findUnique({
      where: { id: data.portfolioAreaId },
    });
    if (!area) {
      throw new NotFoundError('PortfolioArea', data.portfolioAreaId);
    }
  }

  if (data.requestedById) {
    const user = await prisma.user.findUnique({
      where: { id: data.requestedById },
    });
    if (!user) {
      throw new NotFoundError('User', data.requestedById);
    }
  }

  if (data.sponsorId) {
    const user = await prisma.user.findUnique({
      where: { id: data.sponsorId },
    });
    if (!user) {
      throw new NotFoundError('User', data.sponsorId);
    }
  }

  const item = await prisma.intakeRequest.create({
    data: {
      title: data.title,
      description: data.description || null,
      requestedById: data.requestedById || null,
      sponsorId: data.sponsorId || null,
      portfolioAreaId: data.portfolioAreaId || null,
      targetQuarter: data.targetQuarter || null,
      valueScore: data.valueScore ?? null,
      effortEstimate: data.effortEstimate || null,
      urgency: data.urgency || null,
      customerName: data.customerName || null,
      tags: data.tags ? (data.tags as any) : null,
      strategicThemes: data.strategicThemes ? (data.strategicThemes as any) : null,
      sourceType: data.sourceType || null,
      intakeItemId: data.intakeItemId || null,
      decisionNotes: data.decisionNotes || null,
      createdBy: createdBy || null,
      updatedBy: createdBy || null,
    },
    include: INCLUDE_RELATIONS,
  });

  return item;
}

/**
 * Update an intake request.
 */
export async function update(
  id: string,
  data: UpdateIntakeRequestInput,
  updatedBy?: string
) {
  const existing = await prisma.intakeRequest.findUnique({ where: { id } });

  if (!existing) {
    throw new NotFoundError('IntakeRequest', id);
  }

  // Check editability based on status
  if (
    !EDITABLE_STATUSES.includes(existing.status) &&
    !NOTES_ONLY_STATUSES.includes(existing.status)
  ) {
    throw new WorkflowError(
      `Cannot edit intake request in ${existing.status} status`
    );
  }

  // In APPROVED status, only notes can be edited
  if (NOTES_ONLY_STATUSES.includes(existing.status)) {
    const allowedKeys = ['decisionNotes'];
    const attemptedKeys = Object.keys(data).filter(
      (k) => data[k as keyof typeof data] !== undefined
    );
    const disallowed = attemptedKeys.filter((k) => !allowedKeys.includes(k));
    if (disallowed.length > 0) {
      throw new WorkflowError(
        `In ${existing.status} status, only notes can be edited`
      );
    }
  }

  if (data.portfolioAreaId) {
    const area = await prisma.portfolioArea.findUnique({
      where: { id: data.portfolioAreaId },
    });
    if (!area) {
      throw new NotFoundError('PortfolioArea', data.portfolioAreaId);
    }
  }

  const item = await prisma.intakeRequest.update({
    where: { id },
    data: {
      ...data,
      tags: data.tags !== undefined ? (data.tags as any) : undefined,
      strategicThemes:
        data.strategicThemes !== undefined ? (data.strategicThemes as any) : undefined,
      updatedBy: updatedBy || undefined,
    },
    include: INCLUDE_RELATIONS,
  });

  return item;
}

/**
 * Delete an intake request (only DRAFT or CLOSED).
 */
export async function remove(id: string) {
  const existing = await prisma.intakeRequest.findUnique({ where: { id } });

  if (!existing) {
    throw new NotFoundError('IntakeRequest', id);
  }

  if (
    existing.status !== IntakeRequestStatus.DRAFT &&
    existing.status !== IntakeRequestStatus.CLOSED
  ) {
    throw new WorkflowError(
      `Can only delete intake requests in DRAFT or CLOSED status (current: ${existing.status})`
    );
  }

  await prisma.intakeRequest.delete({ where: { id } });
  return { deleted: true };
}

/**
 * Transition intake request status.
 */
export async function transitionStatus(
  id: string,
  input: IntakeRequestStatusTransitionInput,
  updatedBy?: string
) {
  const existing = await prisma.intakeRequest.findUnique({ where: { id } });

  if (!existing) {
    throw new NotFoundError('IntakeRequest', id);
  }

  if (!isValidIntakeTransition(existing.status, input.newStatus)) {
    throw new WorkflowError(
      `Cannot transition from ${existing.status} to ${input.newStatus}`
    );
  }

  // CONVERTED can only happen via the convert endpoint
  if (input.newStatus === IntakeRequestStatus.CONVERTED) {
    throw new WorkflowError(
      'Use the /convert endpoint to transition to CONVERTED status'
    );
  }

  const updateData: Prisma.IntakeRequestUpdateInput = {
    status: input.newStatus,
    updatedBy: updatedBy || undefined,
  };

  if (input.closedReason && input.newStatus === IntakeRequestStatus.CLOSED) {
    updateData.closedReason = input.closedReason;
  }

  if (input.decisionNotes) {
    updateData.decisionNotes = input.decisionNotes;
  }

  const item = await prisma.intakeRequest.update({
    where: { id },
    data: updateData,
    include: INCLUDE_RELATIONS,
  });

  return item;
}

/**
 * Convert an approved intake request to an initiative.
 */
export async function convertToInitiative(
  id: string,
  input: ConvertToInitiativeInput,
  convertedBy?: string
) {
  const existing = await prisma.intakeRequest.findUnique({
    where: { id },
    include: INCLUDE_RELATIONS,
  });

  if (!existing) {
    throw new NotFoundError('IntakeRequest', id);
  }

  if (existing.status !== IntakeRequestStatus.APPROVED) {
    throw new WorkflowError(
      `Can only convert intake requests in APPROVED status (current: ${existing.status})`
    );
  }

  if (existing.initiativeId) {
    throw new WorkflowError('This intake request has already been converted');
  }

  // Validate referenced users for the new initiative
  const [businessOwner, productOwner] = await Promise.all([
    prisma.user.findUnique({ where: { id: input.businessOwnerId } }),
    prisma.user.findUnique({ where: { id: input.productOwnerId } }),
  ]);

  if (!businessOwner) {
    throw new NotFoundError('User (businessOwner)', input.businessOwnerId);
  }
  if (!productOwner) {
    throw new NotFoundError('User (productOwner)', input.productOwnerId);
  }

  if (input.portfolioAreaId) {
    const area = await prisma.portfolioArea.findUnique({
      where: { id: input.portfolioAreaId },
    });
    if (!area) {
      throw new NotFoundError('PortfolioArea', input.portfolioAreaId);
    }
  }

  if (input.productLeaderId) {
    const leader = await prisma.user.findUnique({
      where: { id: input.productLeaderId },
    });
    if (!leader) {
      throw new NotFoundError('User (productLeader)', input.productLeaderId);
    }
  }

  // Freeze a snapshot of the intake request at conversion time
  const conversionSnapshot = {
    title: existing.title,
    description: existing.description,
    valueScore: existing.valueScore,
    effortEstimate: existing.effortEstimate,
    urgency: existing.urgency,
    customerName: existing.customerName,
    targetQuarter: existing.targetQuarter,
    tags: existing.tags,
    strategicThemes: existing.strategicThemes,
    convertedAt: new Date().toISOString(),
    convertedBy,
  };

  // Use transaction for atomicity
  const result = await prisma.$transaction(async (tx) => {
    // Create the initiative
    const initiative = await tx.initiative.create({
      data: {
        title: input.title || existing.title,
        description: input.description !== undefined ? input.description : existing.description,
        businessOwnerId: input.businessOwnerId,
        productOwnerId: input.productOwnerId,
        portfolioAreaId: input.portfolioAreaId || existing.portfolioAreaId || null,
        productLeaderId: input.productLeaderId || null,
        status: InitiativeStatus.PROPOSED,
        origin: InitiativeOrigin.INTAKE_CONVERTED,
        targetQuarter: input.targetQuarter || existing.targetQuarter || null,
      },
      include: {
        businessOwner: true,
        productOwner: true,
        portfolioArea: true,
        productLeader: true,
      },
    });

    // Update the intake request
    const updatedRequest = await tx.intakeRequest.update({
      where: { id },
      data: {
        status: IntakeRequestStatus.CONVERTED,
        initiativeId: initiative.id,
        conversionSnapshot,
        updatedBy: convertedBy || undefined,
      },
      include: INCLUDE_RELATIONS,
    });

    return { initiative, intakeRequest: updatedRequest };
  });

  return result;
}

/**
 * Get intake request statistics.
 */
export async function getStats() {
  const [
    total,
    byStatus,
    byUrgency,
    withInitiative,
    withoutInitiative,
  ] = await Promise.all([
    prisma.intakeRequest.count(),
    prisma.intakeRequest.groupBy({
      by: ['status'],
      _count: { id: true },
    }),
    prisma.intakeRequest.groupBy({
      by: ['urgency'],
      where: { status: { not: IntakeRequestStatus.CLOSED } },
      _count: { id: true },
    }),
    prisma.intakeRequest.count({
      where: { initiativeId: { not: null } },
    }),
    prisma.intakeRequest.count({
      where: { initiativeId: null, status: { not: IntakeRequestStatus.CLOSED } },
    }),
  ]);

  return {
    total,
    byStatus: byStatus.map((row) => ({
      status: row.status,
      count: row._count.id,
    })),
    byUrgency: byUrgency.map((row) => ({
      urgency: row.urgency || 'Unset',
      count: row._count.id,
    })),
    converted: withInitiative,
    unconverted: withoutInitiative,
  };
}
