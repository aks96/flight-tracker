import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// expo-secure-store's web shim doesn't implement getValueWithKeyAsync /
// setValueWithKeyAsync at all in this SDK version — calling it on web
// throws "is not a function" rather than degrading gracefully. This only
// matters for local browser preview: the shipped app is native-only (iOS/
// Android via EAS, never a web build — see architecture.md §1), so
// Platform.OS is never 'web' in a real build. This just keeps the web
// preview usable for local dev/testing.
async function getItemAsync(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return window.localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function setItemAsync(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    window.localStorage.setItem(key, value);
    return;
  }
  return SecureStore.setItemAsync(key, value);
}

async function deleteItemAsync(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    window.localStorage.removeItem(key);
    return;
  }
  return SecureStore.deleteItemAsync(key);
}

export default { getItemAsync, setItemAsync, deleteItemAsync };
