import { FastifyInstance } from 'fastify';
import { entitlementService } from '../services/entitlement.service.js';
import { updateTenantConfigSchema, entitlementEventQuerySchema } from '../schemas/entitlement.schema.js';
import { deriveSeatType } from '../lib/permissions.js';

export async function entitlementRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', fastify.authenticate);

  const requireAdmin = fastify.requirePermission('authority:admin');

  // GET /api/admin/entitlements — licensed + observer user lists
  fastify.get('/api/admin/entitlements', { preHandler: [requireAdmin] }, async (request, reply) => {
    const [licensed, observers] = await Promise.all([
      entitlementService.getLicensedUsers(),
      entitlementService.getNonLicensedUsers(),
    ]);
    return reply.send({ licensed, observers });
  });

  // GET /api/admin/entitlements/summary — counts + tier + seat limit
  fastify.get('/api/admin/entitlements/summary', { preHandler: [requireAdmin] }, async (request, reply) => {
    const summary = await entitlementService.getEntitlementSummary();
    return reply.send(summary);
  });

  // PUT /api/admin/entitlements/config — update tier/seat limit
  fastify.put<{ Body: Record<string, unknown> }>(
    '/api/admin/entitlements/config',
    { preHandler: [requireAdmin, fastify.requireSeat('decision')] },
    async (request, reply) => {
      const data = updateTenantConfigSchema.parse(request.body);
      const config = await entitlementService.updateTenantConfig(data);
      return reply.send(config);
    }
  );

  // GET /api/admin/entitlements/export — CSV export of licensed users
  fastify.get('/api/admin/entitlements/export', { preHandler: [requireAdmin] }, async (request, reply) => {
    const { users } = await entitlementService.getLicensedUsers();
    const csv = [
      'name,email,role,seatType',
      ...users.map((u) => {
        return `"${u.name}","${u.email}","${u.role}","decision"`;
      }),
    ].join('\n');

    return reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', 'attachment; filename="licensed-users.csv"')
      .send(csv);
  });

  // GET /api/admin/revops — usage summary + expansion signals
  fastify.get('/api/admin/revops', { preHandler: [requireAdmin] }, async (request, reply) => {
    const signals = await entitlementService.getExpansionSignals();
    return reply.send(signals);
  });

  // GET /api/admin/revops/events — paginated event log
  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/api/admin/revops/events',
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const query = entitlementEventQuerySchema.parse(request.query);
      const events = await entitlementService.getEvents(query);
      return reply.send(events);
    }
  );
}
