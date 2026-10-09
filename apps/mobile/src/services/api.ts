import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import SecureStore from '../utils/secureStorage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Called when the session can no longer be recovered, so the auth store can
 * clear itself and the app can return to the login screen. Previously the
 * interceptor wiped the tokens but left the store believing it was still
 * authenticated, stranding the user on a dashboard where every request failed.
 */
type SessionExpiredHandler = () => void;
let onSessionExpired: SessionExpiredHandler | null = null;

export function setSessionExpiredHandler(handler: SessionExpiredHandler | null): void {
  onSessionExpired = handler;
}

apiClient.interceptors.request.use(
  async (config) => {
    try {
      const token = await SecureStore.getItemAsync('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.warn('Error retrieving access token', error);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * A single in-flight refresh shared by every 401'd request. The dashboard
 * fires several requests at once on load; without this, each one started its
 * own refresh, and because the backend now *rotates* refresh tokens, the
 * losers of that race would immediately invalidate the winner's token and log
 * the user out.
 */
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = await SecureStore.getItemAsync('refreshToken');
  if (!refreshToken) {
    throw new Error('No refresh token');
  }

  // Bare axios, not apiClient — otherwise a failing refresh would recurse
  // through this same interceptor.
  const response = await axios.post(
    `${API_BASE_URL}/auth/refresh`,
    { refreshToken },
    { timeout: 20000 }
  );

  const { accessToken, refreshToken: rotatedToken } = response.data;
  await SecureStore.setItemAsync('accessToken', accessToken);

  // The backend rotates the refresh token on every use; storing the new one is
  // mandatory, or the next refresh presents a revoked token and is treated as
  // a replay.
  if (rotatedToken) {
    await SecureStore.setItemAsync('refreshToken', rotatedToken);
  }

  return accessToken;
}

async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync('accessToken');
  await SecureStore.deleteItemAsync('refreshToken');
  onSessionExpired?.();
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status !== 401 || !originalRequest || originalRequest._retry) {
      return Promise.reject(error);
    }

    // A 401 from the refresh endpoint itself is unrecoverable.
    if (originalRequest.url?.includes('/auth/refresh')) {
      await clearSession();
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }

      const accessToken = await refreshPromise;
      originalRequest.headers.Authorization = `Bearer ${accessToken}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      await clearSession();
      return Promise.reject(refreshError);
    }
  }
);

export default apiClient;
