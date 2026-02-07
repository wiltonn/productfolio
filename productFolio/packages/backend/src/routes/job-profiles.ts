import { FastifyInstance } from 'fastify';
import {
  CreateJobProfileSchema,
  UpdateJobProfileSchema,
  JobProfileFiltersSchema,
} from '../schemas/job-profiles.schema.js';
import * as jobProfileService from '../services/job-profile.service.js';
import { generateBudgetReport } from '../services/budget-report.service.js';

export async function jobProfilesRoutes(fastify: FastifyInstance) {
  // Feature gate: all routes return 404 when job_profiles flag is disabled
  fastify.addHook('onRequest', fastify.requireFeature('job_profiles'));
  fastify.addHook('onRequest', fastify.authenticate);

  /**
   * GET /api/job-profiles
   * List job profiles (paginated, filterable)
   */
  fastify.get<{
    Querystring: Record<string, unknown>;
  }>('/api/job-profiles', async (request, reply) => {
    const filters = JobProfileFiltersSchema.parse(request.query);
    const result = await jobProfileService.list(filters);
    return reply.send(result);
  });

  /**
   * GET /api/job-profiles/:id
   * Get a single job profile with skills and cost band
   */
  fastify.get<{
    Params: { id: string };
  }>('/api/job-profiles/:id', async (request, reply) => {
    const profile = await jobProfileService.getById(request.params.id);
    return reply.send(profile);
  });

  /**
   * POST /api/job-profiles
   * Create a new job profile (ADMIN only)
   */
  fastify.post(
    '/api/job-profiles',
    { preHandler: [fastify.authorize(['ADMIN'])] },
    async (request, reply) => {
      const data = CreateJobProfileSchema.parse(request.body);
      const profile = await jobProfileService.create(data);
      return reply.status(201).send(profile);
    }
  );

  /**
   * PUT /api/job-profiles/:id
   * Update a job profile (ADMIN only)
   */
  fastify.put<{
    Params: { id: string };
  }>(
    '/api/job-profiles/:id',
    { preHandler: [fastify.authorize(['ADMIN'])] },
    async (request, reply) => {
      const data = UpdateJobProfileSchema.parse(request.body);
      const profile = await jobProfileService.update(request.params.id, data);
      return reply.send(profile);
    }
  );

  /**
   * DELETE /api/job-profiles/:id
   * Soft delete a job profile (ADMIN only)
   */
  fastify.delete<{
    Params: { id: string };
  }>(
    '/api/job-profiles/:id',
    { preHandler: [fastify.authorize(['ADMIN'])] },
    async (request, reply) => {
      const result = await jobProfileService.deleteProfile(request.params.id);
      return reply.send(result);
    }
  );

  /**
   * GET /api/budget/scenario/:id
   * Budget report: CostBand × allocation hours for a scenario
   */
  fastify.get<{
    Params: { id: string };
  }>('/api/budget/scenario/:id', async (request, reply) => {
    const report = await generateBudgetReport(request.params.id);
    return reply.send(report);
  });
}
