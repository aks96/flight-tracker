import apiClient from './api';
import { Tracker } from '../types/index';

export interface CreateTrackerPayload {
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
}

export async function createTracker(payload: CreateTrackerPayload): Promise<{ tracker: Tracker }> {
  const response = await apiClient.post('/trackers', payload);
  return response.data;
}

export interface QuotePayload {
  tripType: 'one_way' | 'round_trip';
  origin: string;
  destination: string;
  departDateStart: string;
  returnDateStart?: string;
  cabinClass: 'economy' | 'premium_economy' | 'business' | 'first';
  adults: number;
  children: number;
  infants: number;
}

export interface QuoteResult {
  amount: number;
  currency: string;
  airline: string;
}

export async function getQuote(payload: QuotePayload): Promise<QuoteResult> {
  const response = await apiClient.post('/trackers/quote', payload);
  return response.data;
}

export async function getTrackers(): Promise<{ trackers: Tracker[] }> {
  const response = await apiClient.get('/trackers');
  return response.data;
}

export async function getTracker(id: string): Promise<{ tracker: Tracker }> {
  const response = await apiClient.get(`/trackers/${id}`);
  return response.data;
}

export async function updateTracker(
  id: string,
  payload: Partial<CreateTrackerPayload>
): Promise<{ tracker: Tracker }> {
  const response = await apiClient.patch(`/trackers/${id}`, payload);
  return response.data;
}

export async function deleteTracker(id: string): Promise<void> {
  await apiClient.delete(`/trackers/${id}`);
}

export async function pauseTracker(id: string): Promise<{ tracker: Tracker }> {
  const response = await apiClient.post(`/trackers/${id}/pause`);
  return response.data;
}

export async function resumeTracker(id: string): Promise<{ tracker: Tracker }> {
  const response = await apiClient.post(`/trackers/${id}/resume`);
  return response.data;
}
