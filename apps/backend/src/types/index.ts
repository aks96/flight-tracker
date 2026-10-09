// User types
export interface User {
  id: string;
  email: string;
  passwordHash?: string;
  phone?: string;
  preferredCurrency: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Device {
  id: string;
  userId: string;
  pushToken: string;
  platform: 'ios' | 'android';
  isActive: boolean;
  lastActiveAt: Date;
  createdAt: Date;
}

export interface Tracker {
  id: string;
  userId: string;
  tripType: 'one_way' | 'round_trip';
  origin: string;
  destination: string;
  departDateStart: Date;
  departDateEnd: Date;
  returnDateStart?: Date;
  returnDateEnd?: Date;
  cabinClass: 'economy' | 'premium_economy' | 'business' | 'first';
  adults: number;
  children: number;
  infants: number;
  currency: string;
  baselinePrice: number;
  priceDropAmount: number;
  status: 'active' | 'paused' | 'expired';
  createdAt: Date;
  updatedAt: Date;
}

export interface Alert {
  id: string;
  trackerId: string;
  priceAtAlert: number;
  baselineBefore: number;
  channel?: 'push' | 'email';
  deliveryStatus: 'sent' | 'retried' | 'fallback_email' | 'failed';
  detectedAt: Date;
  deliveredAt?: Date;
}

export interface PricePoint {
  time: Date;
  origin: string;
  destination: string;
  departDate: Date;
  returnDate?: Date;
  cabinClass: string;
  price: number;
  currency: string;
  source: string;
}

// Request/Response types
export interface PriceCheckResult {
  trackerId: string;
  currentPrice: number;
  baselinePrice: number;
  priceDropAmount: number;
  hasDropped: boolean;
  percentChange: number;
}

export interface TrendData {
  percentile: number;
  slope: number;
  priceRange: {
    min: number;
    max: number;
  };
  sampleSize: number;
}

export interface AlertPayload {
  trackerId: string;
  userId: string;
  deviceTokens: string[];
  route: string;
  currentPrice: number;
  previousBaselinePrice: number;
  priceDropped: number;
  currency: string;
}
