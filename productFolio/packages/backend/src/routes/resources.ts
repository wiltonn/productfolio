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
import { upsertFamiliaritySchema } from '../schemas/ramp.schema.js';
import * as resourcesService from '../services/resources.service.js';
import * as capacityService from '../services/capacity.service.js';
import { allocationService } from '../services/allocation.service.js';
import { prisma } from '../lib/prisma.js';
import { FamiliaritySource } from '@prisma/client';
import { z } from 'zod';
import { isEnabled } from '../services/feature-flag.service.js';
import { NotFoundError } from '../lib/errors.js';

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

  // =========================================================================
  // Domain Familiarity Routes
  // =========================================================================

  // GET /api/employees/:id/domain-familiarity - List all familiarity for employee
  fastify.get<{ Params: { id: string } }>(
    '/api/employees/:id/domain-familiarity',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const records = await prisma.employeeDomainFamiliarity.findMany({
        where: { employeeId: id },
        include: {
          initiative: { select: { id: true, title: true, domainComplexity: true } },
        },
        orderBy: { updatedAt: 'desc' },
      });
      return reply.status(200).send(records);
    }
  );

  // PUT /api/employees/:id/domain-familiarity/:initiativeId - Upsert familiarity
  fastify.put<{ Params: { id: string; initiativeId: string } }>(
    '/api/employees/:id/domain-familiarity/:initiativeId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, initiativeId } = request.params as { id: string; initiativeId: string };
      const data = upsertFamiliaritySchema.parse(request.body);
      const record = await prisma.employeeDomainFamiliarity.upsert({
        where: {
          employeeId_initiativeId: { employeeId: id, initiativeId },
        },
        create: {
          employeeId: id,
          initiativeId,
          familiarityLevel: data.familiarityLevel,
          source: data.source as FamiliaritySource,
        },
        update: {
          familiarityLevel: data.familiarityLevel,
          source: data.source as FamiliaritySource,
        },
      });
      return reply.status(200).send(record);
    }
  );

  // GET /api/initiatives/:id/domain-familiarity - List all employee familiarities for initiative
  fastify.get<{ Params: { id: string } }>(
    '/api/initiatives/:id/domain-familiarity',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const records = await prisma.employeeDomainFamiliarity.findMany({
        where: { initiativeId: id },
        include: {
          employee: { select: { id: true, name: true, role: true } },
        },
        orderBy: { updatedAt: 'desc' },
      });
      return reply.status(200).send(records);
    }
  );

  // =========================================================================
  // Job Profile Assignment (guarded by job_profiles feature flag)
  // =========================================================================

  const AssignJobProfileSchema = z.object({
    jobProfileId: z.string().uuid().nullable(),
  });

  // PUT /api/employees/:id/job-profile - Assign or remove job profile
  fastify.put<{ Params: { id: string } }>(
    '/api/employees/:id/job-profile',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const enabled = await isEnabled('job_profiles');
      if (!enabled) {
        throw new NotFoundError('Resource');
      }

      const { id } = request.params as { id: string };
      const { jobProfileId } = AssignJobProfileSchema.parse(request.body);

      const employee = await prisma.employee.findUnique({ where: { id } });
      if (!employee) {
        throw new NotFoundError('Employee', id);
      }

      if (jobProfileId) {
        const profile = await prisma.jobProfile.findUnique({ where: { id: jobProfileId } });
        if (!profile) {
          throw new NotFoundError('JobProfile', jobProfileId);
        }
      }

      const updated = await prisma.employee.update({
        where: { id },
        data: { jobProfileId },
        include: {
          jobProfile: { include: { skills: true, costBand: true } },
        },
      });

      return reply.status(200).send(updated);
    }
  );
}
