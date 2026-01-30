import { FastifyInstance } from 'fastify';
import { UserRole } from '@prisma/client';
import {
  acknowledgeDriftAlertSchema,
  resolveDriftAlertSchema,
  driftThresholdSchema,
  driftCheckSchema,
} from '../schemas/baseline.schema.js';
import { driftAlertService } from '../services/drift-alert.service.js';
import { enqueueDriftCheck } from '../jobs/index.js';

export async function driftRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', fastify.authenticate);

  const authorizeAdmin = fastify.authorize([UserRole.ADMIN, UserRole.PRODUCT_OWNER]);

  // GET /api/drift/alerts - List drift alerts
  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/api/drift/alerts',
    async (request, reply) => {
      const filters: { scenarioId?: string; periodId?: string; status?: string } = {};
      if (request.query.scenarioId) filters.scenarioId = request.query.scenarioId as string;
      if (request.query.periodId) filters.periodId = request.query.periodId as string;
      if (request.query.status) filters.status = request.query.status as string;

      const alerts = await driftAlertService.getAlerts(filters);
      return reply.code(200).send(alerts);
    }
  );

  // PUT /api/drift/alerts/acknowledge - Acknowledge alerts
  fastify.put<{ Body: unknown }>(
    '/api/drift/alerts/acknowledge',
    { preHandler: authorizeAdmin },
    async (request, reply) => {
      const data = acknowledgeDriftAlertSchema.parse(request.body);
      const result = await driftAlertService.acknowledgeAlerts(data.alertIds);
      return reply.code(200).send(result);
    }
  );

  // PUT /api/drift/alerts/resolve - Resolve alerts
  fastify.put<{ Body: unknown }>(
    '/api/drift/alerts/resolve',
    { preHandler: authorizeAdmin },
    async (request, reply) => {
      const data = resolveDriftAlertSchema.parse(request.body);
      const result = await driftAlertService.resolveAlerts(data.alertIds);
      return reply.code(200).send(result);
    }
  );

  // POST /api/drift/check - Manual drift check trigger
  fastify.post<{ Body: unknown }>(
    '/api/drift/check',
    { preHandler: authorizeAdmin },
    async (request, reply) => {
      const data = driftCheckSchema.parse(request.body || {});
      if (data.scenarioId) {
        const result = await driftAlertService.checkDrift(data.scenarioId);
        return reply.code(200).send(result);
      }
      // Enqueue check for all baselines
      const jobId = await enqueueDriftCheck('manual');
      return reply.code(202).send({ jobId, message: 'Drift check enqueued for all baselines' });
    }
  );

  // GET /api/drift/thresholds - Get thresholds
  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/api/drift/thresholds',
    async (request, reply) => {
      const periodId = request.query.periodId as string | undefined;
      const thresholds = await driftAlertService.getThresholds(periodId);
      return reply.code(200).send(thresholds);
    }
  );

  // PUT /api/drift/thresholds - Update thresholds
  fastify.put<{ Body: unknown; Querystring: Record<string, unknown> }>(
    '/api/drift/thresholds',
    { preHandler: authorizeAdmin },
    async (request, reply) => {
      const data = driftThresholdSchema.parse(request.body);
      const periodId = request.query.periodId as string | undefined;
      const thresholds = await driftAlertService.updateThresholds(data, periodId);
      return reply.code(200).send(thresholds);
    }
  );
}
