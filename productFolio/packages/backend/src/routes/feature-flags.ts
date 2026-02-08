import { FastifyInstance } from 'fastify';
import { UpdateFeatureFlagSchema } from '../schemas/feature-flags.schema.js';
import * as featureFlagService from '../services/feature-flag.service.js';

export async function featureFlagsRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate);

  const requireDecisionSeat = fastify.requireSeat('decision');

  /**
   * GET /api/feature-flags
   * List all feature flags (used by admin UI and frontend hook)
   */
  fastify.get('/api/feature-flags', async (_request, reply) => {
    const flags = await featureFlagService.listFlags();
    return reply.send(flags);
  });

  /**
   * GET /api/feature-flags/:key
   * Get a single feature flag by key
   */
  fastify.get<{
    Params: { key: string };
  }>('/api/feature-flags/:key', async (request, reply) => {
    const flag = await featureFlagService.getFlag(request.params.key);
    return reply.send(flag);
  });

  /**
   * PUT /api/feature-flags/:key
   * Update a feature flag (ADMIN only)
   */
  fastify.put<{
    Params: { key: string };
  }>(
    '/api/feature-flags/:key',
    { preHandler: [fastify.requirePermission('feature-flag:admin'), requireDecisionSeat] },
    async (request, reply) => {
      const data = UpdateFeatureFlagSchema.parse(request.body);
      const flag = await featureFlagService.setFlag(request.params.key, data);
      return reply.send(flag);
    }
  );
}
