import { createHash } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { searchIssues } from './jira-api.service.js';
import type { JiraIssue, JiraAdfDocument, JiraAdfNode } from '../types/jira.js';

const BACKFILL_DAYS = 180;
const PAGE_SIZE = 50;
const DESCRIPTION_EXCERPT_LENGTH = 500;

/**
 * Extract plain text from an ADF (Atlassian Document Format) document.
 * Returns first N characters as an excerpt.
 */
export function extractAdfText(doc: JiraAdfDocument | string | null | undefined): string {
  if (!doc) return '';
  if (typeof doc === 'string') return doc.slice(0, DESCRIPTION_EXCERPT_LENGTH);

  const parts: string[] = [];

  function walk(nodes: JiraAdfNode[] | undefined) {
    if (!nodes) return;
    for (const node of nodes) {
      if (node.text) {
        parts.push(node.text);
      }
      if (node.content) {
        walk(node.content);
      }
    }
  }

  walk(doc.content);
  return parts.join(' ').slice(0, DESCRIPTION_EXCERPT_LENGTH);
}

/**
 * Compute a SHA-256 content hash of the normalized fields for change detection.
 */
export function computeContentHash(issue: JiraIssue): string {
  const fields = issue.fields;
  const hashInput = JSON.stringify({
    summary: fields.summary,
    description: extractAdfText(fields.description),
    issueType: fields.issuetype?.name,
    status: fields.status?.name,
    statusCategory: fields.status?.statusCategory?.name,
    priority: fields.priority?.name,
    labels: fields.labels || [],
    assignee: fields.assignee?.displayName,
    reporter: fields.reporter?.displayName,
  });

  return createHash('sha256').update(hashInput).digest('hex');
}

/**
 * Build a JQL query for sync.
 */
export function buildJql(projectKey: string, cursorValue?: string | null): string {
  if (cursorValue) {
    // Incremental: overlap by 1 minute to avoid missing issues
    const cursorDate = new Date(cursorValue);
    cursorDate.setMinutes(cursorDate.getMinutes() - 1);
    const formatted = cursorDate.toISOString().replace('T', ' ').slice(0, 19);
    return `project = "${projectKey}" AND updated >= "${formatted}" ORDER BY updated ASC`;
  }

  // Backfill: last N days
  return `project = "${projectKey}" AND updated >= -${BACKFILL_DAYS}d ORDER BY updated ASC`;
}

interface SyncResult {
  issuesFound: number;
  issuesCreated: number;
  issuesUpdated: number;
  issuesSkipped: number;
  lastUpdated: string | null;
}

/**
 * Sync a single site+project: paginate through JQL results and upsert IntakeItems.
 */
export async function syncSiteProject(
  connectionId: string,
  siteId: string,
  cloudId: string,
  projectSelectionId: string,
  projectKey: string,
  triggeredBy: string
): Promise<SyncResult> {
  // Create sync run
  const syncRun = await prisma.integrationSyncRun.create({
    data: {
      jiraSiteId: siteId,
      projectKey,
      status: 'RUNNING',
      triggeredBy,
    },
  });

  // Load or create cursor
  const cursor = await prisma.integrationSyncCursor.upsert({
    where: {
      jiraSiteId_jiraProjectSelectionId: {
        jiraSiteId: siteId,
        jiraProjectSelectionId: projectSelectionId,
      },
    },
    create: {
      jiraSiteId: siteId,
      jiraProjectSelectionId: projectSelectionId,
    },
    update: {},
  });

  const jql = buildJql(projectKey, cursor.cursorValue);

  let issuesFound = 0;
  let issuesCreated = 0;
  let issuesUpdated = 0;
  let issuesSkipped = 0;
  let lastUpdated: string | null = null;
  let startAt = 0;
  let hasMore = true;

  try {
    while (hasMore) {
      const searchResult = await searchIssues(
        { connectionId, cloudId },
        jql,
        startAt,
        PAGE_SIZE
      );

      issuesFound += searchResult.issues.length;

      for (const issue of searchResult.issues) {
        const result = await upsertIntakeItem(siteId, issue);
        if (result === 'created') issuesCreated++;
        else if (result === 'updated') issuesUpdated++;
        else issuesSkipped++;

        // Track latest updated timestamp for cursor
        if (issue.fields.updated) {
          if (!lastUpdated || issue.fields.updated > lastUpdated) {
            lastUpdated = issue.fields.updated;
          }
        }
      }

      startAt += searchResult.issues.length;
      hasMore = startAt < searchResult.total && searchResult.issues.length > 0;
    }

    // Advance cursor
    if (lastUpdated) {
      await prisma.integrationSyncCursor.update({
        where: { id: cursor.id },
        data: {
          cursorValue: lastUpdated,
          lastSyncedAt: new Date(),
        },
      });
    }

    // Complete sync run
    await prisma.integrationSyncRun.update({
      where: { id: syncRun.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        issuesFound,
        issuesCreated,
        issuesUpdated,
        issuesSkipped,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const status = issuesFound > 0 ? 'PARTIAL' : 'FAILED';

    await prisma.integrationSyncRun.update({
      where: { id: syncRun.id },
      data: {
        status,
        completedAt: new Date(),
        issuesFound,
        issuesCreated,
        issuesUpdated,
        issuesSkipped,
        errorMessage,
      },
    });

    // Still advance cursor if we processed some issues
    if (lastUpdated) {
      await prisma.integrationSyncCursor.update({
        where: { id: cursor.id },
        data: {
          cursorValue: lastUpdated,
          lastSyncedAt: new Date(),
        },
      });
    }

    throw error;
  }

  return { issuesFound, issuesCreated, issuesUpdated, issuesSkipped, lastUpdated };
}

/**
 * Upsert a single intake item from a Jira issue.
 * Returns 'created', 'updated', or 'skipped'.
 */
async function upsertIntakeItem(
  siteId: string,
  issue: JiraIssue
): Promise<'created' | 'updated' | 'skipped'> {
  const fields = issue.fields;
  const contentHash = computeContentHash(issue);

  // Check if item already exists
  const existing = await prisma.intakeItem.findUnique({
    where: {
      jiraSiteId_jiraIssueId: {
        jiraSiteId: siteId,
        jiraIssueId: issue.id,
      },
    },
  });

  const now = new Date();

  if (existing) {
    if (existing.contentHash === contentHash) {
      // No changes, just update lastSeenAt
      await prisma.intakeItem.update({
        where: { id: existing.id },
        data: { lastSeenAt: now },
      });
      return 'skipped';
    }

    // Content changed, update
    await prisma.intakeItem.update({
      where: { id: existing.id },
      data: {
        summary: fields.summary,
        jiraIssueKey: issue.key,
        descriptionExcerpt: extractAdfText(fields.description),
        issueTypeName: fields.issuetype?.name || null,
        statusName: fields.status?.name || null,
        statusCategory: fields.status?.statusCategory?.name || null,
        priorityName: fields.priority?.name || null,
        labels: fields.labels || [],
        assigneeName: fields.assignee?.displayName || null,
        reporterName: fields.reporter?.displayName || null,
        jiraCreatedAt: fields.created ? new Date(fields.created) : null,
        jiraUpdatedAt: fields.updated ? new Date(fields.updated) : null,
        contentHash,
        lastSyncedAt: now,
        lastSeenAt: now,
        itemStatus: 'ACTIVE',
      },
    });
    return 'updated';
  }

  // Create new item
  const site = await prisma.jiraSite.findUnique({
    where: { id: siteId },
    select: { siteUrl: true },
  });

  await prisma.intakeItem.create({
    data: {
      jiraSiteId: siteId,
      jiraIssueId: issue.id,
      jiraIssueKey: issue.key,
      jiraIssueUrl: site ? `${site.siteUrl}/browse/${issue.key}` : null,
      summary: fields.summary,
      descriptionExcerpt: extractAdfText(fields.description),
      issueTypeName: fields.issuetype?.name || null,
      statusName: fields.status?.name || null,
      statusCategory: fields.status?.statusCategory?.name || null,
      priorityName: fields.priority?.name || null,
      labels: fields.labels || [],
      assigneeName: fields.assignee?.displayName || null,
      reporterName: fields.reporter?.displayName || null,
      jiraCreatedAt: fields.created ? new Date(fields.created) : null,
      jiraUpdatedAt: fields.updated ? new Date(fields.updated) : null,
      contentHash,
      lastSyncedAt: now,
      lastSeenAt: now,
    },
  });
  return 'created';
}

/**
 * Sync all selected sites and projects for all active connections.
 */
export async function syncAll(triggeredBy: string): Promise<{ synced: number; errors: string[] }> {
  const connections = await prisma.jiraConnection.findMany({
    where: { isActive: true },
    include: {
      sites: {
        where: { isSelected: true },
        include: {
          projectSelections: {
            where: { isSelected: true },
          },
        },
      },
    },
  });

  let synced = 0;
  const errors: string[] = [];

  for (const connection of connections) {
    for (const site of connection.sites) {
      for (const project of site.projectSelections) {
        try {
          await syncSiteProject(
            connection.id,
            site.id,
            site.cloudId,
            project.id,
            project.projectKey,
            triggeredBy
          );
          synced++;
        } catch (error) {
          const msg = `Failed to sync ${site.siteName}/${project.projectKey}: ${error instanceof Error ? error.message : String(error)}`;
          console.error(`[jira-sync] ${msg}`);
          errors.push(msg);
        }
      }
    }
  }

  return { synced, errors };
}

/**
 * Get sync status: cursors and recent runs.
 */
export async function getSyncStatus() {
  const cursors = await prisma.integrationSyncCursor.findMany({
    include: {
      jiraSite: {
        select: { id: true, siteName: true, cloudId: true },
      },
      jiraProjectSelection: {
        select: { id: true, projectKey: true, projectName: true },
      },
    },
    orderBy: { lastSyncedAt: 'desc' },
  });

  const recentRuns = await prisma.integrationSyncRun.findMany({
    take: 10,
    orderBy: { startedAt: 'desc' },
    include: {
      jiraSite: {
        select: { siteName: true },
      },
    },
  });

  return { cursors, recentRuns };
}

/**
 * Get paginated sync runs.
 */
export async function getSyncRuns(params: {
  page: number;
  limit: number;
  siteId?: string;
  status?: string;
}) {
  const where: Record<string, unknown> = {};
  if (params.siteId) where.jiraSiteId = params.siteId;
  if (params.status) where.status = params.status;

  const [data, total] = await Promise.all([
    prisma.integrationSyncRun.findMany({
      where,
      include: {
        jiraSite: {
          select: { siteName: true, siteUrl: true },
        },
      },
      orderBy: { startedAt: 'desc' },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
    prisma.integrationSyncRun.count({ where }),
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
