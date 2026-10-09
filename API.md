# Flight Tracker API Documentation

Complete REST API reference for the Flight Tracker backend service.

## Base URL

Production: `https://api.flighttracker.com`
Development: `http://localhost:3000`

## Authentication

All protected endpoints require Bearer token in Authorization header:

```
Authorization: Bearer <access_token>
```

## Response Format

All responses follow this format:

```json
{
  "data": {...},
  "message": "Success message",
  "error": "Error message (if applicable)"
}
```

---

## Authentication Endpoints

### Sign Up
Create a new user account.

**Request**
```
POST /api/auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response (201 Created)**
```json
{
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  },
  "message": "Account created successfully"
}
```

**Errors**
- 400: Email already exists or invalid input
- 500: Server error

---

### Login
Authenticate with email and password.

**Request**
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response (200 OK)**
```json
{
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  },
  "message": "Login successful"
}
```

**Errors**
- 400: Invalid credentials
- 404: User not found
- 500: Server error

---

### Refresh Token
Exchange a refresh token for a new access token.

**Refresh tokens are rotated.** Each call revokes the token you presented and
returns a new one — clients MUST store the returned `refreshToken`, or their
next refresh presents a revoked token. Presenting an already-revoked token is
treated as a replay (the signature of a stolen token) and revokes every session
for that user.

**Request**
```
POST /api/auth/refresh
Content-Type: application/json

{ "refreshToken": "eyJhbGciOiJIUzI1NiIs..." }
```

**Response (200 OK)**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Errors**
- 400: Missing refreshToken
- 401: Invalid, expired or revoked token
- 429: Rate limited

---

### Get Current User
Fetch authenticated user's profile.

**Request**
```
GET /api/auth/me
Authorization: Bearer <access_token>
```

**Response (200 OK)**
```json
{
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

**Errors**
- 401: Unauthorized
- 404: User not found

---

### Logout

Revokes the presented refresh token so it cannot be replayed. Logging out is
now server-side, not just a local token wipe.

```http
POST /api/auth/logout
Content-Type: application/json

{ "refreshToken": "eyJhbGciOi..." }
```

**Response** `204 No Content`

---

### Forgot Password

```http
POST /api/auth/forgot-password
Content-Type: application/json

{ "email": "user@example.com" }
```

**Response** `202 Accepted`

```json
{ "message": "If that email has an account, a reset link is on its way" }
```

The response is identical whether or not the address has an account — otherwise
this endpoint becomes an account-enumeration oracle. The emailed link uses the
app's deep-link scheme: `flighttracker://reset-password?token=...`. Tokens are
single-use and expire after 1 hour.

---

### Reset Password

```http
POST /api/auth/reset-password
Content-Type: application/json

{ "token": "abc123...", "password": "new-password" }
```

**Response** `200 OK`. Every existing session is revoked on success.

---

### Change Password

```http
POST /api/auth/change-password
Authorization: Bearer <accessToken>
Content-Type: application/json

{ "currentPassword": "old-password", "newPassword": "new-password" }
```

**Response** `200 OK`. Revokes all refresh tokens, so other devices must sign in again.

---

### Delete Account

Permanently deletes the account and cascades to every tracker, device, alert
and token. Required by App Store review for any app offering signup.

```http
DELETE /api/auth/me
Authorization: Bearer <accessToken>
```

**Response** `204 No Content`

---

## Tracker Endpoints

### Create Tracker
Create new flight price tracker.

**Request**
```
POST /api/trackers
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "tripType": "round_trip",
  "origin": "DEL",
  "destination": "NYC",
  "departDateStart": "2025-09-15",
  "departDateEnd": "2025-09-30",
  "returnDateStart": "2025-10-05",
  "returnDateEnd": "2025-10-20",
  "cabinClass": "economy",
  "adults": 2,
  "children": 1,
  "infants": 0,
  "currency": "INR",
  "baselinePrice": 50000,
  "priceDropAmount": 5000
}
```

**Response (201 Created)**
```json
{
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "origin": "DEL",
    "destination": "NYC",
    "tripType": "round_trip",
    "status": "active",
    "baselinePrice": 50000,
    "priceDropAmount": 5000,
    "createdAt": "2024-01-15T10:30:00Z"
  },
  "message": "Tracker created successfully"
}
```

**Errors**
- 400: Invalid input or validation error
- 401: Unauthorized
- 500: Server error

---

### Get All Trackers
Fetch all trackers for authenticated user.

**Request**
```
GET /api/trackers
Authorization: Bearer <access_token>
```

**Query Parameters**
- `status`: Filter by status (active, paused) - optional
- `limit`: Number of results (default: 50) - optional
- `offset`: Pagination offset (default: 0) - optional

**Response (200 OK)**
```json
{
  "data": [
    {
      "id": "uuid",
      "origin": "DEL",
      "destination": "NYC",
      "tripType": "round_trip",
      "status": "active",
      "baselinePrice": 50000,
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "count": 5
}
```

---

### Get Live Tracker Price

The tracker's current cheapest fare. Distinct from the tracker row's
`baselinePrice`, which is the reference point an alert is measured against and
only changes when an alert fires.

```http
GET /api/trackers/:id/price
Authorization: Bearer <accessToken>
```

```json
{
  "amount": 7659,
  "currency": "INR",
  "airline": "Akasa Air",
  "live": true,
  "fetchedAt": "2026-08-24T10:00:00.000Z",
  "baselinePrice": 9000,
  "priceDropAmount": 900
}
```

`live` is `false` when the monthly search budget is exhausted or no fresh fare
was available — the response then carries the most recent observed price
instead, so the client can label it accurately rather than implying it is
current.

---

### Get Tracker by ID
Fetch specific tracker details.

**Request**
```
GET /api/trackers/:trackerId
Authorization: Bearer <access_token>
```

**Response (200 OK)**
```json
{
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "origin": "DEL",
    "destination": "NYC",
    "tripType": "round_trip",
    "departDateStart": "2025-09-15",
    "departDateEnd": "2025-09-30",
    "returnDateStart": "2025-10-05",
    "returnDateEnd": "2025-10-20",
    "cabinClass": "economy",
    "adults": 2,
    "children": 1,
    "infants": 0,
    "currency": "INR",
    "baselinePrice": 50000,
    "priceDropAmount": 5000,
    "status": "active",
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-16T15:45:00Z"
  }
}
```

**Errors**
- 401: Unauthorized
- 404: Tracker not found

---

### Update Tracker
Modify tracker settings.

**Request**
```
PATCH /api/trackers/:trackerId
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "baselinePrice": 48000,
  "priceDropAmount": 3000
}
```

**Updatable Fields**
- baselinePrice
- priceDropAmount
- cabinClass
- status (use pause/resume endpoints instead)

**Response (200 OK)**
```json
{
  "data": {
    "id": "uuid",
    "baselinePrice": 48000,
    "priceDropAmount": 3000,
    "updatedAt": "2024-01-16T15:45:00Z"
  },
  "message": "Tracker updated"
}
```

---

### Delete Tracker
Remove tracker and stop monitoring.

**Request**
```
DELETE /api/trackers/:trackerId
Authorization: Bearer <access_token>
```

**Response (200 OK)**
```json
{
  "message": "Tracker deleted successfully"
}
```

**Errors**
- 401: Unauthorized
- 404: Tracker not found

---

### Pause Tracker
Stop price monitoring without deleting tracker.

**Request**
```
POST /api/trackers/:trackerId/pause
Authorization: Bearer <access_token>
```

**Response (200 OK)**
```json
{
  "data": {
    "id": "uuid",
    "status": "paused"
  },
  "message": "Tracker paused"
}
```

---

### Resume Tracker
Resume price monitoring for paused tracker.

**Request**
```
POST /api/trackers/:trackerId/resume
Authorization: Bearer <access_token>
```

**Response (200 OK)**
```json
{
  "data": {
    "id": "uuid",
    "status": "active"
  },
  "message": "Tracker resumed"
}
```

---

## Flight Endpoints

### Search Flights

The full list of available fares for a route, so a user can compare prices
in-app and create a tracker from what they see.

```http
POST /api/flights/search
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "tripType": "one_way",
  "origin": "DEL",
  "destination": "BOM",
  "departDateStart": "2026-10-02",
  "cabinClass": "economy",
  "adults": 1,
  "children": 0,
  "infants": 0,
  "currency": "INR",
  "limit": 25
}
```

**Response** `200 OK`

```json
{
  "offers": [
    {
      "id": "mock_a1b2c3",
      "amount": 7659,
      "currency": "INR",
      "airline": "Akasa Air",
      "airlineCode": "QP",
      "stops": 0,
      "durationMinutes": 126,
      "departingAt": "2026-10-02T09:55:00.000Z",
      "arrivingAt": "2026-10-02T12:01:00.000Z",
      "baggageIncluded": false,
      "refundable": false,
      "slices": [{ "origin": "DEL", "destination": "BOM", "segments": [] }]
    }
  ],
  "meta": { "cached": false, "fetchedAt": "...", "cheapest": 7659, "currency": "INR" }
}
```

`meta.cached` tells the client whether this listing came from Redis, so a
cached result can be labelled honestly rather than presented as live.

**Errors**
- 400: Validation failure
- 404: No fares found for this route
- 429: Rate limited, or `search_budget_exhausted`

---

### Search Budget

```http
GET /api/flights/budget
Authorization: Bearer <accessToken>
```

```json
{
  "month": "2026-08",
  "used": 412,
  "limit": 2300,
  "remaining": 1888,
  "schedulerUsed": 380,
  "schedulerLimit": 1495,
  "interactiveUsed": 32,
  "interactiveLimit": 805,
  "estimatedSpendUsd": 2.06,
  "exhausted": false
}
```

---

## Device Endpoints

### Register Device
Register device for push notifications.

**Request**
```
POST /api/devices/register
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "pushToken": "ExponentPushToken[xxx]",
  "platform": "ios"
}
```

**Platform Values**
- `ios`: Apple devices
- `android`: Android devices

**Response (200 OK)**
```json
{
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "pushToken": "ExponentPushToken[xxx]",
    "platform": "ios",
    "isActive": true
  },
  "message": "Device registered successfully"
}
```

---

### Get User Devices
Fetch all active devices for user.

**Request**
```
GET /api/devices
Authorization: Bearer <access_token>
```

**Response (200 OK)**
```json
{
  "data": [
    {
      "id": "uuid",
      "pushToken": "ExponentPushToken[xxx]",
      "platform": "ios",
      "isActive": true,
      "lastPing": "2024-01-16T15:45:00Z"
    }
  ],
  "count": 2
}
```

---

### Deactivate Device
Stop receiving notifications on specific device.

**Request**
```
DELETE /api/devices/:deviceId
Authorization: Bearer <access_token>
```

**Response (200 OK)**
```json
{
  "message": "Device deactivated successfully"
}
```

---

### Ping Device
Keep-alive endpoint to track active devices.

**Request**
```
POST /api/devices/:deviceId/ping
Authorization: Bearer <access_token>
```

**Response (200 OK)**
```json
{
  "message": "Device ping updated"
}
```

---

## Prediction Endpoints

### Get Price Trend
Analyze price trends over time.

**Request**
```
GET /api/predictions/tracker/:trackerId/trend
Authorization: Bearer <access_token>
```

**Query Parameters**
- `hoursBack`: Hours of history to analyze (default: 48) - optional

**Response (200 OK)**
```json
{
  "data": {
    "trackerId": "uuid",
    "trend": "decreasing",
    "direction": -1,
    "percentChange": -5.2,
    "bestPrice": 45000,
    "worstPrice": 52000,
    "averagePrice": 49000,
    "volatility": 1.3,
    "predictedPrice": 43000,
    "confidence": 0.75
  }
}
```

**Trend Values**
- `increasing`: Prices going up
- `decreasing`: Prices going down
- `stable`: Minimal change

---

### Get Best Time to Book
Get recommendation on when to book.

**Request**
```
GET /api/predictions/tracker/:trackerId/best-time
Authorization: Bearer <access_token>
```

**Response (200 OK)**
```json
{
  "data": {
    "recommendedDate": "2024-01-22T00:00:00Z",
    "expectedPrice": 43000,
    "reason": "Prices are decreasing - wait 3 more days for better deals"
  }
}
```

---

### Get Price Statistics
Analyze price statistics for tracker.

**Request**
```
GET /api/predictions/tracker/:trackerId/statistics
Authorization: Bearer <access_token>
```

**Query Parameters**
- `days`: Days of history to analyze (default: 30) - optional

**Response (200 OK)**
```json
{
  "data": {
    "min": 42000,
    "max": 55000,
    "average": 48500,
    "median": 48000,
    "stdDev": 2200,
    "dataPoints": 48
  }
}
```

---

## Health Checks

Two distinct endpoints — conflating them is what let a deploy with no database
report itself healthy.

### Liveness

```http
GET /health
```

Returns `200` whenever the process is running. Never touches Postgres or Redis,
so a dependency outage doesn't cause the orchestrator to kill healthy
containers. Use this for the container/Kubernetes liveness probe.

```json
{ "status": "ok", "timestamp": "2026-08-24T10:00:00.000Z" }
```

### Readiness

```http
GET /health/ready
```

Returns `200` only when Postgres **and** Redis are both reachable, `503`
otherwise. Use this for the load balancer / readiness probe, so an instance
that can't actually serve requests is taken out of rotation.

```json
{
  "status": "ready",
  "checks": { "database": true, "redis": true },
  "timestamp": "2026-08-24T10:00:00.000Z"
}
```

---

## Error Codes

| Code | Meaning |
|------|---------|
| 200 | OK - Request successful |
| 201 | Created - Resource created successfully |
| 400 | Bad Request - Invalid input or validation error |
| 401 | Unauthorized - Missing or invalid authentication |
| 403 | Forbidden - User lacks permissions |
| 404 | Not Found - Resource doesn't exist |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error - Server error |
| 503 | Service Unavailable - Server temporarily down |

---

## Rate Limiting

Enforced by the application itself and backed by Redis, so limits hold across
every instance rather than resetting per process on each deploy. (The nginx
config carries a second, coarser layer, but it is only in the request path when
you actually front the API with that container.)

| Scope | Window | Limit | Keyed by |
|---|---|---|---|
| `/api/auth/*` (signup, login, refresh, password reset) | 15 min | 10 | IP |
| `/api/*` (everything authenticated) | 1 min | 100 | user id, falling back to IP |
| `POST /api/trackers/quote` | 1 min | 20 | user id |

Quote lookups get their own cap because they are the one route where
client-side typing directly triggers a billed Duffel search.

Exceeding a limit returns `429` with `{ "error": "..." }` and standard
`RateLimit-*` headers (draft-7). All limits are configurable — see
`AUTH_RATE_MAX`, `API_RATE_MAX` and `QUOTE_RATE_MAX` in
`.env.production.example`.

---

## Best Practices

1. **Token Management**
   - Store tokens securely
   - Refresh before expiry (1 hour)
   - Clear tokens on logout

2. **Error Handling**
   - Check error status codes
   - Display user-friendly messages
   - Log errors for debugging

3. **Performance**
   - Implement pagination for large datasets
   - Cache responses when appropriate
   - Use efficient query parameters

4. **Security**
   - Use HTTPS only in production
   - Never log sensitive data
   - Validate all inputs
   - Keep dependencies updated

---

## Webhooks (Future)

Webhooks for price drop alerts, tracker updates, etc. will be added in v2.0.

---

**API Version**: 1.0.0  
**Last Updated**: January 2024
