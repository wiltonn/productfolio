import { FastifyInstance } from 'fastify';
import { ScenarioStatus } from '@prisma/client';
import {
  createScenarioSchema,
  updateScenarioSchema,
  updatePrioritiesSchema,
  createAllocationSchema,
  updateAllocationSchema,
  compareQuerySchema,
  paginationSchema,
  autoAllocateOptionsSchema,
  transitionStatusSchema,
  cloneScenarioSchema,
} from '../schemas/scenarios.schema.js';
import { createRevisionSchema } from '../schemas/baseline.schema.js';
import { calculatorQuerySchema } from '../schemas/calculator.schema.js';
import { scenariosService } from '../services/scenarios.service.js';
import { allocationService } from '../services/allocation.service.js';
import { scenarioCalculatorService } from '../services/scenario-calculator.service.js';
import { baselineService } from '../services/baseline.service.js';
import { deltaEngineService } from '../services/delta-engine.service.js';
import { rampService } from '../services/ramp.service.js';
import { planningService } from '../planning/planning.service.js';
import { entitlementService } from '../services/entitlement.service.js';

export async function scenariosRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply authentication to all routes in this plugin
  fastify.addHook('onRequest', fastify.authenticate);

  const authorizeScenarioMutation = fastify.requirePermission('scenario:write');
  const requireDecisionSeat = fastify.requireSeat('decision');

  // GET /api/scenarios - List scenarios (optionally filtered by periodIds)
  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/api/scenarios',
    async (request, reply) => {
      const pagination = paginationSchema.parse({
        page: request.query.page,
        limit: request.query.limit,
      });

      // Parse periodIds from query params (comma-separated or array)
      let periodIds: string[] | undefined;
      const rawPeriodIds = request.query.periodIds;
      if (rawPeriodIds) {
        if (Array.isArray(rawPeriodIds)) {
          periodIds = rawPeriodIds as string[];
        } else if (typeof rawPeriodIds === 'string') {
          periodIds = rawPeriodIds.split(',').map((s: string) => s.trim()).filter(Boolean);
        }
      }

      const result = await scenariosService.list(pagination, periodIds);
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
    { preHandler: [authorizeScenarioMutation, requireDecisionSeat] },
    async (request, reply) => {
      const data = createScenarioSchema.parse(request.body);
      const scenario = await scenariosService.create(data);

      // RevOps telemetry: scenario created
      entitlementService.recordEvent({
        eventName: 'scenario_created',
        userId: request.user.sub,
        seatType: request.user.seatType,
        metadata: { scenarioId: scenario.id, scenarioName: scenario.name },
      }).catch(() => {});

      return reply.code(201).send(scenario);
    }
  );

  // PUT /api/scenarios/:id - Update scenario
  fastify.put<{ Params: { id: string }; Body: unknown }>(
    '/api/scenarios/:id',
    { preHandler: [authorizeScenarioMutation, requireDecisionSeat] },
    async (request, reply) => {
      const data = updateScenarioSchema.parse(request.body);
      const scenario = await scenariosService.update(request.params.id, data);
      return reply.code(200).send(scenario);
    }
  );

  // DELETE /api/scenarios/:id - Delete scenario
  fastify.delete<{ Params: { id: string } }>(
    '/api/scenarios/:id',
    { preHandler: [authorizeScenarioMutation, requireDecisionSeat] },
    async (request, reply) => {
      await scenariosService.delete(request.params.id);
      return reply.code(204).send();
    }
  );

  // PUT /api/scenarios/:id/status - Transition scenario status
  fastify.put<{ Params: { id: string }; Body: unknown }>(
    '/api/scenarios/:id/status',
    { preHandler: [authorizeScenarioMutation, requireDecisionSeat] },
    async (request, reply) => {
      const { status } = transitionStatusSchema.parse(request.body);
      const scenario = await scenariosService.transitionStatus(
        request.params.id,
        status as ScenarioStatus,
        request.user.role
      );

      // RevOps telemetry: scenario status transitions
      if (status === 'APPROVED' || status === 'LOCKED') {
        const eventName = status === 'APPROVED' ? 'scenario_approved' : 'scenario_locked';
        entitlementService.recordEvent({
          eventName,
          userId: request.user.sub,
          seatType: request.user.seatType,
          metadata: { scenarioId: request.params.id, newStatus: status },
        }).catch(() => {});
      }

      return reply.code(200).send(scenario);
    }
  );

  // PUT /api/scenarios/:id/primary - Set scenario as primary for its quarter
  fastify.put<{ Params: { id: string } }>(
    '/api/scenarios/:id/primary',
    { preHandler: [authorizeScenarioMutation, requireDecisionSeat] },
    async (request, reply) => {
      const scenario = await scenariosService.setPrimary(request.params.id);
      return reply.code(200).send(scenario);
    }
  );

  // POST /api/scenarios/:id/clone - Clone scenario to target quarter
  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/scenarios/:id/clone',
    { preHandler: [authorizeScenarioMutation, requireDecisionSeat] },
    async (request, reply) => {
      const data = cloneScenarioSchema.parse(request.body);
      const scenario = await scenariosService.cloneScenario(request.params.id, data);
      return reply.code(201).send(scenario);
    }
  );

  // PUT /api/scenarios/:id/priorities - Update priority rankings
  fastify.put<{ Params: { id: string }; Body: unknown }>(
    '/api/scenarios/:id/priorities',
    { preHandler: [authorizeScenarioMutation, requireDecisionSeat] },
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

  // GET /api/scenarios/:id/initiatives/:initiativeId/allocations - List allocations for an initiative within a scenario
  fastify.get<{ Params: { id: string; initiativeId: string } }>(
    '/api/scenarios/:id/initiatives/:initiativeId/allocations',
    async (request, reply) => {
      const allocations = await allocationService.listByInitiative(
        request.params.id,
        request.params.initiativeId
      );
      return reply.code(200).send(allocations);
    }
  );

  // POST /api/scenarios/:id/allocations - Create allocation
  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/scenarios/:id/allocations',
    { preHandler: [authorizeScenarioMutation, requireDecisionSeat] },
    async (request, reply) => {
      const data = createAllocationSchema.parse(request.body);
      const allocation = await allocationService.create(request.params.id, data);
      return reply.code(201).send(allocation);
    }
  );

  // PUT /api/allocations/:id - Update allocation
  fastify.put<{ Params: { id: string }; Body: unknown }>(
    '/api/allocations/:id',
    { preHandler: [authorizeScenarioMutation, requireDecisionSeat] },
    async (request, reply) => {
      const data = updateAllocationSchema.parse(request.body);
      const allocation = await allocationService.update(request.params.id, data);
      return reply.code(200).send(allocation);
    }
  );

  // DELETE /api/allocations/:id - Delete allocation
  fastify.delete<{ Params: { id: string } }>(
    '/api/allocations/:id',
    { preHandler: [authorizeScenarioMutation, requireDecisionSeat] },
    async (request, reply) => {
      await allocationService.delete(request.params.id);
      return reply.code(204).send();
    }
  );

  // GET /api/scenarios/:id/capacity-demand - Calculate capacity vs demand
  fastify.get<{ Params: { id: string } }>(
    '/api/scenarios/:id/capacity-demand',
    async (request, reply) => {
      const results = await planningService.getCapacityDemand(request.params.id);
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

  // GET /api/scenarios/:id/calculator - Calculate demand vs capacity with caching
  fastify.get<{ Params: { id: string }; Querystring: Record<string, unknown> }>(
    '/api/scenarios/:id/calculator',
    async (request, reply) => {
      const options = calculatorQuerySchema.parse({
        skipCache: request.query.skipCache,
        includeBreakdown: request.query.includeBreakdown,
      });
      const results = await planningService.getCalculator(
        request.params.id,
        options
      );
      reply.header('X-Cache', results.cacheHit ? 'HIT' : 'MISS');
      return reply.code(200).send(results);
    }
  );

  // POST /api/scenarios/:id/calculator/invalidate - Invalidate cache
  fastify.post<{ Params: { id: string } }>(
    '/api/scenarios/:id/calculator/invalidate',
    { preHandler: [authorizeScenarioMutation, requireDecisionSeat] },
    async (request, reply) => {
      await scenarioCalculatorService.invalidateCache(request.params.id);
      return reply.code(204).send();
    }
  );

  // POST /api/scenarios/:id/recompute-ramp - Recompute ramp modifiers for all allocations
  fastify.post<{ Params: { id: string } }>(
    '/api/scenarios/:id/recompute-ramp',
    { preHandler: [authorizeScenarioMutation, requireDecisionSeat] },
    async (request, reply) => {
      await rampService.recomputeScenarioRamp(request.params.id);
      await scenarioCalculatorService.invalidateCache(request.params.id);
      return reply.code(204).send();
    }
  );

  // POST /api/scenarios/:id/auto-allocate - Preview auto-allocations (no side effects)
  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/scenarios/:id/auto-allocate',
    { preHandler: [authorizeScenarioMutation, requireDecisionSeat] },
    async (request, reply) => {
      const options = autoAllocateOptionsSchema.parse(request.body || {});
      const result = await allocationService.autoAllocate(request.params.id, options);
      return reply.code(200).send(result);
    }
  );

  // POST /api/scenarios/:id/auto-allocate/apply - Apply auto-allocations
  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/scenarios/:id/auto-allocate/apply',
    { preHandler: [authorizeScenarioMutation, requireDecisionSeat] },
    async (request, reply) => {
      const { proposedAllocations } = request.body as {
        proposedAllocations: Array<{
          employeeId: string;
          employeeName: string;
          initiativeId: string;
          initiativeTitle: string;
          skill: string;
          percentage: number;
          hours: number;
          startDate: string;
          endDate: string;
        }>;
      };
      const result = await allocationService.applyAutoAllocate(
        request.params.id,
        proposedAllocations.map((a) => ({
          ...a,
          startDate: new Date(a.startDate),
          endDate: new Date(a.endDate),
        }))
      );
      return reply.code(200).send(result);
    }
  );

  // GET /api/scenarios/:id/snapshot - Get baseline snapshot
  fastify.get<{ Params: { id: string } }>(
    '/api/scenarios/:id/snapshot',
    async (request, reply) => {
      const snapshot = await baselineService.getSnapshot(request.params.id);
      return reply.code(200).send(snapshot);
    }
  );

  // GET /api/scenarios/:id/delta - Baseline vs live delta
  fastify.get<{ Params: { id: string } }>(
    '/api/scenarios/:id/delta',
    async (request, reply) => {
      const delta = await deltaEngineService.computeDelta(request.params.id);
      return reply.code(200).send(delta);
    }
  );

  // GET /api/scenarios/:id/revision-delta - Revision vs baseline delta
  fastify.get<{ Params: { id: string } }>(
    '/api/scenarios/:id/revision-delta',
    async (request, reply) => {
      const delta = await deltaEngineService.computeRevisionDelta(request.params.id);
      return reply.code(200).send(delta);
    }
  );

  // POST /api/scenarios/:id/revision - Create a revision from a locked baseline
  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/scenarios/:id/revision',
    { preHandler: [authorizeScenarioMutation, requireDecisionSeat] },
    async (request, reply) => {
      const data = createRevisionSchema.parse(request.body);
      const scenario = await scenariosService.createRevision(
        request.params.id,
        data,
        request.user.role
      );
      return reply.code(201).send(scenario);
    }
  );

  // PUT /api/scenarios/:id/reconcile - Mark revision as reconciled
  fastify.put<{ Params: { id: string } }>(
    '/api/scenarios/:id/reconcile',
    { preHandler: [authorizeScenarioMutation, requireDecisionSeat] },
    async (request, reply) => {
      const scenario = await scenariosService.markReconciled(request.params.id);
      return reply.code(200).send(scenario);
    }
  );
}
