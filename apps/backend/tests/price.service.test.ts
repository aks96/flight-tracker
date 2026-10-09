import { jest } from '@jest/globals';

/**
 * The caching and budget layer sitting between callers and the provider. This
 * is what keeps a ~2,300 search/month ceiling workable: identical routes
 * collapse onto one billable search, and the counter refuses anything beyond
 * the cap.
 */

const store = new Map<string, string>();
const redisGet = jest.fn<any>(async (key: string) => store.get(key) ?? null);
const redisSet = jest.fn<any>(async (key: string, value: string) => {
  store.set(key, value);
  return 'OK';
});

jest.unstable_mockModule('../src/utils/redis.js', () => ({
  getRedis: () => ({ get: redisGet, set: redisSet }),
  isRedisHealthy: async () => true,
  closeRedis: async () => undefined,
}));

const reserveSearch = jest.fn<any>(async () => true);
const releaseSearch = jest.fn<any>(async () => undefined);

jest.unstable_mockModule('../src/services/searchBudget.js', () => ({
  reserveSearch,
  releaseSearch,
  getBudgetStatus: async () => ({ exhausted: false }),
}));

const search = jest.fn<any>();
jest.unstable_mockModule('../src/services/providers/index.js', () => ({
  getPriceProvider: () => ({ name: 'fake', search }),
  resetPriceProvider: () => undefined,
}));

const { searchFlights, getCheapestOffer, getPriceForTracker, SearchBudgetExhaustedError } =
  await import('../src/services/price.service.js');

function offer(id: string, amount: number) {
  return {
    id,
    amount,
    currency: 'INR',
    airline: 'IndiGo',
    airlineCode: '6E',
    cabinClass: 'economy',
    stops: 0,
    durationMinutes: 130,
    departingAt: '2030-03-01T06:00:00.000Z',
    arrivingAt: '2030-03-01T08:10:00.000Z',
    slices: [],
    baggageIncluded: true,
    refundable: false,
    source: 'fake',
    fetchedAt: new Date(),
  };
}

const INPUT = {
  tripType: 'one_way' as const,
  origin: 'DEL',
  destination: 'BOM',
  departDateStart: '2030-03-01',
  cabinClass: 'economy',
  adults: 1,
  children: 0,
  infants: 0,
  currency: 'INR',
};

beforeEach(() => {
  store.clear();
  reserveSearch.mockResolvedValue(true);
  search.mockResolvedValue([offer('off_1', 4500), offer('off_2', 5200)]);
});

describe('caching', () => {
  it('serves a repeated identical search from cache without a second provider call', async () => {
    const first = await searchFlights(INPUT, { limit: 10 });
    expect(first.cached).toBe(false);
    expect(search).toHaveBeenCalledTimes(1);

    const second = await searchFlights(INPUT, { limit: 10 });
    expect(second.cached).toBe(true);
    expect(search).toHaveBeenCalledTimes(1);
    expect(second.offers[0].amount).toBe(4500);
  });

  it('does not consume budget for a cached result', async () => {
    await searchFlights(INPUT, { limit: 10 });
    reserveSearch.mockClear();

    await searchFlights(INPUT, { limit: 10 });
    expect(reserveSearch).not.toHaveBeenCalled();
  });

  it('keys the cache by route, dates, cabin, passengers and currency', async () => {
    await searchFlights(INPUT, { limit: 10 });
    const [key] = redisSet.mock.calls[0] as [string, ...unknown[]];
    expect(key).toBe('search:DEL:BOM:2030-03-01:ow:economy:1-0-0:INR');
  });

  it('treats a different cabin as a separate search', async () => {
    await searchFlights(INPUT, { limit: 10 });
    await searchFlights({ ...INPUT, cabinClass: 'business' }, { limit: 10 });
    expect(search).toHaveBeenCalledTimes(2);
  });

  it('keeps quote and search caches separate, since they expire differently', async () => {
    await searchFlights(INPUT, { limit: 10, kind: 'search' });
    await searchFlights(INPUT, { limit: 10, kind: 'quote' });
    expect(search).toHaveBeenCalledTimes(2);
  });

  it('does not cache an empty result, so a transient outage is retried', async () => {
    search.mockResolvedValue([]);
    await searchFlights(INPUT, { limit: 10 });
    await searchFlights(INPUT, { limit: 10 });
    expect(search).toHaveBeenCalledTimes(2);
  });
});

describe('budget enforcement', () => {
  it('refuses the search when the budget is exhausted', async () => {
    reserveSearch.mockResolvedValue(false);

    await expect(searchFlights(INPUT, { limit: 10 })).rejects.toBeInstanceOf(
      SearchBudgetExhaustedError
    );
    expect(search).not.toHaveBeenCalled();
  });

  it('releases the reservation when the provider throws', async () => {
    // The search never happened, so it must not count against the month.
    search.mockRejectedValue(new Error('provider down'));

    await expect(searchFlights(INPUT, { limit: 10 })).rejects.toThrow('provider down');
    expect(releaseSearch).toHaveBeenCalled();
  });

  it('bills scheduler and interactive callers to separate buckets', async () => {
    await searchFlights(INPUT, { limit: 5, consumer: 'scheduler', kind: 'quote' });
    expect(reserveSearch).toHaveBeenCalledWith('scheduler');

    await searchFlights({ ...INPUT, origin: 'BLR' }, { limit: 5, consumer: 'interactive' });
    expect(reserveSearch).toHaveBeenCalledWith('interactive');
  });
});

describe('cheapest-offer helpers', () => {
  it('returns the lowest fare', async () => {
    const cheapest = await getCheapestOffer(INPUT);
    expect(cheapest?.amount).toBe(4500);
  });

  it('returns null when no fares exist', async () => {
    search.mockResolvedValue([]);
    expect(await getCheapestOffer(INPUT)).toBeNull();
  });

  it('throws for a tracker with no available fares, so the tick logs it', async () => {
    search.mockResolvedValue([]);
    await expect(getPriceForTracker({ ...INPUT, id: 'trk_1' })).rejects.toThrow('No live fares');
  });

  it('charges tracker checks to the scheduler bucket', async () => {
    await getPriceForTracker({ ...INPUT, id: 'trk_1' });
    expect(reserveSearch).toHaveBeenCalledWith('scheduler');
  });
});
