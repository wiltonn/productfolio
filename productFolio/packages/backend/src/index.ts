import Fastify from 'fastify';
import cors from '@fastify/cors';
import 'dotenv/config';
import { registerErrorHandler } from './lib/error-handler.js';
import { initiativesRoutes } from './routes/initiatives.js';
import { scopingRoutes } from './routes/scoping.js';
import { resourcesRoutes } from './routes/resources.js';
import { scenariosRoutes } from './routes/scenarios.js';

const fastify = Fastify({
  logger: true,
});

await fastify.register(cors, {
  origin: true,
});

registerErrorHandler(fastify);

fastify.get('/health', async () => {
  return { status: 'ok' };
});

// Register API routes
await fastify.register(initiativesRoutes);
await fastify.register(scopingRoutes);
await fastify.register(resourcesRoutes);
await fastify.register(scenariosRoutes);

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
