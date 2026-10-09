import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import path from 'path';
import { getPool, closePool } from '../connection.js';
import logger from '../../utils/logger.js';

/**
 * Minimal forward-only migration runner.
 *
 * `db/setup.ts` is idempotent CREATE-TABLE-IF-NOT-EXISTS and only ever gets
 * the schema to its *initial* shape — there was no way to alter a column on a
 * database that already had data. Anything that changes existing structure
 * belongs here: drop a `NNN_description.sql` file in db/migrations/sql/ and it
 * runs exactly once, recorded in schema_migrations.
 *
 *   npm run db:migrate
 */

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sql');

async function ensureMigrationsTable(): Promise<void> {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function appliedMigrations(): Promise<Set<string>> {
  const result = await getPool().query<{ name: string }>('SELECT name FROM schema_migrations');
  return new Set(result.rows.map((row) => row.name));
}

async function pendingFiles(): Promise<string[]> {
  let files: string[];
  try {
    files = await fs.readdir(MIGRATIONS_DIR);
  } catch {
    logger.info('No migrations directory yet — nothing to run');
    return [];
  }

  const applied = await appliedMigrations();
  return files
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .filter((file) => !applied.has(file));
}

export async function runMigrations(): Promise<number> {
  await ensureMigrationsTable();
  const pending = await pendingFiles();

  if (pending.length === 0) {
    logger.info('Database is up to date — no pending migrations');
    return 0;
  }

  for (const file of pending) {
    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await getPool().connect();

    // Each migration runs in its own transaction, so a failure leaves the
    // database on the last known-good migration rather than half-applied.
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      logger.info(`Applied migration ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Migration ${file} failed — rolled back`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  return pending.length;
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  runMigrations()
    .then(async (count) => {
      logger.info(`Migrations complete (${count} applied)`);
      await closePool();
      process.exit(0);
    })
    .catch(async (error) => {
      logger.error('Migration run failed', error);
      await closePool();
      process.exit(1);
    });
}
