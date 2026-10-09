import SecureStore from '../utils/secureStorage';
import apiClient from './api';

export interface SignupPayload {
  email: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    preferredCurrency: string;
    createdAt: string;
    updatedAt: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

export async function signup(payload: SignupPayload): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/auth/signup', payload);

  if (response.data.tokens) {
    await SecureStore.setItemAsync('accessToken', response.data.tokens.accessToken);
    await SecureStore.setItemAsync('refreshToken', response.data.tokens.refreshToken);
  }

  return response.data;
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/auth/login', payload);

  if (response.data.tokens) {
    await SecureStore.setItemAsync('accessToken', response.data.tokens.accessToken);
    await SecureStore.setItemAsync('refreshToken', response.data.tokens.refreshToken);
  }

  return response.data;
}

export async function logout(): Promise<void> {
  // Tell the backend to revoke the refresh token before dropping it locally —
  // otherwise the token stays valid for its full lifetime and logging out
  // protects nothing if the device is compromised.
  try {
    const refreshToken = await SecureStore.getItemAsync('refreshToken');
    if (refreshToken) {
      await apiClient.post('/auth/logout', { refreshToken });
    }
  } catch (error) {
    // Local sign-out must succeed regardless of network state.
    console.warn('Failed to revoke refresh token on the server', error);
  }

  await SecureStore.deleteItemAsync('accessToken');
  await SecureStore.deleteItemAsync('refreshToken');
}

export async function requestPasswordReset(email: string): Promise<void> {
  await apiClient.post('/auth/forgot-password', { email });
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await apiClient.post('/auth/reset-password', { token, password });
}

/** Apple requires an in-app account deletion path for any app with signup. */
export async function deleteAccount(): Promise<void> {
  await apiClient.delete('/auth/me');
  await SecureStore.deleteItemAsync('accessToken');
  await SecureStore.deleteItemAsync('refreshToken');
}

export async function getCurrentUser(): Promise<any> {
  const response = await apiClient.get('/auth/me');
  return response.data.user;
}

export async function getStoredTokens(): Promise<{ accessToken?: string; refreshToken?: string }> {
  try {
    // SecureStore.getItemAsync resolves `string | null`; normalize null to
    // undefined to match this function's `{ accessToken?: string }` shape.
    const accessToken = (await SecureStore.getItemAsync('accessToken')) ?? undefined;
    const refreshToken = (await SecureStore.getItemAsync('refreshToken')) ?? undefined;
    return { accessToken, refreshToken };
  } catch (error) {
    console.error('Error retrieving tokens:', error);
    return {};
  }
}
