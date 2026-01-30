import { getViewRefreshQueue, getDriftCheckQueue } from './queue.js';
import { periodService } from '../services/period.service.js';

/**
 * Set up recurring jobs using BullMQ's repeatable jobs feature
 */
export async function setupScheduledJobs(): Promise<void> {
  console.log('Setting up scheduled jobs...');

  const viewRefreshQueue = getViewRefreshQueue();

  // Schedule view refresh every 15 minutes
  await viewRefreshQueue.add(
    'scheduled-refresh',
    {
      viewType: 'all',
      triggeredBy: 'scheduled',
    },
    {
      repeat: {
        pattern: '*/15 * * * *', // Every 15 minutes
      },
      jobId: 'scheduled-view-refresh',
    }
  );

  // Schedule drift check every 30 minutes
  const driftCheckQueue = getDriftCheckQueue();
  await driftCheckQueue.add(
    'scheduled-drift-check',
    {
      triggeredBy: 'scheduled',
      timestamp: new Date().toISOString(),
    },
    {
      repeat: {
        pattern: '*/30 * * * *', // Every 30 minutes
      },
      jobId: 'scheduled-drift-check',
    }
  );

  console.log('Scheduled jobs configured:');
  console.log('- View refresh: every 15 minutes');
  console.log('- Drift check: every 30 minutes');

  // Run period maintenance on startup (ensure periods exist 2 years into future)
  await runPeriodMaintenance();
}

/**
 * Ensure periods exist at least 2 years into the future.
 * Called on startup and can be called periodically.
 */
export async function runPeriodMaintenance(): Promise<void> {
  try {
    const currentYear = new Date().getFullYear();
    const endYear = currentYear + 2;
    const startYear = currentYear - 1; // Also ensure previous year exists

    console.log(`Period maintenance: ensuring periods exist for ${startYear}-${endYear}...`);
    const result = await periodService.seedPeriods(startYear, endYear);
    console.log(`Period maintenance complete: ${result.created} periods created`);
  } catch (error) {
    console.error('Period maintenance failed:', error);
  }
}

/**
 * Remove all scheduled jobs (for cleanup)
 */
export async function removeScheduledJobs(): Promise<void> {
  const viewRefreshQueue = getViewRefreshQueue();
  const repeatableJobs = await viewRefreshQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await viewRefreshQueue.removeRepeatableByKey(job.key);
  }

  const driftCheckQueue = getDriftCheckQueue();
  const driftRepeatableJobs = await driftCheckQueue.getRepeatableJobs();
  for (const job of driftRepeatableJobs) {
    await driftCheckQueue.removeRepeatableByKey(job.key);
  }

  console.log('Scheduled jobs removed');
}
