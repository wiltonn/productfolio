import { FastifyInstance } from 'fastify';
import { ForecastMode } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';
import {
  ScopeBasedForecastSchema,
  EmpiricalForecastSchema,
  DataQualityQuerySchema,
  ForecastRunsQuerySchema,
} from '../schemas/forecast.schema.js';
import {
  runScopeBasedForecast,
  runEmpiricalForecast,
  assessDataQuality,
} from '../services/forecast.service.js';
import { entitlementService } from '../services/entitlement.service.js';

export async function forecastRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', fastify.authenticate);

  const requireForecast = fastify.requireFeature('flow_forecast_v1');
  const requireModeB = fastify.requireFeature('forecast_mode_b');
  const requireDecisionSeat = fastify.requireSeat('decision');

  // POST /api/forecast/scope-based — Run Mode A forecast
  fastify.post<{ Body: unknown }>(
    '/api/forecast/scope-based',
    { preHandler: [requireForecast, requireDecisionSeat] },
    async (request, reply) => {
      const data = ScopeBasedForecastSchema.parse(request.body);
      const result = await runScopeBasedForecast(data);

      // RevOps telemetry: forecast run
      entitlementService.recordEvent({
        eventName: 'forecast_run',
        userId: request.user.sub,
        seatType: request.user.seatType,
        metadata: { mode: 'SCOPE_BASED', scenarioId: data.scenarioId },
      }).catch(() => {});

      return reply.code(200).send(result);
    }
  );

  // POST /api/forecast/empirical — Run Mode B forecast
  fastify.post<{ Body: unknown }>(
    '/api/forecast/empirical',
    { preHandler: [requireForecast, requireModeB, requireDecisionSeat] },
    async (request, reply) => {
      const data = EmpiricalForecastSchema.parse(request.body);
      const result = await runEmpiricalForecast(data);

      // RevOps telemetry: forecast run
      entitlementService.recordEvent({
        eventName: 'forecast_run',
        userId: request.user.sub,
        seatType: request.user.seatType,
        metadata: { mode: 'EMPIRICAL' },
      }).catch(() => {});

      return reply.code(200).send(result);
    }
  );

  // GET /api/forecast/runs — List past forecast runs (paginated)
  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/api/forecast/runs',
    { preHandler: [requireForecast] },
    async (request, reply) => {
      const query = ForecastRunsQuerySchema.parse(request.query);
      const { page, limit, scenarioId, mode } = query;

      const where: Record<string, unknown> = {};
      if (scenarioId) where.scenarioId = scenarioId;
      if (mode) where.mode = mode as ForecastMode;

      const [runs, total] = await Promise.all([
        prisma.forecastRun.findMany({
          where,
          orderBy: { computedAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.forecastRun.count({ where }),
      ]);

      return reply.code(200).send({
        data: runs,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      });
    }
  );

  // GET /api/forecast/runs/:id — Get a single forecast run
  fastify.get<{ Params: { id: string } }>(
    '/api/forecast/runs/:id',
    { preHandler: [requireForecast] },
    async (request, reply) => {
      const run = await prisma.forecastRun.findUnique({
        where: { id: request.params.id },
      });

      if (!run) {
        throw new NotFoundError('ForecastRun');
      }

      return reply.code(200).send(run);
    }
  );

  // GET /api/forecast/data-quality — Assess data quality for forecasting
  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/api/forecast/data-quality',
    { preHandler: [requireForecast] },
    async (request, reply) => {
      const query = DataQualityQuerySchema.parse(request.query);

      const initiativeIds = query.initiativeIds
        ? query.initiativeIds.split(',').map(id => id.trim()).filter(Boolean)
        : undefined;

      const result = await assessDataQuality({
        scenarioId: query.scenarioId,
        initiativeIds,
      });

      return reply.code(200).send(result);
    }
  );
}
