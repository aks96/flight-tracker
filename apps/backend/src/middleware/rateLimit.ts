import rateLimit, { Options } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { Request } from 'express';
import { config } from '@/config/env.js';
import { getRedis } from '@/utils/redis.js';
import logger from '@/utils/logger.js';

/**
 * Rate limiting lives in the app, not only in nginx.conf — the nginx limits
 * only apply if you actually front the API with that container, which you
 * don't on Render/Fly/Cloud Run. Backed by Redis so limits hold across all
 * instances instead of resetting per process on every deploy.
 */
function buildStore(prefix: string): Options['store'] | undefined {
  try {
    const redis = getRedis();
    return new RedisStore({
      prefix,
      sendCommand: (...args: string[]) => redis.call(...(args as [string, ...string[]])) as any,
    });
  } catch (error) {
    // Falling back to per-process memory is worse than Redis but far better
    // than serving auth endpoints with no limit at all.
    logger.warn('Redis unavailable for rate limiting — falling back to in-memory limits', error);
    return undefined;
  }
}

function userOrIpKey(req: Request): string {
  return req.user?.id || req.ip || 'unknown';
}

/** Tight limit on credential endpoints — the brute-force surface. */
export const authLimiter = rateLimit({
  windowMs: config.rateLimit.authWindowMs,
  limit: config.rateLimit.authMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts — try again later' },
  store: buildStore('rl:auth:'),
});

/** Broad limit across the authenticated API. */
export const apiLimiter = rateLimit({
  windowMs: config.rateLimit.apiWindowMs,
  limit: config.rateLimit.apiMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { error: 'Too many requests — slow down' },
  store: buildStore('rl:api:'),
});

/**
 * Quote lookups are the one route where client-side typing directly triggers
 * billed Duffel searches, so they get their own per-user cap on top of the
 * general API limit.
 */
export const quoteLimiter = rateLimit({
  windowMs: config.rateLimit.quoteWindowMs,
  limit: config.rateLimit.quoteMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { error: 'Too many price lookups — wait a moment and try again' },
  store: buildStore('rl:quote:'),
});
