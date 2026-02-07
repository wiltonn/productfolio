import { FastifyInstance } from 'fastify';
import {
  CreateInitiativeSchema,
  UpdateInitiativeSchema,
  InitiativeFiltersSchema,
  StatusTransitionSchema,
  BulkUpdateSchema,
  BulkDeleteSchema,
  CsvImportSchema,
  CsvExportSchema,
  InitiativeAllocationHoursQuerySchema,
} from '../schemas/initiatives.schema.js';
import * as initiativesService from '../services/initiatives.service.js';
import * as statusLogService from '../services/initiative-status-log.service.js';
import { allocationService } from '../services/allocation.service.js';
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
      origin?: string;
      businessOwnerId?: string;
      productOwnerId?: string;
      portfolioAreaId?: string;
      targetQuarter?: string;
      deliveryHealth?: string;
      search?: string;
      page?: string;
      limit?: string;
    };
  }>('/api/initiatives', async (request, reply) => {
    const filters = {
      status: request.query.status,
      origin: request.query.origin,
      businessOwnerId: request.query.businessOwnerId,
      productOwnerId: request.query.productOwnerId,
      portfolioAreaId: request.query.portfolioAreaId,
      targetQuarter: request.query.targetQuarter,
      deliveryHealth: request.query.deliveryHealth,
      search: request.query.search,
      page: request.query.page ? parseInt(request.query.page, 10) : 1,
      limit: request.query.limit ? parseInt(request.query.limit, 10) : 20,
    };

    const validatedFilters = InitiativeFiltersSchema.parse(filters);
    const result = await initiativesService.list(validatedFilters);
    return reply.send(result);
  });

  /**
   * GET /api/initiatives/allocation-hours
   * Batch fetch allocated hours per initiative for current and next quarters
   */
  fastify.get<{
    Querystring: Record<string, unknown>;
  }>('/api/initiatives/allocation-hours', async (request, reply) => {
    const query = InitiativeAllocationHoursQuerySchema.parse(request.query);
    const initiativeIds = query.initiativeIds.split(',').map((id) => id.trim());
    const hours = await allocationService.listInitiativeAllocationHours(
      initiativeIds,
      query.currentQuarterStart,
      query.currentQuarterEnd,
      query.nextQuarterStart,
      query.nextQuarterEnd
    );
    return reply.send(hours);
  });

  /**
   * GET /api/initiatives/allocation-hours-by-type
   * Batch fetch actual vs proposed allocation hours per initiative for current and next quarters
   */
  fastify.get<{
    Querystring: Record<string, unknown>;
  }>('/api/initiatives/allocation-hours-by-type', async (request, reply) => {
    const query = InitiativeAllocationHoursQuerySchema.parse(request.query);
    const initiativeIds = query.initiativeIds.split(',').map((id) => id.trim());
    const hours = await allocationService.listInitiativeAllocationHoursByType(
      initiativeIds,
      query.currentQuarterStart,
      query.currentQuarterEnd,
      query.nextQuarterStart,
      query.nextQuarterEnd
    );
    return reply.send(hours);
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
   * GET /api/initiatives/:id/allocations
   * List all allocations for an initiative across all scenarios
   * Optional query param: periodId to filter to a specific quarter
   */
  fastify.get<{
    Params: { id: string };
    Querystring: { periodId?: string };
  }>('/api/initiatives/:id/allocations', async (request, reply) => {
    const allocations = await allocationService.listByInitiativeAcrossScenarios(
      request.params.id,
      request.query.periodId
    );
    return reply.send(allocations);
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
      validatedData.newStatus,
      request.user.sub
    );
    return reply.send(initiative);
  });

  /**
   * GET /api/initiatives/:id/status-history
   * Get the full status transition history for an initiative
   */
  fastify.get<{
    Params: { id: string };
  }>('/api/initiatives/:id/status-history', async (request, reply) => {
    const history = await statusLogService.getHistory(request.params.id);
    return reply.send(history);
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
   * POST /api/initiatives/bulk-delete
   * Bulk delete initiatives
   */
  fastify.post<{
    Body: { ids: string[] };
  }>('/api/initiatives/bulk-delete', async (request, reply) => {
    const validatedData = BulkDeleteSchema.parse(request.body);
    const result = await initiativesService.bulkDelete(validatedData);
    return reply.send(result);
  });

  /**
   * DELETE /api/initiatives/bulk
   * Bulk delete initiatives (alternative endpoint)
   */
  fastify.delete<{
    Body: { ids: string[] };
  }>('/api/initiatives/bulk', async (request, reply) => {
    // For DELETE with body, manually parse if body is a string
    let body = request.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return reply.status(400).send({ error: 'Invalid JSON body' });
      }
    }
    if (!body || !body.ids) {
      return reply.status(400).send({ error: 'Missing ids in request body' });
    }
    const validatedData = BulkDeleteSchema.parse(body);
    const result = await initiativesService.bulkDelete(validatedData);
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
      portfolioAreaId?: string;
      targetQuarter?: string;
      deliveryHealth?: string;
      search?: string;
    };
  }>('/api/initiatives/export', async (request, reply) => {
    const filters = {
      status: request.query.status,
      businessOwnerId: request.query.businessOwnerId,
      productOwnerId: request.query.productOwnerId,
      portfolioAreaId: request.query.portfolioAreaId,
      targetQuarter: request.query.targetQuarter,
      deliveryHealth: request.query.deliveryHealth,
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
