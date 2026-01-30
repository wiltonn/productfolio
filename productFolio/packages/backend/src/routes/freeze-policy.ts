import { FastifyInstance } from 'fastify';
import { UserRole } from '@prisma/client';
import { updateFreezePolicySchema } from '../schemas/baseline.schema.js';
import { freezePolicyService } from '../services/freeze-policy.service.js';

export async function freezePolicyRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', fastify.authenticate);

  const authorizeAdmin = fastify.authorize([UserRole.ADMIN, UserRole.PRODUCT_OWNER]);

  // GET /api/freeze-policies/:periodId - Get freeze policy for a period
  fastify.get<{ Params: { periodId: string } }>(
    '/api/freeze-policies/:periodId',
    async (request, reply) => {
      const policy = await freezePolicyService.getByPeriod(request.params.periodId);
      if (!policy) {
        return reply.code(404).send({ error: 'FreezePolicy not found' });
      }
      return reply.code(200).send(policy);
    }
  );

  // PUT /api/freeze-policies/:periodId - Create or update freeze policy
  fastify.put<{ Params: { periodId: string }; Body: unknown }>(
    '/api/freeze-policies/:periodId',
    { preHandler: authorizeAdmin },
    async (request, reply) => {
      const data = updateFreezePolicySchema.parse(request.body);
      const policy = await freezePolicyService.upsert(
        request.params.periodId,
        data.changeFreezeDate
      );
      return reply.code(200).send(policy);
    }
  );

  // DELETE /api/freeze-policies/:periodId - Remove freeze policy
  fastify.delete<{ Params: { periodId: string } }>(
    '/api/freeze-policies/:periodId',
    { preHandler: authorizeAdmin },
    async (request, reply) => {
      await freezePolicyService.delete(request.params.periodId);
      return reply.code(204).send();
    }
  );

  // GET /api/freeze-policies/:periodId/status - Get freeze status
  fastify.get<{ Params: { periodId: string } }>(
    '/api/freeze-policies/:periodId/status',
    async (request, reply) => {
      const isFrozen = await freezePolicyService.isFrozen(request.params.periodId);
      const policy = await freezePolicyService.getByPeriod(request.params.periodId);
      return reply.code(200).send({
        isFrozen,
        changeFreezeDate: policy?.changeFreezeDate ?? null,
        periodId: request.params.periodId,
      });
    }
  );
}
