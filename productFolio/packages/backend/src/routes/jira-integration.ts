import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';
import { isJiraConfigured } from '../lib/config/jira.js';
import * as jiraAuthService from '../services/jira-auth.service.js';
import * as jiraApiService from '../services/jira-api.service.js';
import * as jiraSyncService from '../services/jira-sync.service.js';
import { enqueueJiraSync } from '../jobs/queue.js';
import {
  jiraCallbackSchema,
  connectionIdSchema,
  siteIdSchema,
  selectSitesSchema,
  selectProjectsSchema,
  triggerSyncSchema,
  syncRunsQuerySchema,
} from '../schemas/jira-integration.schema.js';

export async function jiraIntegrationRoutes(fastify: FastifyInstance) {
  // All routes require authentication except the OAuth callback
  // (Atlassian redirects here with no auth token)
  const UNAUTHENTICATED_PATHS = ['/api/integrations/jira/callback'];
  fastify.addHook('onRequest', async (request, reply) => {
    if (UNAUTHENTICATED_PATHS.includes(request.url.split('?')[0])) {
      return;
    }
    return fastify.authenticate(request, reply);
  });

  // Admin-only authorization hook
  const adminOnly = fastify.authorize(['ADMIN']);

  // ---- Health Check ----

  /**
   * GET /api/integrations/jira/health
   * Returns Jira integration health status. Never throws.
   */
  fastify.get('/api/integrations/jira/health', {
    preHandler: adminOnly,
  }, async (request, reply) => {
    const result: {
      ok: boolean;
      configured: boolean;
      connected: boolean;
      sites?: Array<{ name: string; url: string }>;
      error?: string;
      suggestion?: string;
    } = {
      ok: false,
      configured: false,
      connected: false,
    };

    // Check env var configuration
    if (!isJiraConfigured()) {
      result.error = 'Jira integration is not configured';
      result.suggestion = 'Set JIRA_CLIENT_ID, JIRA_CLIENT_SECRET, and JIRA_TOKEN_ENCRYPTION_KEY environment variables';
      return result;
    }

    result.configured = true;

    // Check DB for active connections
    try {
      const connections = await prisma.jiraConnection.findMany({
        where: { isActive: true },
        include: { sites: { where: { isSelected: true } } },
        take: 10,
      });

      if (connections.length === 0) {
        result.error = 'No active Jira connections';
        result.suggestion = 'Use the Connect Jira Account button in Settings to link your Atlassian account';
        return result;
      }

      result.connected = true;

      // Validate token on first connection by calling Atlassian API
      try {
        const { accessToken } = await jiraAuthService.getValidAccessToken(connections[0].id);
        await jiraAuthService.getAccessibleResources(accessToken);
      } catch (tokenErr) {
        result.ok = false;
        result.error = `Token validation failed: ${(tokenErr as Error).message}`;
        result.suggestion = 'Try reconnecting your Jira account';
        return result;
      }

      result.ok = true;
      result.sites = connections.flatMap(c =>
        c.sites.map(s => ({ name: s.siteName, url: s.siteUrl }))
      );
    } catch (dbErr) {
      result.error = `Database error: ${(dbErr as Error).message}`;
      result.suggestion = 'Check database connectivity';
    }

    return result;
  });

  // ---- OAuth Flow ----

  /**
   * GET /api/integrations/jira/connect
   * Returns the Atlassian authorization URL.
   */
  fastify.get('/api/integrations/jira/connect', {
    preHandler: adminOnly,
  }, async (request, reply) => {
    const url = jiraAuthService.getAuthorizationUrl(request.user.sub);
    return { authorizationUrl: url };
  });

  /**
   * GET /api/integrations/jira/callback
   * OAuth callback - exchanges code for tokens.
   */
  fastify.get<{
    Querystring: { code?: string; state?: string; error?: string };
  }>('/api/integrations/jira/callback', async (request, reply) => {
    const { code, state, error } = request.query;

    // Handle OAuth errors
    if (error) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return reply.redirect(`${frontendUrl}/admin/jira-settings?error=${encodeURIComponent(error)}`);
    }

    const parsed = jiraCallbackSchema.parse({ code, state });

    // Validate state and get userId
    const userId = jiraAuthService.validateState(parsed.state);

    // Exchange code for tokens
    const tokens = await jiraAuthService.exchangeCodeForTokens(parsed.code);

    // Store connection + sites
    await jiraAuthService.completeOAuthCallback(userId, tokens);

    // Redirect to frontend
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return reply.redirect(`${frontendUrl}/admin/jira-settings?connected=true`);
  });

  // ---- Connection Management ----

  /**
   * GET /api/integrations/jira/connections
   * List all Jira connections.
   */
  fastify.get('/api/integrations/jira/connections', {
    preHandler: adminOnly,
  }, async (request, reply) => {
    return jiraAuthService.listConnections();
  });

  /**
   * DELETE /api/integrations/jira/connections/:connectionId
   * Delete a Jira connection.
   */
  fastify.delete<{
    Params: { connectionId: string };
  }>('/api/integrations/jira/connections/:connectionId', {
    preHandler: adminOnly,
  }, async (request, reply) => {
    const { connectionId } = connectionIdSchema.parse(request.params);
    return jiraAuthService.deleteConnection(connectionId);
  });

  // ---- Site Management ----

  /**
   * GET /api/integrations/jira/connections/:connectionId/sites
   * List available sites for a connection.
   */
  fastify.get<{
    Params: { connectionId: string };
  }>('/api/integrations/jira/connections/:connectionId/sites', {
    preHandler: adminOnly,
  }, async (request, reply) => {
    const { connectionId } = connectionIdSchema.parse(request.params);
    return jiraAuthService.listSitesForConnection(connectionId);
  });

  /**
   * PUT /api/integrations/jira/connections/:connectionId/sites
   * Select sites for a connection.
   */
  fastify.put<{
    Params: { connectionId: string };
    Body: { siteIds: string[] };
  }>('/api/integrations/jira/connections/:connectionId/sites', {
    preHandler: adminOnly,
  }, async (request, reply) => {
    const { connectionId } = connectionIdSchema.parse(request.params);
    const { siteIds } = selectSitesSchema.parse(request.body);
    return jiraAuthService.selectSites(connectionId, siteIds);
  });

  // ---- Project Management ----

  /**
   * GET /api/integrations/jira/sites/:siteId/projects
   * List available projects for a site (from Jira API).
   */
  fastify.get<{
    Params: { siteId: string };
  }>('/api/integrations/jira/sites/:siteId/projects', {
    preHandler: adminOnly,
  }, async (request, reply) => {
    const { siteId } = siteIdSchema.parse(request.params);

    // Get the site and its connection
    const site = await prisma.jiraSite.findUnique({
      where: { id: siteId },
      include: {
        jiraConnection: true,
        projectSelections: true,
      },
    });

    if (!site) {
      throw new NotFoundError('Jira site not found');
    }

    // Fetch projects from Jira API
    const projects = await jiraApiService.listAllProjects({
      connectionId: site.jiraConnectionId,
      cloudId: site.cloudId,
    });

    // Mark which ones are already selected
    const selectedKeys = new Set(
      site.projectSelections.filter(p => p.isSelected).map(p => p.projectKey)
    );

    return projects.map(p => ({
      id: p.id,
      key: p.key,
      name: p.name,
      projectTypeKey: p.projectTypeKey,
      isSelected: selectedKeys.has(p.key),
    }));
  });

  /**
   * PUT /api/integrations/jira/sites/:siteId/projects
   * Select projects for a site.
   */
  fastify.put<{
    Params: { siteId: string };
    Body: { projects: Array<{ projectId: string; projectKey: string; projectName: string }> };
  }>('/api/integrations/jira/sites/:siteId/projects', {
    preHandler: adminOnly,
  }, async (request, reply) => {
    const { siteId } = siteIdSchema.parse(request.params);
    const { projects } = selectProjectsSchema.parse(request.body);
    return jiraAuthService.selectProjects(siteId, projects);
  });

  // ---- Sync Management ----

  /**
   * POST /api/integrations/jira/sync
   * Trigger a manual sync (enqueues BullMQ job).
   */
  fastify.post<{
    Body: { connectionId?: string; siteId?: string; fullResync?: boolean };
  }>('/api/integrations/jira/sync', {
    preHandler: adminOnly,
  }, async (request, reply) => {
    const input = triggerSyncSchema.parse(request.body || {});

    const jobId = await enqueueJiraSync({
      connectionId: input.connectionId,
      siteId: input.siteId,
      fullResync: input.fullResync,
      triggeredBy: 'manual',
    });

    return { jobId, message: 'Sync job enqueued' };
  });

  /**
   * GET /api/integrations/jira/sync/status
   * Get sync status: cursors and recent runs.
   */
  fastify.get('/api/integrations/jira/sync/status', {
    preHandler: adminOnly,
  }, async (request, reply) => {
    return jiraSyncService.getSyncStatus();
  });

  /**
   * GET /api/integrations/jira/sync/runs
   * Get paginated sync run history.
   */
  fastify.get<{
    Querystring: { page?: string; limit?: string; siteId?: string; status?: string };
  }>('/api/integrations/jira/sync/runs', {
    preHandler: adminOnly,
  }, async (request, reply) => {
    const params = syncRunsQuerySchema.parse(request.query);
    return jiraSyncService.getSyncRuns(params);
  });
}
