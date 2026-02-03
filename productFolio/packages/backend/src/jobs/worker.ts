import { Worker, Job } from 'bullmq';
import { redisConnection, QUEUE_NAMES } from './queue.js';
import type { ScenarioRecomputeJobData, CsvImportJobData, ViewRefreshJobData, DriftCheckJobData, JiraSyncJobData } from './queue.js';
import { processScenarioRecompute } from './processors/scenario-recompute.processor.js';
import { processCsvImport } from './processors/csv-import.processor.js';
import { processViewRefresh } from './processors/view-refresh.processor.js';
import { processDriftCheck } from './processors/drift-check.processor.js';
import { processJiraSync } from './processors/jira-sync.processor.js';

let scenarioRecomputeWorker: Worker | null = null;
let csvImportWorker: Worker | null = null;
let viewRefreshWorker: Worker | null = null;
let driftCheckWorker: Worker | null = null;
let jiraSyncWorker: Worker | null = null;

/**
 * Start all background job workers
 */
export async function startWorkers(): Promise<void> {
  console.log('Starting background job workers...');

  // Scenario recompute worker
  scenarioRecomputeWorker = new Worker(
    QUEUE_NAMES.SCENARIO_RECOMPUTE,
    processScenarioRecompute,
    {
      connection: redisConnection,
      concurrency: 5, // Process up to 5 scenarios concurrently
      limiter: {
        max: 10,
        duration: 1000, // Max 10 jobs per second
      },
    }
  );

  scenarioRecomputeWorker.on('completed', (job: Job<ScenarioRecomputeJobData>) => {
    console.log(`[scenario-recompute] Job ${job.id} completed`);
  });

  scenarioRecomputeWorker.on('failed', (job: Job<ScenarioRecomputeJobData> | undefined, err: Error) => {
    console.error(`[scenario-recompute] Job ${job?.id} failed:`, err.message);
  });

  scenarioRecomputeWorker.on('error', (err: Error) => {
    console.error('[scenario-recompute] Worker error:', err.message);
  });

  // CSV import worker
  csvImportWorker = new Worker(QUEUE_NAMES.CSV_IMPORT, processCsvImport, {
    connection: redisConnection,
    concurrency: 2, // Limit concurrent imports
    limiter: {
      max: 5,
      duration: 60000, // Max 5 imports per minute
    },
  });

  csvImportWorker.on('completed', (job: Job<CsvImportJobData>, result: { success: number; failed: number }) => {
    console.log(
      `[csv-import] Job ${job.id} completed: ${result.success} success, ${result.failed} failed`
    );
  });

  csvImportWorker.on('failed', (job: Job<CsvImportJobData> | undefined, err: Error) => {
    console.error(`[csv-import] Job ${job?.id} failed:`, err.message);
  });

  csvImportWorker.on('error', (err: Error) => {
    console.error('[csv-import] Worker error:', err.message);
  });

  // View refresh worker
  viewRefreshWorker = new Worker(QUEUE_NAMES.VIEW_REFRESH, processViewRefresh, {
    connection: redisConnection,
    concurrency: 3,
    limiter: {
      max: 10,
      duration: 10000, // Max 10 refreshes per 10 seconds
    },
  });

  viewRefreshWorker.on('completed', (job: Job<ViewRefreshJobData>, result: { scenariosProcessed: number }) => {
    console.log(
      `[view-refresh] Job ${job.id} completed: ${result.scenariosProcessed} scenarios processed`
    );
  });

  viewRefreshWorker.on('failed', (job: Job<ViewRefreshJobData> | undefined, err: Error) => {
    console.error(`[view-refresh] Job ${job?.id} failed:`, err.message);
  });

  viewRefreshWorker.on('error', (err: Error) => {
    console.error('[view-refresh] Worker error:', err.message);
  });

  // Drift check worker
  driftCheckWorker = new Worker(QUEUE_NAMES.DRIFT_CHECK, processDriftCheck, {
    connection: redisConnection,
    concurrency: 2,
    limiter: {
      max: 5,
      duration: 10000, // Max 5 drift checks per 10 seconds
    },
  });

  driftCheckWorker.on('completed', (job: Job<DriftCheckJobData>, result: { alertsCreated: number; scenariosChecked: number }) => {
    console.log(
      `[drift-check] Job ${job.id} completed: ${result.scenariosChecked} checked, ${result.alertsCreated} alerts`
    );
  });

  driftCheckWorker.on('failed', (job: Job<DriftCheckJobData> | undefined, err: Error) => {
    console.error(`[drift-check] Job ${job?.id} failed:`, err.message);
  });

  driftCheckWorker.on('error', (err: Error) => {
    console.error('[drift-check] Worker error:', err.message);
  });

  // Jira sync worker
  jiraSyncWorker = new Worker(QUEUE_NAMES.JIRA_SYNC, processJiraSync, {
    connection: redisConnection,
    concurrency: 2,
    limiter: {
      max: 3,
      duration: 60000, // Max 3 sync jobs per minute
    },
  });

  jiraSyncWorker.on('completed', (job: Job<JiraSyncJobData>, result: { synced: number; errors: string[] }) => {
    console.log(
      `[jira-sync] Job ${job.id} completed: ${result.synced} synced, ${result.errors.length} errors`
    );
  });

  jiraSyncWorker.on('failed', (job: Job<JiraSyncJobData> | undefined, err: Error) => {
    console.error(`[jira-sync] Job ${job?.id} failed:`, err.message);
  });

  jiraSyncWorker.on('error', (err: Error) => {
    console.error('[jira-sync] Worker error:', err.message);
  });

  console.log('All workers started successfully');
}

/**
 * Stop all workers gracefully
 */
export async function stopWorkers(): Promise<void> {
  console.log('Stopping background job workers...');

  const closePromises: Promise<void>[] = [];

  if (scenarioRecomputeWorker) {
    closePromises.push(scenarioRecomputeWorker.close());
    scenarioRecomputeWorker = null;
  }

  if (csvImportWorker) {
    closePromises.push(csvImportWorker.close());
    csvImportWorker = null;
  }

  if (viewRefreshWorker) {
    closePromises.push(viewRefreshWorker.close());
    viewRefreshWorker = null;
  }

  if (driftCheckWorker) {
    closePromises.push(driftCheckWorker.close());
    driftCheckWorker = null;
  }

  if (jiraSyncWorker) {
    closePromises.push(jiraSyncWorker.close());
    jiraSyncWorker = null;
  }

  await Promise.all(closePromises);
  console.log('All workers stopped');
}

/**
 * Get worker status for health checks
 */
export function getWorkerStatus(): {
  scenarioRecompute: boolean;
  csvImport: boolean;
  viewRefresh: boolean;
  driftCheck: boolean;
  jiraSync: boolean;
} {
  return {
    scenarioRecompute: scenarioRecomputeWorker !== null && !scenarioRecomputeWorker.closing,
    csvImport: csvImportWorker !== null && !csvImportWorker.closing,
    viewRefresh: viewRefreshWorker !== null && !viewRefreshWorker.closing,
    driftCheck: driftCheckWorker !== null && !driftCheckWorker.closing,
    jiraSync: jiraSyncWorker !== null && !jiraSyncWorker.closing,
  };
}
