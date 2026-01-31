import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  CreateEmployeeSchema,
  UpdateEmployeeSchema,
  EmployeeFiltersSchema,
  CreateSkillSchema,
  UpdateSkillSchema,
  CreateDomainSchema,
  UpdateDomainSchema,
  UpdateCapacitySchema,
  AvailabilityQuerySchema,
  AllocationSummariesQuerySchema,
} from '../schemas/resources.schema.js';
import * as resourcesService from '../services/resources.service.js';
import * as capacityService from '../services/capacity.service.js';
import { allocationService } from '../services/allocation.service.js';

// ============================================================================
// Employee Routes
// ============================================================================

export async function resourcesRoutes(fastify: FastifyInstance) {
  // Apply authentication to all routes in this plugin
  fastify.addHook('onRequest', fastify.authenticate);
  // GET /api/employees - List employees
  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/api/employees',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const filters = EmployeeFiltersSchema.parse(request.query);

      const result = await resourcesService.listEmployees(filters, {
        page: filters.page || 1,
        limit: filters.limit || 20,
      });

      return reply.status(200).send(result);
    }
  );

  // GET /api/employees/allocation-summaries - Batch allocation summaries
  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/api/employees/allocation-summaries',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AllocationSummariesQuerySchema.parse(request.query);
      const employeeIds = query.employeeIds.split(',').map((id) => id.trim());
      const summaries = await allocationService.listAllocationSummaries(
        employeeIds,
        query.currentQuarterStart,
        query.currentQuarterEnd,
        query.nextQuarterStart,
        query.nextQuarterEnd
      );
      return reply.status(200).send(summaries);
    }
  );

  // GET /api/employees/pto-hours - Batch PTO hours per employee per quarter
  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/api/employees/pto-hours',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = AllocationSummariesQuerySchema.parse(request.query);
      const employeeIds = query.employeeIds.split(',').map((id) => id.trim());
      const ptoHours = await capacityService.batchGetPtoHours(
        employeeIds,
        query.currentQuarterStart,
        query.currentQuarterEnd,
        query.nextQuarterStart,
        query.nextQuarterEnd
      );
      return reply.status(200).send(ptoHours);
    }
  );

  // GET /api/employees/:id - Get single employee
  fastify.get<{ Params: { id: string } }>(
    '/api/employees/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const employee = await resourcesService.getEmployeeById(id);
      return reply.status(200).send(employee);
    }
  );

  // POST /api/employees - Create employee
  fastify.post(
    '/api/employees',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = CreateEmployeeSchema.parse(request.body);
      const employee = await resourcesService.createEmployee(data);
      return reply.status(201).send(employee);
    }
  );

  // PUT /api/employees/:id - Update employee
  fastify.put<{ Params: { id: string } }>(
    '/api/employees/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const data = UpdateEmployeeSchema.parse(request.body);
      const employee = await resourcesService.updateEmployee(id, data);
      return reply.status(200).send(employee);
    }
  );

  // DELETE /api/employees/:id - Delete employee
  fastify.delete<{ Params: { id: string } }>(
    '/api/employees/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const result = await resourcesService.deleteEmployee(id);
      return reply.status(200).send(result);
    }
  );

  // GET /api/employees/:id/allocations - Get employee allocations across scenarios
  fastify.get<{ Params: { id: string } }>(
    '/api/employees/:id/allocations',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const allocations = await allocationService.listByEmployee(id);
      return reply.status(200).send(allocations);
    }
  );

  // =========================================================================
  // Skill Routes
  // =========================================================================

  // GET /api/employees/:id/skills - Get skills
  fastify.get<{ Params: { id: string } }>(
    '/api/employees/:id/skills',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const skills = await resourcesService.getEmployeeSkills(id);
      return reply.status(200).send({ skills });
    }
  );

  // POST /api/employees/:id/skills - Add skill
  fastify.post<{ Params: { id: string } }>(
    '/api/employees/:id/skills',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const data = CreateSkillSchema.parse(request.body);
      const skill = await resourcesService.addSkill(id, data);
      return reply.status(201).send(skill);
    }
  );

  // PUT /api/employees/:id/skills/:skillId - Update skill
  fastify.put<{
    Params: { id: string; skillId: string };
  }>(
    '/api/employees/:id/skills/:skillId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, skillId } = request.params as { id: string; skillId: string };
      const data = UpdateSkillSchema.parse(request.body);
      const skill = await resourcesService.updateSkill(id, skillId, data);
      return reply.status(200).send(skill);
    }
  );

  // DELETE /api/employees/:id/skills/:skillId - Remove skill
  fastify.delete<{ Params: { id: string; skillId: string } }>(
    '/api/employees/:id/skills/:skillId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, skillId } = request.params as { id: string; skillId: string };
      const result = await resourcesService.removeSkill(id, skillId);
      return reply.status(200).send(result);
    }
  );

  // =========================================================================
  // Domain Routes
  // =========================================================================

  // GET /api/employees/:id/domains - Get domains
  fastify.get<{ Params: { id: string } }>(
    '/api/employees/:id/domains',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const domains = await resourcesService.getEmployeeDomains(id);
      return reply.status(200).send({ domains });
    }
  );

  // POST /api/employees/:id/domains - Add domain
  fastify.post<{ Params: { id: string } }>(
    '/api/employees/:id/domains',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const data = CreateDomainSchema.parse(request.body);
      const domain = await resourcesService.addDomain(id, data);
      return reply.status(201).send(domain);
    }
  );

  // PUT /api/employees/:id/domains/:domainId - Update domain
  fastify.put<{
    Params: { id: string; domainId: string };
  }>(
    '/api/employees/:id/domains/:domainId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, domainId } = request.params as { id: string; domainId: string };
      const data = UpdateDomainSchema.parse(request.body);
      const domain = await resourcesService.updateDomain(id, domainId, data);
      return reply.status(200).send(domain);
    }
  );

  // DELETE /api/employees/:id/domains/:domainId - Remove domain
  fastify.delete<{ Params: { id: string; domainId: string } }>(
    '/api/employees/:id/domains/:domainId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, domainId } = request.params as { id: string; domainId: string };
      const result = await resourcesService.removeDomain(id, domainId);
      return reply.status(200).send(result);
    }
  );

  // =========================================================================
  // Capacity Routes
  // =========================================================================

  // GET /api/employees/:id/capacity - Get capacity calendar
  fastify.get<{ Params: { id: string } }>(
    '/api/employees/:id/capacity',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const capacityEntries = await capacityService.getCapacityCalendar(id);
      return reply.status(200).send({ capacity: capacityEntries });
    }
  );

  // PUT /api/employees/:id/capacity - Update capacity
  fastify.put<{ Params: { id: string } }>(
    '/api/employees/:id/capacity',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const data = UpdateCapacitySchema.parse(request.body);
      const updated = await capacityService.updateCapacity(id, data.entries);
      return reply.status(200).send({ capacity: updated });
    }
  );

  // GET /api/employees/:id/availability - Calculate availability
  fastify.get<{ Params: { id: string } }>(
    '/api/employees/:id/availability',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const query = AvailabilityQuerySchema.parse(request.query);
      const availability = await capacityService.calculateAvailability(
        id,
        query.startDate,
        query.endDate
      );
      return reply.status(200).send({ availability });
    }
  );
}
