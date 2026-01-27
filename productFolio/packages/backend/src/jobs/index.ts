// Queue exports
export {
  QUEUE_NAMES,
  redisConnection,
  getScenarioRecomputeQueue,
  getCsvImportQueue,
  getViewRefreshQueue,
  closeQueues,
  enqueueScenarioRecompute,
  enqueueCsvImport,
  enqueueViewRefresh,
} from './queue.js';

export type {
  ScenarioRecomputeJobData,
  CsvImportJobData,
  ViewRefreshJobData,
} from './queue.js';

// Worker exports
export { startWorkers, stopWorkers, getWorkerStatus } from './worker.js';

// Scheduler exports
export { setupScheduledJobs, removeScheduledJobs } from './scheduler.js';

// Processor exports (for testing)
export { processScenarioRecompute } from './processors/scenario-recompute.processor.js';
export { processCsvImport } from './processors/csv-import.processor.js';
export { processViewRefresh } from './processors/view-refresh.processor.js';
