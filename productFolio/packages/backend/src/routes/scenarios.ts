import { FastifyInstance } from 'fastify';
import {
  createScenarioSchema,
  updateScenarioSchema,
  updatePrioritiesSchema,
  createAllocationSchema,
  updateAllocationSchema,
  compareQuerySchema,
  paginationSchema,
} from '../schemas/scenarios.schema.js';
import { scenariosService } from '../services/scenarios.service.js';
import { allocationService } from '../services/allocation.service.js';

export async function scenariosRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/scenarios - List scenarios
  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/api/scenarios',
    async (request, reply) => {
      const pagination = paginationSchema.parse({
        page: request.query.page,
        limit: request.query.limit,
      });

      const result = await scenariosService.list(pagination);
      return reply.code(200).send(result);
    }
  );

  // GET /api/scenarios/:id - Get single scenario
  fastify.get<{ Params: { id: string } }>(
    '/api/scenarios/:id',
    async (request, reply) => {
      const scenario = await scenariosService.getById(request.params.id);
      return reply.code(200).send(scenario);
    }
  );

  // POST /api/scenarios - Create scenario
  fastify.post<{ Body: unknown }>(
    '/api/scenarios',
    async (request, reply) => {
      const data = createScenarioSchema.parse(request.body);
      const scenario = await scenariosService.create(data);
      return reply.code(201).send(scenario);
    }
  );

  // PUT /api/scenarios/:id - Update scenario
  fastify.put<{ Params: { id: string }; Body: unknown }>(
    '/api/scenarios/:id',
    async (request, reply) => {
      const data = updateScenarioSchema.parse(request.body);
      const scenario = await scenariosService.update(request.params.id, data);
      return reply.code(200).send(scenario);
    }
  );

  // DELETE /api/scenarios/:id - Delete scenario
  fastify.delete<{ Params: { id: string } }>(
    '/api/scenarios/:id',
    async (request, reply) => {
      await scenariosService.delete(request.params.id);
      return reply.code(204).send();
    }
  );

  // PUT /api/scenarios/:id/priorities - Update priority rankings
  fastify.put<{ Params: { id: string }; Body: unknown }>(
    '/api/scenarios/:id/priorities',
    async (request, reply) => {
      const data = updatePrioritiesSchema.parse(request.body);
      const scenario = await scenariosService.updatePriorities(request.params.id, data);
      return reply.code(200).send(scenario);
    }
  );

  // GET /api/scenarios/:id/allocations - List allocations for scenario
  fastify.get<{ Params: { id: string } }>(
    '/api/scenarios/:id/allocations',
    async (request, reply) => {
      const allocations = await allocationService.listByScenario(request.params.id);
      return reply.code(200).send(allocations);
    }
  );

  // POST /api/scenarios/:id/allocations - Create allocation
  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/scenarios/:id/allocations',
    async (request, reply) => {
      const data = createAllocationSchema.parse(request.body);
      const allocation = await allocationService.create(request.params.id, data);
      return reply.code(201).send(allocation);
    }
  );

  // PUT /api/allocations/:id - Update allocation
  fastify.put<{ Params: { id: string }; Body: unknown }>(
    '/api/allocations/:id',
    async (request, reply) => {
      const data = updateAllocationSchema.parse(request.body);
      const allocation = await allocationService.update(request.params.id, data);
      return reply.code(200).send(allocation);
    }
  );

  // DELETE /api/allocations/:id - Delete allocation
  fastify.delete<{ Params: { id: string } }>(
    '/api/allocations/:id',
    async (request, reply) => {
      await allocationService.delete(request.params.id);
      return reply.code(204).send();
    }
  );

  // GET /api/scenarios/:id/capacity-demand - Calculate capacity vs demand
  fastify.get<{ Params: { id: string } }>(
    '/api/scenarios/:id/capacity-demand',
    async (request, reply) => {
      const results = await allocationService.calculateCapacityDemand(request.params.id);
      return reply.code(200).send(results);
    }
  );

  // GET /api/scenarios/compare - Compare multiple scenarios
  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/api/scenarios/compare',
    async (request, reply) => {
      const query = compareQuerySchema.parse({
        scenarioIds: request.query.scenarioIds,
      });
      const comparisons = await allocationService.compareScenarios(query.scenarioIds);
      return reply.code(200).send(comparisons);
    }
  );
}
