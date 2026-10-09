import pkg from 'pg';
import { config } from '@/config/env.js';
import logger from '@/utils/logger.js';

const { Pool } = pkg;

let pool: pkg.Pool | null = null;

export function getPool(): pkg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.database.url,
      // Managed providers present certs Node doesn't trust by default; without
      // this the connection is rejected outright in production.
      ssl: config.database.ssl ? { rejectUnauthorized: false } : undefined,
      max: config.database.poolMax,
      idleTimeoutMillis: config.database.idleTimeoutMs,
      connectionTimeoutMillis: config.database.connectionTimeoutMs,
    });

    pool.on('error', (err) => {
      logger.error('Unexpected error on idle Postgres client', err);
    });
  }

  return pool;
}

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const result = await getPool().query(text, params);
  return result.rows as T[];
}

export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const results = await query<T>(text, params);
  return results.length > 0 ? results[0] : null;
}

export async function execute(text: string, params?: any[]): Promise<number> {
  const result = await getPool().query(text, params);
  return result.rowCount || 0;
}

/** Run `fn` inside a transaction on a single dedicated client. */
export async function withTransaction<T>(fn: (client: pkg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Cheap liveness probe for /health — distinguishes "up" from "up but blind". */
export async function isDatabaseHealthy(): Promise<boolean> {
  try {
    await getPool().query('SELECT 1');
    return true;
  } catch (error) {
    logger.error('Database health check failed', error);
    return false;
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
