import React, { useCallback, useState } from 'react';
import { View, StyleSheet, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTrackerStore } from '@/store/tracker';
import { useAuthStore } from '@/store/auth';
import { Tracker } from '@/types/index';
import { Badge, Button, Card, EmptyState, LiveIndicator, useConfirm, useToast } from '@/components/ui';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { getTrackerPrice, TrackerLivePrice } from '@/services/flights';
import { colors, radius, spacing, type } from '@/theme';

// How often the dashboard silently re-fetches trackers in the background. The
// backend's price-check scheduler runs independently on its own tiered
// interval; this just keeps what's on screen from going stale.
//
// Deliberately slower than it looks: live prices come from a separate,
// Redis-cached endpoint, so this refresh costs nothing against the search
// budget while cached, and the cache TTL — not this interval — governs how
// often a real search happens.
const REFRESH_INTERVAL_MS = 60000;

interface DashboardScreenProps {
  onNavigate: (
    screen: 'createTracker' | 'trackerDetail' | 'settings' | 'flightSearch',
    trackerId?: string
  ) => void;
}

const CURRENCY_SYMBOL: Record<string, string> = { INR: '₹', USD: '$', EUR: '€' };

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function DashboardScreen({ onNavigate }: DashboardScreenProps) {
  const { trackers, isLoading, fetchTrackers } = useTrackerStore();
  const { user, logout } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);
  // Live cheapest fare per tracker, keyed by tracker id. The card used to show
  // `baselinePrice` — a stored column that only changes when an alert fires —
  // under a "live" indicator, so an unchanged tracker displayed the same
  // number indefinitely while implying it was current.
  const [livePrices, setLivePrices] = useState<Record<string, TrackerLivePrice>>({});
  const toast = useToast();
  const confirm = useConfirm();

  const loadTrackers = useCallback(async () => {
    try {
      await fetchTrackers();
    } catch (err) {
      toast.error('Failed to load trackers');
    }
  }, [fetchTrackers, toast]);

  const { secondsAgo } = useAutoRefresh(loadTrackers, REFRESH_INTERVAL_MS);

  // Fetch live prices for whatever is on screen. Each call is served from the
  // backend's Redis cache unless it has expired, so this does not scale the
  // Duffel bill with how often the dashboard is opened.
  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      const results = await Promise.all(
        trackers.map(async (tracker) => {
          try {
            return [tracker.id, await getTrackerPrice(tracker.id)] as const;
          } catch {
            // A tracker with no available fare just keeps its stored value.
            return null;
          }
        })
      );

      if (cancelled) return;
      setLivePrices((current) => {
        const next = { ...current };
        for (const entry of results) {
          if (entry) next[entry[0]] = entry[1];
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [trackers]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTrackers();
    setRefreshing(false);
  };

  const handleLogout = async () => {
    const ok = await confirm({
      title: 'Log Out',
      message: 'Are you sure you want to log out?',
      confirmLabel: 'Log Out',
      destructive: true,
    });
    if (ok) await logout();
  };

  const renderTracker = ({ item }: { item: Tracker }) => {
    const symbol = CURRENCY_SYMBOL[item.currency] || item.currency;
    const isActive = item.status === 'active';
    const live = livePrices[item.id];
    const displayPrice = live ? live.amount : Number(item.baselinePrice);
    // Only claim a price is live when the backend says it actually fetched one.
    const isLive = Boolean(live?.live);
    const baseline = Number(item.baselinePrice);
    const delta = live ? live.amount - baseline : 0;

    return (
      <TouchableOpacity activeOpacity={0.7} onPress={() => onNavigate('trackerDetail', item.id)}>
        <Card style={styles.trackerCard}>
          <View style={styles.cardTopRow}>
            <View style={styles.routeRow}>
              <Text style={styles.route}>{item.origin}</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.inkFaint} style={styles.routeArrow} />
              <Text style={styles.route}>{item.destination}</Text>
            </View>
            <Badge
              label={isActive ? 'TRACKING' : 'PAUSED'}
              tone={isActive ? 'success' : 'warning'}
              icon={isActive ? undefined : 'pause'}
              pulse={isActive}
            />
          </View>

          <Text style={styles.dates}>
            {formatDate(item.departDateStart as any)} – {formatDate(item.departDateEnd as any)}
          </Text>

          <View style={styles.cardBottomRow}>
            <View style={styles.priceBlock}>
              <Text style={styles.price}>
                {symbol}
                {Math.round(displayPrice).toLocaleString()}
              </Text>
              <Text style={styles.priceLabel}>
                {isLive ? 'live' : live ? 'last seen' : 'baseline'}
              </Text>
              {live && delta !== 0 && (
                <Text style={[styles.delta, delta < 0 ? styles.deltaDown : styles.deltaUp]}>
                  {delta < 0 ? '▼' : '▲'} {symbol}
                  {Math.abs(Math.round(delta)).toLocaleString()}
                </Text>
              )}
            </View>
            <View style={styles.dropChip}>
              <Ionicons name="trending-down" size={12} color={colors.primary} />
              <Text style={styles.dropText}>
                Alert at {symbol}
                {Number(item.priceDropAmount).toLocaleString()} drop
              </Text>
            </View>
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome back</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <View style={styles.liveRow}>
            <LiveIndicator secondsAgo={secondsAgo} />
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => onNavigate('flightSearch')}
            hitSlop={8}
          >
            <Ionicons name="search" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={() => onNavigate('settings')} hitSlop={8}>
            <Ionicons name="settings-outline" size={20} color={colors.ink} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={handleLogout} hitSlop={8}>
            <Ionicons name="log-out-outline" size={20} color={colors.inkMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {trackers.length === 0 && !isLoading ? (
        <EmptyState
          icon="airplane-outline"
          title="No trackers yet"
          message="Search flights to see live fares, then track the one you want."
          actionLabel="Search Flights"
          onAction={() => onNavigate('flightSearch')}
        />
      ) : (
        <FlatList
          data={trackers}
          renderItem={renderTracker}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListHeaderComponent={
            <Button
              label="New Tracker"
              onPress={() => onNavigate('createTracker')}
              icon={<Ionicons name="add" size={18} color={colors.white} />}
              style={styles.newTrackerButton}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  greeting: {
    ...type.h1,
    color: colors.ink,
  },
  email: {
    ...type.small,
    color: colors.inkMuted,
    marginTop: 2,
  },
  liveRow: {
    marginTop: spacing.xs,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: spacing.md,
  },
  newTrackerButton: {
    marginBottom: spacing.md,
  },
  trackerCard: {
    marginBottom: spacing.sm,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xxs,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  route: {
    ...type.h2,
    color: colors.ink,
  },
  routeArrow: {
    marginHorizontal: 6,
  },
  dates: {
    ...type.small,
    color: colors.inkMuted,
    marginBottom: spacing.sm,
  },
  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceBlock: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xxs },
  priceLabel: { ...type.micro, color: colors.inkFaint, textTransform: 'uppercase' },
  delta: { ...type.micro },
  deltaDown: { color: colors.success },
  deltaUp: { color: colors.danger },
  price: {
    fontFamily: 'monospace',
    fontSize: 22,
    fontWeight: '800',
    color: colors.success,
  },
  dropChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.xs,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  dropText: {
    ...type.micro,
    color: colors.primaryDark,
    fontWeight: '700',
  },
});
