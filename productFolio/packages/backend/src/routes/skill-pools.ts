import { FastifyInstance } from 'fastify';
import {
  createSkillPoolSchema,
  updateSkillPoolSchema,
  skillPoolFiltersSchema,
} from '../schemas/skill-pool.schema.js';
import { skillPoolService } from '../services/skill-pool.service.js';

export async function skillPoolsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', fastify.requireFeature('token_planning_v1'));
  fastify.addHook('onRequest', fastify.authenticate);

  const requireDecisionSeat = fastify.requireSeat('decision');

  // GET /api/skill-pools — list skill pools
  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/api/skill-pools',
    async (request, reply) => {
      const filters = skillPoolFiltersSchema.parse(request.query);
      const pools = await skillPoolService.list(filters.includeInactive);
      return reply.code(200).send(pools);
    }
  );

  // GET /api/skill-pools/:id — get single pool
  fastify.get<{ Params: { id: string } }>(
    '/api/skill-pools/:id',
    async (request, reply) => {
      const pool = await skillPoolService.getById(request.params.id);
      return reply.code(200).send(pool);
    }
  );

  // POST /api/skill-pools — create pool (requires job-profile:write)
  fastify.post<{ Body: unknown }>(
    '/api/skill-pools',
    { preHandler: [fastify.requirePermission('job-profile:write'), requireDecisionSeat] },
    async (request, reply) => {
      const data = createSkillPoolSchema.parse(request.body);
      const pool = await skillPoolService.create(data);
      return reply.code(201).send(pool);
    }
  );

  // PUT /api/skill-pools/:id — update pool (requires job-profile:write)
  fastify.put<{ Params: { id: string }; Body: unknown }>(
    '/api/skill-pools/:id',
    { preHandler: [fastify.requirePermission('job-profile:write'), requireDecisionSeat] },
    async (request, reply) => {
      const data = updateSkillPoolSchema.parse(request.body);
      const pool = await skillPoolService.update(request.params.id, data);
      return reply.code(200).send(pool);
    }
  );

  // DELETE /api/skill-pools/:id — soft delete (requires job-profile:write)
  fastify.delete<{ Params: { id: string } }>(
    '/api/skill-pools/:id',
    { preHandler: [fastify.requirePermission('job-profile:write'), requireDecisionSeat] },
    async (request, reply) => {
      await skillPoolService.delete(request.params.id);
      return reply.code(204).send();
    }
  );
}
