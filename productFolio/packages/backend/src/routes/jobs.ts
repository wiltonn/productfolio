import { FastifyInstance } from 'fastify';
import { Job } from 'bullmq';
import {
  getScenarioRecomputeQueue,
  getCsvImportQueue,
  getViewRefreshQueue,
  QUEUE_NAMES,
  enqueueStatusLogBackfill,
} from '../jobs/index.js';

export async function jobsRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/jobs/status
   * Get overall job queue status
   */
  fastify.get('/api/jobs/status', async (request, reply) => {
    const [scenarioQueue, csvQueue, viewQueue] = [
      getScenarioRecomputeQueue(),
      getCsvImportQueue(),
      getViewRefreshQueue(),
    ];

    const [scenarioCounts, csvCounts, viewCounts] = await Promise.all([
      scenarioQueue.getJobCounts(),
      csvQueue.getJobCounts(),
      viewQueue.getJobCounts(),
    ]);

    return reply.send({
      queues: {
        [QUEUE_NAMES.SCENARIO_RECOMPUTE]: scenarioCounts,
        [QUEUE_NAMES.CSV_IMPORT]: csvCounts,
        [QUEUE_NAMES.VIEW_REFRESH]: viewCounts,
      },
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * GET /api/jobs/:queueName/:jobId
   * Get status of a specific job
   */
  fastify.get<{
    Params: { queueName: string; jobId: string };
  }>('/api/jobs/:queueName/:jobId', async (request, reply) => {
    const { queueName, jobId } = request.params;

    let queue;
    switch (queueName) {
      case QUEUE_NAMES.SCENARIO_RECOMPUTE:
        queue = getScenarioRecomputeQueue();
        break;
      case QUEUE_NAMES.CSV_IMPORT:
        queue = getCsvImportQueue();
        break;
      case QUEUE_NAMES.VIEW_REFRESH:
        queue = getViewRefreshQueue();
        break;
      default:
        return reply.status(404).send({ error: 'Queue not found' });
    }

    const job = await queue.getJob(jobId);

    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    const state = await job.getState();
    const progress = job.progress;
    const logs = await queue.getJobLogs(jobId);

    return reply.send({
      id: job.id,
      name: job.name,
      data: job.data,
      state,
      progress,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
      returnvalue: job.returnvalue,
      logs: logs.logs,
      timestamps: {
        created: job.timestamp,
        processed: job.processedOn,
        finished: job.finishedOn,
      },
    });
  });

  /**
   * GET /api/jobs/:queueName/recent
   * Get recent jobs from a queue
   */
  fastify.get<{
    Params: { queueName: string };
    Querystring: { status?: string; limit?: string };
  }>('/api/jobs/:queueName/recent', async (request, reply) => {
    const { queueName } = request.params;
    const status = request.query.status || 'completed';
    const limit = parseInt(request.query.limit || '10', 10);

    let queue;
    switch (queueName) {
      case QUEUE_NAMES.SCENARIO_RECOMPUTE:
        queue = getScenarioRecomputeQueue();
        break;
      case QUEUE_NAMES.CSV_IMPORT:
        queue = getCsvImportQueue();
        break;
      case QUEUE_NAMES.VIEW_REFRESH:
        queue = getViewRefreshQueue();
        break;
      default:
        return reply.status(404).send({ error: 'Queue not found' });
    }

    let jobs;
    switch (status) {
      case 'completed':
        jobs = await queue.getCompleted(0, limit);
        break;
      case 'failed':
        jobs = await queue.getFailed(0, limit);
        break;
      case 'active':
        jobs = await queue.getActive(0, limit);
        break;
      case 'waiting':
        jobs = await queue.getWaiting(0, limit);
        break;
      case 'delayed':
        jobs = await queue.getDelayed(0, limit);
        break;
      default:
        return reply.status(400).send({ error: 'Invalid status' });
    }

    const jobSummaries = await Promise.all(
      jobs.map(async (job: Job) => ({
        id: job.id,
        name: job.name,
        state: await job.getState(),
        progress: job.progress,
        attemptsMade: job.attemptsMade,
        failedReason: job.failedReason,
        timestamps: {
          created: job.timestamp,
          processed: job.processedOn,
          finished: job.finishedOn,
        },
      }))
    );

    return reply.send({
      queue: queueName,
      status,
      jobs: jobSummaries,
    });
  });

  /**
   * DELETE /api/jobs/:queueName/:jobId
   * Remove a job from the queue
   */
  fastify.delete<{
    Params: { queueName: string; jobId: string };
  }>('/api/jobs/:queueName/:jobId', async (request, reply) => {
    const { queueName, jobId } = request.params;

    let queue;
    switch (queueName) {
      case QUEUE_NAMES.SCENARIO_RECOMPUTE:
        queue = getScenarioRecomputeQueue();
        break;
      case QUEUE_NAMES.CSV_IMPORT:
        queue = getCsvImportQueue();
        break;
      case QUEUE_NAMES.VIEW_REFRESH:
        queue = getViewRefreshQueue();
        break;
      default:
        return reply.status(404).send({ error: 'Queue not found' });
    }

    const job = await queue.getJob(jobId);

    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    await job.remove();

    return reply.send({ success: true, message: 'Job removed' });
  });

  /**
   * POST /api/jobs/backfill-status-logs
   * Trigger a one-time backfill of InitiativeStatusLog from AuditEvent records
   */
  fastify.post<{
    Body: { batchSize?: number };
  }>('/api/jobs/backfill-status-logs', async (request, reply) => {
    const batchSize = (request.body as any)?.batchSize;
    const jobId = await enqueueStatusLogBackfill(batchSize);

    if (!jobId) {
      return reply.status(500).send({ error: 'Failed to enqueue backfill job' });
    }

    return reply.status(202).send({
      message: 'Status log backfill job queued',
      jobId,
      queue: QUEUE_NAMES.STATUS_LOG_BACKFILL,
    });
  });
}
