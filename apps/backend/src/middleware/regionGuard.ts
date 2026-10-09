import { getAirport, isSupportedAirport } from '@/data/airports.js';

export interface RegionCheck {
  ok: boolean;
  error?: string;
}

/**
 * Reject routes outside the supported region before a search is attempted.
 * Enforced server-side rather than only in the picker, since the client can be
 * bypassed and every accepted route costs budget.
 */
export function checkRoute(origin: string, destination: string): RegionCheck {
  for (const [label, code] of [
    ['Origin', origin],
    ['Destination', destination],
  ] as const) {
    if (!getAirport(code)) {
      return { ok: false, error: `${label} ${code} is not a recognised airport` };
    }
    if (!isSupportedAirport(code)) {
      return {
        ok: false,
        error: `${label} ${code} is outside the supported region — India and nearby Asian destinations only`,
      };
    }
  }

  return { ok: true };
}
