import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import 'dotenv/config';
import { registerErrorHandler } from './lib/error-handler.js';
import authPlugin from './plugins/auth.plugin.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { initiativesRoutes } from './routes/initiatives.js';
import { scopingRoutes } from './routes/scoping.js';
import { resourcesRoutes } from './routes/resources.js';
import { scenariosRoutes } from './routes/scenarios.js';
import { jobsRoutes } from './routes/jobs.js';
import { getWorkerStatus } from './jobs/index.js';

const fastify = Fastify({
  logger: true,
});

// CORS with credentials support
await fastify.register(cors, {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
});

// Cookie support (required for auth)
await fastify.register(cookie);

// Auth plugin (JWT + decorators)
await fastify.register(authPlugin);

registerErrorHandler(fastify);

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
await fastify.register(jobsRoutes);

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
