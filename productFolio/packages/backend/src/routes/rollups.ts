import { FastifyInstance } from 'fastify';
import { RollupParamsSchema } from '../schemas/rollup.schema.js';
import { rollupService } from '../services/rollup.service.js';

export async function rollupRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', fastify.authenticate);

  const requireRollups = fastify.requireFeature('triple_constraint_rollups_v1');

  // GET /api/scenarios/:id/rollups/portfolio-areas
  fastify.get<{ Params: { id: string } }>(
    '/api/scenarios/:id/rollups/portfolio-areas',
    { preHandler: [requireRollups] },
    async (request, reply) => {
      const { id } = RollupParamsSchema.parse(request.params);
      const result = await rollupService.rollupByPortfolioArea(id);
      return reply.code(200).send(result);
    }
  );

  // GET /api/scenarios/:id/rollups/org-nodes
  fastify.get<{ Params: { id: string } }>(
    '/api/scenarios/:id/rollups/org-nodes',
    { preHandler: [requireRollups] },
    async (request, reply) => {
      const { id } = RollupParamsSchema.parse(request.params);
      const result = await rollupService.rollupByOrgNode(id);
      return reply.code(200).send(result);
    }
  );

  // GET /api/scenarios/:id/rollups/business-owners
  fastify.get<{ Params: { id: string } }>(
    '/api/scenarios/:id/rollups/business-owners',
    { preHandler: [requireRollups] },
    async (request, reply) => {
      const { id } = RollupParamsSchema.parse(request.params);
      const result = await rollupService.rollupByBusinessOwner(id);
      return reply.code(200).send(result);
    }
  );
}
