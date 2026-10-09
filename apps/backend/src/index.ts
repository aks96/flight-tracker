import { createApp } from '@/app.js';
import { config, validateConfig } from '@/config/env.js';
import { setupDatabase } from '@/db/setup.js';
import { getPool, closePool } from '@/db/connection.js';
import { closeRedis } from '@/utils/redis.js';
import { SchedulerService } from '@/services/scheduler.service.js';
import logger from '@/utils/logger.js';

async function startServer(): Promise<void> {
  // Refuse to boot on an unsafe or incomplete configuration. Previously a
  // missing JWT_SECRET quietly fell back to 'dev-secret-key' and a missing
  // DATABASE_URL quietly fell back to localhost, so a broken production deploy
  // came up "healthy" and served forgeable tokens against no database.
  validateConfig();

  logger.info(`Starting Flight Tracker API (${config.nodeEnv})`);

  await setupDatabase();
  const pool = getPool();
  await pool.query('SELECT NOW()');
  logger.info('Database connected');

  let scheduler: SchedulerService | null = null;

  // In production the scheduler runs as its own process (src/worker.ts) so
  // that scaling the API to N instances doesn't start N schedulers competing
  // over the same repeatable job.
  if (config.runSchedulerInProcess) {
    scheduler = new SchedulerService(pool);
    await scheduler.startScheduler();
    logger.info('In-process scheduler running (development mode)');
  } else {
    logger.info('Scheduler not started in this process — run the worker separately');
  }

  const app = createApp(pool);
  const server = app.listen(config.port, config.host, () => {
    logger.info(`API listening on http://${config.host}:${config.port}`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal} — shutting down`);

    // Stop accepting new connections, then drain.
    server.close();

    if (scheduler) await scheduler.stopScheduler();
    await closeRedis();
    await closePool();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // An unhandled rejection leaves the process in an unknown state; log it and
  // let the orchestrator restart rather than limping along.
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', reason);
  });
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception — exiting', error);
    process.exit(1);
  });
}

startServer().catch((error) => {
  logger.error('Failed to start server', error);
  process.exit(1);
});
