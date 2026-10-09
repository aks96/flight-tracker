import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  AirportInput,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  ScreenHeader,
  useToast,
} from '@/components/ui';
import {
  FlightOffer,
  formatDuration,
  formatTime,
  searchFlights,
} from '@/services/flights';
import { colors, radius, spacing, type } from '@/theme';

type Cabin = 'economy' | 'premium_economy' | 'business' | 'first';
type SortKey = 'price' | 'duration' | 'departure';

export interface FlightSearchPrefill {
  origin: string;
  destination: string;
  departDate: string;
  cabinClass: Cabin;
  adults: number;
  currency: 'INR' | 'USD' | 'EUR';
  /** Seeds the tracker's baseline with the fare the user actually picked. */
  baselinePrice?: number;
}

interface FlightSearchScreenProps {
  onGoBack: () => void;
  /**
   * Hands the selected flight to the create-tracker form, so a tracker is set
   * up from a fare the user has actually seen rather than a number they had to
   * guess or look up in another app.
   */
  onTrackFlight: (prefill: FlightSearchPrefill) => void;
}

const CABINS: Array<{ key: Cabin; label: string }> = [
  { key: 'economy', label: 'Economy' },
  { key: 'premium_economy', label: 'Premium' },
  { key: 'business', label: 'Business' },
  { key: 'first', label: 'First' },
];

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'price', label: 'Cheapest' },
  { key: 'duration', label: 'Fastest' },
  { key: 'departure', label: 'Earliest' },
];

function sortOffers(offers: FlightOffer[], key: SortKey): FlightOffer[] {
  const copy = [...offers];
  if (key === 'duration') return copy.sort((a, b) => a.durationMinutes - b.durationMinutes);
  if (key === 'departure') {
    return copy.sort(
      (a, b) => new Date(a.departingAt).getTime() - new Date(b.departingAt).getTime()
    );
  }
  return copy.sort((a, b) => a.amount - b.amount);
}

export default function FlightSearchScreen({ onGoBack, onTrackFlight }: FlightSearchScreenProps) {
  const [origin, setOrigin] = useState('DEL');
  const [destination, setDestination] = useState('BOM');
  const [departDate, setDepartDate] = useState('');
  const [cabinClass, setCabinClass] = useState<Cabin>('economy');
  const [adults, setAdults] = useState('1');
  const [sortKey, setSortKey] = useState<SortKey>('price');

  const [offers, setOffers] = useState<FlightOffer[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState<{ cached: boolean; fetchedAt: string } | null>(null);
  const toast = useToast();

  const canSearch = Boolean(origin && destination && departDate) && origin !== destination;

  const handleSearch = async () => {
    if (!canSearch) {
      toast.error('Pick an origin, destination and departure date');
      return;
    }

    setLoading(true);
    try {
      const result = await searchFlights({
        tripType: 'one_way',
        origin,
        destination,
        departDateStart: departDate,
        cabinClass,
        adults: Math.max(1, parseInt(adults, 10) || 1),
        children: 0,
        infants: 0,
        currency: 'INR',
        limit: 25,
      });

      setOffers(result.offers);
      setMeta({ cached: result.meta.cached, fetchedAt: result.meta.fetchedAt });
    } catch (error: any) {
      // The budget ceiling is a normal operating state, not a crash — say so
      // plainly rather than showing a generic failure.
      if (error.response?.data?.code === 'search_budget_exhausted') {
        toast.error('Monthly live-search budget reached — try again next month');
      } else if (error.response?.status === 404) {
        setOffers([]);
        setMeta(null);
      } else {
        toast.error(error.response?.data?.error || 'Search failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const swap = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  const renderOffer = ({ item }: { item: FlightOffer }) => (
    <Card style={styles.offerCard}>
      <View style={styles.offerHeader}>
        <View style={styles.airlineBlock}>
          <Text style={styles.airlineCode}>{item.airlineCode}</Text>
          <View style={styles.airlineText}>
            <Text style={styles.airlineName}>{item.airline}</Text>
            <Text style={styles.flightNumber}>
              {item.slices[0]?.segments.map((segment) => segment.flightNumber).join(' · ')}
            </Text>
          </View>
        </View>
        <Text style={styles.price}>
          {item.currency} {Math.round(item.amount).toLocaleString()}
        </Text>
      </View>

      <View style={styles.timeline}>
        <View style={styles.timeBlock}>
          <Text style={styles.time}>{formatTime(item.departingAt)}</Text>
          <Text style={styles.airport}>{item.slices[0]?.origin ?? origin}</Text>
        </View>

        <View style={styles.duration}>
          <Text style={styles.durationText}>{formatDuration(item.durationMinutes)}</Text>
          <View style={styles.durationLine} />
          <Text style={styles.stopsText}>
            {item.stops === 0 ? 'non-stop' : `${item.stops} stop`}
          </Text>
        </View>

        <View style={[styles.timeBlock, styles.timeBlockEnd]}>
          <Text style={styles.time}>{formatTime(item.arrivingAt)}</Text>
          <Text style={styles.airport}>{item.slices[0]?.destination ?? destination}</Text>
        </View>
      </View>

      <View style={styles.offerFooter}>
        <View style={styles.badges}>
          {item.baggageIncluded && <Badge label="bag incl." tone="success" />}
          {item.refundable && <Badge label="refundable" tone="info" />}
        </View>
        <TouchableOpacity
          style={styles.trackButton}
          activeOpacity={0.75}
          onPress={() =>
            onTrackFlight({
              origin,
              destination,
              departDate,
              cabinClass,
              adults: Math.max(1, parseInt(adults, 10) || 1),
              currency: 'INR',
              baselinePrice: Math.round(item.amount),
            })
          }
        >
          <Ionicons name="notifications-outline" size={14} color={colors.primary} />
          <Text style={styles.trackButtonText}>Track this fare</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader title="Search Flights" onBack={onGoBack} />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
        stickyHeaderIndices={[0]}
      >
        <View style={styles.form}>
          <View style={styles.routeRow}>
            <View style={styles.routeField}>
              <AirportInput label="From" value={origin} onChange={setOrigin} />
            </View>
            <TouchableOpacity style={styles.swapButton} onPress={swap} activeOpacity={0.7}>
              <Ionicons name="swap-horizontal" size={18} color={colors.primary} />
            </TouchableOpacity>
            <View style={styles.routeField}>
              <AirportInput label="To" value={destination} onChange={setDestination} />
            </View>
          </View>

          <View style={styles.inlineRow}>
            <View style={styles.flex2}>
              <Input
                label="Departure"
                placeholder="YYYY-MM-DD"
                value={departDate}
                onChangeText={setDepartDate}
                autoCapitalize="none"
              />
            </View>
            <View style={styles.flex1}>
              <Input label="Adults" value={adults} onChangeText={setAdults} keyboardType="number-pad" />
            </View>
          </View>

          <Text style={styles.sectionLabel}>Cabin</Text>
          <View style={styles.chipRow}>
            {CABINS.map((cabin) => (
              <TouchableOpacity
                key={cabin.key}
                style={[styles.chip, cabinClass === cabin.key && styles.chipActive]}
                onPress={() => setCabinClass(cabin.key)}
                activeOpacity={0.75}
              >
                <Text style={[styles.chipText, cabinClass === cabin.key && styles.chipTextActive]}>
                  {cabin.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Button
            label={loading ? 'Searching…' : 'Search flights'}
            onPress={handleSearch}
            loading={loading}
            disabled={!canSearch || loading}
            fullWidth
            icon={<Ionicons name="search" size={16} color={colors.background} />}
          />
        </View>

        {loading && (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>querying fares...</Text>
          </View>
        )}

        {!loading && offers !== null && offers.length === 0 && (
          <EmptyState
            icon="airplane-outline"
            title="No fares found"
            message="Nothing available for that route and date. Try a different day."
          />
        )}

        {!loading && offers !== null && offers.length > 0 && (
          <View style={styles.results}>
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsCount}>{offers.length} flights</Text>
              {/* Cached results are labelled rather than passed off as live. */}
              {meta?.cached && <Badge label="cached" tone="warning" />}
            </View>

            <View style={styles.sortRow}>
              {SORTS.map((sort) => (
                <TouchableOpacity
                  key={sort.key}
                  style={[styles.sortChip, sortKey === sort.key && styles.sortChipActive]}
                  onPress={() => setSortKey(sort.key)}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[styles.sortText, sortKey === sort.key && styles.sortTextActive]}
                  >
                    {sort.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <FlatList
              data={sortOffers(offers, sortKey)}
              renderItem={renderOffer}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  bodyContent: { paddingBottom: spacing.xxxl },
  form: {
    backgroundColor: colors.background,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.xs,
  },
  routeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs },
  routeField: { flex: 1 },
  swapButton: {
    padding: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    marginBottom: spacing.xs,
  },
  inlineRow: { flexDirection: 'row', gap: spacing.xs },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  sectionLabel: {
    ...type.caption,
    color: colors.inkMuted,
    textTransform: 'uppercase',
    marginTop: spacing.xxs,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xxs, marginBottom: spacing.xs },
  chip: {
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  chipText: { ...type.small, color: colors.inkMuted },
  chipTextActive: { color: colors.primary },
  loadingBlock: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xxl },
  loadingText: { ...type.small, color: colors.inkMuted },
  results: { padding: spacing.md },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  resultsCount: { ...type.caption, color: colors.inkMuted, textTransform: 'uppercase' },
  sortRow: { flexDirection: 'row', gap: spacing.xxs, marginBottom: spacing.sm },
  sortChip: {
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
  },
  sortChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  sortText: { ...type.small, color: colors.inkMuted },
  sortTextActive: { color: colors.primary },
  separator: { height: spacing.xs },
  offerCard: { padding: spacing.sm, gap: spacing.xs },
  offerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  airlineBlock: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1 },
  airlineCode: {
    ...type.smallStrong,
    color: colors.primary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xxs,
    paddingVertical: 2,
  },
  airlineText: { flex: 1 },
  airlineName: { ...type.bodyStrong, color: colors.ink },
  flightNumber: { ...type.micro, color: colors.inkFaint },
  price: { ...type.h2, color: colors.primary },
  timeline: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xxs },
  timeBlock: { alignItems: 'flex-start', minWidth: 56 },
  timeBlockEnd: { alignItems: 'flex-end' },
  time: { ...type.bodyStrong, color: colors.ink },
  airport: { ...type.micro, color: colors.inkMuted },
  duration: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.xs },
  durationText: { ...type.micro, color: colors.inkMuted },
  durationLine: {
    height: 1,
    backgroundColor: colors.borderStrong,
    alignSelf: 'stretch',
    marginVertical: 3,
  },
  stopsText: { ...type.micro, color: colors.inkFaint },
  offerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
  },
  badges: { flexDirection: 'row', gap: spacing.xxs, flex: 1, flexWrap: 'wrap' },
  trackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.xs,
  },
  trackButtonText: { ...type.smallStrong, color: colors.primary },
});
