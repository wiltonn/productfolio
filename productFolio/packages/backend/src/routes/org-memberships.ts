import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  AssignMembershipSchema,
  BulkAssignSchema,
  MembershipListFiltersSchema,
} from '../schemas/org-tree.schema.js';
import * as orgMembershipService from '../services/org-membership.service.js';

// ============================================================================
// Org Membership Routes
// ============================================================================

export async function orgMembershipRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate);

  const adminOnly = fastify.requirePermission('org:write');
  const requireDecisionSeat = fastify.requireSeat('decision');

  // GET /api/org/memberships — List memberships
  fastify.get(
    '/api/org/memberships',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const filters = MembershipListFiltersSchema.parse(request.query);
      const result = await orgMembershipService.listMemberships(filters);
      return reply.status(200).send(result);
    },
  );

  // POST /api/org/memberships — Assign employee to node (ADMIN)
  fastify.post(
    '/api/org/memberships',
    { preHandler: [adminOnly, requireDecisionSeat] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = AssignMembershipSchema.parse(request.body);
      const membership = await orgMembershipService.assignEmployeeToNode(
        data,
        request.user.sub,
      );
      return reply.status(201).send(membership);
    },
  );

  // POST /api/org/memberships/bulk — Bulk assign (ADMIN)
  fastify.post(
    '/api/org/memberships/bulk',
    { preHandler: [adminOnly, requireDecisionSeat] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = BulkAssignSchema.parse(request.body);
      const result = await orgMembershipService.bulkAssignEmployees(
        data,
        request.user.sub,
      );
      return reply.status(200).send(result);
    },
  );

  // DELETE /api/org/memberships/:id — End membership (ADMIN)
  fastify.delete<{ Params: { id: string } }>(
    '/api/org/memberships/:id',
    { preHandler: [adminOnly, requireDecisionSeat] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const result = await orgMembershipService.endMembership(id, request.user.sub);
      return reply.status(200).send(result);
    },
  );

  // GET /api/org/memberships/employee/:id — Employee membership history
  fastify.get<{ Params: { id: string } }>(
    '/api/org/memberships/employee/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const history = await orgMembershipService.getMembershipHistory(id);
      return reply.status(200).send(history);
    },
  );
}
