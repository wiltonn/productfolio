import { Queue, QueueEvents } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';

// Redis connection options for BullMQ
export const redisConnection: ConnectionOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
};

// Queue names
export const QUEUE_NAMES = {
  SCENARIO_RECOMPUTE: 'scenario-recompute',
  CSV_IMPORT: 'csv-import',
  VIEW_REFRESH: 'view-refresh',
  DRIFT_CHECK: 'drift-check',
} as const;

// Job data types
export interface ScenarioRecomputeJobData {
  scenarioId: string;
  triggeredBy: 'allocation_change' | 'priority_change' | 'manual' | 'scope_change';
  timestamp: string;
}

export interface CsvImportJobData {
  rows: Array<Record<string, string>>;
  userId: string;
  fileName: string;
  totalRows: number;
}

export interface ViewRefreshJobData {
  viewType: 'demand_summary' | 'capacity_summary' | 'all';
  scenarioIds?: string[];
  triggeredBy: 'allocation_change' | 'scheduled' | 'manual';
}

export interface DriftCheckJobData {
  scenarioId?: string;
  triggeredBy: 'scheduled' | 'manual' | 'capacity_change' | 'demand_change';
  timestamp: string;
}

// Queue instances (lazy initialization)
let scenarioRecomputeQueue: Queue<ScenarioRecomputeJobData> | null = null;
let csvImportQueue: Queue<CsvImportJobData> | null = null;
let viewRefreshQueue: Queue<ViewRefreshJobData> | null = null;
let driftCheckQueue: Queue<DriftCheckJobData> | null = null;

/**
 * Get or create the scenario recompute queue
 */
export function getScenarioRecomputeQueue(): Queue<ScenarioRecomputeJobData> {
  if (!scenarioRecomputeQueue) {
    scenarioRecomputeQueue = new Queue<ScenarioRecomputeJobData>(
      QUEUE_NAMES.SCENARIO_RECOMPUTE,
      {
        connection: redisConnection,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: {
            age: 24 * 3600, // Keep completed jobs for 24 hours
            count: 1000,
          },
          removeOnFail: {
            age: 7 * 24 * 3600, // Keep failed jobs for 7 days
          },
        },
      }
    );
  }
  return scenarioRecomputeQueue;
}

/**
 * Get or create the CSV import queue
 */
export function getCsvImportQueue(): Queue<CsvImportJobData> {
  if (!csvImportQueue) {
    csvImportQueue = new Queue<CsvImportJobData>(QUEUE_NAMES.CSV_IMPORT, {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 1, // CSV imports should not retry automatically
        removeOnComplete: {
          age: 24 * 3600,
          count: 100,
        },
        removeOnFail: {
          age: 7 * 24 * 3600,
        },
      },
    });
  }
  return csvImportQueue;
}

/**
 * Get or create the view refresh queue
 */
export function getViewRefreshQueue(): Queue<ViewRefreshJobData> {
  if (!viewRefreshQueue) {
    viewRefreshQueue = new Queue<ViewRefreshJobData>(QUEUE_NAMES.VIEW_REFRESH, {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: {
          age: 12 * 3600, // Keep for 12 hours
          count: 500,
        },
        removeOnFail: {
          age: 24 * 3600,
        },
      },
    });
  }
  return viewRefreshQueue;
}

/**
 * Get or create the drift check queue
 */
export function getDriftCheckQueue(): Queue<DriftCheckJobData> {
  if (!driftCheckQueue) {
    driftCheckQueue = new Queue<DriftCheckJobData>(QUEUE_NAMES.DRIFT_CHECK, {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: {
          age: 12 * 3600, // Keep for 12 hours
          count: 500,
        },
        removeOnFail: {
          age: 24 * 3600,
        },
      },
    });
  }
  return driftCheckQueue;
}

/**
 * Close all queue connections
 */
export async function closeQueues(): Promise<void> {
  const closePromises: Promise<void>[] = [];

  if (scenarioRecomputeQueue) {
    closePromises.push(scenarioRecomputeQueue.close());
    scenarioRecomputeQueue = null;
  }

  if (csvImportQueue) {
    closePromises.push(csvImportQueue.close());
    csvImportQueue = null;
  }

  if (viewRefreshQueue) {
    closePromises.push(viewRefreshQueue.close());
    viewRefreshQueue = null;
  }

  if (driftCheckQueue) {
    closePromises.push(driftCheckQueue.close());
    driftCheckQueue = null;
  }

  await Promise.all(closePromises);
}

/**
 * Helper to add a scenario recompute job with deduplication
 */
export async function enqueueScenarioRecompute(
  scenarioId: string,
  triggeredBy: ScenarioRecomputeJobData['triggeredBy']
): Promise<string | null> {
  const queue = getScenarioRecomputeQueue();

  // Use scenario ID as job ID to deduplicate rapid changes
  const jobId = `recompute-${scenarioId}`;

  const job = await queue.add(
    'recompute',
    {
      scenarioId,
      triggeredBy,
      timestamp: new Date().toISOString(),
    },
    {
      jobId,
      // Debounce: delay execution to batch rapid changes
      delay: 500,
    }
  );

  return job.id ?? null;
}

/**
 * Helper to add a CSV import job
 */
export async function enqueueCsvImport(
  rows: Array<Record<string, string>>,
  userId: string,
  fileName: string
): Promise<string | null> {
  const queue = getCsvImportQueue();

  const job = await queue.add('import', {
    rows,
    userId,
    fileName,
    totalRows: rows.length,
  });

  return job.id ?? null;
}

/**
 * Helper to add a view refresh job
 */
export async function enqueueViewRefresh(
  viewType: ViewRefreshJobData['viewType'],
  triggeredBy: ViewRefreshJobData['triggeredBy'],
  scenarioIds?: string[]
): Promise<string | null> {
  const queue = getViewRefreshQueue();

  // Use view type as part of job ID to deduplicate
  const jobId = scenarioIds
    ? `refresh-${viewType}-${scenarioIds.join('-')}`
    : `refresh-${viewType}-all`;

  const job = await queue.add(
    'refresh',
    {
      viewType,
      scenarioIds,
      triggeredBy,
    },
    {
      jobId,
      delay: 1000, // Debounce view refreshes
    }
  );

  return job.id ?? null;
}

/**
 * Helper to add a drift check job with deduplication
 */
export async function enqueueDriftCheck(
  triggeredBy: DriftCheckJobData['triggeredBy'],
  scenarioId?: string
): Promise<string | null> {
  const queue = getDriftCheckQueue();

  const jobId = `drift-check-${scenarioId || 'all'}`;

  const job = await queue.add(
    'drift-check',
    {
      scenarioId,
      triggeredBy,
      timestamp: new Date().toISOString(),
    },
    {
      jobId,
      delay: 2000, // Debounce drift checks
    }
  );

  return job.id ?? null;
}
