export interface Tracker {
  id: string;
  userId: string;
  tripType: 'one_way' | 'round_trip';
  origin: string;
  destination: string;
  departDateStart: string;
  departDateEnd: string;
  returnDateStart?: string;
  returnDateEnd?: string;
  cabinClass: 'economy' | 'premium_economy' | 'business' | 'first';
  adults: number;
  children: number;
  infants: number;
  currency: 'INR' | 'USD' | 'EUR';
  baselinePrice: number;
  priceDropAmount: number;
  status: 'active' | 'paused' | 'expired';
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  preferredCurrency: string;
  createdAt: string;
  updatedAt: string;
}

export interface PushNotification {
  trackerId: string;
  route: string;
  currentPrice: number;
  priceDropped: number;
  currency: string;
}
