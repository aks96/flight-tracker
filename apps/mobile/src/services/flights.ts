import apiClient from './api';

export interface FlightSegment {
  origin: string;
  destination: string;
  departingAt: string;
  arrivingAt: string;
  durationMinutes: number;
  marketingCarrier: string;
  flightNumber: string;
}

export interface FlightSlice {
  origin: string;
  destination: string;
  durationMinutes: number;
  segments: FlightSegment[];
}

export interface FlightOffer {
  id: string;
  amount: number;
  currency: string;
  airline: string;
  airlineCode: string;
  cabinClass: string;
  stops: number;
  durationMinutes: number;
  departingAt: string;
  arrivingAt: string;
  slices: FlightSlice[];
  baggageIncluded: boolean;
  refundable: boolean;
  source: string;
  fetchedAt: string;
}

export interface FlightSearchPayload {
  tripType: 'one_way' | 'round_trip';
  origin: string;
  destination: string;
  departDateStart: string;
  returnDateStart?: string;
  cabinClass: 'economy' | 'premium_economy' | 'business' | 'first';
  adults: number;
  children: number;
  infants: number;
  currency: 'INR' | 'USD' | 'EUR';
  limit?: number;
}

export interface FlightSearchResult {
  offers: FlightOffer[];
  meta: {
    cached: boolean;
    fetchedAt: string;
    cheapest: number;
    currency: string;
  };
}

export async function searchFlights(payload: FlightSearchPayload): Promise<FlightSearchResult> {
  const response = await apiClient.post<FlightSearchResult>('/flights/search', payload);
  return response.data;
}

export interface TrackerLivePrice {
  amount: number;
  currency: string;
  airline?: string;
  /** False when the backend served the last observed price instead of a fresh one. */
  live: boolean;
  fetchedAt: string;
  baselinePrice?: number;
  priceDropAmount?: number;
  note?: string;
}

/** Live cheapest fare for a saved tracker. */
export async function getTrackerPrice(trackerId: string): Promise<TrackerLivePrice> {
  const response = await apiClient.get<TrackerLivePrice>(`/trackers/${trackerId}/price`);
  return response.data;
}

export interface BudgetStatus {
  used: number;
  limit: number;
  remaining: number;
  estimatedSpendUsd: number;
  exhausted: boolean;
}

export async function getSearchBudget(): Promise<BudgetStatus> {
  const response = await apiClient.get<BudgetStatus>('/flights/budget');
  return response.data;
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export interface PriceTrend {
  trackerId: string;
  trend: 'increasing' | 'decreasing' | 'stable';
  direction: number;
  percentChange: number;
  bestPrice: number;
  worstPrice: number;
  averagePrice: number;
  volatility: number;
  predictedPrice: number;
  /** 0–1. Low when there isn't enough history yet to say anything useful. */
  confidence: number;
}

export interface BookingAdvice {
  recommendedDate: string;
  expectedPrice: number;
  reason: string;
}

/**
 * Trend and booking guidance for a tracker. This is the "wait vs book now"
 * decision support the product is built around — the endpoints existed from
 * the start but nothing in the app called them.
 */
export async function getTrackerTrend(trackerId: string): Promise<PriceTrend> {
  const response = await apiClient.get<{ data: PriceTrend }>(
    `/predictions/tracker/${trackerId}/trend`
  );
  return response.data.data;
}

export async function getBookingAdvice(trackerId: string): Promise<BookingAdvice> {
  const response = await apiClient.get<{ data: BookingAdvice }>(
    `/predictions/tracker/${trackerId}/best-time`
  );
  return response.data.data;
}
