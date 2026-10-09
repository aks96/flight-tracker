/**
 * Provider-agnostic shapes. Everything downstream of a price lookup — the
 * scheduler, the alert pipeline, price_history, the search screen — speaks
 * these types only, so swapping the fare source is contained to one directory.
 */

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

/** One priced, orderable itinerary. */
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
  fetchedAt: Date;
}

export interface SearchInput {
  tripType: 'one_way' | 'round_trip';
  origin: string;
  destination: string;
  departDateStart: string | Date;
  returnDateStart?: string | Date | null;
  cabinClass: string;
  adults: number;
  children: number;
  infants: number;
  currency?: string;
}

export interface PriceProvider {
  readonly name: string;
  /**
   * Returns offers sorted cheapest-first. One call to this method equals one
   * billable search, which is what the budget guard counts.
   */
  search(input: SearchInput, limit: number): Promise<FlightOffer[]>;
}
