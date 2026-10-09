import Redis from 'ioredis';
import { config } from '@/config/env.js';
import logger from '@/utils/logger.js';

let client: Redis | null = null;

/**
 * Shared Redis connection for the short-TTL price cache and the distributed
 * rate limiter. Bull manages its own connections separately.
 */
export function getRedis(): Redis {
  if (!client) {
    client = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      // Upstash and other hosted Redis require TLS; rediss:// URLs enable it.
      lazyConnect: false,
    });

    client.on('error', (err) => {
      logger.error('Redis connection error', err);
    });
  }

  return client;
}

export async function isRedisHealthy(): Promise<boolean> {
  try {
    const pong = await getRedis().ping();
    return pong === 'PONG';
  } catch (error) {
    logger.error('Redis health check failed', error);
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
