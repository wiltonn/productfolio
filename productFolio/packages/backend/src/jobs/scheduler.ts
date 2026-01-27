import { getViewRefreshQueue } from './queue.js';

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

  console.log('Scheduled jobs configured:');
  console.log('- View refresh: every 15 minutes');
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

  console.log('Scheduled jobs removed');
}
