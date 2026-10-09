import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import apiClient from './api';

/**
 * Push registration — the client half of the alert pipeline.
 *
 * The backend has always had a devices table, a registration endpoint and a
 * fan-out path, but nothing in the app ever asked for permission or sent a
 * token, so every price-drop alert found zero devices and fell through to the
 * email fallback. This module closes that loop.
 */

// Foreground behavior: an alert that arrives while the user is looking at the
// app should still surface, since the whole product is time-sensitive.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export interface PriceDropPayload {
  type?: string;
  trackerId?: string;
  oldPrice?: string;
  newPrice?: string;
  currency?: string;
}

/**
 * Android requires an explicit channel for anything to be delivered with a
 * sound or heads-up presentation; without one, alerts arrive silently.
 */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('price-alerts', {
    name: 'Price Alerts',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
  });
}

function resolveProjectId(): string | undefined {
  // EAS builds inject this; a bare `expo start` may not have it.
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as any).easConfig?.projectId ??
    undefined
  );
}

/**
 * Ask for permission and return an Expo push token, or null if unavailable.
 * Never throws — a device that declines notifications must still be able to
 * use the app (the backend falls back to email).
 */
export async function getPushToken(): Promise<string | null> {
  if (!Device.isDevice) {
    // Simulators can't receive push; not an error worth surfacing.
    return null;
  }

  try {
    await ensureAndroidChannel();

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;

    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }

    if (status !== 'granted') {
      return null;
    }

    const projectId = resolveProjectId();
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return token.data;
  } catch (error) {
    console.warn('Push token registration failed', error);
    return null;
  }
}

/**
 * Register this device with the backend so alerts can reach it. Call after
 * login and on every app start while authenticated — the token can change
 * (reinstall, restore to a new device), and re-registering refreshes
 * last_ping, which is how the backend spots dormant devices.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  const token = await getPushToken();
  if (!token) return null;

  try {
    await apiClient.post('/devices/register', {
      pushToken: token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    return token;
  } catch (error) {
    // A failed registration must not block the user from reaching the app.
    console.warn('Failed to register device for push notifications', error);
    return null;
  }
}

/** Best-effort deregistration on logout, so alerts stop reaching this device. */
export async function unregisterPushNotifications(): Promise<void> {
  try {
    const devices = await apiClient.get('/devices');
    const token = await Notifications.getExpoPushTokenAsync().catch(() => null);
    const match = devices.data?.data?.find((d: any) => d.pushToken === token?.data);
    if (match) {
      await apiClient.delete(`/devices/${match.id}`);
    }
  } catch {
    // Logging out locally is what matters; the backend prunes dead tokens via
    // Expo receipts anyway.
  }
}

/**
 * Wire up notification taps. `onOpenTracker` receives the tracker id from the
 * payload the backend attaches, which is what makes an alert actionable
 * instead of just informational.
 */
export function addNotificationListeners(onOpenTracker: (trackerId: string) => void): () => void {
  const handle = (payload: PriceDropPayload | undefined) => {
    if (payload?.trackerId) {
      onOpenTracker(payload.trackerId);
    }
  };

  // Tapped while the app was running (foreground or background).
  const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
    handle(response.notification.request.content.data as PriceDropPayload);
  });

  // Tapped while the app was fully closed — the response that launched the app
  // isn't delivered to the listener above.
  Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (response) handle(response.notification.request.content.data as PriceDropPayload);
    })
    .catch(() => undefined);

  return () => {
    responseSub.remove();
  };
}
