import axios, { AxiosInstance } from 'axios';
import { config } from '@/config/env.js';
import logger from '@/utils/logger.js';
import { FlightOffer, FlightSlice, PriceProvider, SearchInput } from './types.js';

// Duffel envelopes every response as `{ data: ... }`. For the offers list
// endpoint `data` is an *array of offers*, not an object with its own nested
// `data` — parsing it as `offer.data.total_amount` made every amount NaN.
interface DuffelEnvelope<T> {
  data: T;
}

interface DuffelSegment {
  origin: { iata_code: string };
  destination: { iata_code: string };
  departing_at: string;
  arriving_at: string;
  duration: string;
  marketing_carrier: { iata_code: string; name: string };
  marketing_carrier_flight_number: string;
  passengers?: Array<{ cabin_class?: string; baggages?: Array<{ type: string; quantity: number }> }>;
}

interface DuffelOffer {
  id: string;
  owner: { name: string; iata_code: string };
  total_amount: string;
  total_currency: string;
  conditions?: { refund_before_departure?: { allowed: boolean } | null };
  slices: Array<{
    origin: { iata_code: string };
    destination: { iata_code: string };
    duration?: string;
    segments: DuffelSegment[];
  }>;
}

/** Duffel durations are ISO-8601 (`PT2H10M`). */
function parseIsoDuration(value: string | undefined): number {
  if (!value) return 0;
  const match = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(value);
  if (!match) return 0;
  const [, days, hours, minutes] = match;
  return (Number(days || 0) * 24 + Number(hours || 0)) * 60 + Number(minutes || 0);
}

function toDateString(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export class DuffelProvider implements PriceProvider {
  readonly name = 'duffel';
  private client: AxiosInstance | null = null;

  private getClient(): AxiosInstance {
    if (!this.client) {
      if (!config.duffel.apiKey) {
        logger.warn('DUFFEL_API_KEY is not set — live price lookups will fail');
      }

      // Duffel rejects any request without an explicit Duffel-Version header.
      this.client = axios.create({
        baseURL: `${config.duffel.apiUrl}/air`,
        timeout: config.duffel.timeoutMs,
        headers: {
          Authorization: `Bearer ${config.duffel.apiKey}`,
          'Duffel-Version': config.duffel.apiVersion,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });
    }
    return this.client;
  }

  /** Visible for testing — drops the memoized client so a new key takes effect. */
  reset(): void {
    this.client = null;
  }

  private isRetryable(error: any): boolean {
    const status = error?.response?.status;
    if (status === undefined) return true; // network error / timeout
    return status === 429 || status >= 500;
  }

  private async withRetry<T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        if (attempt === attempts || !this.isRetryable(error)) break;

        const delayMs = 500 * 2 ** (attempt - 1);
        logger.warn(`${label} failed (attempt ${attempt}/${attempts}), retrying in ${delayMs}ms`, {
          status: error?.response?.status,
          message: error?.message,
        });
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError;
  }

  async createOfferRequest(input: SearchInput): Promise<string> {
    const passengers = [
      ...Array.from({ length: input.adults }, () => ({ type: 'adult' as const })),
      ...Array.from({ length: input.children }, () => ({ type: 'child' as const })),
      // Duffel models lap infants as `infant_without_seat`, not `infant`.
      ...Array.from({ length: input.infants }, () => ({ type: 'infant_without_seat' as const })),
    ];

    // Duffel's slice fields are `origin` / `destination` / `departure_date`.
    const slices = [
      {
        origin: input.origin,
        destination: input.destination,
        departure_date: toDateString(input.departDateStart),
      },
    ];

    if (input.tripType === 'round_trip' && input.returnDateStart) {
      slices.push({
        origin: input.destination,
        destination: input.origin,
        departure_date: toDateString(input.returnDateStart),
      });
    }

    const response = await this.withRetry('Duffel offer request', () =>
      this.getClient().post<DuffelEnvelope<{ id: string }>>('/offer_requests', {
        data: {
          passengers,
          slices,
          cabin_class: input.cabinClass,
          // Price in the tracker's currency so INR/USD/EUR selection actually
          // affects the fares returned.
          ...(input.currency ? { currency: input.currency } : {}),
        },
      })
    );

    return response.data.data.id;
  }

  async search(input: SearchInput, limit: number): Promise<FlightOffer[]> {
    const offerRequestId = await this.createOfferRequest(input);

    const response = await this.withRetry('Duffel offers fetch', () =>
      this.getClient().get<DuffelEnvelope<DuffelOffer[]>>(
        `/offer_requests/${offerRequestId}/offers`,
        { params: { sort: 'total_amount', limit } }
      )
    );

    const offers = response.data?.data;
    if (!Array.isArray(offers) || offers.length === 0) {
      logger.info(`No offers returned for offer request ${offerRequestId}`);
      return [];
    }

    const fetchedAt = new Date();

    return offers
      .slice(0, limit)
      .map((offer) => this.normalize(offer, input, fetchedAt))
      // A malformed or unpriced offer must never reach a baseline comparison
      // as NaN — every `baseline - NaN >= threshold` check is false, which
      // silently disables alerting for the tracker.
      .filter((offer) => Number.isFinite(offer.amount) && offer.amount > 0);
  }

  private normalize(offer: DuffelOffer, input: SearchInput, fetchedAt: Date): FlightOffer {
    const slices: FlightSlice[] = (offer.slices || []).map((slice) => ({
      origin: slice.origin?.iata_code ?? input.origin,
      destination: slice.destination?.iata_code ?? input.destination,
      durationMinutes: parseIsoDuration(slice.duration),
      segments: (slice.segments || []).map((segment) => ({
        origin: segment.origin?.iata_code ?? '',
        destination: segment.destination?.iata_code ?? '',
        departingAt: segment.departing_at,
        arrivingAt: segment.arriving_at,
        durationMinutes: parseIsoDuration(segment.duration),
        marketingCarrier: segment.marketing_carrier?.name ?? 'Unknown',
        flightNumber: `${segment.marketing_carrier?.iata_code ?? ''}${
          segment.marketing_carrier_flight_number ?? ''
        }`,
      })),
    }));

    const outbound = slices[0];
    const segments = outbound?.segments ?? [];
    const firstSegment = segments[0];
    const lastSegment = segments[segments.length - 1];
    const baggages = offer.slices?.[0]?.segments?.[0]?.passengers?.[0]?.baggages ?? [];

    return {
      id: offer.id,
      amount: parseFloat(offer.total_amount),
      currency: offer.total_currency,
      airline: offer.owner?.name ?? 'Unknown',
      airlineCode: offer.owner?.iata_code ?? '',
      cabinClass: input.cabinClass,
      stops: Math.max(0, segments.length - 1),
      durationMinutes:
        outbound?.durationMinutes ||
        segments.reduce((total, segment) => total + segment.durationMinutes, 0),
      departingAt: firstSegment?.departingAt ?? new Date().toISOString(),
      arrivingAt: lastSegment?.arrivingAt ?? new Date().toISOString(),
      slices,
      baggageIncluded: baggages.some((bag) => bag.type === 'checked' && bag.quantity > 0),
      refundable: offer.conditions?.refund_before_departure?.allowed ?? false,
      source: 'duffel',
      fetchedAt,
    };
  }
}
