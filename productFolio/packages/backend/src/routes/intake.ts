import { FastifyInstance } from 'fastify';
import * as intakeService from '../services/intake.service.js';
import { intakeListSchema, intakeItemIdSchema } from '../schemas/intake.schema.js';

export async function intakeRoutes(fastify: FastifyInstance) {
  // All routes require authentication
  fastify.addHook('onRequest', fastify.authenticate);

  /**
   * GET /api/intake
   * List intake items with filters and pagination.
   */
  fastify.get<{
    Querystring: {
      page?: string;
      limit?: string;
      search?: string;
      statusCategory?: string;
      priorityName?: string;
      siteId?: string;
      projectKey?: string;
      linked?: string;
      itemStatus?: string;
      sortBy?: string;
      sortOrder?: string;
    };
  }>('/api/intake', async (request, reply) => {
    const params = intakeListSchema.parse(request.query);
    return intakeService.listIntakeItems(params);
  });

  /**
   * GET /api/intake/stats
   * Get intake dashboard statistics.
   */
  fastify.get('/api/intake/stats', async (request, reply) => {
    return intakeService.getIntakeStats();
  });

  /**
   * GET /api/intake/:id
   * Get a single intake item.
   */
  fastify.get<{
    Params: { id: string };
  }>('/api/intake/:id', async (request, reply) => {
    const { id } = intakeItemIdSchema.parse(request.params);
    return intakeService.getIntakeItem(id);
  });
}
