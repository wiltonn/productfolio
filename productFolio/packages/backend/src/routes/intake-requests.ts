import { FastifyInstance } from 'fastify';
import * as intakeRequestService from '../services/intake-request.service.js';
import * as intakePlanningService from '../services/intake-planning.service.js';
import {
  CreateIntakeRequestSchema,
  UpdateIntakeRequestSchema,
  IntakeRequestStatusTransitionSchema,
  IntakeRequestFiltersSchema,
  IntakeRequestIdSchema,
  ConvertToInitiativeSchema,
} from '../schemas/intake-request.schema.js';

export async function intakeRequestRoutes(fastify: FastifyInstance) {
  // All routes require authentication
  fastify.addHook('onRequest', fastify.authenticate);

  const requireDecisionSeat = fastify.requireSeat('decision');

  /**
   * GET /api/intake-requests
   * List intake requests with filters and pagination.
   */
  fastify.get<{
    Querystring: Record<string, string | undefined>;
  }>('/api/intake-requests', async (request) => {
    const filters = IntakeRequestFiltersSchema.parse(request.query);
    return intakeRequestService.list(filters);
  });

  /**
   * GET /api/intake-requests/stats
   * Get intake request statistics.
   */
  fastify.get('/api/intake-requests/stats', async () => {
    return intakeRequestService.getStats();
  });

  /**
   * GET /api/intake-requests/pipeline
   * Get pipeline statistics with period-aware planned/unplanned states.
   */
  fastify.get<{
    Querystring: { periodId?: string };
  }>('/api/intake-requests/pipeline', async (request) => {
    return intakePlanningService.getPipelineStats(request.query.periodId);
  });

  /**
   * GET /api/intake-requests/:id
   * Get a single intake request.
   */
  fastify.get<{
    Params: { id: string };
  }>('/api/intake-requests/:id', async (request) => {
    const { id } = IntakeRequestIdSchema.parse(request.params);
    return intakeRequestService.getById(id);
  });

  /**
   * POST /api/intake-requests
   * Create a new intake request.
   */
  fastify.post<{
    Body: Record<string, unknown>;
  }>('/api/intake-requests', { preHandler: [requireDecisionSeat] }, async (request, reply) => {
    const data = CreateIntakeRequestSchema.parse(request.body);
    const userId = (request.user as any)?.id;
    const result = await intakeRequestService.create(data, userId);
    reply.code(201);
    return result;
  });

  /**
   * PUT /api/intake-requests/:id
   * Update an intake request.
   */
  fastify.put<{
    Params: { id: string };
    Body: Record<string, unknown>;
  }>('/api/intake-requests/:id', { preHandler: [requireDecisionSeat] }, async (request) => {
    const { id } = IntakeRequestIdSchema.parse(request.params);
    const data = UpdateIntakeRequestSchema.parse(request.body);
    const userId = (request.user as any)?.id;
    return intakeRequestService.update(id, data, userId);
  });

  /**
   * DELETE /api/intake-requests/:id
   * Delete an intake request (only DRAFT or CLOSED).
   */
  fastify.delete<{
    Params: { id: string };
  }>('/api/intake-requests/:id', { preHandler: [requireDecisionSeat] }, async (request) => {
    const { id } = IntakeRequestIdSchema.parse(request.params);
    return intakeRequestService.remove(id);
  });

  /**
   * POST /api/intake-requests/:id/status
   * Transition intake request status.
   */
  fastify.post<{
    Params: { id: string };
    Body: Record<string, unknown>;
  }>('/api/intake-requests/:id/status', { preHandler: [requireDecisionSeat] }, async (request) => {
    const { id } = IntakeRequestIdSchema.parse(request.params);
    const input = IntakeRequestStatusTransitionSchema.parse(request.body);
    const userId = (request.user as any)?.id;
    return intakeRequestService.transitionStatus(id, input, userId);
  });

  /**
   * POST /api/intake-requests/:id/convert
   * Convert an approved intake request to an initiative.
   */
  fastify.post<{
    Params: { id: string };
    Body: Record<string, unknown>;
  }>('/api/intake-requests/:id/convert', { preHandler: [requireDecisionSeat] }, async (request, reply) => {
    const { id } = IntakeRequestIdSchema.parse(request.params);
    const input = ConvertToInitiativeSchema.parse(request.body);
    const userId = (request.user as any)?.id;
    const result = await intakeRequestService.convertToInitiative(id, input, userId);
    reply.code(201);
    return result;
  });
}
