import raw from './airports.json';
import { config } from '@/config/env.js';

export interface Airport {
  code: string;
  city: string;
  name: string;
  country: string;
}

/**
 * The full OurAirports-derived dataset the mobile app also bundles. Kept whole
 * rather than pre-filtered so the API can tell "that isn't an airport" apart
 * from "that airport is outside the region we serve" — two different mistakes
 * that deserve two different messages.
 *
 * The supported region is India plus nearby Asian destinations. Restricting it
 * is a cost control as much as a scope decision: a route the API refuses can
 * never consume the monthly search budget.
 */
const ALL: Airport[] = raw as Airport[];

const byCode = new Map(ALL.map((airport) => [airport.code, airport]));

export function getAirport(code: string): Airport | undefined {
  return byCode.get(code.toUpperCase());
}

/** Whether this IATA code is inside the supported region. */
export function isSupportedAirport(code: string): boolean {
  const airport = getAirport(code);
  return Boolean(airport && config.region.allowedCountries.includes(airport.country));
}

export function supportedAirports(): Airport[] {
  return ALL.filter((airport) => config.region.allowedCountries.includes(airport.country));
}
