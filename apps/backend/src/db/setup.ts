import { fileURLToPath } from 'url';
import { execute, closePool } from './connection.js';
import logger from '../utils/logger.js';

export async function setupDatabase(): Promise<void> {
  logger.info('Setting up database schema...');

  // Users table
  await execute(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      phone TEXT,
      preferred_currency TEXT DEFAULT 'INR',
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);

  // Emails are normalized to lowercase before insert; enforce that at the
  // database level too so 'A@b.com' and 'a@b.com' can never both exist.
  await execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email));
  `);

  // Devices table
  // Note: push_token is UNIQUE and columns are named is_active/last_ping to
  // match what device.service.ts actually queries (registerDevice's
  // ON CONFLICT (push_token), getDevicesByUserId/getActiveDevices filtering
  // on is_active, updateLastPing writing last_ping) — this previously drifted
  // from the service and would have failed at query time.
  await execute(`
    CREATE TABLE IF NOT EXISTS devices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
      push_token TEXT UNIQUE NOT NULL,
      platform TEXT NOT NULL,
      is_active BOOLEAN DEFAULT true,
      last_ping TIMESTAMPTZ DEFAULT now(),
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
    CREATE INDEX IF NOT EXISTS idx_devices_push_token ON devices(push_token);
    CREATE INDEX IF NOT EXISTS idx_devices_is_active ON devices(is_active);
  `);

  // Trackers table
  await execute(`
    CREATE TABLE IF NOT EXISTS trackers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
      trip_type TEXT NOT NULL DEFAULT 'one_way',
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      depart_date_start DATE NOT NULL,
      depart_date_end DATE NOT NULL,
      return_date_start DATE,
      return_date_end DATE,
      cabin_class TEXT DEFAULT 'economy',
      adults INT NOT NULL DEFAULT 1,
      children INT NOT NULL DEFAULT 0,
      infants INT NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'INR',
      baseline_price NUMERIC NOT NULL,
      price_drop_amount NUMERIC NOT NULL,
      status TEXT DEFAULT 'active',
      -- Enforces the per-tracker alert cooldown, so a tracker whose delivery
      -- keeps failing can't re-fire an alert on every scheduler tick.
      last_alert_at TIMESTAMPTZ,
      -- Drives tiered polling: the scheduler picks up only trackers that are
      -- due, rather than every active tracker on every tick.
      next_check_at TIMESTAMPTZ,
      last_checked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    ALTER TABLE trackers ADD COLUMN IF NOT EXISTS last_alert_at TIMESTAMPTZ;
    ALTER TABLE trackers ADD COLUMN IF NOT EXISTS next_check_at TIMESTAMPTZ;
    ALTER TABLE trackers ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS idx_trackers_next_check_at ON trackers(next_check_at) WHERE status = 'active';
    CREATE INDEX IF NOT EXISTS idx_trackers_user_id ON trackers(user_id);
    CREATE INDEX IF NOT EXISTS idx_trackers_status ON trackers(status);
    CREATE INDEX IF NOT EXISTS idx_trackers_route ON trackers(origin, destination);
  `);

  // Alerts table
  await execute(`
    CREATE TABLE IF NOT EXISTS alerts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tracker_id UUID REFERENCES trackers(id) ON DELETE CASCADE NOT NULL,
      price_at_alert NUMERIC NOT NULL,
      baseline_before NUMERIC NOT NULL,
      channel TEXT,
      delivery_status TEXT DEFAULT 'sent',
      detected_at TIMESTAMPTZ DEFAULT now(),
      delivered_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_alerts_tracker_id ON alerts(tracker_id);
    CREATE INDEX IF NOT EXISTS idx_alerts_detected_at ON alerts(detected_at);
  `);

  // Refresh tokens — stored as SHA-256 digests so a database leak doesn't
  // hand over usable sessions. Persisting them is what makes logout, rotation
  // and "revoke everything" possible at all; the previous stateless design
  // could not invalidate a refresh token before its 7-day expiry.
  await execute(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id UUID PRIMARY KEY,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      replaced_by UUID,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
  `);

  // Password reset tokens (single-use, 1 hour TTL, digest-only).
  await execute(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id UUID PRIMARY KEY,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_password_reset_user_id ON password_reset_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_password_reset_token_hash ON password_reset_tokens(token_hash);
  `);

  // Create TimescaleDB hypertable for price history
  await execute(`
    CREATE TABLE IF NOT EXISTS price_history (
      time TIMESTAMPTZ NOT NULL,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      depart_date DATE NOT NULL,
      return_date DATE,
      cabin_class TEXT NOT NULL,
      price NUMERIC NOT NULL,
      currency TEXT NOT NULL,
      source TEXT DEFAULT 'duffel'
    );
  `);

  // Convert to hypertable if TimescaleDB is available. On a plain Postgres
  // instance (no TimescaleDB extension installed — e.g. local dev without
  // the timescale/timescaledb Docker image, or a managed Postgres not yet
  // upgraded to Timescale Cloud per the deployment plan) this used to throw
  // and crash the whole server on boot, since `create_hypertable` doesn't
  // exist at all in that case (a different failure than "already a
  // hypertable", which the old check for "already exists" didn't cover).
  // Degrade gracefully instead: price_history still works as a normal table,
  // just without hypertable partitioning/compression.
  try {
    await execute(`CREATE EXTENSION IF NOT EXISTS timescaledb;`);
    await execute(`
      SELECT create_hypertable('price_history', 'time', if_not_exists => TRUE);
    `);
    logger.info('price_history is a TimescaleDB hypertable');
  } catch (error: any) {
    logger.warn(
      `TimescaleDB not available — price_history will run as a regular Postgres table (${error.message})`
    );
  }

  // Create indexes on price_history
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_price_history_origin_dest 
    ON price_history(origin, destination, depart_date, cabin_class DESC);
  `);

  logger.info('Database schema setup complete');
}

export async function dropDatabase(): Promise<void> {
  logger.info('Dropping all tables...');

  await execute('DROP TABLE IF EXISTS refresh_tokens CASCADE');
  await execute('DROP TABLE IF EXISTS password_reset_tokens CASCADE');
  await execute('DROP TABLE IF EXISTS alerts CASCADE');
  await execute('DROP TABLE IF EXISTS trackers CASCADE');
  await execute('DROP TABLE IF EXISTS devices CASCADE');
  await execute('DROP TABLE IF EXISTS users CASCADE');
  await execute('DROP TABLE IF EXISTS price_history CASCADE');

  logger.info('Database cleaned');
}

// `npm run db:setup` invokes this file directly via tsx (`tsx src/db/setup.ts`).
// Without this entry point the script silently did nothing — it only
// defined setupDatabase()/dropDatabase() but never called either, so
// `npm run db:setup` printed no output and created no tables.
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const shouldDrop = process.argv.includes('--drop');

  (async () => {
    try {
      if (shouldDrop) {
        await dropDatabase();
      }
      await setupDatabase();
      await closePool();
      process.exit(0);
    } catch (error) {
      logger.error('Database setup failed', error);
      process.exit(1);
    }
  })();
}
