import { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, BackHandler, Platform, Linking } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/auth';
import { ToastProvider, ConfirmProvider, BlinkingCursor } from '@/components/ui';
import { colors } from '@/theme';
import LoginScreen from '@/screens/LoginScreen';
import SignupScreen from '@/screens/SignupScreen';
import DashboardScreen from '@/screens/DashboardScreen';
import CreateTrackerScreen from '@/screens/CreateTrackerScreen';
import TrackerDetailScreen from '@/screens/TrackerDetailScreen';
import SettingsScreen from '@/screens/SettingsScreen';
import FlightSearchScreen, { FlightSearchPrefill } from '@/screens/FlightSearchScreen';
import ForgotPasswordScreen from '@/screens/ForgotPasswordScreen';
import ResetPasswordScreen from '@/screens/ResetPasswordScreen';
import { addNotificationListeners } from '@/services/notifications';

type Screen =
  | 'login'
  | 'signup'
  | 'forgotPassword'
  | 'resetPassword'
  | 'dashboard'
  | 'flightSearch'
  | 'createTracker'
  | 'trackerDetail'
  | 'settings';

interface NavigationState {
  currentScreen: Screen;
  selectedTrackerId?: string;
}

function AppShell() {
  const { isAuthenticated, checkAuth, isCheckingAuth } = useAuthStore();
  const [navState, setNavState] = useState<NavigationState>({
    currentScreen: 'login',
  });
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    // Check if user is already logged in
    checkAuth().finally(() => {
      setAppReady(true);
    });
  }, []);

  useEffect(() => {
    if (appReady) {
      if (isAuthenticated) {
        setNavState({ currentScreen: 'dashboard' });
      } else {
        setNavState({ currentScreen: 'login' });
      }
    }
  }, [isAuthenticated, appReady]);

  const navigate = useCallback((screen: Screen, selectedTrackerId?: string) => {
    setNavState({ currentScreen: screen, selectedTrackerId });
  }, []);

  // A tracker prefilled from a flight the user picked in search, handed to the
  // create-tracker form so the baseline is a fare they actually saw.
  const [trackerPrefill, setTrackerPrefill] = useState<FlightSearchPrefill | null>(null);
  // Token carried by the emailed watchmyfares://reset-password?token=... link.
  const [resetToken, setResetToken] = useState<string | null>(null);

  const goBack = useCallback(() => {
    setNavState((current) =>
      current.currentScreen === 'createTracker' ||
      current.currentScreen === 'trackerDetail' ||
      current.currentScreen === 'settings' ||
      current.currentScreen === 'flightSearch'
        ? { currentScreen: 'dashboard' }
        : current
    );
  }, []);

  const handleTrackFlight = useCallback((prefill: FlightSearchPrefill) => {
    setTrackerPrefill(prefill);
    setNavState({ currentScreen: 'createTracker' });
  }, []);

  // Deep links. The password-reset email is the only flow that depends on one,
  // and without this handler the emailed link opened the app on the login
  // screen with the token silently discarded.
  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) return;
      try {
        const parsed = new URL(url);
        if (parsed.hostname !== 'reset-password' && !parsed.pathname.includes('reset-password')) {
          return;
        }
        const token = parsed.searchParams.get('token');
        if (token) {
          setResetToken(token);
          setNavState({ currentScreen: 'resetPassword' });
        }
      } catch {
        // A malformed link should be ignored, not crash the app on launch.
      }
    };

    // Cold start: the URL that launched the app isn't delivered to the listener.
    Linking.getInitialURL().then(handleUrl).catch(() => undefined);

    const subscription = Linking.addEventListener('url', (event) => handleUrl(event.url));
    return () => subscription.remove();
  }, []);

  // A tapped price-drop alert must land on the tracker it's about, not just
  // open the app. The backend puts trackerId in the notification payload;
  // this is what consumes it. Held in a ref so the pending target survives
  // the auth check that runs on a cold start.
  const pendingTrackerId = useRef<string | null>(null);

  const openTracker = useCallback(
    (trackerId: string) => {
      if (isAuthenticated) {
        navigate('trackerDetail', trackerId);
      } else {
        // Arrived before the session was restored — replay once logged in.
        pendingTrackerId.current = trackerId;
      }
    },
    [isAuthenticated, navigate]
  );

  useEffect(() => addNotificationListeners(openTracker), [openTracker]);

  useEffect(() => {
    if (appReady && isAuthenticated && pendingTrackerId.current) {
      const trackerId = pendingTrackerId.current;
      pendingTrackerId.current = null;
      navigate('trackerDetail', trackerId);
    }
  }, [appReady, isAuthenticated, navigate]);

  // Android's hardware back button did nothing on the detail/create/settings
  // screens, so the only way out was the on-screen control — and pressing back
  // exited the app instead.
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const screen = navState.currentScreen;
      if (
        screen === 'createTracker' ||
        screen === 'trackerDetail' ||
        screen === 'settings' ||
        screen === 'flightSearch'
      ) {
        goBack();
        return true;
      }
      if (screen === 'forgotPassword' || screen === 'resetPassword') {
        navigate('login');
        return true;
      }
      return false;
    });

    return () => subscription.remove();
  }, [navState.currentScreen, goBack]);

  if (!appReady || isCheckingAuth) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="light" />
        <View style={styles.loadingBrand}>
          <View style={styles.loadingBrandRow}>
            <Ionicons name="airplane" size={22} color={colors.primary} />
            <Text style={styles.loadingBrandText}>flight_tracker</Text>
            <BlinkingCursor size={16} />
          </View>
          <Text style={styles.loadingSubtext}>booting session...</Text>
        </View>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {navState.currentScreen === 'login' && (
        <LoginScreen onNavigate={navigate} />
      )}
      {navState.currentScreen === 'signup' && (
        <SignupScreen onNavigate={navigate} />
      )}
      {navState.currentScreen === 'forgotPassword' && (
        <ForgotPasswordScreen onGoBack={() => navigate('login')} />
      )}
      {navState.currentScreen === 'resetPassword' && (
        <ResetPasswordScreen
          token={resetToken ?? ''}
          onDone={() => {
            setResetToken(null);
            navigate('login');
          }}
          onGoBack={() => {
            setResetToken(null);
            navigate('login');
          }}
        />
      )}
      {navState.currentScreen === 'dashboard' && (
        <DashboardScreen onNavigate={navigate} />
      )}
      {navState.currentScreen === 'flightSearch' && (
        <FlightSearchScreen onGoBack={goBack} onTrackFlight={handleTrackFlight} />
      )}
      {navState.currentScreen === 'createTracker' && (
        <CreateTrackerScreen
          onNavigate={navigate}
          onGoBack={goBack}
          prefill={trackerPrefill}
          onPrefillConsumed={() => setTrackerPrefill(null)}
        />
      )}
      {navState.currentScreen === 'trackerDetail' && (
        <TrackerDetailScreen trackerId={navState.selectedTrackerId} onNavigate={navigate} onGoBack={goBack} />
      )}
      {navState.currentScreen === 'settings' && (
        <SettingsScreen onNavigate={navigate} onGoBack={goBack} />
      )}
    </View>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AppShell />
      </ConfirmProvider>
    </ToastProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    gap: 24,
  },
  loadingBrand: {
    alignItems: 'center',
    gap: 8,
  },
  loadingBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingBrandText: {
    fontFamily: 'monospace',
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  loadingSubtext: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: colors.inkMuted,
  },
});
