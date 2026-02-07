import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  CreateNodeSchema,
  UpdateNodeSchema,
  MoveNodeSchema,
  NodeListFiltersSchema,
  AssignMembershipSchema,
  BulkAssignSchema,
  MembershipListFiltersSchema,
} from '../schemas/org-tree.schema.js';
import * as orgTreeService from '../services/org-tree.service.js';
import * as orgMembershipService from '../services/org-membership.service.js';
import { ScenarioCalculatorService } from '../services/scenario-calculator.service.js';
import { isEnabled } from '../services/feature-flag.service.js';
import { NotFoundError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

// ============================================================================
// Org Tree Routes
// ============================================================================

export async function orgTreeRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate);

  const adminOnly = fastify.authorize(['ADMIN']);

  // =========================================================================
  // Node CRUD
  // =========================================================================

  // GET /api/org/tree — Full tree (nested)
  fastify.get(
    '/api/org/tree',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const tree = await orgTreeService.getFullTree();
      return reply.status(200).send(tree);
    },
  );

  // GET /api/org/nodes — List nodes (flat, with filters)
  fastify.get(
    '/api/org/nodes',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const filters = NodeListFiltersSchema.parse(request.query);
      const nodes = await orgTreeService.listNodes(filters);
      return reply.status(200).send(nodes);
    },
  );

  // GET /api/org/nodes/:id — Get single node
  fastify.get<{ Params: { id: string } }>(
    '/api/org/nodes/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const node = await orgTreeService.getNodeById(id);
      return reply.status(200).send(node);
    },
  );

  // POST /api/org/nodes — Create node (ADMIN)
  fastify.post(
    '/api/org/nodes',
    { preHandler: adminOnly },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = CreateNodeSchema.parse(request.body);
      const node = await orgTreeService.createNode(data, request.user.sub);
      return reply.status(201).send(node);
    },
  );

  // PUT /api/org/nodes/:id — Update node (ADMIN)
  fastify.put<{ Params: { id: string } }>(
    '/api/org/nodes/:id',
    { preHandler: adminOnly },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const data = UpdateNodeSchema.parse(request.body);
      const node = await orgTreeService.updateNode(id, data, request.user.sub);
      return reply.status(200).send(node);
    },
  );

  // POST /api/org/nodes/:id/move — Move node to new parent (ADMIN)
  fastify.post<{ Params: { id: string } }>(
    '/api/org/nodes/:id/move',
    { preHandler: adminOnly },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { newParentId } = MoveNodeSchema.parse(request.body);
      const node = await orgTreeService.moveNode(id, newParentId, request.user.sub);
      return reply.status(200).send(node);
    },
  );

  // DELETE /api/org/nodes/:id — Soft-delete node (ADMIN)
  fastify.delete<{ Params: { id: string } }>(
    '/api/org/nodes/:id',
    { preHandler: adminOnly },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const result = await orgTreeService.deleteNode(id, request.user.sub);
      return reply.status(200).send(result);
    },
  );

  // GET /api/org/nodes/:id/ancestors — Get ancestry chain
  fastify.get<{ Params: { id: string } }>(
    '/api/org/nodes/:id/ancestors',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const ancestors = await orgTreeService.getAncestors(id);
      return reply.status(200).send(ancestors);
    },
  );

  // GET /api/org/nodes/:id/descendants — Get subtree
  fastify.get<{ Params: { id: string } }>(
    '/api/org/nodes/:id/descendants',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const descendants = await orgTreeService.getDescendants(id);
      return reply.status(200).send(descendants);
    },
  );

  // GET /api/org/coverage — Coverage report (ADMIN)
  fastify.get(
    '/api/org/coverage',
    { preHandler: adminOnly },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const report = await orgTreeService.getCoverageReport();
      return reply.status(200).send(report);
    },
  );

  // =========================================================================
  // Membership CRUD
  // =========================================================================

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
    { preHandler: adminOnly },
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
    { preHandler: adminOnly },
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
    { preHandler: adminOnly },
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

  // =========================================================================
  // Org Capacity (guarded by org_capacity_view feature flag)
  // =========================================================================

  // GET /api/org/nodes/:id/employees — Employees in subtree
  fastify.get<{ Params: { id: string } }>(
    '/api/org/nodes/:id/employees',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const enabled = await isEnabled('org_capacity_view');
      if (!enabled) throw new NotFoundError('Resource');

      const { id } = request.params as { id: string };
      const employeeIds = await orgTreeService.getEmployeesInSubtree(id);

      const employees = await prisma.employee.findMany({
        where: { id: { in: employeeIds } },
        include: {
          skills: { select: { name: true, proficiency: true } },
          jobProfile: { select: { id: true, name: true, level: true } },
          allocations: {
            select: {
              id: true,
              scenarioId: true,
              initiativeId: true,
              percentage: true,
              startDate: true,
              endDate: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      });

      return reply.status(200).send({
        orgNodeId: id,
        employeeCount: employees.length,
        employees,
      });
    },
  );

  // GET /api/org/nodes/:id/capacity?scenarioId=X — Org-scoped capacity/demand
  fastify.get<{
    Params: { id: string };
    Querystring: { scenarioId: string };
  }>(
    '/api/org/nodes/:id/capacity',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const enabled = await isEnabled('org_capacity_view');
      if (!enabled) throw new NotFoundError('Resource');

      const { id } = request.params as { id: string };
      const { scenarioId } = request.query as { scenarioId: string };

      if (!scenarioId) {
        return reply.status(400).send({ error: 'scenarioId query parameter is required' });
      }

      const calculator = new ScenarioCalculatorService();
      const result = await calculator.calculate(scenarioId, {
        orgNodeId: id,
        skipCache: false,
      });

      return reply.status(200).send(result);
    },
  );
}
