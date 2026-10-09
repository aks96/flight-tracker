// Manual smoke test of the search path with the mock provider. No database or
// Redis required — the cache and budget layers both degrade gracefully.
//   PRICE_PROVIDER=mock npx tsx scripts/smoke-search.ts DEL BOM
import { searchFlights } from '../src/services/price.service.js';

const origin = process.argv[2] || 'DEL';
const destination = process.argv[3] || 'BOM';
const depart = process.argv[4] || new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);

const result = await searchFlights(
  {
    tripType: 'one_way',
    origin,
    destination,
    departDateStart: depart,
    cabinClass: 'economy',
    adults: 1,
    children: 0,
    infants: 0,
    currency: 'INR',
  },
  { limit: 8 }
);

console.log(`\n${origin} -> ${destination}  ${depart}   (cached: ${result.cached})\n`);
for (const offer of result.offers) {
  const depart = new Date(offer.departingAt).toISOString().slice(11, 16);
  const arrive = new Date(offer.arrivingAt).toISOString().slice(11, 16);
  const stops = offer.stops === 0 ? 'non-stop' : `${offer.stops} stop`;
  console.log(
    `  ${offer.airlineCode}  ${depart}-${arrive}  ${String(Math.floor(offer.durationMinutes / 60)).padStart(2)}h${String(offer.durationMinutes % 60).padStart(2, '0')}  ${stops.padEnd(9)} ` +
      `${offer.baggageIncluded ? 'bag' : '   '}  ${offer.currency} ${String(Math.round(offer.amount)).padStart(7)}   ${offer.airline}`
  );
}
process.exit(0);
