import { FastifyInstance } from 'fastify';
import {
  CreateInitiativeSchema,
  UpdateInitiativeSchema,
  InitiativeFiltersSchema,
  StatusTransitionSchema,
  BulkUpdateSchema,
  CsvImportSchema,
  CsvExportSchema,
} from '../schemas/initiatives.schema.js';
import * as initiativesService from '../services/initiatives.service.js';
import { enqueueCsvImport } from '../jobs/index.js';

export async function initiativesRoutes(fastify: FastifyInstance) {
  // Apply authentication to all routes in this plugin
  fastify.addHook('onRequest', fastify.authenticate);
  /**
   * GET /api/initiatives
   * List initiatives with filters and pagination
   */
  fastify.get<{
    Querystring: {
      status?: string;
      businessOwnerId?: string;
      productOwnerId?: string;
      targetQuarter?: string;
      search?: string;
      page?: string;
      limit?: string;
    };
  }>('/api/initiatives', async (request, reply) => {
    const filters = {
      status: request.query.status,
      businessOwnerId: request.query.businessOwnerId,
      productOwnerId: request.query.productOwnerId,
      targetQuarter: request.query.targetQuarter,
      search: request.query.search,
      page: request.query.page ? parseInt(request.query.page, 10) : 1,
      limit: request.query.limit ? parseInt(request.query.limit, 10) : 20,
    };

    const validatedFilters = InitiativeFiltersSchema.parse(filters);
    const result = await initiativesService.list(validatedFilters);
    return reply.send(result);
  });

  /**
   * GET /api/initiatives/:id
   * Get a single initiative by ID
   */
  fastify.get<{
    Params: { id: string };
  }>('/api/initiatives/:id', async (request, reply) => {
    const initiative = await initiativesService.getById(request.params.id);
    return reply.send(initiative);
  });

  /**
   * POST /api/initiatives
   * Create a new initiative
   */
  fastify.post<{
    Body: typeof CreateInitiativeSchema;
  }>('/api/initiatives', async (request, reply) => {
    const validatedData = CreateInitiativeSchema.parse(request.body);
    const initiative = await initiativesService.create(validatedData);
    return reply.status(201).send(initiative);
  });

  /**
   * PUT /api/initiatives/:id
   * Update an initiative
   */
  fastify.put<{
    Params: { id: string };
    Body: typeof UpdateInitiativeSchema;
  }>('/api/initiatives/:id', async (request, reply) => {
    const validatedData = UpdateInitiativeSchema.parse(request.body);
    const initiative = await initiativesService.update(
      request.params.id,
      validatedData
    );
    return reply.send(initiative);
  });

  /**
   * DELETE /api/initiatives/:id
   * Delete an initiative
   */
  fastify.delete<{
    Params: { id: string };
  }>('/api/initiatives/:id', async (request, reply) => {
    const result = await initiativesService.deleteInitiative(request.params.id);
    return reply.send(result);
  });

  /**
   * POST /api/initiatives/:id/status
   * Transition initiative status
   */
  fastify.post<{
    Params: { id: string };
    Body: typeof StatusTransitionSchema;
  }>('/api/initiatives/:id/status', async (request, reply) => {
    const validatedData = StatusTransitionSchema.parse(request.body);
    const initiative = await initiativesService.transitionStatus(
      request.params.id,
      validatedData.newStatus
    );
    return reply.send(initiative);
  });

  /**
   * PATCH /api/initiatives/bulk
   * Bulk update initiatives
   */
  fastify.patch<{
    Body: typeof BulkUpdateSchema;
  }>('/api/initiatives/bulk', async (request, reply) => {
    const validatedData = BulkUpdateSchema.parse(request.body);
    const result = await initiativesService.bulkUpdate(validatedData);
    return reply.send(result);
  });

  /**
   * POST /api/initiatives/import
   * Import initiatives from CSV
   * For large imports (>100 rows), processes asynchronously via background job
   */
  fastify.post<{
    Body: { data: Array<Record<string, string>>; async?: boolean; fileName?: string };
  }>('/api/initiatives/import', async (request, reply) => {
    const validatedData = CsvImportSchema.parse(request.body);
    const rows = validatedData.data as Array<Record<string, string>>;

    // Use async processing for large imports (>100 rows) or when explicitly requested
    const useAsync = rows.length > 100 || request.body.async === true;

    if (useAsync) {
      // Queue the import job for background processing
      const jobId = await enqueueCsvImport(
        rows,
        request.user.sub, // Use authenticated user's ID
        request.body.fileName || `import-${Date.now()}.csv`
      );

      return reply.status(202).send({
        message: 'Import job queued for processing',
        jobId,
        totalRows: rows.length,
        async: true,
      });
    }

    // Process synchronously for small imports
    const result = await initiativesService.importFromCsv(rows);
    return reply.status(202).send({ ...result, async: false });
  });

  /**
   * GET /api/initiatives/export
   * Export initiatives to CSV
   */
  fastify.get<{
    Querystring: {
      status?: string;
      businessOwnerId?: string;
      productOwnerId?: string;
      targetQuarter?: string;
      search?: string;
    };
  }>('/api/initiatives/export', async (request, reply) => {
    const filters = {
      status: request.query.status,
      businessOwnerId: request.query.businessOwnerId,
      productOwnerId: request.query.productOwnerId,
      targetQuarter: request.query.targetQuarter,
      search: request.query.search,
    };

    const validatedFilters = CsvExportSchema.parse(filters);
    const csv = await initiativesService.exportToCsv(validatedFilters);

    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header(
        'Content-Disposition',
        'attachment; filename="initiatives-export.csv"'
      )
      .send(csv);
  });
}
