import { checkRoute } from '../src/middleware/regionGuard.js';
import { isSupportedAirport, supportedAirports } from '../src/data/airports.js';

/**
 * The product covers India and nearby Asian destinations. Enforcing this
 * server-side matters for cost as much as scope: a route the API refuses can
 * never consume the monthly search budget.
 */

describe('supported region', () => {
  it.each(['DEL', 'BOM', 'BLR', 'BKK', 'HKT', 'SIN', 'NRT', 'ICN', 'DPS', 'MLE', 'DXB', 'KTM'])(
    'accepts %s',
    (code) => {
      expect(isSupportedAirport(code)).toBe(true);
    }
  );

  it.each(['LHR', 'JFK', 'CDG', 'SYD', 'LAX', 'FRA'])('rejects %s as out of region', (code) => {
    expect(isSupportedAirport(code)).toBe(false);
  });

  it('covers every configured country', () => {
    const countries = new Set(supportedAirports().map((airport) => airport.country));
    for (const expected of ['IN', 'TH', 'JP', 'CN', 'SG', 'MY', 'ID', 'VN', 'KR', 'MV']) {
      expect(countries.has(expected)).toBe(true);
    }
  });
});

describe('checkRoute', () => {
  it('accepts a domestic Indian route', () => {
    expect(checkRoute('DEL', 'BOM')).toEqual({ ok: true });
  });

  it('accepts India to a supported Asian destination', () => {
    expect(checkRoute('BOM', 'BKK').ok).toBe(true);
    expect(checkRoute('BLR', 'NRT').ok).toBe(true);
  });

  it('rejects a destination outside the region, naming it', () => {
    const result = checkRoute('DEL', 'LHR');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Destination LHR/);
    expect(result.error).toMatch(/outside the supported region/);
  });

  it('rejects an origin outside the region', () => {
    const result = checkRoute('JFK', 'DEL');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Origin JFK/);
  });

  it('rejects an unrecognised airport code', () => {
    const result = checkRoute('ZZZ', 'DEL');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not a recognised airport/);
  });

  it('is case-insensitive', () => {
    expect(checkRoute('del', 'bom').ok).toBe(true);
  });
});
