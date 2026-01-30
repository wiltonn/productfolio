import { FastifyInstance } from 'fastify';
import { periodFiltersSchema, seedPeriodsSchema } from '../schemas/periods.schema.js';
import { periodService } from '../services/period.service.js';

export async function periodsRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply authentication to all routes in this plugin
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /api/periods/adjacent-quarters - Get last, current, next quarter
  fastify.get(
    '/api/periods/adjacent-quarters',
    async (_request, reply) => {
      const result = await periodService.getAdjacentQuarters();
      return reply.code(200).send(result);
    }
  );

  // GET /api/periods - List periods with filters
  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/api/periods',
    async (request, reply) => {
      const filters = periodFiltersSchema.parse(request.query);
      const result = await periodService.list(filters);
      return reply.code(200).send(result);
    }
  );

  // GET /api/periods/:id - Get period with parent/children
  fastify.get<{ Params: { id: string } }>(
    '/api/periods/:id',
    async (request, reply) => {
      const period = await periodService.getById(request.params.id);
      return reply.code(200).send(period);
    }
  );

  // GET /api/periods/:id/children - Get child periods
  fastify.get<{ Params: { id: string } }>(
    '/api/periods/:id/children',
    async (request, reply) => {
      const children = await periodService.getChildren(request.params.id);
      return reply.code(200).send(children);
    }
  );

  // GET /api/periods/label/:label - Get period by label
  fastify.get<{ Params: { label: string } }>(
    '/api/periods/label/:label',
    async (request, reply) => {
      const period = await periodService.findByLabel(request.params.label);
      return reply.code(200).send(period);
    }
  );

  // POST /api/periods/seed - Admin: seed periods for year range
  fastify.post<{ Body: unknown }>(
    '/api/periods/seed',
    async (request, reply) => {
      const data = seedPeriodsSchema.parse(request.body);
      const result = await periodService.seedPeriods(data.startYear, data.endYear);
      return reply.code(201).send(result);
    }
  );
}
