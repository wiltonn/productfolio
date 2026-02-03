import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';
import type { Prisma } from '@prisma/client';

interface IntakeListParams {
  page: number;
  limit: number;
  search?: string;
  statusCategory?: string;
  priorityName?: string;
  siteId?: string;
  projectKey?: string;
  linked?: string;
  itemStatus?: string;
  sortBy?: string;
  sortOrder?: string;
}

/**
 * List intake items with filtering and pagination.
 */
export async function listIntakeItems(params: IntakeListParams) {
  const where: Prisma.IntakeItemWhereInput = {};

  // Status filter
  where.itemStatus = (params.itemStatus as 'ACTIVE' | 'ARCHIVED' | 'DELETED') || 'ACTIVE';

  // Search
  if (params.search) {
    where.OR = [
      { summary: { contains: params.search, mode: 'insensitive' } },
      { jiraIssueKey: { contains: params.search, mode: 'insensitive' } },
      { assigneeName: { contains: params.search, mode: 'insensitive' } },
      { reporterName: { contains: params.search, mode: 'insensitive' } },
    ];
  }

  // Status category filter
  if (params.statusCategory) {
    where.statusCategory = params.statusCategory;
  }

  // Priority filter
  if (params.priorityName) {
    where.priorityName = params.priorityName;
  }

  // Site filter
  if (params.siteId) {
    where.jiraSiteId = params.siteId;
  }

  // Project key filter
  if (params.projectKey) {
    where.jiraIssueKey = { startsWith: `${params.projectKey}-` };
  }

  // Linked/unlinked filter
  if (params.linked === 'true') {
    where.initiativeId = { not: null };
  } else if (params.linked === 'false') {
    where.initiativeId = null;
  }

  // Sort
  const sortBy = params.sortBy || 'jiraUpdatedAt';
  const sortOrder = (params.sortOrder || 'desc') as 'asc' | 'desc';
  const orderBy: Prisma.IntakeItemOrderByWithRelationInput = { [sortBy]: sortOrder };

  const [data, total] = await Promise.all([
    prisma.intakeItem.findMany({
      where,
      include: {
        jiraSite: {
          select: {
            id: true,
            siteName: true,
            siteUrl: true,
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
      orderBy,
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
    prisma.intakeItem.count({ where }),
  ]);

  return {
    data,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages: Math.ceil(total / params.limit),
    },
  };
}

/**
 * Get a single intake item by ID.
 */
export async function getIntakeItem(id: string) {
  const item = await prisma.intakeItem.findUnique({
    where: { id },
    include: {
      jiraSite: {
        select: {
          id: true,
          siteName: true,
          siteUrl: true,
          cloudId: true,
          jiraConnection: {
            select: {
              id: true,
              displayName: true,
            },
          },
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

  if (!item) {
    throw new NotFoundError('Intake item not found');
  }

  return item;
}

/**
 * Get intake dashboard stats.
 */
export async function getIntakeStats() {
  const [
    totalActive,
    byStatusCategory,
    byPriority,
    linked,
    unlinked,
    recentlyUpdated,
  ] = await Promise.all([
    prisma.intakeItem.count({ where: { itemStatus: 'ACTIVE' } }),
    prisma.intakeItem.groupBy({
      by: ['statusCategory'],
      where: { itemStatus: 'ACTIVE' },
      _count: { id: true },
    }),
    prisma.intakeItem.groupBy({
      by: ['priorityName'],
      where: { itemStatus: 'ACTIVE' },
      _count: { id: true },
    }),
    prisma.intakeItem.count({
      where: { itemStatus: 'ACTIVE', initiativeId: { not: null } },
    }),
    prisma.intakeItem.count({
      where: { itemStatus: 'ACTIVE', initiativeId: null },
    }),
    prisma.intakeItem.count({
      where: {
        itemStatus: 'ACTIVE',
        jiraUpdatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  return {
    totalActive,
    byStatusCategory: byStatusCategory.map(row => ({
      statusCategory: row.statusCategory || 'Unknown',
      count: row._count.id,
    })),
    byPriority: byPriority.map(row => ({
      priorityName: row.priorityName || 'Unknown',
      count: row._count.id,
    })),
    linked,
    unlinked,
    recentlyUpdated,
  };
}
