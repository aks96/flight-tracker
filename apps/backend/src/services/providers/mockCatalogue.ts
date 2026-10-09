/**
 * Reference data for the mock price provider. Deliberately broad so testing
 * covers domestic and long-haul, low-cost and full-service, and every cabin.
 */

export interface MockAirline {
  code: string;
  name: string;
  /** Fare multiplier relative to the route's base fare. */
  priceFactor: number;
  lowCost: boolean;
  /** Regions this carrier plausibly serves, for route filtering. */
  regions: string[];
}

export const AIRLINES: MockAirline[] = [
  { code: '6E', name: 'IndiGo', priceFactor: 0.86, lowCost: true, regions: ['IN', 'AE', 'SG', 'TH', 'LK', 'NP'] },
  { code: 'AI', name: 'Air India', priceFactor: 1.05, lowCost: false, regions: ['IN', 'AE', 'GB', 'US', 'SG', 'TH', 'DE', 'AU'] },
  { code: 'UK', name: 'Vistara', priceFactor: 1.12, lowCost: false, regions: ['IN', 'AE', 'SG', 'TH', 'GB'] },
  { code: 'SG', name: 'SpiceJet', priceFactor: 0.82, lowCost: true, regions: ['IN', 'AE', 'LK', 'NP'] },
  { code: 'QP', name: 'Akasa Air', priceFactor: 0.88, lowCost: true, regions: ['IN', 'AE'] },
  { code: 'EK', name: 'Emirates', priceFactor: 1.32, lowCost: false, regions: ['AE', 'IN', 'GB', 'US', 'SG', 'DE', 'AU', 'FR'] },
  { code: 'QR', name: 'Qatar Airways', priceFactor: 1.28, lowCost: false, regions: ['QA', 'IN', 'GB', 'US', 'DE', 'FR', 'AU', 'SG'] },
  { code: 'EY', name: 'Etihad Airways', priceFactor: 1.22, lowCost: false, regions: ['AE', 'IN', 'GB', 'US', 'DE'] },
  { code: 'SQ', name: 'Singapore Airlines', priceFactor: 1.35, lowCost: false, regions: ['SG', 'IN', 'GB', 'US', 'AU', 'TH'] },
  { code: 'BA', name: 'British Airways', priceFactor: 1.30, lowCost: false, regions: ['GB', 'IN', 'US', 'DE', 'FR', 'AE'] },
  { code: 'LH', name: 'Lufthansa', priceFactor: 1.26, lowCost: false, regions: ['DE', 'IN', 'GB', 'US', 'FR'] },
  { code: 'AF', name: 'Air France', priceFactor: 1.24, lowCost: false, regions: ['FR', 'IN', 'US', 'GB', 'DE'] },
  { code: 'TG', name: 'Thai Airways', priceFactor: 1.10, lowCost: false, regions: ['TH', 'IN', 'SG', 'AU'] },
  { code: 'UL', name: 'SriLankan Airlines', priceFactor: 0.95, lowCost: false, regions: ['LK', 'IN', 'AE', 'GB'] },
  { code: 'FZ', name: 'flydubai', priceFactor: 0.90, lowCost: true, regions: ['AE', 'IN', 'LK', 'NP'] },
  { code: 'AA', name: 'American Airlines', priceFactor: 1.20, lowCost: false, regions: ['US', 'GB', 'DE', 'FR'] },
  { code: 'UA', name: 'United Airlines', priceFactor: 1.18, lowCost: false, regions: ['US', 'GB', 'DE', 'IN'] },
  { code: 'DL', name: 'Delta Air Lines', priceFactor: 1.19, lowCost: false, regions: ['US', 'GB', 'FR', 'DE'] },
  { code: 'QF', name: 'Qantas', priceFactor: 1.33, lowCost: false, regions: ['AU', 'SG', 'GB', 'US', 'IN'] },
  { code: 'MH', name: 'Malaysia Airlines', priceFactor: 1.02, lowCost: false, regions: ['MY', 'IN', 'SG', 'AU', 'TH', 'JP', 'CN'] },
  // Asia-Pacific carriers, for the region the product actually serves.
  { code: 'JL', name: 'Japan Airlines', priceFactor: 1.30, lowCost: false, regions: ['JP', 'IN', 'SG', 'TH', 'CN', 'KR', 'HK', 'TW', 'PH', 'VN'] },
  { code: 'NH', name: 'ANA', priceFactor: 1.31, lowCost: false, regions: ['JP', 'IN', 'SG', 'TH', 'CN', 'KR', 'HK', 'TW', 'PH', 'VN'] },
  { code: 'CA', name: 'Air China', priceFactor: 1.08, lowCost: false, regions: ['CN', 'IN', 'TH', 'JP', 'KR', 'SG', 'HK', 'MY', 'VN'] },
  { code: 'MU', name: 'China Eastern', priceFactor: 1.03, lowCost: false, regions: ['CN', 'IN', 'TH', 'JP', 'KR', 'SG', 'HK', 'VN', 'KH'] },
  { code: 'CZ', name: 'China Southern', priceFactor: 1.02, lowCost: false, regions: ['CN', 'IN', 'TH', 'JP', 'KR', 'SG', 'MY', 'VN', 'PH'] },
  { code: 'CX', name: 'Cathay Pacific', priceFactor: 1.24, lowCost: false, regions: ['HK', 'IN', 'SG', 'TH', 'JP', 'CN', 'KR', 'TW', 'PH', 'VN', 'MY'] },
  { code: 'KE', name: 'Korean Air', priceFactor: 1.21, lowCost: false, regions: ['KR', 'IN', 'JP', 'CN', 'TH', 'SG', 'HK', 'VN', 'PH'] },
  { code: 'OZ', name: 'Asiana Airlines', priceFactor: 1.16, lowCost: false, regions: ['KR', 'IN', 'JP', 'CN', 'TH', 'SG', 'VN', 'PH'] },
  { code: 'BR', name: 'EVA Air', priceFactor: 1.18, lowCost: false, regions: ['TW', 'IN', 'JP', 'SG', 'TH', 'KR', 'HK', 'VN', 'PH'] },
  { code: 'CI', name: 'China Airlines', priceFactor: 1.12, lowCost: false, regions: ['TW', 'IN', 'JP', 'SG', 'TH', 'KR', 'HK', 'VN'] },
  { code: 'VN', name: 'Vietnam Airlines', priceFactor: 1.00, lowCost: false, regions: ['VN', 'IN', 'TH', 'JP', 'KR', 'SG', 'MY', 'KH', 'CN'] },
  { code: 'GA', name: 'Garuda Indonesia', priceFactor: 1.06, lowCost: false, regions: ['ID', 'IN', 'SG', 'TH', 'MY', 'JP', 'KR', 'CN'] },
  { code: 'PR', name: 'Philippine Airlines', priceFactor: 1.04, lowCost: false, regions: ['PH', 'IN', 'SG', 'JP', 'KR', 'HK', 'TH', 'CN'] },
  { code: 'AK', name: 'AirAsia', priceFactor: 0.74, lowCost: true, regions: ['MY', 'TH', 'IN', 'SG', 'ID', 'VN', 'PH', 'KH', 'LK'] },
  { code: 'FD', name: 'Thai AirAsia', priceFactor: 0.76, lowCost: true, regions: ['TH', 'IN', 'MY', 'SG', 'VN', 'KH', 'CN'] },
  { code: 'TR', name: 'Scoot', priceFactor: 0.78, lowCost: true, regions: ['SG', 'IN', 'TH', 'MY', 'ID', 'VN', 'JP', 'CN', 'PH'] },
  { code: 'VJ', name: 'VietJet Air', priceFactor: 0.72, lowCost: true, regions: ['VN', 'IN', 'TH', 'SG', 'MY', 'KR', 'JP'] },
  { code: 'QZ', name: 'Indonesia AirAsia', priceFactor: 0.75, lowCost: true, regions: ['ID', 'MY', 'SG', 'TH', 'IN'] },
  { code: 'UL2', name: 'Bhutan Airlines', priceFactor: 1.14, lowCost: false, regions: ['BT', 'IN', 'NP', 'TH'] },
  { code: 'Q2', name: 'Maldivian', priceFactor: 1.08, lowCost: false, regions: ['MV', 'IN', 'LK', 'AE'] },
  { code: 'K7', name: 'Angkor Air', priceFactor: 0.98, lowCost: false, regions: ['KH', 'TH', 'VN', 'SG', 'CN'] },
];

export interface MockAirport {
  code: string;
  city: string;
  country: string;
  /** Rough coordinates, used to derive distance and therefore a base fare. */
  lat: number;
  lon: number;
}

export const AIRPORTS: MockAirport[] = [
  // India
  { code: 'DEL', city: 'New Delhi', country: 'IN', lat: 28.5562, lon: 77.1000 },
  { code: 'BOM', city: 'Mumbai', country: 'IN', lat: 19.0896, lon: 72.8656 },
  { code: 'BLR', city: 'Bengaluru', country: 'IN', lat: 13.1986, lon: 77.7066 },
  { code: 'MAA', city: 'Chennai', country: 'IN', lat: 12.9941, lon: 80.1709 },
  { code: 'HYD', city: 'Hyderabad', country: 'IN', lat: 17.2403, lon: 78.4294 },
  { code: 'CCU', city: 'Kolkata', country: 'IN', lat: 22.6547, lon: 88.4467 },
  { code: 'GOI', city: 'Goa', country: 'IN', lat: 15.3808, lon: 73.8314 },
  { code: 'PNQ', city: 'Pune', country: 'IN', lat: 18.5793, lon: 73.9089 },
  { code: 'AMD', city: 'Ahmedabad', country: 'IN', lat: 23.0772, lon: 72.6347 },
  { code: 'COK', city: 'Kochi', country: 'IN', lat: 10.1520, lon: 76.4019 },
  { code: 'JAI', city: 'Jaipur', country: 'IN', lat: 26.8242, lon: 75.8122 },
  { code: 'LKO', city: 'Lucknow', country: 'IN', lat: 26.7606, lon: 80.8893 },
  { code: 'SXR', city: 'Srinagar', country: 'IN', lat: 33.9871, lon: 74.7742 },
  { code: 'IXC', city: 'Chandigarh', country: 'IN', lat: 30.6735, lon: 76.7885 },
  { code: 'TRV', city: 'Thiruvananthapuram', country: 'IN', lat: 8.4821, lon: 76.9200 },
  // Middle East
  { code: 'DXB', city: 'Dubai', country: 'AE', lat: 25.2532, lon: 55.3657 },
  { code: 'AUH', city: 'Abu Dhabi', country: 'AE', lat: 24.4330, lon: 54.6511 },
  { code: 'DOH', city: 'Doha', country: 'QA', lat: 25.2731, lon: 51.6081 },
  // Asia-Pacific
  { code: 'SIN', city: 'Singapore', country: 'SG', lat: 1.3644, lon: 103.9915 },
  { code: 'BKK', city: 'Bangkok', country: 'TH', lat: 13.6900, lon: 100.7501 },
  { code: 'KUL', city: 'Kuala Lumpur', country: 'MY', lat: 2.7456, lon: 101.7099 },
  { code: 'CMB', city: 'Colombo', country: 'LK', lat: 7.1808, lon: 79.8841 },
  { code: 'KTM', city: 'Kathmandu', country: 'NP', lat: 27.6966, lon: 85.3591 },
  { code: 'SYD', city: 'Sydney', country: 'AU', lat: -33.9399, lon: 151.1753 },
  { code: 'MEL', city: 'Melbourne', country: 'AU', lat: -37.6690, lon: 144.8410 },
  // East Asia
  { code: 'NRT', city: 'Tokyo', country: 'JP', lat: 35.7647, lon: 140.3864 },
  { code: 'HND', city: 'Tokyo', country: 'JP', lat: 35.5494, lon: 139.7798 },
  { code: 'KIX', city: 'Osaka', country: 'JP', lat: 34.4342, lon: 135.2328 },
  { code: 'CTS', city: 'Sapporo', country: 'JP', lat: 42.7752, lon: 141.6923 },
  { code: 'FUK', city: 'Fukuoka', country: 'JP', lat: 33.5859, lon: 130.4506 },
  { code: 'PEK', city: 'Beijing', country: 'CN', lat: 40.0799, lon: 116.6031 },
  { code: 'PVG', city: 'Shanghai', country: 'CN', lat: 31.1443, lon: 121.8083 },
  { code: 'CAN', city: 'Guangzhou', country: 'CN', lat: 23.3924, lon: 113.2988 },
  { code: 'CTU', city: 'Chengdu', country: 'CN', lat: 30.5785, lon: 103.9471 },
  { code: 'SZX', city: 'Shenzhen', country: 'CN', lat: 22.6393, lon: 113.8108 },
  { code: 'ICN', city: 'Seoul', country: 'KR', lat: 37.4602, lon: 126.4407 },
  { code: 'PUS', city: 'Busan', country: 'KR', lat: 35.1795, lon: 128.9382 },
  { code: 'HKG', city: 'Hong Kong', country: 'HK', lat: 22.3080, lon: 113.9185 },
  { code: 'TPE', city: 'Taipei', country: 'TW', lat: 25.0777, lon: 121.2328 },
  // Southeast Asia
  { code: 'HKT', city: 'Phuket', country: 'TH', lat: 8.1132, lon: 98.3169 },
  { code: 'CNX', city: 'Chiang Mai', country: 'TH', lat: 18.7669, lon: 98.9626 },
  { code: 'DMK', city: 'Bangkok', country: 'TH', lat: 13.9126, lon: 100.6068 },
  { code: 'SGN', city: 'Ho Chi Minh City', country: 'VN', lat: 10.8188, lon: 106.6520 },
  { code: 'HAN', city: 'Hanoi', country: 'VN', lat: 21.2212, lon: 105.8072 },
  { code: 'DAD', city: 'Da Nang', country: 'VN', lat: 16.0439, lon: 108.1993 },
  { code: 'DPS', city: 'Bali', country: 'ID', lat: -8.7482, lon: 115.1672 },
  { code: 'CGK', city: 'Jakarta', country: 'ID', lat: -6.1256, lon: 106.6559 },
  { code: 'MNL', city: 'Manila', country: 'PH', lat: 14.5086, lon: 121.0198 },
  { code: 'CEB', city: 'Cebu', country: 'PH', lat: 10.3075, lon: 123.9791 },
  { code: 'PEN', city: 'Penang', country: 'MY', lat: 5.2971, lon: 100.2769 },
  { code: 'REP', city: 'Siem Reap', country: 'KH', lat: 13.4107, lon: 103.8130 },
  { code: 'PNH', city: 'Phnom Penh', country: 'KH', lat: 11.5466, lon: 104.8442 },
  // South Asia / Indian Ocean
  { code: 'MLE', city: 'Male', country: 'MV', lat: 4.1918, lon: 73.5291 },
  { code: 'PBH', city: 'Paro', country: 'BT', lat: 27.4032, lon: 89.4246 },
  // Europe
  { code: 'LHR', city: 'London', country: 'GB', lat: 51.4700, lon: -0.4543 },
  { code: 'LGW', city: 'London', country: 'GB', lat: 51.1537, lon: -0.1821 },
  { code: 'CDG', city: 'Paris', country: 'FR', lat: 49.0097, lon: 2.5479 },
  { code: 'FRA', city: 'Frankfurt', country: 'DE', lat: 50.0379, lon: 8.5622 },
  { code: 'MUC', city: 'Munich', country: 'DE', lat: 48.3537, lon: 11.7750 },
  // North America
  { code: 'JFK', city: 'New York', country: 'US', lat: 40.6413, lon: -73.7781 },
  { code: 'EWR', city: 'Newark', country: 'US', lat: 40.6895, lon: -74.1745 },
  { code: 'SFO', city: 'San Francisco', country: 'US', lat: 37.6213, lon: -122.3790 },
  { code: 'ORD', city: 'Chicago', country: 'US', lat: 41.9742, lon: -87.9073 },
  { code: 'LAX', city: 'Los Angeles', country: 'US', lat: 33.9416, lon: -118.4085 },
];

const AIRPORTS_BY_CODE = new Map(AIRPORTS.map((airport) => [airport.code, airport]));

export function getMockAirport(code: string): MockAirport | undefined {
  return AIRPORTS_BY_CODE.get(code.toUpperCase());
}

/** Great-circle distance in km. */
export function distanceKm(from: MockAirport, to: MockAirport): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(to.lat - from.lat);
  const dLon = toRad(to.lon - from.lon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Per-currency base rate per km, plus a fixed component. */
export const CURRENCY_MODEL: Record<string, { perKm: number; base: number }> = {
  INR: { perKm: 4.6, base: 1800 },
  USD: { perKm: 0.055, base: 22 },
  EUR: { perKm: 0.051, base: 20 },
};

export const CABIN_MULTIPLIER: Record<string, number> = {
  economy: 1,
  premium_economy: 1.7,
  business: 3.4,
  first: 5.6,
};
