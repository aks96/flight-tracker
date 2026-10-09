import { createHash } from 'crypto';
import { FlightOffer, FlightSegment, FlightSlice, PriceProvider, SearchInput } from './types.js';
import {
  AIRLINES,
  CABIN_MULTIPLIER,
  CURRENCY_MODEL,
  MockAirline,
  distanceKm,
  getMockAirport,
} from './mockCatalogue.js';

/**
 * Offline fare generator used in place of Duffel for development and tests.
 *
 * Two properties matter and are why this isn't a static fixture file:
 *
 *  1. **Deterministic** — the same route, date, cabin and time bucket always
 *     produce the same offers, so tests are reproducible and the Redis cache
 *     behaves exactly as it does in production.
 *  2. **Prices actually move** — fares follow a slow random walk keyed to a
 *     time bucket, so a tracker really does see a drop and fire an alert
 *     without anyone hand-editing a fixture. Set MOCK_PRICE_BUCKET_MS lower to
 *     make prices move faster during a manual test.
 */

const PRICE_BUCKET_MS = parseInt(process.env.MOCK_PRICE_BUCKET_MS || '900000', 10);
const LATENCY_MS = parseInt(process.env.MOCK_LATENCY_MS || '0', 10);

/** Stable 0..1 from any string — the seed behind every generated value. */
function hashUnit(seed: string): number {
  const digest = createHash('sha256').update(seed).digest();
  return digest.readUInt32BE(0) / 0xffffffff;
}

function toDateString(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function minutesToIso(date: Date, minutes: number): string {
  return new Date(date.getTime() + minutes * 60_000).toISOString();
}

export class MockProvider implements PriceProvider {
  readonly name = 'mock';

  async search(input: SearchInput, limit: number): Promise<FlightOffer[]> {
    if (LATENCY_MS > 0) {
      await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
    }

    const origin = getMockAirport(input.origin);
    const destination = getMockAirport(input.destination);

    // Unknown airports mimic a genuine "no fares for this route" result rather
    // than inventing data for a city pair nobody flies.
    if (!origin || !destination || origin.code === destination.code) {
      return [];
    }

    const currency = input.currency || 'INR';
    const model = CURRENCY_MODEL[currency] ?? CURRENCY_MODEL.INR;
    const km = distanceKm(origin, destination);
    const departDate = toDateString(input.departDateStart);

    // Carriers that plausibly serve both ends of the route. On a domestic
    // route only home carriers qualify — otherwise Qantas and United showed up
    // on DEL-BOM simply because both list India among the countries they serve.
    const isDomestic = origin.country === destination.country;
    const carriers = AIRLINES.filter((airline) =>
      isDomestic
        ? airline.regions[0] === origin.country
        : airline.regions.includes(origin.country) && airline.regions.includes(destination.country)
    );
    const pool = carriers.length > 0 ? carriers : AIRLINES.slice(0, 6);

    const routeKey = `${origin.code}-${destination.code}-${departDate}-${input.cabinClass}`;
    const bucket = Math.floor(Date.now() / PRICE_BUCKET_MS);

    // Fares rise as departure approaches, which is what makes the polling
    // tiers meaningful in a mock run.
    const daysToDeparture = Math.max(
      0,
      Math.ceil((new Date(departDate).getTime() - Date.now()) / 86_400_000)
    );
    const urgency = daysToDeparture < 7 ? 1.35 : daysToDeparture < 21 ? 1.15 : daysToDeparture < 60 ? 1.0 : 0.92;

    const cabinMultiplier = CABIN_MULTIPLIER[input.cabinClass] ?? 1;
    const passengers = Math.max(1, input.adults + input.children);
    const baseFare = (model.base + km * model.perKm) * cabinMultiplier * urgency;

    const offerCount = Math.min(limit, 4 + Math.floor(hashUnit(`${routeKey}:count`) * 9));
    const offers: FlightOffer[] = [];
    const fetchedAt = new Date();

    for (let i = 0; i < offerCount; i++) {
      const carrier = pool[Math.floor(hashUnit(`${routeKey}:carrier:${i}`) * pool.length)];
      const offer = this.buildOffer({
        index: i,
        routeKey,
        bucket,
        carrier,
        baseFare,
        passengers,
        currency,
        km,
        input,
        originCode: origin.code,
        destinationCode: destination.code,
        departDate,
        fetchedAt,
      });
      offers.push(offer);
    }

    // Cheapest first, matching what the Duffel provider requests.
    return offers.sort((a, b) => a.amount - b.amount).slice(0, limit);
  }

  private buildOffer(params: {
    index: number;
    routeKey: string;
    bucket: number;
    carrier: MockAirline;
    baseFare: number;
    passengers: number;
    currency: string;
    km: number;
    input: SearchInput;
    originCode: string;
    destinationCode: string;
    departDate: string;
    fetchedAt: Date;
  }): FlightOffer {
    const {
      index, routeKey, bucket, carrier, baseFare, passengers,
      currency, km, input, originCode, destinationCode, departDate, fetchedAt,
    } = params;

    const seed = `${routeKey}:${index}`;

    // Long routes are more likely to involve a connection. A carrier based at
    // neither endpoint always connects through its own hub — Emirates does not
    // fly BLR-LHR non-stop, and showing that undermined the whole listing.
    const home = carrier.regions[0];
    const mustConnect =
      home !== undefined &&
      home !== getMockAirport(originCode)?.country &&
      home !== getMockAirport(destinationCode)?.country;

    const stopRoll = hashUnit(`${seed}:stops`);
    const stops = mustConnect
      ? 1
      : km > 4500
        ? (stopRoll > 0.35 ? 1 : 0)
        : km > 1800
          ? (stopRoll > 0.75 ? 1 : 0)
          : 0;

    // A slow random walk over time: the +/-9% swing is what lets a tracker
    // observe a real drop across successive checks.
    const drift = (hashUnit(`${seed}:drift:${bucket}`) - 0.5) * 0.18;
    const spread = 1 + hashUnit(`${seed}:spread`) * 0.55;

    const perPassenger = baseFare * carrier.priceFactor * spread * (1 + drift) * (stops > 0 ? 0.92 : 1);
    const roundTripMultiplier = input.tripType === 'round_trip' ? 1.85 : 1;
    const amount = Math.round(perPassenger * passengers * roundTripMultiplier);

    // Departures spread across the day, anchored to the requested date.
    const departureHour = 5 + Math.floor(hashUnit(`${seed}:hour`) * 17);
    const departureMinute = Math.floor(hashUnit(`${seed}:minute`) * 12) * 5;
    const departure = new Date(`${departDate}T00:00:00.000Z`);
    departure.setUTCHours(departureHour, departureMinute, 0, 0);

    const cruiseMinutes = Math.round(km / 12.5 + 35);
    const layoverMinutes = stops > 0 ? 60 + Math.floor(hashUnit(`${seed}:layover`) * 150) : 0;
    const totalMinutes = cruiseMinutes + layoverMinutes;

    const outbound = this.buildSlice({
      seed,
      originCode,
      destinationCode,
      departure,
      cruiseMinutes,
      layoverMinutes,
      stops,
      carrier,
    });

    const slices: FlightSlice[] = [outbound];

    if (input.tripType === 'round_trip' && input.returnDateStart) {
      const returnDate = new Date(`${toDateString(input.returnDateStart)}T00:00:00.000Z`);
      returnDate.setUTCHours(5 + Math.floor(hashUnit(`${seed}:rhour`) * 17), 0, 0, 0);
      slices.push(
        this.buildSlice({
          seed: `${seed}:return`,
          originCode: destinationCode,
          destinationCode: originCode,
          departure: returnDate,
          cruiseMinutes,
          layoverMinutes,
          stops,
          carrier,
        })
      );
    }

    return {
      id: `mock_${createHash('sha1').update(seed).digest('hex').slice(0, 20)}`,
      amount,
      currency,
      airline: carrier.name,
      airlineCode: carrier.code,
      cabinClass: input.cabinClass,
      stops,
      durationMinutes: totalMinutes,
      departingAt: departure.toISOString(),
      arrivingAt: minutesToIso(departure, totalMinutes),
      slices,
      // Low-cost carriers sell baggage separately; full-service fares include it.
      baggageIncluded: !carrier.lowCost || hashUnit(`${seed}:bag`) > 0.6,
      refundable: hashUnit(`${seed}:refund`) > 0.72,
      source: 'mock',
      fetchedAt,
    };
  }

  private buildSlice(params: {
    seed: string;
    originCode: string;
    destinationCode: string;
    departure: Date;
    cruiseMinutes: number;
    layoverMinutes: number;
    stops: number;
    carrier: MockAirline;
  }): FlightSlice {
    const { seed, originCode, destinationCode, departure, cruiseMinutes, layoverMinutes, stops, carrier } =
      params;

    const flightNumber = (suffix: string) =>
      `${carrier.code}${100 + Math.floor(hashUnit(`${seed}:fn:${suffix}`) * 899)}`;

    const segments: FlightSegment[] = [];

    if (stops === 0) {
      segments.push({
        origin: originCode,
        destination: destinationCode,
        departingAt: departure.toISOString(),
        arrivingAt: minutesToIso(departure, cruiseMinutes),
        durationMinutes: cruiseMinutes,
        marketingCarrier: carrier.name,
        flightNumber: flightNumber('0'),
      });
    } else {
      // Connect through the carrier's own hub where that makes sense.
      const hub = carrier.regions.includes('AE') ? 'DXB' : carrier.regions[0] === 'IN' ? 'DEL' : 'SIN';
      const via = hub === originCode || hub === destinationCode ? 'BOM' : hub;
      const firstLeg = Math.round(cruiseMinutes * 0.55);
      const secondLeg = cruiseMinutes - firstLeg;

      segments.push({
        origin: originCode,
        destination: via,
        departingAt: departure.toISOString(),
        arrivingAt: minutesToIso(departure, firstLeg),
        durationMinutes: firstLeg,
        marketingCarrier: carrier.name,
        flightNumber: flightNumber('0'),
      });
      segments.push({
        origin: via,
        destination: destinationCode,
        departingAt: minutesToIso(departure, firstLeg + layoverMinutes),
        arrivingAt: minutesToIso(departure, firstLeg + layoverMinutes + secondLeg),
        durationMinutes: secondLeg,
        marketingCarrier: carrier.name,
        flightNumber: flightNumber('1'),
      });
    }

    return {
      origin: originCode,
      destination: destinationCode,
      durationMinutes: cruiseMinutes + layoverMinutes,
      segments,
    };
  }
}
