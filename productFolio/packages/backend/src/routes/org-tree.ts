import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  CreateNodeSchema,
  UpdateNodeSchema,
  MoveNodeSchema,
  NodeListFiltersSchema,
} from '../schemas/org-tree.schema.js';
import * as orgTreeService from '../services/org-tree.service.js';

// ============================================================================
// Org Tree Routes — Node CRUD, ancestors/descendants, portfolio areas, coverage
// ============================================================================

export async function orgTreeRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate);

  const adminOnly = fastify.requirePermission('org:write');
  const requireDecisionSeat = fastify.requireSeat('decision');

  // =========================================================================
  // Portfolio Area Nodes
  // =========================================================================

  // GET /api/org/portfolio-areas — List org nodes flagged as portfolio areas
  fastify.get(
    '/api/org/portfolio-areas',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const nodes = await orgTreeService.listPortfolioAreaNodes();
      return reply.status(200).send(nodes);
    },
  );

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
    { preHandler: [adminOnly, requireDecisionSeat] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = CreateNodeSchema.parse(request.body);
      const node = await orgTreeService.createNode(data, request.user.sub);
      return reply.status(201).send(node);
    },
  );

  // PUT /api/org/nodes/:id — Update node (ADMIN)
  fastify.put<{ Params: { id: string } }>(
    '/api/org/nodes/:id',
    { preHandler: [adminOnly, requireDecisionSeat] },
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
    { preHandler: [adminOnly, requireDecisionSeat] },
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
    { preHandler: [adminOnly, requireDecisionSeat] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const result = await orgTreeService.deleteNode(id, request.user.sub);
      return reply.status(200).send(result);
    },
  );

  // =========================================================================
  // Ancestry / Descendants
  // =========================================================================

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

  // =========================================================================
  // Coverage
  // =========================================================================

  // GET /api/org/coverage — Coverage report (ADMIN)
  fastify.get(
    '/api/org/coverage',
    { preHandler: adminOnly },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const report = await orgTreeService.getCoverageReport();
      return reply.status(200).send(report);
    },
  );
}
