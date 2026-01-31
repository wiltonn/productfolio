import { FastifyInstance } from 'fastify';
import {
  CreatePortfolioAreaSchema,
  UpdatePortfolioAreaSchema,
  PortfolioAreaFiltersSchema,
} from '../schemas/portfolio-areas.schema.js';
import * as portfolioAreasService from '../services/portfolio-areas.service.js';

export async function portfolioAreasRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate);

  /**
   * GET /api/portfolio-areas
   * List portfolio areas (for dropdowns and management)
   */
  fastify.get<{
    Querystring: {
      search?: string;
      page?: string;
      limit?: string;
    };
  }>('/api/portfolio-areas', async (request, reply) => {
    const filters = {
      search: request.query.search,
      page: request.query.page ? parseInt(request.query.page, 10) : 1,
      limit: request.query.limit ? parseInt(request.query.limit, 10) : 50,
    };

    const validatedFilters = PortfolioAreaFiltersSchema.parse(filters);
    const result = await portfolioAreasService.list(validatedFilters);
    return reply.send(result);
  });

  /**
   * GET /api/portfolio-areas/:id
   * Get a single portfolio area by ID
   */
  fastify.get<{
    Params: { id: string };
  }>('/api/portfolio-areas/:id', async (request, reply) => {
    const area = await portfolioAreasService.getById(request.params.id);
    return reply.send(area);
  });

  /**
   * POST /api/portfolio-areas
   * Create a new portfolio area
   */
  fastify.post<{
    Body: typeof CreatePortfolioAreaSchema;
  }>('/api/portfolio-areas', async (request, reply) => {
    const validatedData = CreatePortfolioAreaSchema.parse(request.body);
    const area = await portfolioAreasService.create(validatedData);
    return reply.status(201).send(area);
  });

  /**
   * PUT /api/portfolio-areas/:id
   * Update a portfolio area
   */
  fastify.put<{
    Params: { id: string };
    Body: typeof UpdatePortfolioAreaSchema;
  }>('/api/portfolio-areas/:id', async (request, reply) => {
    const validatedData = UpdatePortfolioAreaSchema.parse(request.body);
    const area = await portfolioAreasService.update(
      request.params.id,
      validatedData
    );
    return reply.send(area);
  });

  /**
   * DELETE /api/portfolio-areas/:id
   * Delete a portfolio area (fails if initiatives reference it)
   */
  fastify.delete<{
    Params: { id: string };
  }>('/api/portfolio-areas/:id', async (request, reply) => {
    const result = await portfolioAreasService.deleteArea(request.params.id);
    return reply.send(result);
  });
}
