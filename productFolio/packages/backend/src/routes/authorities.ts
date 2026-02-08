import { FastifyInstance } from 'fastify';
import { authorityService } from '../services/authority.service.js';
import { UpdateAuthoritySchema, AuditLogQuerySchema } from '../schemas/authority.schema.js';

export async function authorityRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', fastify.authenticate);

  const requireAdmin = fastify.requirePermission('authority:admin');
  const requireDecisionSeat = fastify.requireSeat('decision');

  // GET /api/authorities — list all authorities (any authenticated user)
  fastify.get('/api/authorities', async (_request, reply) => {
    const authorities = await authorityService.list();
    return reply.send(authorities);
  });

  // GET /api/authorities/role-mapping — get role-to-permissions mapping
  fastify.get('/api/authorities/role-mapping', async (_request, reply) => {
    const mapping = authorityService.getRoleMapping();
    return reply.send(mapping);
  });

  // GET /api/authorities/drift — compare registry vs code (admin only)
  fastify.get(
    '/api/authorities/drift',
    { preHandler: requireAdmin },
    async (_request, reply) => {
      const drift = await authorityService.detectDrift();
      return reply.send(drift);
    }
  );

  // GET /api/authorities/user/:userId/effective — get effective permissions (admin only)
  fastify.get<{ Params: { userId: string } }>(
    '/api/authorities/user/:userId/effective',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const result = await authorityService.getEffectivePermissions(request.params.userId);
      return reply.send(result);
    }
  );

  // PUT /api/authorities/:code — update authority description/deprecated (admin only)
  fastify.put<{ Params: { code: string } }>(
    '/api/authorities/:code',
    { preHandler: [requireAdmin, requireDecisionSeat] },
    async (request, reply) => {
      const data = UpdateAuthoritySchema.parse(request.body);
      const updated = await authorityService.update(
        request.params.code,
        data,
        request.user.sub
      );
      return reply.send(updated);
    }
  );

  // GET /api/authorities/audit-log — paginated audit log (admin only)
  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/api/authorities/audit-log',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const query = AuditLogQuerySchema.parse(request.query);
      const result = await authorityService.getAuditLog(query);
      return reply.send(result);
    }
  );
}
