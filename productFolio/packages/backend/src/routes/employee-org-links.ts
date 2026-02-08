import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  CreateEmployeeOrgLinkSchema,
  UpdateEmployeeOrgLinkSchema,
  LinkListFiltersSchema,
  MigrateFromMembershipsSchema,
} from '../schemas/employee-org-link.schema.js';
import * as linkService from '../services/employee-org-link.service.js';

// ============================================================================
// Employee Org Unit Link Routes (gated by matrix_org_v1 feature flag)
// ============================================================================

export async function employeeOrgLinksRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate);

  const adminOnly = fastify.requirePermission('org:write');
  const requireMatrixFlag = fastify.requireFeature('matrix_org_v1');

  // =========================================================================
  // List links (with filters)
  // =========================================================================

  fastify.get(
    '/api/org/links',
    { preHandler: [requireMatrixFlag] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const filters = LinkListFiltersSchema.parse(request.query);
      const result = await linkService.listLinks(filters);
      return reply.status(200).send(result);
    },
  );

  // =========================================================================
  // Get active links for an employee
  // =========================================================================

  fastify.get(
    '/api/org/links/employee/:employeeId',
    { preHandler: [requireMatrixFlag] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { employeeId } = request.params as { employeeId: string };
      const links = await linkService.getActiveLinks(employeeId);
      return reply.status(200).send(links);
    },
  );

  // =========================================================================
  // Get home org (PRIMARY_REPORTING) for an employee
  // =========================================================================

  fastify.get(
    '/api/org/links/employee/:employeeId/home',
    { preHandler: [requireMatrixFlag] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { employeeId } = request.params as { employeeId: string };
      const link = await linkService.getHomeOrg(employeeId);
      return reply.status(200).send(link);
    },
  );

  // =========================================================================
  // Get link history for an employee
  // =========================================================================

  fastify.get(
    '/api/org/links/employee/:employeeId/history',
    { preHandler: [requireMatrixFlag] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { employeeId } = request.params as { employeeId: string };
      const history = await linkService.getLinkHistory(employeeId);
      return reply.status(200).send(history);
    },
  );

  // =========================================================================
  // Get capacity-consuming links for an employee
  // =========================================================================

  fastify.get(
    '/api/org/links/employee/:employeeId/capacity',
    { preHandler: [requireMatrixFlag] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { employeeId } = request.params as { employeeId: string };
      const links = await linkService.getCapacityConsumingLinks(employeeId);
      return reply.status(200).send(links);
    },
  );

  // =========================================================================
  // Get members of an org node (optionally by relationship type)
  // =========================================================================

  fastify.get(
    '/api/org/nodes/:orgNodeId/links',
    { preHandler: [requireMatrixFlag] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgNodeId } = request.params as { orgNodeId: string };
      const { relationshipType } = request.query as { relationshipType?: string };
      const members = await linkService.getOrgNodeMembers(
        orgNodeId,
        relationshipType as any,
      );
      return reply.status(200).send(members);
    },
  );

  // =========================================================================
  // Create link
  // =========================================================================

  fastify.post(
    '/api/org/links',
    { preHandler: [requireMatrixFlag, adminOnly] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = CreateEmployeeOrgLinkSchema.parse(request.body);
      const actorId = request.user?.userId;
      const link = await linkService.createLink(data, actorId);
      return reply.status(201).send(link);
    },
  );

  // =========================================================================
  // Update link
  // =========================================================================

  fastify.patch(
    '/api/org/links/:linkId',
    { preHandler: [requireMatrixFlag, adminOnly] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { linkId } = request.params as { linkId: string };
      const data = UpdateEmployeeOrgLinkSchema.parse(request.body);
      const actorId = request.user?.userId;
      const updated = await linkService.updateLink(linkId, data, actorId);
      return reply.status(200).send(updated);
    },
  );

  // =========================================================================
  // End link (soft delete)
  // =========================================================================

  fastify.delete(
    '/api/org/links/:linkId',
    { preHandler: [requireMatrixFlag, adminOnly] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { linkId } = request.params as { linkId: string };
      const actorId = request.user?.userId;
      const ended = await linkService.endLink(linkId, actorId);
      return reply.status(200).send(ended);
    },
  );

  // =========================================================================
  // Reassign PRIMARY_REPORTING
  // =========================================================================

  fastify.post(
    '/api/org/links/reassign-primary',
    { preHandler: [requireMatrixFlag, adminOnly] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { employeeId, orgNodeId } = request.body as {
        employeeId: string;
        orgNodeId: string;
      };
      if (!employeeId || !orgNodeId) {
        return reply
          .status(400)
          .send({ error: 'employeeId and orgNodeId are required' });
      }
      const actorId = request.user?.userId;
      const link = await linkService.reassignPrimaryReporting(
        employeeId,
        orgNodeId,
        actorId,
      );
      return reply.status(200).send(link);
    },
  );

  // =========================================================================
  // Migration: Create PRIMARY_REPORTING from existing OrgMemberships
  // =========================================================================

  fastify.post(
    '/api/org/links/migrate-from-memberships',
    { preHandler: [requireMatrixFlag, adminOnly] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { dryRun } = MigrateFromMembershipsSchema.parse(
        request.query ?? request.body ?? {},
      );
      const result = await linkService.migrateFromMemberships(dryRun);
      return reply.status(200).send(result);
    },
  );
}
