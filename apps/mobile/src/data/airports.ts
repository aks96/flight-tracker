import raw from './airports.json';

export interface Airport {
  code: string; // 3-letter IATA code, e.g. "DEL"
  city: string; // e.g. "New Delhi"
  name: string; // e.g. "Indira Gandhi International Airport"
  country: string; // ISO 2-letter, e.g. "IN"
}

// ~3,270 airports with scheduled commercial service and an IATA code,
// filtered from OurAirports' public dataset (large_airport + medium_airport,
// scheduled_service=yes). Bundled locally rather than queried from Duffel
// per-keystroke — IATA codes are effectively static reference data, so
// there's no reason to pay a network round trip (or Duffel usage) just to
// resolve "Delhi" -> "DEL" every time someone types in the create-tracker form.
/**
 * Countries the product currently serves: India plus nearby Asian
 * destinations. Kept in sync with ALLOWED_COUNTRIES on the backend — the API
 * rejects anything outside this set with 422, so offering a wider picker would
 * just let people choose routes that fail.
 */
export const SUPPORTED_COUNTRIES = [
  'IN', 'TH', 'JP', 'CN', 'SG', 'MY', 'ID', 'VN',
  'LK', 'NP', 'MV', 'BT', 'KH', 'PH', 'KR', 'HK', 'TW', 'AE',
];

export const AIRPORTS: Airport[] = (raw as Airport[]).filter((airport) =>
  SUPPORTED_COUNTRIES.includes(airport.country)
);

const byCode = new Map(AIRPORTS.map((a) => [a.code, a]));

export function getAirportByCode(code: string): Airport | undefined {
  return byCode.get(code.toUpperCase());
}

/**
 * Ranked search across code / city / airport name. Prefix matches on code or
 * city outrank substring matches, so typing "del" surfaces Delhi before,
 * say, an airport merely named "... Delaware ...".
 */
export function searchAirports(query: string, limit = 8): Airport[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const scored: { airport: Airport; score: number }[] = [];

  for (const airport of AIRPORTS) {
    const code = airport.code.toLowerCase();
    const city = airport.city.toLowerCase();
    const name = airport.name.toLowerCase();

    let score = -1;
    if (code === q) score = 100;
    else if (code.startsWith(q)) score = 90;
    else if (city.startsWith(q)) score = 80;
    else if (city.includes(q)) score = 50;
    else if (name.startsWith(q)) score = 40;
    else if (name.includes(q)) score = 20;

    if (score > 0) scored.push({ airport, score });
  }

  scored.sort((a, b) => b.score - a.score || a.airport.city.localeCompare(b.airport.city));
  return scored.slice(0, limit).map((s) => s.airport);
}
