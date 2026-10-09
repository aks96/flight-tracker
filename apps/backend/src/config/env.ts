import dotenv from 'dotenv';

dotenv.config();

/**
 * Build a Postgres connection string from either DATABASE_URL or the discrete
 * DB_HOST/DB_PORT/... variables. docker-compose.prod.yml and most managed
 * hosts hand over the discrete form; only reading DATABASE_URL (the previous
 * behavior) meant production silently fell back to the localhost dev default,
 * failed to connect, and booted in degraded mode with a green health check.
 */
function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const host = process.env.DB_HOST;
  if (!host) return 'postgresql://postgres:password@localhost:5432/flight_tracker';

  const port = process.env.DB_PORT || '5432';
  const name = process.env.DB_NAME || 'flight_tracker';
  const user = encodeURIComponent(process.env.DB_USER || 'postgres');
  const password = encodeURIComponent(process.env.DB_PASSWORD || '');

  return `postgresql://${user}:${password}@${host}:${port}/${name}`;
}

/** Same idea for Redis: accept REDIS_URL, or assemble it from the parts. */
function resolveRedisUrl(): string {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;

  const host = process.env.REDIS_HOST;
  if (!host) return 'redis://localhost:6379';

  const port = process.env.REDIS_PORT || '6379';
  const password = process.env.REDIS_PASSWORD;
  const auth = password ? `:${encodeURIComponent(password)}@` : '';

  return `redis://${auth}${host}:${port}`;
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

export const config = {
  // Server
  nodeEnv,
  isProduction,
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || 'localhost',
  logLevel: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),

  // Runs the price-check scheduler inside this process. Defaults to true in
  // development for a one-command local stack, but false in production, where
  // the scheduler belongs in the dedicated worker process (src/worker.ts) —
  // otherwise every scaled API instance runs its own scheduler and they wipe
  // each other's repeatable jobs on boot.
  runSchedulerInProcess:
    process.env.RUN_SCHEDULER_IN_PROCESS === 'true' ||
    (process.env.RUN_SCHEDULER_IN_PROCESS === undefined && !isProduction),

  // Database
  database: {
    url: resolveDatabaseUrl(),
    // Managed Postgres (Timescale Cloud, Supabase, Render) terminates TLS with
    // certificates that aren't in Node's default trust store.
    ssl: process.env.DB_SSL === 'true' || (isProduction && process.env.DB_SSL !== 'false'),
    poolMax: parseInt(process.env.DB_POOL_MAX || '10', 10),
    idleTimeoutMs: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10),
    connectionTimeoutMs: parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '10000', 10),
  },

  // Redis
  redis: {
    url: resolveRedisUrl(),
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-key',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-key',
    expiresIn: process.env.JWT_EXPIRY || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRY || '7d',
  },

  // External APIs
  duffel: {
    apiKey: process.env.DUFFEL_API_KEY || '',
    apiUrl: process.env.DUFFEL_API_URL || 'https://api.duffel.com',
    // Duffel requires an explicit API version header on every request.
    apiVersion: process.env.DUFFEL_API_VERSION || 'v2',
    timeoutMs: parseInt(process.env.DUFFEL_TIMEOUT_MS || '30000', 10),
  },

  /**
   * Which price provider backs every search.
   *
   * 'mock' serves a large generated fare catalogue with prices that drift over
   * time, so the full detect -> alert -> re-arm loop can be exercised (and
   * price drops actually observed) without spending a single billed Duffel
   * search. Defaults to mock outside production precisely so day-to-day
   * development can't quietly burn the monthly budget.
   */
  priceProvider: (process.env.PRICE_PROVIDER || (isProduction ? 'duffel' : 'mock')) as
    | 'duffel'
    | 'mock',

  /**
   * Duffel bills $0.005 per "excess" search — searches beyond a 1500:1
   * search-to-book ratio. This app performs no bookings in v1, so effectively
   * every search is billable and the monthly count is a hard cost ceiling
   * rather than a soft guideline.
   */
  searchBudget: {
    // Total searches per calendar month across every caller.
    monthlyLimit: parseInt(process.env.SEARCH_BUDGET_MONTHLY || '2300', 10),
    // Share reserved for the scheduler. The remainder is available to
    // interactive callers (flight search, live tracker prices), so a busy
    // browsing session can never starve the polling that drives alerts.
    schedulerShare: parseFloat(process.env.SEARCH_BUDGET_SCHEDULER_SHARE || '0.65'),
    // Warn once consumption crosses this fraction of the limit.
    warnThreshold: parseFloat(process.env.SEARCH_BUDGET_WARN_THRESHOLD || '0.8'),
    // Cost per excess search, used only to report spend in the budget status.
    costPerSearchUsd: parseFloat(process.env.SEARCH_COST_USD || '0.005'),
  },

  expo: {
    accessToken: process.env.EXPO_ACCESS_TOKEN || '',
  },

  sendgrid: {
    apiKey: process.env.SENDGRID_API_KEY || '',
    fromEmail: process.env.SENDGRID_FROM_EMAIL || 'noreply@flighttracker.app',
  },

  // CORS
  cors: {
    origin: (process.env.CORS_ORIGIN || 'http://localhost:19000').split(','),
  },

  // Polling and notifications
  polling: {
    // How often the worker *wakes up* to look for trackers that are due. This
    // is no longer how often each tracker is checked — see `tiers` below.
    // Previously every tracker was checked on this interval, which at the old
    // 5-minute default cost ~8,600 searches per route per month, roughly four
    // times the entire monthly budget for a single route.
    tickIntervalMs: parseInt(process.env.PRICE_TICK_INTERVAL_MS || '900000', 10),
    maxConcurrent: parseInt(process.env.MAX_CONCURRENT_PRICE_FETCHES || '5', 10),

    /**
     * Per-tracker check interval, chosen by how close departure is. A fare six
     * months out does not move meaningfully hour to hour; one three days out
     * does. Ordered nearest-first; the first matching tier wins.
     */
    tiers: [
      { withinDays: 7, intervalMs: 3 * 60 * 60 * 1000 },   // < 1 week  -> every 3h
      { withinDays: 21, intervalMs: 6 * 60 * 60 * 1000 },  // < 3 weeks -> every 6h
      { withinDays: 60, intervalMs: 12 * 60 * 60 * 1000 }, // < 2 months-> every 12h
      { withinDays: Infinity, intervalMs: 24 * 60 * 60 * 1000 }, // beyond -> daily
    ] as Array<{ withinDays: number; intervalMs: number }>,

    // How long a cheapest-fare lookup for an identical route/date/cabin is
    // reused. Sized to the tightest polling tier so a cached result is still
    // fresh when the next tick arrives, and so many users tracking one route
    // cost one search rather than N.
    quoteCacheTtlSec: parseInt(process.env.QUOTE_CACHE_TTL_SEC || '3600', 10),
    // Full search-result listings are browsed far more often than they change,
    // so they cache longer still.
    searchCacheTtlSec: parseInt(process.env.SEARCH_CACHE_TTL_SEC || '1800', 10),
  },

  notification: {
    retryAttempts: parseInt(process.env.NOTIFICATION_RETRY_ATTEMPTS || '3', 10),
    retryDelayMs: parseInt(process.env.NOTIFICATION_RETRY_DELAY_MS || '1000', 10),
    // Minimum gap between two alerts for the same tracker, so a tracker whose
    // delivery keeps failing can't re-alert on every scheduler tick.
    cooldownMs: parseInt(process.env.ALERT_COOLDOWN_MS || '3600000', 10),
  },

  rateLimit: {
    authWindowMs: parseInt(process.env.AUTH_RATE_WINDOW_MS || '900000', 10),
    authMax: parseInt(process.env.AUTH_RATE_MAX || '10', 10),
    apiWindowMs: parseInt(process.env.API_RATE_WINDOW_MS || '60000', 10),
    apiMax: parseInt(process.env.API_RATE_MAX || '100', 10),
    quoteWindowMs: parseInt(process.env.QUOTE_RATE_WINDOW_MS || '60000', 10),
    quoteMax: parseInt(process.env.QUOTE_RATE_MAX || '20', 10),
  },

  /**
   * Supported region. The product covers India and nearby Asian destinations;
   * routes outside it are rejected before any search is attempted, which both
   * scopes the product and protects the monthly search budget.
   */
  region: {
    allowedCountries: (
      process.env.ALLOWED_COUNTRIES ||
      'IN,TH,JP,CN,SG,MY,ID,VN,LK,NP,MV,BT,KH,PH,KR,HK,TW,AE'
    )
      .split(',')
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean),
  },

  appName: process.env.APP_NAME || 'Flight Tracker',
  // Deep link base used in password-reset emails.
  appScheme: process.env.APP_SCHEME || 'flighttracker',
};

const INSECURE_JWT_DEFAULTS = ['dev-secret-key', 'dev-refresh-secret-key'];

/**
 * Fail fast on boot rather than serving traffic with a forgeable token secret
 * or an unreachable database. Called from both the API and worker entrypoints.
 */
export function validateConfig(): void {
  const errors: string[] = [];

  if (!config.isProduction) {
    if (INSECURE_JWT_DEFAULTS.includes(config.jwt.secret)) {
      console.warn('⚠️  JWT_SECRET is unset — using an insecure development default.');
    }
    return;
  }

  if (!process.env.JWT_SECRET || INSECURE_JWT_DEFAULTS.includes(config.jwt.secret)) {
    errors.push('JWT_SECRET must be set to a strong random value in production');
  }
  if (!process.env.JWT_REFRESH_SECRET || INSECURE_JWT_DEFAULTS.includes(config.jwt.refreshSecret)) {
    errors.push('JWT_REFRESH_SECRET must be set to a strong random value in production');
  }
  if (config.jwt.secret === config.jwt.refreshSecret) {
    errors.push('JWT_SECRET and JWT_REFRESH_SECRET must differ');
  }
  if (config.jwt.secret.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters');
  }
  if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
    errors.push('DATABASE_URL (or DB_HOST/DB_NAME/DB_USER/DB_PASSWORD) must be set');
  }
  if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
    errors.push('REDIS_URL (or REDIS_HOST) must be set — the price-check queue needs it');
  }
  if (!config.duffel.apiKey) {
    errors.push('DUFFEL_API_KEY must be set — price checks cannot run without it');
  }
  if (config.cors.origin.some((o) => o.includes('localhost') || o === '*')) {
    errors.push(`CORS_ORIGIN must not allow localhost or * in production (got: ${config.cors.origin.join(',')})`);
  }

  if (errors.length > 0) {
    throw new Error(`Invalid production configuration:\n  - ${errors.join('\n  - ')}`);
  }
}

export default config;
