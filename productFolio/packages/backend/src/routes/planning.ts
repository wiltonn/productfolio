import { FastifyInstance } from 'fastify';
import { UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { NotFoundError, ConflictError } from '../lib/errors.js';
import { updatePlanningModeSchema } from '../schemas/planning.schema.js';
import { upsertTokenSupplySchema } from '../schemas/token-supply.schema.js';
import {
  upsertTokenDemandSchema,
  bulkUpsertTokenDemandSchema,
} from '../schemas/token-demand.schema.js';
import { planningService } from '../planning/planning.service.js';
import { tokenSupplyService } from '../services/token-supply.service.js';
import { tokenDemandService } from '../services/token-demand.service.js';

const MUTATION_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.PRODUCT_OWNER,
  UserRole.BUSINESS_OWNER,
];

export async function planningRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', fastify.authenticate);

  const authorizeMutation = fastify.authorize(MUTATION_ROLES);
  const requireTokenPlanning = fastify.requireFeature('token_planning_v1');

  // ──────────────────────────────────────────────
  // Phase 1: Planning mode toggle
  // ──────────────────────────────────────────────

  // PUT /api/scenarios/:id/planning-mode — toggle planning mode
  fastify.put<{ Params: { id: string }; Body: unknown }>(
    '/api/scenarios/:id/planning-mode',
    { preHandler: [authorizeMutation] },
    async (request, reply) => {
      const { mode } = updatePlanningModeSchema.parse(request.body);
      const scenario = await prisma.scenario.findUnique({
        where: { id: request.params.id },
        select: { id: true },
      });
      if (!scenario) {
        throw new NotFoundError('Scenario', request.params.id);
      }
      await prisma.scenario.update({
        where: { id: request.params.id },
        data: { planningMode: mode },
      });
      return reply.code(200).send({ planningMode: mode });
    }
  );

  // ──────────────────────────────────────────────
  // Phase 4: Token supply CRUD
  // ──────────────────────────────────────────────

  // GET /api/scenarios/:id/token-supply — list supplies for scenario
  fastify.get<{ Params: { id: string } }>(
    '/api/scenarios/:id/token-supply',
    { preHandler: [requireTokenPlanning] },
    async (request, reply) => {
      const supplies = await tokenSupplyService.list(request.params.id);
      return reply.code(200).send(supplies);
    }
  );

  // PUT /api/scenarios/:id/token-supply — upsert supply
  fastify.put<{ Params: { id: string }; Body: unknown }>(
    '/api/scenarios/:id/token-supply',
    { preHandler: [requireTokenPlanning, authorizeMutation] },
    async (request, reply) => {
      const data = upsertTokenSupplySchema.parse(request.body);
      const supply = await tokenSupplyService.upsert(request.params.id, data);
      return reply.code(200).send(supply);
    }
  );

  // DELETE /api/scenarios/:id/token-supply/:skillPoolId — remove supply
  fastify.delete<{ Params: { id: string; skillPoolId: string } }>(
    '/api/scenarios/:id/token-supply/:skillPoolId',
    { preHandler: [requireTokenPlanning, authorizeMutation] },
    async (request, reply) => {
      await tokenSupplyService.delete(request.params.id, request.params.skillPoolId);
      return reply.code(204).send();
    }
  );

  // ──────────────────────────────────────────────
  // Phase 4: Token demand CRUD
  // ──────────────────────────────────────────────

  // GET /api/scenarios/:id/token-demand — list demands for scenario
  fastify.get<{ Params: { id: string } }>(
    '/api/scenarios/:id/token-demand',
    { preHandler: [requireTokenPlanning] },
    async (request, reply) => {
      const demands = await tokenDemandService.list(request.params.id);
      return reply.code(200).send(demands);
    }
  );

  // PUT /api/scenarios/:id/token-demand — upsert single demand
  fastify.put<{ Params: { id: string }; Body: unknown }>(
    '/api/scenarios/:id/token-demand',
    { preHandler: [requireTokenPlanning, authorizeMutation] },
    async (request, reply) => {
      const data = upsertTokenDemandSchema.parse(request.body);
      const demand = await tokenDemandService.upsert(request.params.id, data);
      return reply.code(200).send(demand);
    }
  );

  // POST /api/scenarios/:id/token-demand/bulk — bulk upsert demands
  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/scenarios/:id/token-demand/bulk',
    { preHandler: [requireTokenPlanning, authorizeMutation] },
    async (request, reply) => {
      const { items } = bulkUpsertTokenDemandSchema.parse(request.body);
      const demands = await tokenDemandService.bulkUpsert(request.params.id, items);
      return reply.code(200).send(demands);
    }
  );

  // DELETE /api/scenarios/:id/token-demand/:demandId — remove demand
  fastify.delete<{ Params: { id: string; demandId: string } }>(
    '/api/scenarios/:id/token-demand/:demandId',
    { preHandler: [requireTokenPlanning, authorizeMutation] },
    async (request, reply) => {
      await tokenDemandService.delete(request.params.demandId);
      return reply.code(204).send();
    }
  );

  // ──────────────────────────────────────────────
  // Phase 5: Token ledger summary
  // ──────────────────────────────────────────────

  // GET /api/scenarios/:id/token-ledger — aggregated supply vs demand view
  fastify.get<{ Params: { id: string } }>(
    '/api/scenarios/:id/token-ledger',
    { preHandler: [requireTokenPlanning] },
    async (request, reply) => {
      const scenario = await prisma.scenario.findUnique({
        where: { id: request.params.id },
        select: { id: true, planningMode: true },
      });

      if (!scenario) {
        throw new NotFoundError('Scenario', request.params.id);
      }

      if (scenario.planningMode !== 'TOKEN') {
        throw new ConflictError('Scenario must be in TOKEN planning mode to view the token ledger');
      }

      const summary = await planningService.getTokenLedgerSummary(request.params.id);
      return reply.code(200).send(summary);
    }
  );
}
