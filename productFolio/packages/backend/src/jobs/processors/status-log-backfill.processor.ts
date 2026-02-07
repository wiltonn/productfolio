import { Job } from 'bullmq';
import { prisma } from '../../lib/prisma.js';
import type { StatusLogBackfillJobData } from '../queue.js';

interface BackfillResult {
  processed: number;
  inserted: number;
  skipped: number;
  errors: Array<{ eventId: string; message: string }>;
  processedAt: string;
}

/**
 * Backfill InitiativeStatusLog from AuditEvent records.
 *
 * Queries AuditEvent entries where entityType = 'Initiative' and
 * action = 'status_transition', then inserts corresponding
 * InitiativeStatusLog records that don't already exist.
 *
 * This is a one-time migration job to populate historical data
 * for Mode B (empirical) forecasting.
 */
export async function processStatusLogBackfill(
  job: Job<StatusLogBackfillJobData>
): Promise<BackfillResult> {
  const { batchSize = 500 } = job.data;

  job.log('Starting InitiativeStatusLog backfill from AuditEvent records');

  const result: BackfillResult = {
    processed: 0,
    inserted: 0,
    skipped: 0,
    errors: [],
    processedAt: new Date().toISOString(),
  };

  // Count total audit events to process
  const totalEvents = await prisma.auditEvent.count({
    where: {
      entityType: 'Initiative',
      action: 'status_transition',
    },
  });

  job.log(`Found ${totalEvents} status_transition audit events to process`);

  if (totalEvents === 0) {
    job.log('No audit events to backfill. Done.');
    return result;
  }

  // Get existing status log entries to avoid duplicates
  const existingLogs = await prisma.initiativeStatusLog.findMany({
    select: { initiativeId: true, transitionedAt: true },
  });

  const existingKeys = new Set(
    existingLogs.map((log) => `${log.initiativeId}:${log.transitionedAt.toISOString()}`)
  );

  job.log(`Found ${existingLogs.length} existing status log entries (will skip duplicates)`);

  // Process in batches using cursor-based pagination
  let cursor: string | undefined;
  const totalBatches = Math.ceil(totalEvents / batchSize);
  let batchIndex = 0;

  while (true) {
    const events = await prisma.auditEvent.findMany({
      where: {
        entityType: 'Initiative',
        action: 'status_transition',
      },
      orderBy: { createdAt: 'asc' },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    if (events.length === 0) break;

    batchIndex++;
    job.log(`Processing batch ${batchIndex}/${totalBatches} (${events.length} events)`);

    const toInsert: Array<{
      initiativeId: string;
      fromStatus: string;
      toStatus: string;
      transitionedAt: Date;
      actorId: string | null;
    }> = [];

    for (const event of events) {
      result.processed++;

      try {
        const payload = event.payload as Record<string, unknown>;

        const fromStatus = payload.fromStatus as string | undefined;
        const toStatus = payload.toStatus as string | undefined;

        if (!fromStatus || !toStatus) {
          result.skipped++;
          continue;
        }

        // Check for duplicate using initiative ID + timestamp
        const key = `${event.entityId}:${event.createdAt.toISOString()}`;
        if (existingKeys.has(key)) {
          result.skipped++;
          continue;
        }

        toInsert.push({
          initiativeId: event.entityId,
          fromStatus,
          toStatus,
          transitionedAt: event.createdAt,
          actorId: event.actorId,
        });

        // Track to prevent in-batch duplicates
        existingKeys.add(key);
      } catch (error) {
        result.errors.push({
          eventId: event.id,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Batch insert
    if (toInsert.length > 0) {
      try {
        const created = await prisma.initiativeStatusLog.createMany({
          data: toInsert.map((item) => ({
            initiativeId: item.initiativeId,
            fromStatus: item.fromStatus as any,
            toStatus: item.toStatus as any,
            transitionedAt: item.transitionedAt,
            actorId: item.actorId,
          })),
          skipDuplicates: true,
        });
        result.inserted += created.count;
      } catch (error) {
        // Fall back to individual inserts
        for (const item of toInsert) {
          try {
            await prisma.initiativeStatusLog.create({
              data: {
                initiativeId: item.initiativeId,
                fromStatus: item.fromStatus as any,
                toStatus: item.toStatus as any,
                transitionedAt: item.transitionedAt,
                actorId: item.actorId,
              },
            });
            result.inserted++;
          } catch (insertError) {
            result.errors.push({
              eventId: item.initiativeId,
              message: insertError instanceof Error ? insertError.message : 'Insert failed',
            });
          }
        }
      }
    }

    // Update progress
    const progress = Math.round((result.processed / totalEvents) * 100);
    await job.updateProgress(progress);

    cursor = events[events.length - 1].id;
  }

  job.log(`Backfill complete:`);
  job.log(`- Processed: ${result.processed}`);
  job.log(`- Inserted: ${result.inserted}`);
  job.log(`- Skipped (duplicates or missing data): ${result.skipped}`);
  job.log(`- Errors: ${result.errors.length}`);

  return result;
}
