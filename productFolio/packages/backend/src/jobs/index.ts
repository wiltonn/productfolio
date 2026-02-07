// Queue exports
export {
  QUEUE_NAMES,
  redisConnection,
  getScenarioRecomputeQueue,
  getCsvImportQueue,
  getViewRefreshQueue,
  getDriftCheckQueue,
  getJiraSyncQueue,
  getStatusLogBackfillQueue,
  closeQueues,
  enqueueScenarioRecompute,
  enqueueCsvImport,
  enqueueViewRefresh,
  enqueueDriftCheck,
  enqueueJiraSync,
  enqueueStatusLogBackfill,
} from './queue.js';

export type {
  ScenarioRecomputeJobData,
  CsvImportJobData,
  ViewRefreshJobData,
  DriftCheckJobData,
  JiraSyncJobData,
  StatusLogBackfillJobData,
} from './queue.js';

// Worker exports
export { startWorkers, stopWorkers, getWorkerStatus } from './worker.js';

// Scheduler exports
export { setupScheduledJobs, removeScheduledJobs } from './scheduler.js';

// Processor exports (for testing)
export { processScenarioRecompute } from './processors/scenario-recompute.processor.js';
export { processCsvImport } from './processors/csv-import.processor.js';
export { processViewRefresh } from './processors/view-refresh.processor.js';
export { processDriftCheck } from './processors/drift-check.processor.js';
export { processJiraSync } from './processors/jira-sync.processor.js';
export { processStatusLogBackfill } from './processors/status-log-backfill.processor.js';
