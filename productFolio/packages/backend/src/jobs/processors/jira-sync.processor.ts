import { Job } from 'bullmq';
import type { JiraSyncJobData } from '../queue.js';
import { syncAll, syncSiteProject } from '../../services/jira-sync.service.js';
import { prisma } from '../../lib/prisma.js';

/**
 * BullMQ processor for Jira sync jobs.
 * Handles both full syncs and targeted syncs.
 */
export async function processJiraSync(
  job: Job<JiraSyncJobData>
): Promise<{ synced: number; errors: string[] }> {
  const { connectionId, siteId, fullResync, triggeredBy } = job.data;

  console.log(`[jira-sync] Processing job ${job.id} (triggeredBy: ${triggeredBy})`);

  // If fullResync, reset cursors first
  if (fullResync) {
    const where: Record<string, string> = {};
    if (siteId) where.jiraSiteId = siteId;

    await prisma.integrationSyncCursor.updateMany({
      where,
      data: { cursorValue: null },
    });
    console.log('[jira-sync] Cursors reset for full resync');
  }

  // Targeted sync for a specific connection/site
  if (connectionId && siteId) {
    const site = await prisma.jiraSite.findUnique({
      where: { id: siteId },
      include: {
        projectSelections: { where: { isSelected: true } },
      },
    });

    if (!site) {
      throw new Error(`Site ${siteId} not found`);
    }

    let synced = 0;
    const errors: string[] = [];

    for (const project of site.projectSelections) {
      try {
        await syncSiteProject(
          connectionId,
          site.id,
          site.cloudId,
          project.id,
          project.projectKey,
          triggeredBy
        );
        synced++;
      } catch (error) {
        errors.push(`${project.projectKey}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return { synced, errors };
  }

  // Full sync of all connections
  return syncAll(triggeredBy);
}
