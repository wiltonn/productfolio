// Queue exports
export {
  QUEUE_NAMES,
  redisConnection,
  getScenarioRecomputeQueue,
  getCsvImportQueue,
  getViewRefreshQueue,
  getDriftCheckQueue,
  getJiraSyncQueue,
  closeQueues,
  enqueueScenarioRecompute,
  enqueueCsvImport,
  enqueueViewRefresh,
  enqueueDriftCheck,
  enqueueJiraSync,
} from './queue.js';

export type {
  ScenarioRecomputeJobData,
  CsvImportJobData,
  ViewRefreshJobData,
  DriftCheckJobData,
  JiraSyncJobData,
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
