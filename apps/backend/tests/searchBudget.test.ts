import { jest } from '@jest/globals';

/**
 * The monthly ceiling. Duffel bills $0.005 per excess search and this app
 * takes no bookings, so an unbounded polling loop is an unbounded invoice.
 */

const counters = new Map<string, number>();

const redis = {
  incr: jest.fn<any>(async (key: string) => {
    const next = (counters.get(key) ?? 0) + 1;
    counters.set(key, next);
    return next;
  }),
  decr: jest.fn<any>(async (key: string) => {
    const next = (counters.get(key) ?? 0) - 1;
    counters.set(key, next);
    return next;
  }),
  expire: jest.fn<any>(async () => 1),
  mget: jest.fn<any>(async (...keys: string[]) => keys.map((key) => String(counters.get(key) ?? 0))),
};

let redisAvailable = true;
jest.unstable_mockModule('../src/utils/redis.js', () => ({
  getRedis: () => {
    if (!redisAvailable) throw new Error('redis down');
    return redis;
  },
  isRedisHealthy: async () => true,
  closeRedis: async () => undefined,
}));

process.env.SEARCH_BUDGET_MONTHLY = '100';
process.env.SEARCH_BUDGET_SCHEDULER_SHARE = '0.6';

const { reserveSearch, releaseSearch, getBudgetStatus } = await import(
  '../src/services/searchBudget.js'
);

beforeEach(() => {
  counters.clear();
  redisAvailable = true;
});

describe('reserveSearch', () => {
  it('allows searches up to the scheduler share and refuses beyond it', async () => {
    // 100 total x 0.6 = 60 for the scheduler.
    for (let i = 0; i < 60; i++) {
      expect(await reserveSearch('scheduler')).toBe(true);
    }
    expect(await reserveSearch('scheduler')).toBe(false);
  });

  it('gives interactive callers their own share, unaffected by scheduler usage', async () => {
    for (let i = 0; i < 60; i++) await reserveSearch('scheduler');

    // The scheduler is exhausted, but browsing still works — a busy polling
    // month must not make the app unusable.
    expect(await reserveSearch('interactive')).toBe(true);
  });

  it('caps interactive callers at the remaining share', async () => {
    for (let i = 0; i < 40; i++) {
      expect(await reserveSearch('interactive')).toBe(true);
    }
    expect(await reserveSearch('interactive')).toBe(false);
  });

  it('does not count a refused reservation against the month', async () => {
    for (let i = 0; i < 40; i++) await reserveSearch('interactive');
    await reserveSearch('interactive'); // refused

    const status = await getBudgetStatus();
    expect(status.interactiveUsed).toBe(40);
  });

  it('fails open when Redis is unavailable', async () => {
    // A cache outage should degrade the ceiling to "unenforced and warned
    // about", not take the product offline.
    redisAvailable = false;
    expect(await reserveSearch('scheduler')).toBe(true);
  });
});

describe('releaseSearch', () => {
  it('returns a reservation for a search that never happened', async () => {
    await reserveSearch('interactive');
    await reserveSearch('interactive');
    await releaseSearch('interactive');

    expect((await getBudgetStatus()).interactiveUsed).toBe(1);
  });
});

describe('getBudgetStatus', () => {
  it('reports usage, remaining headroom and estimated spend', async () => {
    for (let i = 0; i < 10; i++) await reserveSearch('scheduler');
    for (let i = 0; i < 5; i++) await reserveSearch('interactive');

    const status = await getBudgetStatus();

    expect(status.used).toBe(15);
    expect(status.limit).toBe(100);
    expect(status.remaining).toBe(85);
    expect(status.schedulerLimit).toBe(60);
    expect(status.interactiveLimit).toBe(40);
    expect(status.estimatedSpendUsd).toBeCloseTo(0.075, 3);
    expect(status.exhausted).toBe(false);
  });

  it('reports exhaustion once the whole month is consumed', async () => {
    for (let i = 0; i < 60; i++) await reserveSearch('scheduler');
    for (let i = 0; i < 40; i++) await reserveSearch('interactive');

    expect((await getBudgetStatus()).exhausted).toBe(true);
  });

  it('reports zero usage rather than failing when Redis is down', async () => {
    redisAvailable = false;
    const status = await getBudgetStatus();
    expect(status.used).toBe(0);
  });
});
