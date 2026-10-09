import { create } from 'zustand';
import { Tracker } from '../types/index';
import * as trackerService from '../services/tracker';

interface TrackerStore {
  trackers: Tracker[];
  selectedTracker: Tracker | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchTrackers: () => Promise<void>;
  getTracker: (id: string) => Promise<void>;
  createTracker: (payload: any) => Promise<void>;
  updateTracker: (id: string, payload: any) => Promise<void>;
  deleteTracker: (id: string) => Promise<void>;
  pauseTracker: (id: string) => Promise<void>;
  resumeTracker: (id: string) => Promise<void>;
  clearError: () => void;
  clearSelected: () => void;
}

export const useTrackerStore = create<TrackerStore>((set) => ({
  trackers: [],
  selectedTracker: null,
  isLoading: false,
  error: null,

  fetchTrackers: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await trackerService.getTrackers();
      set({
        trackers: data.trackers,
        isLoading: false,
      });
    } catch (error: any) {
      set({
        error: error.response?.data?.error || error.message,
        isLoading: false,
      });
    }
  },

  getTracker: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const data = await trackerService.getTracker(id);
      set({
        selectedTracker: data.tracker,
        isLoading: false,
      });
    } catch (error: any) {
      set({
        error: error.response?.data?.error || error.message,
        isLoading: false,
      });
    }
  },

  createTracker: async (payload: any) => {
    set({ isLoading: true, error: null });
    try {
      const data = await trackerService.createTracker(payload);
      set((state) => ({
        trackers: [data.tracker, ...state.trackers],
        isLoading: false,
      }));
    } catch (error: any) {
      set({
        error: error.response?.data?.error || error.message,
        isLoading: false,
      });
      throw error;
    }
  },

  updateTracker: async (id: string, payload: any) => {
    set({ isLoading: true, error: null });
    try {
      const data = await trackerService.updateTracker(id, payload);
      set((state) => ({
        trackers: state.trackers.map((t) => (t.id === id ? data.tracker : t)),
        selectedTracker:
          state.selectedTracker?.id === id ? data.tracker : state.selectedTracker,
        isLoading: false,
      }));
    } catch (error: any) {
      set({
        error: error.response?.data?.error || error.message,
        isLoading: false,
      });
      throw error;
    }
  },

  deleteTracker: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await trackerService.deleteTracker(id);
      set((state) => ({
        trackers: state.trackers.filter((t) => t.id !== id),
        isLoading: false,
      }));
    } catch (error: any) {
      set({
        error: error.response?.data?.error || error.message,
        isLoading: false,
      });
      throw error;
    }
  },

  pauseTracker: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const data = await trackerService.pauseTracker(id);
      set((state) => ({
        trackers: state.trackers.map((t) => (t.id === id ? data.tracker : t)),
        isLoading: false,
      }));
    } catch (error: any) {
      set({
        error: error.response?.data?.error || error.message,
        isLoading: false,
      });
      throw error;
    }
  },

  resumeTracker: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const data = await trackerService.resumeTracker(id);
      set((state) => ({
        trackers: state.trackers.map((t) => (t.id === id ? data.tracker : t)),
        isLoading: false,
      }));
    } catch (error: any) {
      set({
        error: error.response?.data?.error || error.message,
        isLoading: false,
      });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
  clearSelected: () => set({ selectedTracker: null }),
}));
