import { config, validateConfig } from '@/config/env.js';
import { getPool, closePool } from '@/db/connection.js';
import { closeRedis } from '@/utils/redis.js';
import { SchedulerService } from '@/services/scheduler.service.js';
import logger from '@/utils/logger.js';

/**
 * Dedicated price-check worker.
 *
 * The scheduler used to run inside the API process, which meant every scaled
 * API instance ran its own copy: they raced on the same repeatable job and
 * cleared each other's queue on boot. Run exactly one of these
 * (`npm run worker`) alongside any number of API instances.
 */
async function startWorker(): Promise<void> {
  validateConfig();

  logger.info(`Starting Flight Tracker worker (${config.nodeEnv})`);

  const pool = getPool();
  await pool.query('SELECT NOW()');
  logger.info('Database connected');

  const scheduler = new SchedulerService(pool);
  await scheduler.startScheduler();
  logger.info('Worker running — price checks scheduled');

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal} — shutting down worker`);
    // Bull's close() waits for the in-flight job to finish, so a deploy
    // doesn't abandon a half-processed price check.
    await scheduler.stopScheduler();
    await closeRedis();
    await closePool();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection in worker', reason);
  });
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception in worker — exiting', error);
    process.exit(1);
  });
}

startWorker().catch((error) => {
  logger.error('Failed to start worker', error);
  process.exit(1);
});
