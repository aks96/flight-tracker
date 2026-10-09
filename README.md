# Flight Tracker - Native Mobile App

A real-time flight price tracking and alert system built with React Native/Expo (mobile) and Node.js/Express (backend).

## 📋 Project Structure

```
flight-tracker/
├── apps/
│   ├── mobile/              # React Native Expo app (iOS & Android)
│   │   ├── src/
│   │   │   ├── screens/     # Screen components
│   │   │   ├── components/  # Reusable components
│   │   │   ├── services/    # API services
│   │   │   ├── store/       # Zustand state management
│   │   │   ├── navigation/  # Navigation setup
│   │   │   └── types/       # TypeScript types
│   │   └── package.json
│   │
│   └── backend/             # Node.js/Express API
│       ├── src/
│       │   ├── index.ts     # API entrypoint
│       │   ├── worker.ts    # Price-check worker (run one, separately)
│       │   ├── routes/      # API routes
│       │   ├── services/    # Business logic
│       │   ├── middleware/  # Auth, rate limiting, request context
│       │   ├── db/          # Schema setup + migrations
│       │   ├── config/      # Configuration + startup validation
│       │   ├── types/       # TypeScript types
│       │   └── utils/       # Logger, Redis client
│       ├── tests/           # Jest suites
│       └── package.json
│
├── docker-compose.yml       # Local development stack
├── Dockerfile               # Backend Docker image
└── .github/workflows/       # CI/CD pipelines
```

## 🚀 Quick Start

### Prerequisites

- Node.js 20.19.4+ & npm 10+ (Expo SDK 57 requires it)
- Docker & Docker Compose (for local Postgres + Redis)
- EAS CLI for builds: `npm install -g eas-cli`

### Setup

1. **Clone and install dependencies:**
   ```bash
   npm install
   ```

2. **Start local development stack (PostgreSQL, Redis):**
   ```bash
   docker-compose up -d
   ```

3. **Setup database schema:**
   ```bash
   npm run db:setup    # initial schema
   npm run db:migrate  # any forward migrations
   ```

4. **Create `.env` in `apps/backend/`:**
   ```bash
   cp apps/backend/.env.example apps/backend/.env
   ```
   Fill in your Duffel key at minimum — price lookups fail without it.

5. **Start backend (in one terminal):**
   ```bash
   npm run backend
   ```
   Backend runs on `http://localhost:3000`. In development this process also
   runs the price-check scheduler (`RUN_SCHEDULER_IN_PROCESS=true`). In
   production the scheduler runs as its own process — see below.

6. **Start mobile app (in another terminal):**
   ```bash
   npm run mobile
   ```
   Expo bundler will start on `http://localhost:19000`.

   On a physical device, set `EXPO_PUBLIC_API_URL` to your machine's LAN
   address — the device resolves `localhost` to itself.

### API and worker are separate processes

The scheduler that polls Duffel and fires alerts must run in exactly **one**
process. Running it inside every API instance means N schedulers racing over
the same job queue.

```bash
# Production: any number of API instances...
npm start --workspace apps/backend

# ...and exactly one worker
npm run worker --workspace apps/backend
```

`RUN_SCHEDULER_IN_PROCESS` controls this and defaults to `true` in development,
`false` in production.

## 📱 Mobile App

### Features
- **Flight search** — browse live fares for a route in-app, sort by price,
  duration or departure, and create a tracker from the fare you're looking at
  rather than guessing a baseline
- **Native Push Notifications** via Expo (APNs for iOS, FCM for Android),
  registered on login and deep-linked to the tracker they concern
- **JWT Authentication** with secure token storage and rotating refresh tokens
- **Price Tracking** dashboard with live prices
- **Real-time Alerts** when prices drop
- **Account deletion** from Settings (an App Store review requirement)
- **Dark Mode** support

### Development
```bash
cd apps/mobile

# Run iOS simulator
npm run ios

# Run Android emulator
npm run android

# Run web preview
npm run web
```

### Build & Deploy (EAS)
```bash
eas login

# One-time: creates the EAS project and writes its id into app.json
eas init

eas build --profile preview   --platform all   # internal distribution
eas build --profile production --platform all
eas submit --profile production --platform ios
```

CI builds run from the **Mobile EAS Build** workflow. Store submission is a
separate, manually dispatched job behind a protected GitHub environment — it
does not fire automatically on merges to `main`.

## 🔌 Backend API

### Authentication
- **POST** `/api/auth/signup` - Register new user
- **POST** `/api/auth/login` - Login with email/password
- **POST** `/api/auth/refresh` - Rotate refresh token, get new access token
- **POST** `/api/auth/logout` - Revoke the presented refresh token
- **POST** `/api/auth/forgot-password` - Email a reset link
- **POST** `/api/auth/reset-password` - Consume a reset token
- **POST** `/api/auth/change-password` - Change password (requires JWT)
- **GET** `/api/auth/me` - Get current user (requires JWT)
- **DELETE** `/api/auth/me` - Delete account and all data (requires JWT)

### Trackers (Price Tracking)
- **POST** `/api/trackers` - Create price tracker
- **GET** `/api/trackers` - List user's trackers
- **GET** `/api/trackers/:id` - Get tracker details
- **PATCH** `/api/trackers/:id` - Update tracker settings
- **DELETE** `/api/trackers/:id` - Delete tracker
- **POST** `/api/trackers/:id/pause` - Pause price monitoring
- **POST** `/api/trackers/:id/resume` - Resume price monitoring

### Flights
- **POST** `/api/flights/search` - Live fare listing for a route (cached)
- **GET** `/api/flights/budget` - Current monthly search-budget consumption
- **GET** `/api/trackers/:id/price` - Live cheapest fare for a saved tracker

### Devices & Predictions
- **POST** `/api/devices/register` - Register a push token for this device
- **GET** `/api/devices` - List the user's registered devices
- **DELETE** `/api/devices/:deviceId` - Deactivate a device
- **GET** `/api/predictions/tracker/:id/trend` - Trend + probability score

### Health Checks
- **GET** `/health` - Liveness: is the process up? (no external dependencies)
- **GET** `/health/ready` - Readiness: 200 only if Postgres **and** Redis are reachable

Full reference, including request/response shapes and rate limits: [API.md](API.md).

## 🗄️ Database Schema

### PostgreSQL Tables
- **users** - User accounts with authentication
- **devices** - Push notification tokens per device
- **trackers** - Flight price trackers
- **alerts** - Alert delivery logs
- **refresh_tokens** - Refresh token digests, for rotation and revocation
- **password_reset_tokens** - Single-use reset tokens (1 hour TTL)
- **schema_migrations** - Applied migration ledger

### TimescaleDB Hypertable
- **price_history** - Time-series price data for trend analysis

## 🔐 Authentication

- **Signup/Login**: Email + password (bcrypt, cost factor 12), 8 character minimum
- **Tokens**: JWT access token (15m) + refresh token (7d)
- **Rotation**: Every refresh revokes the old token and issues a new one;
  replaying a revoked token revokes all of that user's sessions
- **Revocation**: Refresh token digests are stored server-side, so logout,
  password change and account deletion invalidate sessions immediately
- **Storage**: Tokens stored in secure storage on mobile (Keychain / Keystore)
- **Auto-refresh**: Automatic token refresh on 401, with a single shared
  in-flight refresh so concurrent requests can't invalidate each other
- **Rate limiting**: 10 attempts per 15 minutes per IP on credential endpoints

## 📬 Notifications

### Push Notifications (Primary)
- **Delivery Time**: Within seconds of price drop detection
- **Platforms**: iOS (APNs) & Android (FCM) via Expo Push
- **Retry Logic**: 3 attempts with exponential backoff
- **Registration**: The app requests permission and registers its Expo push
  token on login and on every launch while authenticated
- **Receipts**: Delivery receipts are polled and tokens reported as
  `DeviceNotRegistered` are deactivated automatically
- **Deep links**: Tapping an alert opens the tracker it refers to
- **Cooldown**: At most one alert per tracker per hour (`ALERT_COOLDOWN_MS`)

### Email Fallback
- **Trigger**: When push delivery fails or no device registered
- **Provider**: SendGrid
- **Use**: Last resort notification channel

## 💾 Environment Variables

Every variable the backend reads is documented in two templates, and nothing
that isn't read appears in them:

- [`apps/backend/.env.example`](apps/backend/.env.example) — local development
- [`.env.production.example`](.env.production.example) — production, with the
  required set marked

The API **validates its configuration on boot and refuses to start** in
production if a required variable is missing, a JWT secret is weak or reused,
or `CORS_ORIGIN` allows localhost or `*`. A misconfigured deploy fails loudly
instead of coming up degraded.

Both `DATABASE_URL` and the discrete `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/
`DB_PASSWORD` form are understood, as are `REDIS_URL` and `REDIS_HOST`/
`REDIS_PORT`/`REDIS_PASSWORD`.

## 🧪 Testing

Run everything the CI runs, from the repo root:

```bash
npm run verify   # lint + typecheck (both apps) + tests + build
```

### Backend
```bash
npm test         # jest, hermetic — no database or Redis required
npm run lint
```

### Mobile
```bash
cd apps/mobile
npx tsc --noEmit      # typecheck
npx expo install --check   # verify native modules match the Expo SDK
```

## 🚢 Deployment

### Backend (Node.js)
- **Render**: Auto-deploy from `main` branch (two services: API + worker)
- **Docker**: Multi-stage `Dockerfile`, runs as a non-root user
- **Database**: Timescale Cloud or Supabase
- **Cache**: Upstash Redis (`rediss://` URLs supported)
- **Config**: The API refuses to boot in production with a weak JWT secret,
  a missing Duffel key, or a localhost CORS origin — see `validateConfig()`

### Mobile (Expo)
- **App Stores**: EAS Build → Submit to App Store & Google Play
- **CI/CD**: GitHub Actions with EAS
- **Updates**: Over-the-air updates via Expo Updates

## 📊 Architecture Highlights

1. **Monorepo**: Shared dependencies and types across mobile & backend
2. **Type Safety**: Full TypeScript throughout
3. **Real-time**: Live price fetches, no stale data
4. **Scalable**: Queue-based job processing (BullMQ)
5. **Secure**: JWT auth, bcrypt hashing, secure token storage
6. **Observable**: Structured logging, error tracking

## 💰 Search Cost Control

Duffel charges **$0.005 per search** beyond a 1500:1 search-to-book ratio. This
app takes no bookings in v1, so effectively **every search is billable** and an
unbounded polling loop is an unbounded invoice. Three mechanisms keep it inside
a fixed monthly budget (default 2,300 searches ≈ $11.50 ≈ ₹1000):

**1. Tiered polling.** Each tracker is checked on an interval set by how close
its departure is, rather than a flat interval for everything:

| Days to departure | Interval | Searches/day |
|---|---|---|
| under 7 | 3h | 8 |
| 7–21 | 6h | 4 |
| 21–60 | 12h | 2 |
| over 60 | 24h | 1 |

The worker wakes every `PRICE_TICK_INTERVAL_MS` and picks up only the trackers
that are actually due (`next_check_at <= now()`). Departed itineraries are
skipped entirely.

**2. Route-level caching.** Results are keyed by route, dates, cabin, passenger
mix and currency — never by user or tracker. Ten users watching DEL→BOM on the
same dates cost one search, not ten. Search listings cache for
`SEARCH_CACHE_TTL_SEC`, cheapest-fare quotes for `QUOTE_CACHE_TTL_SEC`.

**3. A hard budget ceiling.** A Redis counter caps searches per calendar month,
split between the scheduler (65%) and interactive use (35%) so a burst of
browsing can't starve the polling that drives alerts, or vice versa. Past the
cap the API returns `429 search_budget_exhausted` and falls back to the last
observed price. `GET /api/flights/budget` reports consumption and spend.

**Capacity.** ~50 scheduler searches/day. That comfortably fits **~17 trackers**
of mixed departure dates, or ~45 if all departures are distant — capacity is
driven by *when* trackers depart, not how many exist. An imminent-heavy
portfolio of 20 will exhaust the budget; the tier table above is the dial.

## 🧪 Mock Price Provider

`PRICE_PROVIDER` selects the fare source and defaults to **`mock` outside
production**, so development never spends billable searches:

```bash
PRICE_PROVIDER=mock npx tsx scripts/smoke-search.ts DEL BOM
```

The mock generates fares for 35 airports and 20 airlines with realistic
distance-based pricing, cabin multipliers, stops, baggage and refundability.
Two properties make it useful beyond a static fixture:

- **Deterministic** within a time bucket, so tests are reproducible and the
  cache behaves exactly as in production.
- **Prices drift** across buckets, so a tracker genuinely observes a drop and
  fires an alert with no fixture editing. Lower `MOCK_PRICE_BUCKET_MS` to make
  prices move faster during a manual test.

## 🔄 Price Check Flow

1. **Worker scheduler** wakes every 15 minutes and selects only trackers whose
   tier interval has elapsed
2. **Price Fetch Service** calls Duffel for live prices — identical routes
   within the cache TTL collapse onto a single billed search
3. **Comparison**: Live price vs baseline (currency-checked)
4. **Alert Trigger**: If the price drops by the set amount and the tracker is
   outside its alert cooldown
5. **Notification**: Push to all registered devices, email fallback if that fails
6. **History**: Record in TimescaleDB for trends
7. **Re-arm**: Update the baseline — but only on confirmed delivery, so a failed
   alert is retried rather than silently swallowed

## 📈 Future Enhancements (v2)

- [ ] One-click booking integration (Duffel Orders)
- [ ] Payment processing (Stripe)
- [ ] Advanced price predictions (ML models)
- [ ] SMS notifications
- [ ] Multi-leg trip support
- [ ] Flexible date search
- [ ] Price history charts
- [ ] User preferences & notifications settings

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📝 License

MIT License - see LICENSE file for details

## 📞 Support

For issues and questions, open a GitHub issue or contact the team.
