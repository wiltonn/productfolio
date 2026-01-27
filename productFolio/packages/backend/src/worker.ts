/**
 * Standalone worker process for background jobs
 *
 * Run with: npm run worker
 */
import 'dotenv/config';
import { startWorkers, stopWorkers, closeQueues } from './jobs/index.js';
import { setupScheduledJobs, removeScheduledJobs } from './jobs/scheduler.js';
import { closeRedisConnection } from './lib/redis.js';

async function main() {
  console.log('ProductFolio Background Worker');
  console.log('==============================');

  // Start workers
  await startWorkers();

  // Set up scheduled jobs
  await setupScheduledJobs();

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}, shutting down gracefully...`);

    try {
      await removeScheduledJobs();
      await stopWorkers();
      await closeQueues();
      await closeRedisConnection();
      console.log('Shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Keep the process running
  console.log('\nWorker is running. Press Ctrl+C to stop.\n');
}

main().catch((error) => {
  console.error('Failed to start worker:', error);
  process.exit(1);
});
