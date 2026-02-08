import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import 'dotenv/config';
import { registerErrorHandler } from './lib/error-handler.js';
import authPlugin from './plugins/auth.plugin.js';
import featureFlagPlugin from './plugins/feature-flag.plugin.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { initiativesRoutes } from './routes/initiatives.js';
import { scopingRoutes } from './routes/scoping.js';
import { resourcesRoutes } from './routes/resources.js';
import { scenariosRoutes } from './routes/scenarios.js';
import { periodsRoutes } from './routes/periods.js';
import { jobsRoutes } from './routes/jobs.js';
import { orgTreeRoutes } from './routes/org-tree.js';
import { approvalRoutes } from './routes/approvals.js';
import { freezePolicyRoutes } from './routes/freeze-policy.js';
import { driftRoutes } from './routes/drift.js';
import { portfolioAreasRoutes } from './routes/portfolio-areas.js';
import { jiraIntegrationRoutes } from './routes/jira-integration.js';
import { intakeRoutes } from './routes/intake.js';
import { intakeRequestRoutes } from './routes/intake-requests.js';
import { featureFlagsRoutes } from './routes/feature-flags.js';
import { jobProfilesRoutes } from './routes/job-profiles.js';
import { forecastRoutes } from './routes/forecast.js';
import { planningRoutes } from './routes/planning.js';
import { skillPoolsRoutes } from './routes/skill-pools.js';
import { getWorkerStatus } from './jobs/index.js';
import { validateJiraConfig } from './lib/config/jira.js';

const fastify = Fastify({
  logger: true,
});

// CORS with credentials support
await fastify.register(cors, {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
});

// Cookie support
await fastify.register(cookie);

// Auth plugin (Auth0 JWKS + decorators)
await fastify.register(authPlugin);

// Feature flag plugin (requireFeature decorator)
await fastify.register(featureFlagPlugin);

registerErrorHandler(fastify);

// Validate Jira integration config at startup (non-fatal)
try {
  const jiraConfig = validateJiraConfig();
  if (jiraConfig) {
    fastify.log.info('Jira integration: configured');
  } else {
    fastify.log.warn('Jira integration: not configured (JIRA_CLIENT_ID, JIRA_CLIENT_SECRET, JIRA_TOKEN_ENCRYPTION_KEY not set)');
  }
} catch (err) {
  fastify.log.warn(`Jira integration: configuration error — ${(err as Error).message}`);
}

fastify.get('/health', async () => {
  return {
    status: 'ok',
    workers: getWorkerStatus(),
  };
});

// Register API routes
await fastify.register(authRoutes);
await fastify.register(userRoutes);
await fastify.register(initiativesRoutes);
await fastify.register(scopingRoutes);
await fastify.register(resourcesRoutes);
await fastify.register(scenariosRoutes);
await fastify.register(periodsRoutes);
await fastify.register(jobsRoutes);
await fastify.register(orgTreeRoutes);
await fastify.register(approvalRoutes);
await fastify.register(freezePolicyRoutes);
await fastify.register(driftRoutes);
await fastify.register(portfolioAreasRoutes);
await fastify.register(jiraIntegrationRoutes);
await fastify.register(intakeRoutes);
await fastify.register(intakeRequestRoutes);
await fastify.register(featureFlagsRoutes);
await fastify.register(jobProfilesRoutes);
await fastify.register(forecastRoutes);
await fastify.register(planningRoutes);
await fastify.register(skillPoolsRoutes);

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000', 10);
    const host = process.env.HOST || '0.0.0.0';
    await fastify.listen({ port, host });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
