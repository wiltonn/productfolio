import { FastifyInstance } from 'fastify';
import { scopingService } from '../services/scoping.service.js';
import {
  CreateScopeItemSchema,
  UpdateScopeItemSchema,
  SubmitApprovalSchema,
  ApproveWithApproverSchema,
  ApproveRejectSchema,
} from '../schemas/scoping.schema.js';
import type { PaginationParams } from '../types/index.js';

export async function scopingRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply authentication to all routes in this plugin
  fastify.addHook('onRequest', fastify.authenticate);

  const requireDecisionSeat = fastify.requireSeat('decision');
  /**
   * GET /api/initiatives/:initiativeId/scope-items
   * List scope items for an initiative
   */
  fastify.get<{
    Params: { initiativeId: string };
    Querystring: { page?: string; limit?: string };
  }>('/api/initiatives/:initiativeId/scope-items', async (request, reply) => {
    const { initiativeId } = request.params;
    const page = request.query.page ? parseInt(request.query.page) : 1;
    const limit = request.query.limit ? parseInt(request.query.limit) : 10;

    const pagination: PaginationParams = { page, limit };
    const result = await scopingService.listByInitiative(initiativeId, pagination);

    return reply.send(result);
  });

  /**
   * GET /api/scope-items/:id
   * Get a single scope item
   */
  fastify.get<{ Params: { id: string } }>('/api/scope-items/:id', async (request, reply) => {
    const { id } = request.params;
    const scopeItem = await scopingService.getById(id);

    return reply.send(scopeItem);
  });

  /**
   * POST /api/initiatives/:initiativeId/scope-items
   * Create a new scope item
   */
  fastify.post<{
    Params: { initiativeId: string };
    Body: unknown;
  }>('/api/initiatives/:initiativeId/scope-items', { preHandler: [requireDecisionSeat] }, async (request, reply) => {
    const { initiativeId } = request.params;
    const data = CreateScopeItemSchema.parse(request.body);

    const scopeItem = await scopingService.create(initiativeId, data);

    return reply.status(201).send(scopeItem);
  });

  /**
   * PUT /api/scope-items/:id
   * Update a scope item
   */
  fastify.put<{
    Params: { id: string };
    Body: unknown;
  }>('/api/scope-items/:id', { preHandler: [requireDecisionSeat] }, async (request, reply) => {
    const { id } = request.params;
    const data = UpdateScopeItemSchema.parse(request.body);

    const scopeItem = await scopingService.update(id, data);

    return reply.send(scopeItem);
  });

  /**
   * DELETE /api/scope-items/:id
   * Delete a scope item
   */
  fastify.delete<{ Params: { id: string } }>('/api/scope-items/:id', { preHandler: [requireDecisionSeat] }, async (request, reply) => {
    const { id } = request.params;

    await scopingService.delete(id);

    return reply.status(204).send();
  });

  /**
   * POST /api/initiatives/:id/submit-approval
   * Submit initiative for approval
   */
  fastify.post<{
    Params: { id: string };
    Body: unknown;
  }>('/api/initiatives/:id/submit-approval', { preHandler: [requireDecisionSeat] }, async (request, reply) => {
    const { id } = request.params;
    const data = SubmitApprovalSchema.parse(request.body);

    const initiative = await scopingService.submitForApproval(id, data.notes);

    return reply.send(initiative);
  });

  /**
   * POST /api/initiatives/:id/approve
   * Approve an initiative
   */
  fastify.post<{
    Params: { id: string };
    Body: unknown;
  }>('/api/initiatives/:id/approve', { preHandler: [requireDecisionSeat] }, async (request, reply) => {
    const { id } = request.params;
    const data = ApproveWithApproverSchema.parse(request.body);

    const result = await scopingService.approve(id, data.approverId, data.notes);

    return reply.send(result);
  });

  /**
   * POST /api/initiatives/:id/reject
   * Reject an initiative (change status back to DRAFT)
   */
  fastify.post<{
    Params: { id: string };
    Body: unknown;
  }>('/api/initiatives/:id/reject', { preHandler: [requireDecisionSeat] }, async (request, reply) => {
    const { id } = request.params;
    const data = ApproveRejectSchema.parse(request.body);

    const initiative = await scopingService.reject(id, data.notes);

    return reply.send(initiative);
  });

  /**
   * GET /api/initiatives/:id/approval-history
   * Get approval history for an initiative
   */
  fastify.get<{ Params: { id: string } }>('/api/initiatives/:id/approval-history', async (request, reply) => {
    const { id } = request.params;

    const history = await scopingService.getApprovalHistory(id);

    return reply.send(history);
  });
}
