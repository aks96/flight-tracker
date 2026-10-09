import { jest } from '@jest/globals';
import request from 'supertest';

/**
 * Route-level wiring: health/readiness semantics, auth enforcement, error
 * shape and rate limiting. The database and Redis are mocked, so these run
 * anywhere without a live stack.
 */

const dbHealthy = jest.fn<any>(async () => true);
const redisHealthy = jest.fn<any>(async () => true);

jest.unstable_mockModule('../src/db/connection.js', () => ({
  query: jest.fn<any>(async () => []),
  queryOne: jest.fn<any>(async () => null),
  execute: jest.fn<any>(async () => 1),
  getPool: () => ({ query: jest.fn() }),
  closePool: async () => undefined,
  isDatabaseHealthy: dbHealthy,
  withTransaction: async (fn: any) => fn({}),
}));

jest.unstable_mockModule('../src/utils/redis.js', () => ({
  getRedis: () => {
    // Force the limiter onto its in-memory fallback rather than a live Redis.
    throw new Error('redis unavailable in tests');
  },
  isRedisHealthy: redisHealthy,
  closeRedis: async () => undefined,
}));

process.env.JWT_SECRET = 'z'.repeat(40);
process.env.JWT_REFRESH_SECRET = 'w'.repeat(40);

const { createApp } = await import('../src/app.js');
const jwt = (await import('jsonwebtoken')).default;

const app = createApp({} as any);

const validToken = jwt.sign({ userId: 'u1', email: 'a@b.com' }, process.env.JWT_SECRET!, {
  expiresIn: '15m',
});

describe('health endpoints', () => {
  beforeEach(() => {
    // jest's clearMocks only clears call history, not queued one-off
    // implementations — restate the defaults so cases can't leak into each other.
    dbHealthy.mockReset().mockResolvedValue(true);
    redisHealthy.mockReset().mockResolvedValue(true);
  });

  it('liveness stays 200 and does not depend on external services', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('readiness reports 200 when the database and Redis are both reachable', async () => {
    const response = await request(app).get('/health/ready');
    expect(response.status).toBe(200);
    expect(response.body.checks).toEqual({ database: true, redis: true });
  });

  it('readiness reports 503 when the database is unreachable', async () => {
    // The old /health returned 200 here, so a deploy running with no
    // persistence looked healthy to the load balancer.
    dbHealthy.mockResolvedValueOnce(false);
    const response = await request(app).get('/health/ready');
    expect(response.status).toBe(503);
    expect(response.body.status).toBe('degraded');
  });
});

describe('authentication enforcement', () => {
  it.each([
    ['get', '/api/trackers'],
    ['post', '/api/trackers'],
    ['get', '/api/devices'],
    ['post', '/api/devices/register'],
    ['get', '/api/predictions/tracker/trk_1/trend'],
    ['get', '/api/auth/me'],
  ])('rejects unauthenticated %s %s', async (method, path) => {
    const response = await (request(app) as any)[method](path);
    expect(response.status).toBe(401);
  });

  it('returns 401 (not 403) for an expired token, so the client refreshes', async () => {
    const expired = jwt.sign({ userId: 'u1', email: 'a@b.com' }, process.env.JWT_SECRET!, {
      expiresIn: '-1s',
    });

    const response = await request(app).get('/api/trackers').set('Authorization', `Bearer ${expired}`);

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('token_expired');
  });

  it('rejects a token signed with the wrong secret', async () => {
    const forged = jwt.sign({ userId: 'u1', email: 'a@b.com' }, 'some-other-secret');
    const response = await request(app).get('/api/trackers').set('Authorization', `Bearer ${forged}`);
    expect(response.status).toBe(401);
  });
});

describe('tracker validation', () => {
  const validTracker = {
    tripType: 'one_way',
    origin: 'DEL',
    destination: 'BOM',
    departDateStart: '2030-03-01',
    departDateEnd: '2030-03-10',
    cabinClass: 'economy',
    adults: 1,
    children: 0,
    infants: 0,
    currency: 'INR',
    baselinePrice: 6000,
    priceDropAmount: 500,
  };

  const post = (body: Record<string, unknown>) =>
    request(app).post('/api/trackers').set('Authorization', `Bearer ${validToken}`).send(body);

  it('rejects a departure date in the past', async () => {
    const response = await post({ ...validTracker, departDateStart: '2020-01-01' });
    expect(response.status).toBe(400);
  });

  it('rejects an end date before the start date', async () => {
    const response = await post({ ...validTracker, departDateEnd: '2030-02-01' });
    expect(response.status).toBe(400);
  });

  it('rejects a non-IATA origin', async () => {
    const response = await post({ ...validTracker, origin: 'DELHI' });
    expect(response.status).toBe(400);
  });

  it('rejects an origin equal to the destination', async () => {
    const response = await post({ ...validTracker, destination: 'DEL' });
    expect(response.status).toBe(400);
  });

  it('rejects more infants than adults', async () => {
    const response = await post({ ...validTracker, adults: 1, infants: 2 });
    expect(response.status).toBe(400);
  });

  it('rejects a drop threshold larger than the baseline', async () => {
    // Such a tracker can never fire, so it is a configuration mistake.
    const response = await post({ ...validTracker, priceDropAmount: 7000 });
    expect(response.status).toBe(400);
  });

  it('rejects an unsupported currency', async () => {
    const response = await post({ ...validTracker, currency: 'GBP' });
    expect(response.status).toBe(400);
  });

  it('requires a return date for a round trip', async () => {
    const response = await post({ ...validTracker, tripType: 'round_trip' });
    expect(response.status).toBe(400);
  });
});

describe('hardening', () => {
  it('rejects an oversized body instead of buffering 10MB', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({ email: 'a@b.com', password: 'x'.repeat(200_000) });

    expect(response.status).toBe(413);
  });

  it('does not advertise the server framework', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('sets a request id on every response for log correlation', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['x-request-id']).toMatch(/[0-9a-f-]{36}/);
  });

  it('echoes an upstream request id rather than inventing a new one', async () => {
    const response = await request(app).get('/health').set('X-Request-Id', 'upstream-id-123');
    expect(response.headers['x-request-id']).toBe('upstream-id-123');
  });

  it('rate limits repeated login attempts', async () => {
    // Brute-force protection can't depend on an nginx config that isn't in the
    // request path on managed hosts.
    let sawRateLimit = false;
    for (let i = 0; i < 25; i++) {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: `user${i}@example.com`, password: 'wrong-password' });
      if (response.status === 429) {
        sawRateLimit = true;
        break;
      }
    }
    expect(sawRateLimit).toBe(true);
  });

  it('returns JSON, not HTML, for an unknown route', async () => {
    const response = await request(app).get('/nope');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Route not found' });
  });
});
