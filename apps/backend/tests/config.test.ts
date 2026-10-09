import { jest } from '@jest/globals';

// The real dotenv would load the developer's apps/backend/.env into these
// cases and make them pass or fail depending on an untracked local file.
jest.unstable_mockModule('dotenv', () => ({
  default: { config: () => ({ parsed: {} }) },
  config: () => ({ parsed: {} }),
}));

/**
 * validateConfig is the guard that stops a production deploy from booting with
 * a forgeable JWT secret or no database — the failure mode that previously let
 * a misconfigured deploy come up "healthy" and serve traffic.
 */
const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  // validateConfig reads process.env at call time, so the environment has to
  // stay in place for the duration of each case and be restored after it.
  process.env = { ...ORIGINAL_ENV };
});

async function loadConfig(env: Record<string, string | undefined>) {
  jest.resetModules();
  const PREFIXES = ['JWT_', 'DB_', 'REDIS_', 'DUFFEL_'];
  const EXACT = ['DATABASE_URL', 'TIMESCALEDB_URL', 'CORS_ORIGIN', 'NODE_ENV', 'RUN_SCHEDULER_IN_PROCESS'];
  Object.keys(process.env).forEach((key) => {
    if (PREFIXES.some((prefix) => key.startsWith(prefix)) || EXACT.includes(key)) {
      delete process.env[key];
    }
  });
  Object.entries(env).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });

  return import('../src/config/env.js');
}

const VALID_PROD_ENV = {
  NODE_ENV: 'production',
  JWT_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
  DATABASE_URL: 'postgresql://user:pass@db.example.com:5432/flight_tracker',
  REDIS_URL: 'rediss://cache.example.com:6379',
  DUFFEL_API_KEY: 'duffel_test_key',
  CORS_ORIGIN: 'https://api.watchmyfares.com',
};

describe('validateConfig', () => {
  it('accepts a complete production configuration', async () => {
    const { validateConfig } = await loadConfig(VALID_PROD_ENV);
    expect(() => validateConfig()).not.toThrow();
  });

  it('rejects the insecure default JWT secret in production', async () => {
    const { validateConfig } = await loadConfig({ ...VALID_PROD_ENV, JWT_SECRET: undefined });
    expect(() => validateConfig()).toThrow(/JWT_SECRET/);
  });

  it('rejects a JWT secret shorter than 32 characters', async () => {
    const { validateConfig } = await loadConfig({ ...VALID_PROD_ENV, JWT_SECRET: 'short-secret' });
    expect(() => validateConfig()).toThrow(/at least 32 characters/);
  });

  it('rejects identical access and refresh secrets', async () => {
    const secret = 'c'.repeat(40);
    const { validateConfig } = await loadConfig({
      ...VALID_PROD_ENV,
      JWT_SECRET: secret,
      JWT_REFRESH_SECRET: secret,
    });
    expect(() => validateConfig()).toThrow(/must differ/);
  });

  it('rejects a missing Duffel key — price checks cannot run without it', async () => {
    const { validateConfig } = await loadConfig({ ...VALID_PROD_ENV, DUFFEL_API_KEY: undefined });
    expect(() => validateConfig()).toThrow(/DUFFEL_API_KEY/);
  });

  it('rejects a localhost CORS origin in production', async () => {
    const { validateConfig } = await loadConfig({ ...VALID_PROD_ENV, CORS_ORIGIN: 'http://localhost:19000' });
    expect(() => validateConfig()).toThrow(/CORS_ORIGIN/);
  });

  it('does not throw in development, even with defaults', async () => {
    const { validateConfig } = await loadConfig({ NODE_ENV: 'development' });
    expect(() => validateConfig()).not.toThrow();
  });
});

describe('connection string assembly', () => {
  it('builds DATABASE_URL from discrete DB_* vars when the URL is absent', async () => {
    // This is exactly the docker-compose.prod.yml shape that used to be
    // ignored, silently falling back to localhost.
    const { config } = await loadConfig({
      NODE_ENV: 'production',
      DB_HOST: 'postgres',
      DB_PORT: '5432',
      DB_NAME: 'flight_tracker',
      DB_USER: 'app',
      DB_PASSWORD: 'p@ss word',
    });

    expect(config.database.url).toBe('postgresql://app:p%40ss%20word@postgres:5432/flight_tracker');
  });

  it('builds REDIS_URL from discrete REDIS_* vars', async () => {
    const { config } = await loadConfig({
      REDIS_HOST: 'redis',
      REDIS_PORT: '6380',
      REDIS_PASSWORD: 'secret',
    });

    expect(config.redis.url).toBe('redis://:secret@redis:6380');
  });

  it('prefers an explicit REDIS_URL over the parts', async () => {
    const { config } = await loadConfig({
      REDIS_URL: 'rediss://user:tok@upstash.io:6379',
      REDIS_HOST: 'ignored',
    });

    expect(config.redis.url).toBe('rediss://user:tok@upstash.io:6379');
  });

  it('runs the scheduler in-process in development but not in production', async () => {
    const dev = await loadConfig({ NODE_ENV: 'development' });
    expect(dev.config.runSchedulerInProcess).toBe(true);

    const prod = await loadConfig(VALID_PROD_ENV);
    expect(prod.config.runSchedulerInProcess).toBe(false);
  });
});
