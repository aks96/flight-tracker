import React, { useState } from 'react';
import { View, StyleSheet, Text, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTrackerStore } from '@/store/tracker';
import { Tracker } from '@/types/index';
import { Badge, Button, Card, LiveIndicator, ScreenHeader, useConfirm, useToast } from '@/components/ui';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import {
  BookingAdvice,
  PriceTrend,
  getBookingAdvice,
  getTrackerPrice,
  getTrackerTrend,
  TrackerLivePrice,
} from '@/services/flights';
import { colors, radius, spacing, type } from '@/theme';

interface TrackerDetailScreenProps {
  trackerId?: string;
  onNavigate: (screen: 'dashboard') => void;
  onGoBack: () => void;
}

const REFRESH_INTERVAL_MS = 15000;

const CURRENCY_SYMBOL: Record<string, string> = { INR: '₹', USD: '$', EUR: '€' };

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function TrackerDetailScreen({ trackerId, onNavigate, onGoBack }: TrackerDetailScreenProps) {
  const { selectedTracker, isLoading, getTracker, pauseTracker, resumeTracker, deleteTracker } =
    useTrackerStore();
  const [actionLoading, setActionLoading] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  // Live cheapest fare, fetched alongside the tracker row. "Current Price"
  // previously rendered `baselinePrice`, which only moves when an alert fires
  // and delivers — so a tracker that never dropped showed a fixed number
  // under a live indicator.
  const [livePrice, setLivePrice] = useState<TrackerLivePrice | null>(null);
  // Trend + booking guidance. architecture.md calls this pairing with the live
  // price the thing that lets a user decide "wait" vs "book now" — the
  // endpoints existed from the start but nothing rendered them.
  const [trend, setTrend] = useState<PriceTrend | null>(null);
  const [advice, setAdvice] = useState<BookingAdvice | null>(null);

  const { secondsAgo } = useAutoRefresh(async () => {
    if (!trackerId) return;
    await getTracker(trackerId);
    try {
      setLivePrice(await getTrackerPrice(trackerId));
    } catch {
      // Leave the previous value in place; the label below degrades honestly.
    }
    try {
      const [nextTrend, nextAdvice] = await Promise.all([
        getTrackerTrend(trackerId),
        getBookingAdvice(trackerId),
      ]);
      setTrend(nextTrend);
      setAdvice(nextAdvice);
    } catch {
      // A brand-new tracker has no history yet; the card simply stays hidden.
    }
  }, REFRESH_INTERVAL_MS);

  if (!trackerId || !selectedTracker) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Tracker" onBack={onGoBack} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  const tracker = selectedTracker as Tracker;
  const symbol = CURRENCY_SYMBOL[tracker.currency] || tracker.currency;
  const isActive = tracker.status === 'active';

  const handleTogglePause = async () => {
    setActionLoading(true);
    try {
      if (isActive) {
        await pauseTracker(tracker.id);
        toast.success('Tracker paused — you won’t get alerts until resumed');
      } else {
        await resumeTracker(tracker.id);
        toast.success('Tracker resumed — alerts are active again');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update tracker');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete Tracker',
      message: `Stop tracking ${tracker.origin} → ${tracker.destination}? This can't be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;

    setActionLoading(true);
    try {
      await deleteTracker(tracker.id);
      toast.success('Tracker deleted');
      onNavigate('dashboard');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete tracker');
      setActionLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={`${tracker.origin} → ${tracker.destination}`} onBack={onGoBack} />
      <View style={styles.liveBar}>
        <LiveIndicator secondsAgo={secondsAgo} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <>
            <Card style={styles.card}>
              <View style={styles.routeSection}>
                <View style={styles.routeRow}>
                  <Text style={styles.route}>{tracker.origin}</Text>
                  <Ionicons name="arrow-forward" size={18} color={colors.inkFaint} style={styles.routeArrow} />
                  <Text style={styles.route}>{tracker.destination}</Text>
                </View>
                <Badge
                  label={isActive ? 'TRACKING ACTIVE' : 'PAUSED'}
                  tone={isActive ? 'success' : 'warning'}
                  icon={isActive ? undefined : 'pause'}
                  pulse={isActive}
                />
              </View>

              <View style={styles.infoGrid}>
                <InfoRow label="Trip Type" value={tracker.tripType === 'round_trip' ? 'Round Trip' : 'One Way'} />
                <InfoRow
                  label="Passengers"
                  value={`${tracker.adults} Adult${tracker.adults !== 1 ? 's' : ''}${
                    tracker.children > 0 ? `, ${tracker.children} Child` : ''
                  }${tracker.infants > 0 ? `, ${tracker.infants} Infant` : ''}`}
                />
                <InfoRow label="Cabin Class" value={tracker.cabinClass.replace('_', ' ')} />
                <InfoRow label="Currency" value={tracker.currency} />
              </View>
            </Card>

            <Card style={styles.card}>
              <Text style={styles.cardTitle}>Travel Dates</Text>
              <View style={styles.dateItem}>
                <Text style={styles.dateLabel}>Departure</Text>
                <Text style={styles.dateValue}>
                  {new Date(tracker.departDateStart).toLocaleDateString()} – {new Date(tracker.departDateEnd).toLocaleDateString()}
                </Text>
              </View>
              {tracker.returnDateStart && (
                <View style={styles.dateItem}>
                  <Text style={styles.dateLabel}>Return</Text>
                  <Text style={styles.dateValue}>
                    {new Date(tracker.returnDateStart).toLocaleDateString()} – {new Date(tracker.returnDateEnd || '').toLocaleDateString()}
                  </Text>
                </View>
              )}
            </Card>

            <Card style={styles.card}>
              <Text style={styles.cardTitle}>Price Monitoring</Text>
              <View style={styles.priceRow}>
                <View style={styles.priceItem}>
                  <Text style={styles.infoLabel}>
                    {livePrice?.live ? 'Current Price (live)' : livePrice ? 'Last Seen Price' : 'Baseline Price'}
                  </Text>
                  <Text style={styles.priceValue}>
                    {symbol}
                    {Math.round(
                      livePrice ? livePrice.amount : Number(tracker.baselinePrice)
                    ).toLocaleString()}
                  </Text>
                  {livePrice && (
                    <Text style={styles.baselineNote}>
                      baseline {symbol}
                      {Number(tracker.baselinePrice).toLocaleString()}
                      {livePrice.airline ? ` · ${livePrice.airline}` : ''}
                    </Text>
                  )}
                </View>
                <View style={styles.priceItem}>
                  <Text style={styles.infoLabel}>Alert Threshold</Text>
                  <Text style={styles.priceValueSmall}>
                    {symbol}
                    {Number(tracker.priceDropAmount).toLocaleString()} drop
                  </Text>
                </View>
              </View>
              <View style={styles.helpBox}>
                <Ionicons name="notifications-outline" size={14} color={colors.primaryDark} />
                <Text style={styles.helpText}>
                  You'll be notified the moment the price drops by {symbol}
                  {Number(tracker.priceDropAmount).toLocaleString()} from the current baseline.
                </Text>
              </View>
            </Card>

            {trend && (
              <Card style={styles.card}>
                <View style={styles.trendHeader}>
                  <Text style={styles.cardTitle}>Price Trend</Text>
                  <Badge
                    label={trend.trend}
                    tone={
                      trend.trend === 'decreasing'
                        ? 'success'
                        : trend.trend === 'increasing'
                          ? 'danger'
                          : 'neutral'
                    }
                    icon={
                      trend.trend === 'decreasing'
                        ? 'trending-down'
                        : trend.trend === 'increasing'
                          ? 'trending-up'
                          : 'remove'
                    }
                  />
                </View>

                <View style={styles.trendStats}>
                  <View style={styles.trendStat}>
                    <Text style={styles.infoLabel}>Best seen</Text>
                    <Text style={styles.trendValue}>
                      {symbol}
                      {Math.round(trend.bestPrice).toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.trendStat}>
                    <Text style={styles.infoLabel}>Average</Text>
                    <Text style={styles.trendValue}>
                      {symbol}
                      {Math.round(trend.averagePrice).toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.trendStat}>
                    <Text style={styles.infoLabel}>Change</Text>
                    <Text
                      style={[
                        styles.trendValue,
                        trend.percentChange < 0 ? styles.trendDown : styles.trendUp,
                      ]}
                    >
                      {trend.percentChange > 0 ? '+' : ''}
                      {trend.percentChange.toFixed(1)}%
                    </Text>
                  </View>
                </View>

                {advice && (
                  <View style={styles.adviceBox}>
                    <Ionicons name="bulb-outline" size={14} color={colors.primary} />
                    <Text style={styles.adviceText}>{advice.reason}</Text>
                  </View>
                )}

                {/* Low confidence means barely any history yet — say so rather
                    than presenting a guess as insight. */}
                <Text style={styles.confidenceNote}>
                  {trend.confidence < 0.3
                    ? 'Low confidence — still gathering price history for this route'
                    : `Confidence ${Math.round(trend.confidence * 100)}%`}
                </Text>
              </Card>
            )}

            <View style={styles.actionButtons}>
              <Button
                label={isActive ? 'Pause' : 'Resume'}
                onPress={handleTogglePause}
                disabled={actionLoading}
                loading={actionLoading}
                variant="secondary"
                icon={<Ionicons name={isActive ? 'pause' : 'play'} size={16} color={colors.ink} />}
                style={styles.actionButton}
              />
              <Button
                label="Delete"
                onPress={handleDelete}
                disabled={actionLoading}
                variant="danger"
                icon={<Ionicons name="trash-outline" size={16} color={colors.danger} />}
                style={styles.actionButton}
              />
            </View>
        </>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md, paddingBottom: spacing.xxxl },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  liveBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  card: {
    marginBottom: spacing.sm,
  },
  cardTitle: {
    ...type.caption,
    color: colors.inkMuted,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  routeSection: {
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  route: {
    ...type.display,
    color: colors.ink,
  },
  routeArrow: {
    marginHorizontal: spacing.xs,
  },
  infoGrid: {},
  infoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    ...type.small,
    color: colors.inkMuted,
  },
  infoValue: {
    ...type.bodyStrong,
    color: colors.ink,
    textTransform: 'capitalize',
  },
  dateItem: {
    paddingVertical: spacing.xs,
  },
  dateLabel: {
    ...type.small,
    color: colors.inkMuted,
    marginBottom: 2,
  },
  dateValue: {
    ...type.bodyStrong,
    color: colors.ink,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  priceItem: {
    flex: 1,
  },
  priceValue: {
    fontFamily: 'monospace',
    fontSize: 24,
    fontWeight: '800',
    color: colors.success,
    marginTop: 2,
  },
  trendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  trendStats: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  trendStat: { flex: 1 },
  trendValue: { ...type.bodyStrong, color: colors.ink, marginTop: 2 },
  trendDown: { color: colors.success },
  trendUp: { color: colors.danger },
  adviceBox: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  adviceText: { ...type.small, color: colors.inkMuted, flex: 1 },
  confidenceNote: { ...type.micro, color: colors.inkFaint, marginTop: spacing.xs },
  baselineNote: { ...type.micro, color: colors.inkFaint, marginTop: 2 },
  priceValueSmall: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 2,
  },
  helpBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
    padding: spacing.xs,
  },
  helpText: {
    ...type.small,
    color: colors.primaryDark,
    flex: 1,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  actionButton: {
    flex: 1,
  },
});
