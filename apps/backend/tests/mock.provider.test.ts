import { MockProvider } from '../src/services/providers/mock.provider.js';

/**
 * The mock is the default provider outside production, so its guarantees
 * matter: deterministic within a time bucket (reproducible tests, correct
 * cache behaviour) but drifting across buckets (so a tracker can actually
 * observe a price drop without anyone editing a fixture).
 */

const provider = new MockProvider();

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

describe('offer generation', () => {
  it('returns cheapest-first offers, matching the Duffel contract', async () => {
    const offers = await provider.search(INPUT, 20);

    expect(offers.length).toBeGreaterThan(3);
    const amounts = offers.map((o) => o.amount);
    expect([...amounts].sort((a, b) => a - b)).toEqual(amounts);
  });

  it('respects the requested limit', async () => {
    expect((await provider.search(INPUT, 3))).toHaveLength(3);
  });

  it('produces well-formed, finite prices', async () => {
    for (const offer of await provider.search(INPUT, 20)) {
      expect(Number.isFinite(offer.amount)).toBe(true);
      expect(offer.amount).toBeGreaterThan(0);
      expect(offer.currency).toBe('INR');
      expect(offer.airline).toBeTruthy();
      expect(offer.slices.length).toBeGreaterThan(0);
      expect(offer.slices[0].segments.length).toBe(offer.stops + 1);
      expect(new Date(offer.arrivingAt).getTime()).toBeGreaterThan(
        new Date(offer.departingAt).getTime()
      );
    }
  });

  it('is deterministic for the same route within a time bucket', async () => {
    const first = await provider.search(INPUT, 10);
    const second = await provider.search(INPUT, 10);
    expect(second.map((o) => o.amount)).toEqual(first.map((o) => o.amount));
  });

  it('prices business above economy on the same route', async () => {
    const economy = await provider.search(INPUT, 10);
    const business = await provider.search({ ...INPUT, cabinClass: 'business' }, 10);
    expect(business[0].amount).toBeGreaterThan(economy[0].amount);
  });

  it('prices a long-haul route above a short domestic one', async () => {
    const domestic = await provider.search(INPUT, 10);
    const longHaul = await provider.search({ ...INPUT, destination: 'JFK' }, 10);
    expect(longHaul[0].amount).toBeGreaterThan(domestic[0].amount);
  });

  it('scales with passenger count', async () => {
    const single = await provider.search(INPUT, 10);
    const family = await provider.search({ ...INPUT, adults: 2, children: 1 }, 10);
    expect(family[0].amount).toBeGreaterThan(single[0].amount * 2);
  });

  it('prices a round trip above the equivalent one-way', async () => {
    const oneWay = await provider.search(INPUT, 10);
    const roundTrip = await provider.search(
      { ...INPUT, tripType: 'round_trip', returnDateStart: '2030-03-08' },
      10
    );
    expect(roundTrip[0].amount).toBeGreaterThan(oneWay[0].amount);
    expect(roundTrip[0].slices).toHaveLength(2);
    expect(roundTrip[0].slices[1].origin).toBe('BOM');
  });

  it('supports every currency the product offers', async () => {
    for (const currency of ['INR', 'USD', 'EUR']) {
      const offers = await provider.search({ ...INPUT, currency }, 5);
      expect(offers[0].currency).toBe(currency);
      expect(offers[0].amount).toBeGreaterThan(0);
    }
  });

  it('returns nothing for an unknown route rather than inventing fares', async () => {
    expect(await provider.search({ ...INPUT, destination: 'ZZZ' }, 10)).toEqual([]);
    expect(await provider.search({ ...INPUT, destination: 'DEL' }, 10)).toEqual([]);
  });

  it('covers a broad set of real routes', async () => {
    const routes: Array<[string, string]> = [
      ['DEL', 'BOM'], ['BLR', 'GOI'], ['MAA', 'CCU'], ['BOM', 'DXB'],
      ['DEL', 'LHR'], ['BLR', 'SIN'], ['DEL', 'JFK'], ['BOM', 'SYD'],
      ['HYD', 'BKK'], ['COK', 'DOH'], ['LHR', 'JFK'], ['CDG', 'FRA'],
    ];

    for (const [origin, destination] of routes) {
      const offers = await provider.search({ ...INPUT, origin, destination }, 10);
      expect(offers.length).toBeGreaterThan(0);
      expect(offers[0].amount).toBeGreaterThan(0);
    }
  });
});
