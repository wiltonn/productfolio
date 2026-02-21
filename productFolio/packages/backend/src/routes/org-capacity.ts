import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as orgTreeService from '../services/org-tree.service.js';
import { ScenarioCalculatorService } from '../services/scenario-calculator.service.js';
import { isEnabled } from '../services/feature-flag.service.js';
import { NotFoundError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

// ============================================================================
// Org Capacity Routes (guarded by org_capacity_view feature flag)
// ============================================================================

export async function orgCapacityRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /api/org/nodes/:id/employees — Employees in subtree
  fastify.get<{ Params: { id: string } }>(
    '/api/org/nodes/:id/employees',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const enabled = await isEnabled('org_capacity_view');
      if (!enabled) throw new NotFoundError('Resource');

      const { id } = request.params as { id: string };
      const employeeIds = await orgTreeService.getEmployeesInSubtree(id);

      const employees = await prisma.employee.findMany({
        where: { id: { in: employeeIds } },
        include: {
          skills: { select: { name: true, proficiency: true } },
          jobProfile: { select: { id: true, name: true, level: true } },
          allocations: {
            select: {
              id: true,
              scenarioId: true,
              initiativeId: true,
              percentage: true,
              startDate: true,
              endDate: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      });

      return reply.status(200).send({
        orgNodeId: id,
        employeeCount: employees.length,
        employees,
      });
    },
  );

  // GET /api/org/nodes/:id/capacity?scenarioId=X — Org-scoped capacity/demand
  fastify.get<{
    Params: { id: string };
    Querystring: { scenarioId: string };
  }>(
    '/api/org/nodes/:id/capacity',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const enabled = await isEnabled('org_capacity_view');
      if (!enabled) throw new NotFoundError('Resource');

      const { id } = request.params as { id: string };
      const { scenarioId } = request.query as { scenarioId: string };

      if (!scenarioId) {
        return reply.status(400).send({ error: 'scenarioId query parameter is required' });
      }

      const calculator = new ScenarioCalculatorService();
      const result = await calculator.calculate(scenarioId, {
        orgNodeId: id,
        skipCache: false,
      });

      return reply.status(200).send(result);
    },
  );
}
