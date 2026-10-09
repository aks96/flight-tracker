import { jest } from '@jest/globals';

/**
 * The Duffel wire contract. This was previously wrong in three ways at once:
 * a missing Duffel-Version header, `origin_iata` instead of `origin` in the
 * slice, and offers parsed as `offer.data.*` when the list endpoint returns
 * bare offers — which made every price NaN.
 */

const post = jest.fn<any>();
const get = jest.fn<any>();
const create = jest.fn((..._args: any[]) => ({ post, get }));

jest.unstable_mockModule('axios', () => ({ default: { create, post, get }, create }));

const { DuffelProvider } = await import('../src/services/providers/duffel.provider.js');

const OFFER_REQUEST_RESPONSE = { data: { data: { id: 'orq_123' } } };

function duffelOffer(id: string, amount: string, currency = 'INR') {
  return {
    id,
    owner: { name: 'IndiGo', iata_code: '6E' },
    total_amount: amount,
    total_currency: currency,
    conditions: { refund_before_departure: { allowed: true } },
    slices: [
      {
        origin: { iata_code: 'DEL' },
        destination: { iata_code: 'BOM' },
        duration: 'PT2H10M',
        segments: [
          {
            origin: { iata_code: 'DEL' },
            destination: { iata_code: 'BOM' },
            departing_at: '2030-03-01T06:00:00',
            arriving_at: '2030-03-01T08:10:00',
            duration: 'PT2H10M',
            marketing_carrier: { iata_code: '6E', name: 'IndiGo' },
            marketing_carrier_flight_number: '2145',
            passengers: [{ baggages: [{ type: 'checked', quantity: 1 }] }],
          },
        ],
      },
    ],
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

let provider: InstanceType<typeof DuffelProvider>;

beforeEach(() => {
  provider = new DuffelProvider();
  post.mockResolvedValue(OFFER_REQUEST_RESPONSE);
  get.mockResolvedValue({ data: { data: [duffelOffer('off_1', '4500.00')] } });
});

describe('request shape', () => {
  it('sends the Duffel-Version header on every request', async () => {
    await provider.search(INPUT, 5);
    const clientConfig = create.mock.calls[0][0] as any;
    expect(clientConfig.headers['Duffel-Version']).toBe('v2');
    expect(clientConfig.headers.Authorization).toMatch(/^Bearer /);
    expect(clientConfig.timeout).toBeGreaterThan(0);
  });

  it("uses Duffel's origin/destination slice fields, not origin_iata", async () => {
    await provider.search(INPUT, 5);
    const [, body] = post.mock.calls[0] as [string, any];
    expect(body.data.slices[0]).toEqual({
      origin: 'DEL',
      destination: 'BOM',
      departure_date: '2030-03-01',
    });
    expect(body.data.slices[0]).not.toHaveProperty('origin_iata');
  });

  it('passes the requested currency so fares come back comparable', async () => {
    await provider.search(INPUT, 5);
    const [, body] = post.mock.calls[0] as [string, any];
    expect(body.data.currency).toBe('INR');
  });

  it('adds a return slice for round trips', async () => {
    await provider.search({ ...INPUT, tripType: 'round_trip', returnDateStart: '2030-03-08' }, 5);
    const [, body] = post.mock.calls[0] as [string, any];
    expect(body.data.slices).toHaveLength(2);
    expect(body.data.slices[1]).toEqual({
      origin: 'BOM',
      destination: 'DEL',
      departure_date: '2030-03-08',
    });
  });

  it('models infants as infant_without_seat', async () => {
    await provider.search({ ...INPUT, adults: 2, children: 1, infants: 1 }, 5);
    const [, body] = post.mock.calls[0] as [string, any];
    expect(body.data.passengers).toEqual([
      { type: 'adult' },
      { type: 'adult' },
      { type: 'child' },
      { type: 'infant_without_seat' },
    ]);
  });

  it('requests cheapest-first ordering', async () => {
    await provider.search(INPUT, 5);
    const [, options] = get.mock.calls[0] as [string, any];
    expect(options.params.sort).toBe('total_amount');
  });
});

describe('response parsing', () => {
  it('parses bare offers from the list envelope', async () => {
    const offers = await provider.search(INPUT, 5);

    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      id: 'off_1',
      amount: 4500,
      currency: 'INR',
      airline: 'IndiGo',
      airlineCode: '6E',
      stops: 0,
      durationMinutes: 130,
      baggageIncluded: true,
      refundable: true,
    });
  });

  it('drops unparseable offers rather than emitting NaN prices', async () => {
    // A NaN amount silently disables alerting: `baseline - NaN >= threshold`
    // is always false.
    get.mockResolvedValue({
      data: { data: [duffelOffer('off_bad', 'not-a-number'), duffelOffer('off_good', '4500.00')] },
    });

    const offers = await provider.search(INPUT, 5);
    expect(offers).toHaveLength(1);
    expect(offers[0].id).toBe('off_good');
  });

  it('counts stops from segments', async () => {
    const twoSegments = duffelOffer('off_1', '4500.00');
    twoSegments.slices[0].segments.push({ ...twoSegments.slices[0].segments[0] });
    get.mockResolvedValue({ data: { data: [twoSegments] } });

    const offers = await provider.search(INPUT, 5);
    expect(offers[0].stops).toBe(1);
  });

  it('returns an empty list when Duffel finds no offers', async () => {
    get.mockResolvedValue({ data: { data: [] } });
    expect(await provider.search(INPUT, 5)).toEqual([]);
  });

  it('tolerates a malformed envelope without throwing', async () => {
    get.mockResolvedValue({ data: {} });
    expect(await provider.search(INPUT, 5)).toEqual([]);
  });
});
