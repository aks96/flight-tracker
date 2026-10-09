import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import { Pool } from 'pg';
import { config } from '@/config/env.js';
import { errorHandler, notFoundHandler } from '@/middleware/auth.js';
import { requestContext } from '@/middleware/requestContext.js';
import { apiLimiter } from '@/middleware/rateLimit.js';
import { isDatabaseHealthy } from '@/db/connection.js';
import { isRedisHealthy } from '@/utils/redis.js';
import authRoutes from '@/routes/auth.routes.js';
import trackerRoutes from '@/routes/tracker.routes.js';
import flightRoutes from '@/routes/flight.routes.js';
import { createDeviceRoutes } from '@/routes/device.routes.js';
import { createPredictionRoutes } from '@/routes/prediction.routes.js';

export function createApp(db: Pool): express.Application {
  const app = express();

  // Behind nginx/Render's proxy, req.ip is the proxy's address unless this is
  // set — which would make every per-IP rate limit a single shared bucket.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin: config.cors.origin,
      credentials: true,
    })
  );
  app.use(compression());
  app.use(requestContext);

  // 10mb was far more than any endpoint here accepts and made trivial memory
  // pressure available to unauthenticated callers.
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ limit: '100kb', extended: true }));

  // Liveness: is the process up? Used by container orchestrators to decide
  // whether to restart, so it must not depend on external services.
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Readiness: can this instance actually serve traffic? The old /health
  // returned 200 even when the database was unreachable and the app was
  // running with no persistence at all.
  app.get('/health/ready', async (_req, res) => {
    const [database, redis] = await Promise.all([isDatabaseHealthy(), isRedisHealthy()]);
    const ready = database && redis;

    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'degraded',
      checks: { database, redis },
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api', apiLimiter);
  app.use('/api/auth', authRoutes);
  app.use('/api/trackers', trackerRoutes);
  app.use('/api/flights', flightRoutes);
  // These are mounted unconditionally now. Previously they were skipped
  // whenever the pool was missing, so a misconfigured deploy served a 404 for
  // device registration rather than failing loudly.
  app.use('/api/devices', createDeviceRoutes(db));
  app.use('/api/predictions', createPredictionRoutes(db));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
