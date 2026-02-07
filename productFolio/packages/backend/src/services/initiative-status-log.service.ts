import { InitiativeStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';

/**
 * Log a status transition for an initiative.
 */
export async function logTransition(
  initiativeId: string,
  fromStatus: InitiativeStatus,
  toStatus: InitiativeStatus,
  actorId?: string | null
) {
  return prisma.initiativeStatusLog.create({
    data: {
      initiativeId,
      fromStatus,
      toStatus,
      actorId: actorId ?? null,
    },
  });
}

/**
 * Get the full status history for an initiative, newest first.
 */
export async function getHistory(initiativeId: string) {
  // Verify initiative exists
  const initiative = await prisma.initiative.findUnique({
    where: { id: initiativeId },
    select: { id: true },
  });

  if (!initiative) {
    throw new NotFoundError('Initiative', initiativeId);
  }

  return prisma.initiativeStatusLog.findMany({
    where: { initiativeId },
    orderBy: { transitionedAt: 'desc' },
  });
}

/**
 * Compute cycle-time statistics: average days spent in each status.
 *
 * Accepts optional filters to scope the calculation:
 * - initiativeIds: restrict to specific initiatives
 * - fromDate / toDate: restrict to transitions within a date range
 *
 * Returns an array of { status, avgDays, count } entries.
 */
export async function getCycleTimes(options?: {
  initiativeIds?: string[];
  fromDate?: Date;
  toDate?: Date;
}) {
  const where: Record<string, unknown> = {};

  if (options?.initiativeIds?.length) {
    where.initiativeId = { in: options.initiativeIds };
  }

  if (options?.fromDate || options?.toDate) {
    const transitionedAt: Record<string, Date> = {};
    if (options.fromDate) transitionedAt.gte = options.fromDate;
    if (options.toDate) transitionedAt.lte = options.toDate;
    where.transitionedAt = transitionedAt;
  }

  const logs = await prisma.initiativeStatusLog.findMany({
    where,
    orderBy: [{ initiativeId: 'asc' }, { transitionedAt: 'asc' }],
  });

  // Group consecutive transitions per initiative to compute durations
  const durationsByStatus = new Map<InitiativeStatus, number[]>();

  for (let i = 0; i < logs.length - 1; i++) {
    const current = logs[i];
    const next = logs[i + 1];

    // Only pair transitions belonging to the same initiative
    if (current.initiativeId !== next.initiativeId) continue;

    const daysInStatus =
      (next.transitionedAt.getTime() - current.transitionedAt.getTime()) /
      (1000 * 60 * 60 * 24);

    const existing = durationsByStatus.get(current.toStatus) ?? [];
    existing.push(daysInStatus);
    durationsByStatus.set(current.toStatus, existing);
  }

  const results: Array<{ status: InitiativeStatus; avgDays: number; count: number }> = [];

  for (const [status, durations] of durationsByStatus) {
    const sum = durations.reduce((a, b) => a + b, 0);
    results.push({
      status,
      avgDays: Math.round((sum / durations.length) * 100) / 100,
      count: durations.length,
    });
  }

  return results;
}
