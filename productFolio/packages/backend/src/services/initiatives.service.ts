import { InitiativeStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  NotFoundError,
  ValidationError,
  WorkflowError,
} from '../lib/errors.js';
import {
  isValidStatusTransition,
  CreateInitiativeInput,
  UpdateInitiativeInput,
  InitiativeFiltersInput,
  BulkUpdateInput,
  BulkDeleteInput,
  CsvRowInput,
  CsvRowSchema,
} from '../schemas/initiatives.schema.js';
import type {
  PaginatedResponse,
  CsvImportResult,
  BulkUpdateResult,
} from '../types/index.js';

/**
 * List initiatives with filtering and pagination
 */
export async function list(
  filters: Partial<InitiativeFiltersInput> = {},
  pagination?: { page?: number; limit?: number }
): Promise<PaginatedResponse<any>> {
  const page = pagination?.page ?? filters.page ?? 1;
  const limit = pagination?.limit ?? filters.limit ?? 20;

  const where: any = {};

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.businessOwnerId) {
    where.businessOwnerId = filters.businessOwnerId;
  }

  if (filters.productOwnerId) {
    where.productOwnerId = filters.productOwnerId;
  }

  if (filters.targetQuarter) {
    where.targetQuarter = filters.targetQuarter;
  }

  if (filters.search) {
    where.OR = [
      {
        title: {
          contains: filters.search,
          mode: 'insensitive',
        },
      },
      {
        description: {
          contains: filters.search,
          mode: 'insensitive',
        },
      },
    ];
  }

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    prisma.initiative.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        businessOwner: true,
        productOwner: true,
      },
    }),
    prisma.initiative.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

/**
 * Get a single initiative by ID
 */
export async function getById(id: string) {
  const initiative = await prisma.initiative.findUnique({
    where: { id },
    include: {
      businessOwner: true,
      productOwner: true,
      scopeItems: true,
      approvals: {
        include: { approver: true },
        orderBy: { approvedAt: 'desc' },
      },
    },
  });

  if (!initiative) {
    throw new NotFoundError('Initiative', id);
  }

  return initiative;
}

/**
 * Create a new initiative
 */
export async function create(data: CreateInitiativeInput) {
  // Validate that owners exist
  const [businessOwner, productOwner] = await Promise.all([
    prisma.user.findUnique({ where: { id: data.businessOwnerId } }),
    prisma.user.findUnique({ where: { id: data.productOwnerId } }),
  ]);

  if (!businessOwner) {
    throw new NotFoundError('User', data.businessOwnerId);
  }

  if (!productOwner) {
    throw new NotFoundError('User', data.productOwnerId);
  }

  const initiative = await prisma.initiative.create({
    data: {
      title: data.title,
      description: data.description || null,
      businessOwnerId: data.businessOwnerId,
      productOwnerId: data.productOwnerId,
      status: data.status || InitiativeStatus.DRAFT,
      targetQuarter: data.targetQuarter || null,
      customFields: data.customFields || null,
    },
    include: {
      businessOwner: true,
      productOwner: true,
    },
  });

  return initiative;
}

/**
 * Update an initiative
 */
export async function update(id: string, data: UpdateInitiativeInput) {
  const initiative = await prisma.initiative.findUnique({
    where: { id },
  });

  if (!initiative) {
    throw new NotFoundError('Initiative', id);
  }

  // Validate owners if provided
  if (data.businessOwnerId || data.productOwnerId) {
    const promises = [];

    if (data.businessOwnerId) {
      promises.push(
        prisma.user.findUnique({
          where: { id: data.businessOwnerId },
        })
      );
    } else {
      promises.push(Promise.resolve(null));
    }

    if (data.productOwnerId) {
      promises.push(
        prisma.user.findUnique({
          where: { id: data.productOwnerId },
        })
      );
    } else {
      promises.push(Promise.resolve(null));
    }

    const [businessOwner, productOwner] = await Promise.all(promises);

    if (data.businessOwnerId && !businessOwner) {
      throw new NotFoundError('User', data.businessOwnerId);
    }

    if (data.productOwnerId && !productOwner) {
      throw new NotFoundError('User', data.productOwnerId);
    }
  }

  const updateData: any = {};

  if (data.title !== undefined) {
    updateData.title = data.title;
  }

  if (data.description !== undefined) {
    updateData.description = data.description;
  }

  if (data.businessOwnerId !== undefined) {
    updateData.businessOwnerId = data.businessOwnerId;
  }

  if (data.productOwnerId !== undefined) {
    updateData.productOwnerId = data.productOwnerId;
  }

  if (data.targetQuarter !== undefined) {
    updateData.targetQuarter = data.targetQuarter;
  }

  if (data.customFields !== undefined) {
    updateData.customFields = data.customFields;
  }

  const updated = await prisma.initiative.update({
    where: { id },
    data: updateData,
    include: {
      businessOwner: true,
      productOwner: true,
    },
  });

  return updated;
}

/**
 * Delete an initiative
 */
export async function deleteInitiative(id: string) {
  const initiative = await prisma.initiative.findUnique({
    where: { id },
  });

  if (!initiative) {
    throw new NotFoundError('Initiative', id);
  }

  // Cascade delete is handled by Prisma
  await prisma.initiative.delete({
    where: { id },
  });

  return { success: true };
}

/**
 * Transition initiative status
 */
export async function transitionStatus(id: string, newStatus: InitiativeStatus) {
  const initiative = await prisma.initiative.findUnique({
    where: { id },
  });

  if (!initiative) {
    throw new NotFoundError('Initiative', id);
  }

  // Validate transition
  if (!isValidStatusTransition(initiative.status, newStatus)) {
    throw new WorkflowError(
      `Cannot transition from ${initiative.status} to ${newStatus}`,
      initiative.status,
      newStatus
    );
  }

  const updated = await prisma.initiative.update({
    where: { id },
    data: { status: newStatus },
    include: {
      businessOwner: true,
      productOwner: true,
    },
  });

  return updated;
}

/**
 * Bulk update initiatives
 */
export async function bulkUpdate(data: BulkUpdateInput): Promise<BulkUpdateResult> {
  const results: BulkUpdateResult = {
    updated: 0,
    failed: 0,
    errors: [],
  };

  for (const id of data.ids) {
    try {
      const initiative = await prisma.initiative.findUnique({
        where: { id },
      });

      if (!initiative) {
        results.failed++;
        results.errors.push({
          id,
          message: 'Initiative not found',
        });
        continue;
      }

      const updateData: any = {};

      if (data.updates.customFields !== undefined) {
        updateData.customFields = data.updates.customFields;
      }

      if (Object.keys(updateData).length === 0) {
        results.updated++;
        continue;
      }

      await prisma.initiative.update({
        where: { id },
        data: updateData,
      });

      results.updated++;
    } catch (error) {
      results.failed++;
      results.errors.push({
        id,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}

/**
 * Bulk delete initiatives
 */
export async function bulkDelete(data: BulkDeleteInput): Promise<BulkUpdateResult> {
  const results: BulkUpdateResult = {
    updated: 0,
    failed: 0,
    errors: [],
  };

  for (const id of data.ids) {
    try {
      const initiative = await prisma.initiative.findUnique({
        where: { id },
      });

      if (!initiative) {
        results.failed++;
        results.errors.push({
          id,
          message: 'Initiative not found',
        });
        continue;
      }

      await prisma.initiative.delete({
        where: { id },
      });

      results.updated++;
    } catch (error) {
      results.failed++;
      results.errors.push({
        id,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}

/**
 * Import initiatives from CSV
 */
export async function importFromCsv(
  csvData: Array<Record<string, string>>
): Promise<CsvImportResult> {
  const results: CsvImportResult = {
    success: 0,
    failed: 0,
    errors: [],
  };

  for (let i = 0; i < csvData.length; i++) {
    const row = csvData[i];
    const rowNumber = i + 2; // +2 because row 1 is headers and we're 0-indexed

    try {
      // Parse and validate row
      const validatedRow = CsvRowSchema.parse(row);

      // Validate owners exist
      const [businessOwner, productOwner] = await Promise.all([
        prisma.user.findUnique({
          where: { id: validatedRow.businessOwnerId },
        }),
        prisma.user.findUnique({
          where: { id: validatedRow.productOwnerId },
        }),
      ]);

      if (!businessOwner) {
        throw new Error(
          `Business owner with ID '${validatedRow.businessOwnerId}' not found`
        );
      }

      if (!productOwner) {
        throw new Error(
          `Product owner with ID '${validatedRow.productOwnerId}' not found`
        );
      }

      // Create initiative
      await prisma.initiative.create({
        data: {
          title: validatedRow.title,
          description: validatedRow.description || null,
          businessOwnerId: validatedRow.businessOwnerId,
          productOwnerId: validatedRow.productOwnerId,
          status: validatedRow.status || InitiativeStatus.DRAFT,
          targetQuarter: validatedRow.targetQuarter || null,
          customFields: null,
        },
      });

      results.success++;
    } catch (error) {
      results.failed++;
      results.errors.push({
        row: rowNumber,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}

/**
 * Export initiatives to CSV format
 */
export async function exportToCsv(filters: Partial<InitiativeFiltersInput> = {}) {
  const where: any = {};

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.businessOwnerId) {
    where.businessOwnerId = filters.businessOwnerId;
  }

  if (filters.productOwnerId) {
    where.productOwnerId = filters.productOwnerId;
  }

  if (filters.targetQuarter) {
    where.targetQuarter = filters.targetQuarter;
  }

  if (filters.search) {
    where.OR = [
      {
        title: {
          contains: filters.search,
          mode: 'insensitive',
        },
      },
      {
        description: {
          contains: filters.search,
          mode: 'insensitive',
        },
      },
    ];
  }

  const initiatives = await prisma.initiative.findMany({
    where,
    include: {
      businessOwner: true,
      productOwner: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Transform to CSV format
  const csvRows = initiatives.map((initiative) => ({
    id: initiative.id,
    title: initiative.title,
    description: initiative.description || '',
    status: initiative.status,
    targetQuarter: initiative.targetQuarter || '',
    businessOwnerId: initiative.businessOwnerId,
    businessOwnerName: initiative.businessOwner.name,
    productOwnerId: initiative.productOwnerId,
    productOwnerName: initiative.productOwner.name,
    createdAt: initiative.createdAt.toISOString(),
    updatedAt: initiative.updatedAt.toISOString(),
  }));

  // Generate CSV header and data
  const headers = [
    'id',
    'title',
    'description',
    'status',
    'targetQuarter',
    'businessOwnerId',
    'businessOwnerName',
    'productOwnerId',
    'productOwnerName',
    'createdAt',
    'updatedAt',
  ];

  const csvContent = [
    headers.join(','),
    ...csvRows.map((row) =>
      headers
        .map((header) => {
          const value = row[header as keyof typeof row] || '';
          // Escape quotes and wrap in quotes if contains comma, newline, or quote
          const stringValue = String(value);
          if (
            stringValue.includes(',') ||
            stringValue.includes('\n') ||
            stringValue.includes('"')
          ) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        })
        .join(',')
    ),
  ].join('\n');

  return csvContent;
}
