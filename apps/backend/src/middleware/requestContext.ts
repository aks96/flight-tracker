import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import logger from '@/utils/logger.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

/**
 * Tags every request with an id (honoring an upstream X-Request-Id) and logs
 * one structured line per completed request. Replaces morgan's 'combined'
 * text format, which couldn't be correlated with anything downstream.
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const entry = {
      requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      durationMs: Math.round(durationMs),
      userId: req.user?.id,
    };

    if (res.statusCode >= 500) logger.error('request failed', entry);
    else if (res.statusCode >= 400) logger.warn('request rejected', entry);
    else logger.info('request', entry);
  });

  next();
}
