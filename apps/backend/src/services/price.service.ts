import { config } from '@/config/env.js';
import logger from '@/utils/logger.js';
import { getRedis } from '@/utils/redis.js';
import { getPriceProvider, FlightOffer, SearchInput } from '@/services/providers/index.js';
import { reserveSearch, releaseSearch, SearchConsumer } from '@/services/searchBudget.js';

export type { FlightOffer, SearchInput } from '@/services/providers/index.js';

/**
 * Legacy shape kept for the alert pipeline and price_history, which only ever
 * cared about the cheapest fare. `FlightOffer` carries the full detail the
 * search screen needs.
 */
export interface OfferPrice {
  id: string;
  trackerId: string | null;
  amount: number;
  currency: string;
  airline: string;
  fetchedAt: Date;
  duration: string;
  firstDeparture: string;
  source: string;
}

export type PriceQuoteInput = SearchInput;

export class SearchBudgetExhaustedError extends Error {
  constructor() {
    super('Monthly flight search budget exhausted');
    this.name = 'SearchBudgetExhaustedError';
  }
}

function toDateString(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/**
 * Cache key for a route search. Deliberately excludes tracker and user
 * identity — two users tracking DEL→BOM on the same dates and cabin share one
 * search, which is the de-duplication that makes the budget workable.
 */
function cacheKey(input: SearchInput, kind: 'quote' | 'search'): string {
  return [
    kind,
    input.origin.toUpperCase(),
    input.destination.toUpperCase(),
    toDateString(input.departDateStart),
    input.returnDateStart ? toDateString(input.returnDateStart) : 'ow',
    input.cabinClass,
    `${input.adults}-${input.children}-${input.infants}`,
    input.currency || 'default',
  ].join(':');
}

async function readCache<T>(key: string): Promise<T | null> {
  try {
    const cached = await getRedis().get(key);
    return cached ? (JSON.parse(cached) as T) : null;
  } catch (error) {
    // A cache miss must never break a live price lookup.
    logger.warn('Failed to read price cache', error);
    return null;
  }
}

async function writeCache(key: string, value: unknown, ttlSec: number): Promise<void> {
  try {
    await getRedis().set(key, JSON.stringify(value), 'EX', ttlSec);
  } catch (error) {
    logger.warn('Failed to write price cache', error);
  }
}

function reviveOffer(offer: FlightOffer): FlightOffer {
  return { ...offer, fetchedAt: new Date(offer.fetchedAt) };
}

export interface SearchResult {
  offers: FlightOffer[];
  /** True when served from Redis — i.e. this call cost nothing. */
  cached: boolean;
  fetchedAt: Date;
}

/**
 * Full offer list for a route. Backs the flight search screen, and is the only
 * place a billable search is actually performed.
 */
export async function searchFlights(
  input: SearchInput,
  options: { limit?: number; consumer?: SearchConsumer; kind?: 'quote' | 'search' } = {}
): Promise<SearchResult> {
  const limit = options.limit ?? 20;
  const consumer = options.consumer ?? 'interactive';
  const kind = options.kind ?? 'search';
  const key = cacheKey(input, kind);

  const cached = await readCache<{ offers: FlightOffer[]; fetchedAt: string }>(key);
  if (cached) {
    logger.debug(`Price cache hit for ${key}`);
    return {
      offers: cached.offers.slice(0, limit).map(reviveOffer),
      cached: true,
      fetchedAt: new Date(cached.fetchedAt),
    };
  }

  // Reserve *before* calling out, so a burst of concurrent requests can't
  // collectively overshoot the ceiling.
  if (!(await reserveSearch(consumer))) {
    throw new SearchBudgetExhaustedError();
  }

  let offers: FlightOffer[];
  try {
    offers = await getPriceProvider().search(input, Math.max(limit, 20));
  } catch (error) {
    // The search never happened, so it shouldn't count against the budget.
    await releaseSearch(consumer);
    throw error;
  }

  const fetchedAt = new Date();
  const ttl = kind === 'quote' ? config.polling.quoteCacheTtlSec : config.polling.searchCacheTtlSec;

  if (offers.length > 0) {
    await writeCache(key, { offers, fetchedAt: fetchedAt.toISOString() }, ttl);
  }

  return { offers: offers.slice(0, limit), cached: false, fetchedAt };
}

function toOfferPrice(offer: FlightOffer, trackerId: string | null): OfferPrice {
  return {
    id: offer.id,
    trackerId,
    amount: offer.amount,
    currency: offer.currency,
    airline: offer.airline,
    fetchedAt: offer.fetchedAt,
    duration: `PT${Math.floor(offer.durationMinutes / 60)}H${offer.durationMinutes % 60}M`,
    firstDeparture: offer.departingAt,
    source: offer.source,
  };
}

/** Cheapest live fare for a route, or null when none are available. */
export async function getCheapestOffer(
  input: SearchInput,
  trackerId: string | null = null,
  consumer: SearchConsumer = 'interactive'
): Promise<OfferPrice | null> {
  // Quote lookups reuse the search cache under their own key and a shorter
  // TTL, since the scheduler needs a fresher number than a browsing user does.
  const { offers } = await searchFlights(input, { limit: 5, consumer, kind: 'quote' });
  return offers.length > 0 ? toOfferPrice(offers[0], trackerId) : null;
}

export async function getPriceForTracker(
  tracker: SearchInput & { id: string }
): Promise<OfferPrice> {
  const offer = await getCheapestOffer(tracker, tracker.id, 'scheduler');
  if (!offer) {
    throw new Error(`No live fares found for tracker ${tracker.id}`);
  }
  return offer;
}

/**
 * Live cheapest fare for a route that isn't a saved tracker yet — powers the
 * "current price" auto-fill on the create-tracker screen.
 */
export async function getQuote(input: SearchInput): Promise<OfferPrice | null> {
  return getCheapestOffer(input, null, 'interactive');
}
