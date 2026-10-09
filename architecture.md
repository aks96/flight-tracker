# Flight Price Tracking & Alert Agent — Architecture v4

## 1. Goal (v4 scope)
- **Native mobile app** — iOS and Android from a single React Native codebase. Distributed via **App Store (iOS) and Google Play (Android)**. **Not a PWA or web app.**
- User **signs up / logs in** (auth required — trackers are tied to an account). **No MFA in v1.**
- User creates a **tracker**: route, one-way or round-trip, date range, cabin class, currency, **passenger count (single or multiple)**, and a **price-drop amount**.
- User can **edit, pause, and delete** trackers.
- Backend polls Duffel **live** on a schedule per tracker.
- The app shows the tracker's **live current price** (never a historical/cached substitute), plus a **trend line and price-drop probability score** — this pairing is what lets the user decide "wait" vs "book elsewhere now" vs "adjust the tracker's threshold."
- When the live price drops by the user's set amount → notify the user, reliably and **within seconds** of detection. No missed alerts.
- **No booking or payment flow in v1.** The app is detection + notification + decision-support only — it does **not** create Duffel orders, does **not** integrate Stripe, and does not take payment details. A notification tells the user a fare dropped; what they do next (book on the airline's site, an OTA, etc.) is outside the app for now. Booking/checkout is explicitly deferred to a later version.
- Currencies: **INR, USD, EUR**.
- Landing screen (post-login) = **Dashboard**, listing the user's active trackers with live price + trend snapshot on each card.

---

## 2. High-Level System Diagram (described)

```
[Native Mobile App — React Native (Expo) with native compilation]
   iOS (App Store) + Android (Google Play) — single codebase
   App launch → auth check → Dashboard (list of trackers)
        |
        | REST/GraphQL over HTTPS
        v
[API Gateway / Backend (Node.js/Express or FastAPI)]
        |
        |-- Auth Middleware (JWT access + refresh token, no MFA v1)
        |-- Rate Limiter
        |-- Request Validation
        |
        v
   [Core Backend Services]
        |
        |--> Auth Service         -- signup/login/logout, token refresh, password reset
        |--> Device Service       -- registers push tokens per device (APNs/FCM)
        |--> Tracker Service      -- CRUD (create/edit/delete/pause) incl. passengers, trip type
        |--> Price Fetch Service  -- LIVE Duffel calls (search only), normalizes response
        |--> Scheduler/Queue      -- BullMQ (Redis-backed), runs Price Fetch on interval per tracker
        |--> Notification Service -- detects drop -> dispatches push in seconds, retries + fallback
        |--> Prediction Service   -- reads price_history ONLY -> trend + probability score
        |
        v
[Databases]
   - PostgreSQL   -> users, devices, trackers, alerts (relational)
   - TimescaleDB  -> price_history (time-series, feeds Prediction Service only)
   - Redis        -> job queue, short-TTL cache (de-dupe near-simultaneous live calls)

[External APIs]
   - Duffel API        -> flight SEARCH only (no order/booking calls in v1)
   - APNs (iOS) + FCM (Android), via Expo Push -> push notifications
   - SendGrid           -> email (fallback notification channel only — no receipts yet, nothing to pay for)
```

Notably absent from v4: **no Booking Service, no Stripe, no `bookings` table.** These come back once one-click booking is prioritized — see section 9.

---

## 3. Component Breakdown

### Native Mobile App (React Native + Expo — iOS & Android)
- **Native distribution**: App Store (iOS) and Google Play (Android). Single React Native codebase compiles to native binaries for both platforms.
- **Native capabilities**: full access to device push notifications (APNs for iOS, FCM for Android unified via Expo), native file system, camera, contacts, and OS-level permissions.
- **Screens**: Login/Signup, Dashboard (tracker cards: live price + trend sparkline + probability badge), Create Tracker, Edit Tracker, Tracker Detail (live price, full history chart, trend + probability, edit/delete/pause actions), Alerts/Notifications inbox, Account/Settings (currency, notification prefs).
- Every price shown anywhere in the app is a **live fetch result**, filtered by the tracker's cabin class and shown in its currency. History/trend is displayed as separate, clearly-labeled context.
- No checkout/payment screens in v1 — a notification or Tracker Detail view is the end of the flow; at most it can deep-link out to the airline/OTA's own site if useful, but the app itself doesn't take the user through a purchase.
- Native push permission prompt on first launch; registers device token with backend on grant.
- **Not a PWA**: this is a real compiled native app with all platform-specific features, not a web app wrapper or progressive web application.

### Auth Service
- Email + password (bcrypt/argon2 hashing); JWT access token + refresh token pair.
- Password reset via email (SendGrid).
- **No MFA in v1.**
- Every tracker, device, and alert row scoped to `user_id`.

### Device Service
- Registers/refreshes push tokens per installed app instance (a user may have multiple devices).
- Notification Service fans out to **all active devices** for a user.

### Backend API
- **Tracker Service**: full CRUD — create, edit, delete, pause/resume. Supports one-way and round-trip, single or multiple passengers (adults/children/infants), all 3 currencies, and cabin class.
- **Price Fetch Service**: wraps Duffel's `/air/offer_requests` + `/air/offers` **only** — a read-only search call, no order creation. Normalizes into a common `PricePoint` shape. Called on schedule and on-demand (Dashboard/Detail views), so displayed prices stay fresh.
- **Scheduler**: BullMQ job per active tracker, interval tuned against Duffel API cost.
- **Notification Service**: the moment a live-fetched price crosses `baseline_price - price_drop_amount`, enqueues a push job immediately. Push via Expo Push (APNs/FCM), target seconds-level delivery. Retry with backoff; falls back to email if push fails or no device is registered. Re-arms `baseline_price` to the new low after firing.
- **Prediction Service**: reads **only** `price_history`, produces the trend line + probability score shown next to the live price.

### Middleware
- JWT auth check on all protected routes.
- Rate limiting (per-user + per-IP) — controls Duffel spend.
- Input validation: valid IATA codes, date ranges, currency enum, cabin class, passenger counts ≥ 1 adult.

---

## 4. Database Schema (draft v4)

### PostgreSQL — relational data

```sql
-- Users
users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  phone TEXT,
  preferred_currency TEXT DEFAULT 'INR',   -- INR | USD | EUR
  created_at TIMESTAMPTZ DEFAULT now()
)

-- Devices (push targets)
devices (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) NOT NULL,
  push_token TEXT NOT NULL,
  platform TEXT NOT NULL,                  -- ios | android
  last_active_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
)

-- Trackers
trackers (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) NOT NULL,
  trip_type TEXT NOT NULL DEFAULT 'one_way', -- one_way | round_trip
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  depart_date_start DATE NOT NULL,
  depart_date_end DATE NOT NULL,
  return_date_start DATE,                  -- required if round_trip
  return_date_end DATE,
  cabin_class TEXT DEFAULT 'economy',       -- economy | premium_economy | business | first
  adults INT NOT NULL DEFAULT 1,
  children INT NOT NULL DEFAULT 0,
  infants INT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',     -- INR | USD | EUR
  baseline_price NUMERIC NOT NULL,          -- live price captured at creation / last re-arm
  price_drop_amount NUMERIC NOT NULL,       -- alert fires when live price <= baseline - this
  status TEXT DEFAULT 'active',             -- active | paused | expired
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
)

-- Alerts sent (dedup / re-arm / delivery log)
alerts (
  id UUID PRIMARY KEY,
  tracker_id UUID REFERENCES trackers(id),
  price_at_alert NUMERIC NOT NULL,          -- the LIVE price that triggered it
  baseline_before NUMERIC NOT NULL,
  channel TEXT,                             -- push | email
  delivery_status TEXT DEFAULT 'sent',      -- sent | retried | fallback_email | failed
  detected_at TIMESTAMPTZ DEFAULT now(),
  delivered_at TIMESTAMPTZ                  -- used to monitor the "seconds" SLA
)
```

No `bookings` table in v4 — nothing in the system creates an order or takes payment, so there's no booking record to store yet.

### TimescaleDB — price history (hypertable, prediction-only)

```sql
price_history (
  time TIMESTAMPTZ NOT NULL,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  depart_date DATE NOT NULL,
  return_date DATE,
  cabin_class TEXT NOT NULL,
  price NUMERIC NOT NULL,
  currency TEXT NOT NULL,
  source TEXT DEFAULT 'duffel'
)
-- hypertable partitioned on `time`, indexed on (origin, destination, depart_date, cabin_class)
```
Written on every live fetch (scheduled and on-demand), shared across all users, indexed by cabin class.

---

## 5. Alert Logic (live data, low-latency delivery, no purchase step)

1. Scheduler (or on-demand view) triggers **Price Fetch Service** → live Duffel search call for the tracker's route/dates/cabin class/passengers.
2. Compare live price against tracker's `baseline_price`.
3. If `live_price <= baseline_price - price_drop_amount`:
   - Immediately enqueue a notification job (no batching/digest delay).
   - Notification Service pushes to every registered device for that user via Expo Push.
   - Retry with backoff on delivery failure; fall back to email if push ultimately fails or no device is registered.
   - Log `detected_at` / `delivered_at` on the `alerts` row to monitor the seconds-level SLA.
   - Re-arm `baseline_price` to the new `live_price`.
4. Write the live price point to `price_history` regardless of whether it triggered an alert.
5. The notification and the Tracker Detail screen are the **end of the v1 flow** — no in-app checkout follows.

## 6. Trend & Probability (decision support, historical, never "current price")
For a given route + cabin class + days-to-departure bucket:
1. Pull last N days of `price_history` for that route/class/similar days-to-departure.
2. Compute the percentile rank of the current live price against that distribution.
3. Score: "This price is lower than X% of prices seen for this route/class recently."
4. 7-day trend slope (linear regression) as a secondary "likely to drop further?" signal.
5. Shown together on Dashboard/Tracker Detail so the user can decide: **go book elsewhere now**, **keep waiting**, or **adjust the tracker's price-drop amount**.

---

## 7. Notification channels
- **Push (primary)** — APNs (iOS) + FCM (Android), unified via Expo Push. Target: delivery within seconds of detection.
- **Email (fallback)** — SendGrid. Used when push fails/retries are exhausted, or no device is registered.
- SMS (Twilio) — optional, still deferred.

---

## 8. Deployment plan (draft v4)
- **Native mobile app**: Expo Application Services (EAS) Build → native compilation (iOS .ipa + Android .aab). Submit to App Store Connect (iOS) and Google Play Console (Android) via EAS Submit for official app store distribution.
  - Over-the-air (OTA) updates via Expo Updates for JavaScript-only changes (no native recompilation needed).
  - For native dependency changes, full EAS rebuild and app store re-submission required.
- **Backend**: Render/Railway to start → AWS (ECS/Fargate) if scale demands.
- **Databases**: Postgres + TimescaleDB managed (Timescale Cloud / Supabase).
- **Cache**: Redis (Upstash).
- **CI/CD**: GitHub Actions — backend auto-deploy on merge to main; EAS Build + Submit on release branches/tags for app store release.

No payment infrastructure (Stripe, PCI scope, etc.) to stand up for v1 — one less thing on the critical path to launch.

---

## 9. Deferred to a later version
- **One-click booking**: Duffel order creation, live re-verification of price at time of purchase, and payment (Stripe or Duffel Payments). Brings back a `bookings` table and a Booking Service.
- MFA on auth.
- SMS notifications.
- FX-aware currency conversion (if needed once booking returns and real money is changing hands, this gets more important).

## 10. Open decisions to confirm before coding
1. **Polling interval per tracker**: cost (Duffel spend) vs. how quickly a drop is caught.
2. **React Native (Expo) vs Flutter**: this doc assumes Expo for native push notification support and rapid cross-platform deployment via EAS.
3. **Passenger detail on children/infants**: ages needed for accurate search pricing, or is a count sufficient for v1?
4. **Currency conversion**: convert at fetch time (needs an FX source), or restrict tracker currency to what Duffel natively returns for that route?
5. **Account recovery without MFA**: is email-based password reset the sole recovery path for v1?
6. **Deep link on notification**: does tapping an alert just open Tracker Detail in-app, or also offer an external link out to book (even without in-app checkout)?
7. **Background sync**: should the app support background periodic fetch for price updates (iOS BGTaskScheduler, Android WorkManager) via Expo, or rely solely on push notifications?
