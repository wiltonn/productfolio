import { prisma } from '../lib/prisma.js';
import type { Prisma } from '@prisma/client';

// ============================================================================
// Audit Service
// ============================================================================

export interface AuditLogInput {
  actorId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  payload: Prisma.InputJsonValue;
  ipAddress?: string | null;
}

export async function logAuditEvent(input: AuditLogInput) {
  return prisma.auditEvent.create({
    data: {
      actorId: input.actorId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      payload: input.payload,
      ipAddress: input.ipAddress ?? null,
    },
  });
}

export async function queryAuditEvents(filters: {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  action?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}) {
  const {
    entityType,
    entityId,
    actorId,
    action,
    startDate,
    endDate,
    page = 1,
    limit = 50,
  } = filters;

  const where: Record<string, unknown> = {};

  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;
  if (actorId) where.actorId = actorId;
  if (action) where.action = action;

  if (startDate || endDate) {
    const createdAt: Record<string, Date> = {};
    if (startDate) createdAt.gte = startDate;
    if (endDate) createdAt.lte = endDate;
    where.createdAt = createdAt;
  }

  const skip = (page - 1) * limit;

  const [events, total] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      skip,
      take: limit,
      include: {
        actor: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.auditEvent.count({ where }),
  ]);

  return {
    data: events,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
