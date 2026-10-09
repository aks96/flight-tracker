# Production Deployment Guide

## Prerequisites

- Node.js 20.19.4+ (backend)
- Docker & Docker Compose
- PostgreSQL 15+ (or Timescale Cloud)
- Redis (or Upstash)
- Expo EAS account (for mobile)
- Duffel API key
- iOS Developer Account + Apple ID (for App Store)
- Google Play Developer Account (for Google Play)

## Backend Deployment

### Two processes, not one

The backend deploys as **two services from the same image**:

| Service | Command | Replicas |
|---|---|---|
| API | `npm start --workspace apps/backend` | as many as you need |
| Worker | `npm run worker --workspace apps/backend` | **exactly one** |

The worker owns the price-check scheduler. Running it inside the API instead
means every API replica starts its own scheduler, and they race over the same
repeatable job and clear each other's queue on boot. `RUN_SCHEDULER_IN_PROCESS`
defaults to `false` in production and must stay that way on API instances.

### Option 1: Managed platform (Render, Fly, Railway)

1. **Provision Postgres with TimescaleDB and Redis**

   Timescale Cloud and Upstash are the paths of least resistance; both hand you
   a connection URL. Upstash URLs use the `rediss://` scheme (TLS) — supported.

2. **Generate secrets**

   ```bash
   openssl rand -base64 48   # JWT_SECRET
   openssl rand -base64 48   # JWT_REFRESH_SECRET  (must differ)
   ```

   The API refuses to start in production if either is missing, shorter than 32
   characters, identical to the other, or left at the development default.

3. **Set environment variables**

   Copy [`.env.production.example`](.env.production.example) — it lists every
   variable the code actually reads, with the required ones marked. Set the
   same variables on both the API and the worker service.

   The one difference:

   ```
   RUN_SCHEDULER_IN_PROCESS=false    # API service
   ```

   (The worker ignores this — it always runs the scheduler.)

4. **Apply the schema**

   ```bash
   npm run db:setup --workspace apps/backend     # initial schema, idempotent
   npm run db:migrate --workspace apps/backend   # forward-only migrations
   ```

   `db:setup` creates the schema if it isn't there. Anything that *changes* an
   existing schema goes in `apps/backend/src/db/migrations/sql/` as a numbered
   `.sql` file and is applied once by `db:migrate`, recorded in
   `schema_migrations`.

   If TimescaleDB isn't available, `price_history` degrades to a regular
   Postgres table and setup continues — it does not fail the boot.

5. **Configure health checks**

   | Probe | Path | Meaning |
   |---|---|---|
   | Liveness / restart | `/health` | Process is up. No external dependencies, so a Redis blip can't trigger a restart loop. |
   | Readiness / load balancer | `/health/ready` | Postgres **and** Redis reachable. Returns 503 otherwise. |

   Point the load balancer at `/health/ready`. Pointing it at `/health` is how
   an instance with no working database stays in rotation.

6. **Deploy**

   Pushes to `main` trigger the Render deploy hook from the backend workflow,
   which now fails the job if the deploy request is rejected. The `deploy` job
   is gated on the `production` GitHub environment, so you can require approval.

### Option 2: Self-hosted with Docker Compose

```bash
cp .env.production.example .env
# fill in the required values, then:
docker compose -f docker-compose.prod.yml up -d
```

The stack starts Postgres, Redis, the API, one worker, and nginx. Compose fails
fast with a named error if `JWT_SECRET`, `DB_PASSWORD`, `REDIS_PASSWORD`,
`DUFFEL_API_KEY` or `CORS_ORIGIN` is unset, rather than starting with insecure
defaults.

Notes on the production compose file:

- Postgres and Redis are on the internal network only; neither publishes a
  host port.
- The API image is the artifact — there is no source bind-mount shadowing the
  built `dist/`.
- TLS is enabled in `nginx.conf`. Put `cert.pem` and `key.pem` in `./certs`
  before the first start; port 80 redirects to 443 and serves the ACME
  challenge path for certbot renewals.

## Mobile Deployment

### iOS (App Store)

1. **Prerequisites**
   - Apple Developer Account ($99/year)
   - Mac with Xcode installed
   - EAS CLI: `npm install -g eas-cli`

2. **Configure EAS**
   ```bash
   cd apps/mobile
   eas build:configure
   ```

3. **Create App Store Connect app**
   - Visit appstoreconnect.apple.com
   - Create new app
   - Set bundle ID: `com.flighttracker.mobile`

4. **Create provisioning profile**
   - Use Xcode or Apple Developer portal
   - Download certificate and provisioning profile

5. **Build for iOS**
   ```bash
   eas build --platform ios --auto-submit
   ```

6. **Submit to App Store**
   ```bash
   eas submit --platform ios
   ```

### Android (Google Play)

1. **Prerequisites**
   - Google Play Developer Account ($25 one-time)
   - Android keystore setup
   - EAS CLI

2. **Create Google Play app**
   - Visit play.google.com/console
   - Create new app
   - Set package name: `com.flighttracker.mobile`

3. **Generate Android keystore**
   ```bash
   cd apps/mobile
   eas credentials
   ```

4. **Build for Android**
   ```bash
   eas build --platform android --auto-submit
   ```

5. **Submit to Play Store**
   ```bash
   eas submit --platform android
   ```

## Database Schema Setup

The database is automatically initialized on first backend startup. For manual setup:

```sql
-- Create users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create devices table
CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  push_token VARCHAR(255) UNIQUE NOT NULL,
  platform VARCHAR(50) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_ping TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create trackers table
CREATE TABLE trackers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trip_type VARCHAR(50) NOT NULL,
  origin VARCHAR(10) NOT NULL,
  destination VARCHAR(10) NOT NULL,
  depart_date_start DATE NOT NULL,
  depart_date_end DATE NOT NULL,
  return_date_start DATE,
  return_date_end DATE,
  cabin_class VARCHAR(50),
  adults INTEGER DEFAULT 1,
  children INTEGER DEFAULT 0,
  infants INTEGER DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'INR',
  baseline_price DECIMAL(10, 2),
  price_drop_amount DECIMAL(10, 2),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create price history hypertable (TimescaleDB)
CREATE TABLE price_history (
  time TIMESTAMP NOT NULL,
  tracker_id UUID NOT NULL REFERENCES trackers(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3),
  airline VARCHAR(255),
  duration VARCHAR(50),
  first_departure TIMESTAMP,
  source VARCHAR(50)
);

SELECT create_hypertable('price_history', 'time', if_not_exists => TRUE);
CREATE INDEX ON price_history (tracker_id, time DESC);
```

## Monitoring & Logging

### Backend Logging
- Structured JSON via pino, written to stdout for the platform's log collector
  to pick up (no log files to rotate on disk).
- Every request carries an `X-Request-Id` — generated if the caller didn't send
  one, echoed back on the response, and attached to every log line for that
  request. A 500 response returns the id to the client, so a user report can be
  traced to an exact log entry.
- Authorization headers, passwords, tokens and push tokens are redacted at the
  logger, so they can't reach the log store.
- `LOG_LEVEL` controls verbosity (`info` in production).
- Error tracking (Sentry or equivalent) is **not yet wired up** — this remains
  an open item.

### Database Monitoring
- Monitor Timescale Cloud dashboard
- Check query performance
- Monitor backup status

### Redis Monitoring
- Monitor Upstash dashboard
- Check queue depths
- Monitor memory usage

## Backup Strategy

### Database Backups
```bash
# Daily automated backups with Timescale Cloud
# Or manually:
pg_dump postgresql://user:password@host:5432/flight_tracker > backup.sql
```

### Application Configuration Backups
- Store .env files in secure vault (AWS Secrets Manager, etc)
- Never commit to git

## Scaling Considerations

1. **Horizontal Scaling**
   - Use a load balancer (AWS ALB, nginx) pointed at `/health/ready`
   - Run multiple **API** instances freely — they are stateless
   - Keep the **worker** at exactly one instance; a second scheduler duplicates
     every price check and doubles the Duffel bill
   - Use connection pooling (PgBouncer); `DB_POOL_MAX` caps each instance's pool

2. **Vertical Scaling**
   - Upgrade machine specs
   - Increase database resources

3. **Caching Layer**
   - Redis backs the rate limiter, so limits are shared across instances
   - Redis caches route quotes for `QUOTE_CACHE_TTL_SEC`, collapsing identical
     route searches from many users into one billed Duffel call

4. **Database Optimization**
   - Index on tracker_id, user_id
   - Compress old price history
   - Archive completed trackers

## Security Checklist

Enforced by the code — nothing to remember:

- [x] Config validated on boot; production refuses to start with a weak or
      reused JWT secret, a missing Duffel key, or a localhost/`*` CORS origin
- [x] Rate limiting on credential endpoints, the API at large, and quote
      lookups — Redis-backed, so limits survive deploys and span instances
- [x] Refresh tokens stored as digests, rotated on every use, and revocable;
      replaying a revoked token revokes the whole session family
- [x] Login responses identical for unknown email and wrong password
- [x] Password reset tokens single-use, digest-only, 1 hour TTL
- [x] bcrypt cost factor 12; 8 character minimum
- [x] Internal errors never leak their message or stack to the client
- [x] Request bodies capped at 100kb
- [x] Container runs as a non-root user; runtime image has no build toolchain,
      devDependencies or source
- [x] TLS terminated at nginx with HSTS, TLS 1.2/1.3 only

Still operational, and on you:

- [ ] Rotate JWT secrets on a schedule (rotation invalidates live sessions)
- [ ] Enable database encryption at rest
- [ ] Put the database and Redis on a private network / VPC
- [ ] Firewall rules
- [ ] DDoS protection (Cloudflare)
- [ ] Wire up error tracking (Sentry)
- [ ] Keep dependencies updated; `npm audit` currently reports open advisories
- [ ] Regular security audits

## Continuous Deployment

### GitHub Actions CI/CD

Backend CI/CD pipeline:
- Lint code (ESLint)
- Run tests
- Build Docker image
- Push to registry
- Deploy to Render/AWS

Mobile CI/CD pipeline:
- Run tests
- Build app (EAS Build)
- Auto-submit to stores (EAS Submit)

See `.github/workflows/` for configurations.

## Performance Optimization

1. **API Response Times**
   - Add caching headers
   - Compress responses (gzip)
   - Optimize database queries

2. **Mobile App Performance**
   - Bundle size optimization
   - Lazy load screens
   - Cache tracker data

3. **Price Fetching**
   - Batch requests to Duffel API
   - Cache results for 5 minutes
   - Use exponential backoff for retries

## Troubleshooting

### Backend Issues
```bash
# Check logs
docker logs flight-tracker-backend

# Test database connection
psql postgresql://user:password@host:5432/flight_tracker

# Test Redis connection
redis-cli -h host -p 6379 ping
```

### Mobile Issues
```bash
# Clear cache
cd apps/mobile
rm -rf node_modules
rm -rf .expo
npm install

# Rebuild
npm run build

# Check logs
eas build:logs
```

### Database Issues
```bash
# Check connections
SELECT * FROM pg_stat_activity;

# Check slow queries
SELECT * FROM pg_stat_statements ORDER BY mean_time DESC;
```

## Support

- Documentation: See `README.md`
- Issues: GitHub Issues
- Email: support@flighttracker.app
