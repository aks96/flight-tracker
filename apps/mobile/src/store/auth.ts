import { create } from 'zustand';
import { User } from '../types/index';
import * as authService from '../services/auth';
import { setSessionExpiredHandler } from '../services/api';
import { registerForPushNotifications, unregisterPushNotifications } from '../services/notifications';

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  // Separate from isLoading: only true during the one-time app-boot session
  // check. App.tsx's top-level "app not ready yet" gate should watch this,
  // not isLoading — isLoading also flips true/false on every login/signup
  // *button press*, which used to unmount the whole Login/Signup screen
  // behind a full-screen spinner and remount it fresh on completion,
  // wiping out whatever the user had typed.
  isCheckingAuth: boolean;
  error: string | null;

  // Actions
  signup: (email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isCheckingAuth: true,
  error: null,

  signup: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.signup({ email, password });
      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
      });
      // Register for push as soon as there's an account to attach the device
      // to. Fire-and-forget: a declined permission prompt must not fail signup.
      void registerForPushNotifications();
    } catch (error: any) {
      set({
        error: error.response?.data?.error || error.message,
        isLoading: false,
      });
      throw error;
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.login({ email, password });
      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
      });
      void registerForPushNotifications();
    } catch (error: any) {
      set({
        error: error.response?.data?.error || error.message,
        isLoading: false,
      });
      throw error;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      // Stop alerts reaching this device before the token is dropped.
      await unregisterPushNotifications();
      await authService.logout();
    } catch (error: any) {
      // Never strand the user in a logged-in state because the network failed.
      console.warn('Logout cleanup failed', error);
    } finally {
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  deleteAccount: async () => {
    set({ isLoading: true });
    try {
      await authService.deleteAccount();
      set({ user: null, isAuthenticated: false, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.error || error.message,
        isLoading: false,
      });
      throw error;
    }
  },

  checkAuth: async () => {
    set({ isCheckingAuth: true });
    try {
      const tokens = await authService.getStoredTokens();
      if (tokens.accessToken) {
        const user = await authService.getCurrentUser();
        set({
          user,
          isAuthenticated: true,
          isCheckingAuth: false,
        });
        // Re-register on every launch: push tokens rotate on reinstall and on
        // restore to a new device, and this refreshes last_ping.
        void registerForPushNotifications();
      } else {
        set({
          isAuthenticated: false,
          isCheckingAuth: false,
        });
      }
    } catch (error: any) {
      set({
        isAuthenticated: false,
        isCheckingAuth: false,
      });
    }
  },

  clearError: () => set({ error: null }),
}));

// When a refresh finally fails, the API client clears storage and calls this,
// which drops the app back to the login screen instead of leaving it on a
// dashboard whose every request 401s.
setSessionExpiredHandler(() => {
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
});
