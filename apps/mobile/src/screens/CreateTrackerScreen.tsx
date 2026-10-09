import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTrackerStore } from '@/store/tracker';
import { getQuote } from '@/services/tracker';
import { AirportInput, Button, Card, Input, ScreenHeader, useToast } from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';

const QUOTE_DEBOUNCE_MS = 700;

export interface CreateTrackerPrefill {
  origin: string;
  destination: string;
  departDate: string;
  cabinClass: string;
  adults: number;
  currency: string;
  baselinePrice?: number;
}

interface CreateTrackerScreenProps {
  onNavigate: (screen: 'dashboard') => void;
  onGoBack: () => void;
  /** Set when the user arrived here by tapping "Track this fare" in search. */
  prefill?: CreateTrackerPrefill | null;
  onPrefillConsumed?: () => void;
}

const CABIN_CLASSES = [
  { value: 'economy', label: 'Economy' },
  { value: 'premium_economy', label: 'Premium Eco.' },
  { value: 'business', label: 'Business' },
  { value: 'first', label: 'First' },
];

const CURRENCIES = ['INR', 'USD', 'EUR'];

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function Pill<T extends string>({
  options,
  value,
  onChange,
  labelFor,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  labelFor?: (v: T) => string;
}) {
  return (
    <View style={styles.pillRow}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <TouchableOpacity
            key={opt}
            onPress={() => onChange(opt)}
            style={[styles.pill, active && styles.pillActive]}
          >
            <Text style={[styles.pillText, active && styles.pillTextActive]}>
              {labelFor ? labelFor(opt) : opt}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function CreateTrackerScreen({
  onNavigate,
  onGoBack,
  prefill,
  onPrefillConsumed,
}: CreateTrackerScreenProps) {
  const [origin, setOrigin] = useState('DEL');
  const [destination, setDestination] = useState('NYC');
  const [departStart, setDepartStart] = useState('2026-09-15');
  const [departEnd, setDepartEnd] = useState('2026-09-30');
  const [returnStart, setReturnStart] = useState('2026-10-05');
  const [returnEnd, setReturnEnd] = useState('2026-10-20');
  const [isRoundTrip, setIsRoundTrip] = useState(false);
  const [adults, setAdults] = useState('1');
  const [children, setChildren] = useState('0');
  const [infants, setInfants] = useState('0');
  const [cabinClass, setCabinClass] = useState('economy');
  const [currency, setCurrency] = useState('INR');
  const [baselinePrice, setBaselinePrice] = useState('');
  const [priceDropAmount, setPriceDropAmount] = useState('5000');
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [priceIsLive, setPriceIsLive] = useState(false);

  const { createTracker, isLoading } = useTrackerStore();
  const toast = useToast();

  // Seed the form from the flight the user selected in search. The baseline is
  // the exact fare they were looking at, so the drop threshold is set against
  // a real number rather than a guess — and no extra quote lookup is spent.
  const prefillApplied = useRef(false);
  useEffect(() => {
    if (!prefill || prefillApplied.current) return;
    prefillApplied.current = true;

    setOrigin(prefill.origin);
    setDestination(prefill.destination);
    setDepartStart(prefill.departDate);
    setDepartEnd(prefill.departDate);
    setIsRoundTrip(false);
    setCabinClass(prefill.cabinClass);
    setCurrency(prefill.currency);
    setAdults(String(prefill.adults));

    if (prefill.baselinePrice) {
      setBaselinePrice(String(prefill.baselinePrice));
      setPriceIsLive(true);
      // A 10% drop is a sensible starting threshold against a known fare.
      setPriceDropAmount(String(Math.max(100, Math.round(prefill.baselinePrice * 0.1))));
    }

    onPrefillConsumed?.();
  }, [prefill, onPrefillConsumed]);

  // Live-quote the route the moment enough of the form is filled in, instead
  // of asking the user to type a "current price" from memory — previously
  // this field just defaulted to a hardcoded 25000 for every route and
  // never actually reflected what was typed above it.
  const quoteRequestId = useRef(0);
  useEffect(() => {
    const validRoute = origin.length === 3 && destination.length === 3 && origin !== destination;
    if (!validRoute || !departStart) {
      return;
    }

    // The fare came from a flight the user just picked in search — re-quoting
    // it would spend a second billable search for the same number.
    if (prefillApplied.current && priceIsLive && baselinePrice) {
      return;
    }

    const timer = setTimeout(async () => {
      const requestId = ++quoteRequestId.current;
      setPriceLoading(true);
      setPriceError(null);
      try {
        const quote = await getQuote({
          tripType: isRoundTrip ? 'round_trip' : 'one_way',
          origin,
          destination,
          departDateStart: departStart,
          returnDateStart: isRoundTrip ? returnStart : undefined,
          cabinClass: cabinClass as any,
          adults: Number(adults) || 1,
          children: Number(children) || 0,
          infants: Number(infants) || 0,
        });
        if (requestId !== quoteRequestId.current) return; // a newer request superseded this one
        setBaselinePrice(String(quote.amount));
        setCurrency(quote.currency); // the number is only meaningful paired with the currency it was quoted in
        setPriceIsLive(true);
      } catch (err: any) {
        if (requestId !== quoteRequestId.current) return;
        setPriceIsLive(false);
        setPriceError(err.response?.data?.error || 'Couldn’t fetch a live price — enter one manually');
      } finally {
        if (requestId === quoteRequestId.current) setPriceLoading(false);
      }
    }, QUOTE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [origin, destination, departStart, isRoundTrip, returnStart, cabinClass, adults, children, infants]);

  const handleCreate = async () => {
    if (!origin.trim() || !destination.trim()) {
      toast.error('Pick an origin and destination from the suggestions list');
      return;
    }
    if (origin.trim().length !== 3 || destination.trim().length !== 3) {
      // Typed something and never actually selected a suggestion, so
      // AirportInput never committed a real code.
      toast.error('Select an airport from the dropdown for both fields');
      return;
    }
    if (origin.trim().toUpperCase() === destination.trim().toUpperCase()) {
      toast.error('Origin and destination can’t be the same airport');
      return;
    }
    if (Number(priceDropAmount) <= 0 || Number(baselinePrice) <= 0) {
      toast.error('Prices must be greater than 0');
      return;
    }

    try {
      await createTracker({
        tripType: isRoundTrip ? 'round_trip' : 'one_way',
        origin: origin.trim().toUpperCase(),
        destination: destination.trim().toUpperCase(),
        departDateStart: departStart,
        departDateEnd: departEnd,
        returnDateStart: isRoundTrip ? returnStart : undefined,
        returnDateEnd: isRoundTrip ? returnEnd : undefined,
        cabinClass,
        adults: Number(adults),
        children: Number(children),
        infants: Number(infants),
        currency,
        baselinePrice: Number(baselinePrice),
        priceDropAmount: Number(priceDropAmount),
      });

      // Navigate immediately — this used to wait on Alert.alert's OK button,
      // which is a no-op on web (see ToastProvider), so the create actually
      // succeeded server-side but the screen never moved on and looked broken.
      toast.success('Tracker created — we’ll watch prices for you');
      onNavigate('dashboard');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create tracker');
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="New Tracker" onBack={onGoBack} />
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Card style={[styles.section, styles.routeCard]}>
          <SectionTitle>Route</SectionTitle>
          <View style={styles.rowInputs}>
            <View style={styles.inputWrapper}>
              <AirportInput label="From" placeholder="City or airport" value={origin} onChange={setOrigin} />
            </View>
            <TouchableOpacity
              style={styles.swapIcon}
              onPress={() => {
                setOrigin(destination);
                setDestination(origin);
              }}
              hitSlop={8}
            >
              <Ionicons name="swap-horizontal" size={18} color={colors.primary} />
            </TouchableOpacity>
            <View style={styles.inputWrapper}>
              <AirportInput label="To" placeholder="City or airport" value={destination} onChange={setDestination} />
            </View>
          </View>

          <View style={styles.roundTripToggle}>
            <Text style={styles.toggleLabel}>Round trip</Text>
            <Switch
              value={isRoundTrip}
              onValueChange={setIsRoundTrip}
              trackColor={{ false: colors.border, true: colors.primaryBg }}
              thumbColor={isRoundTrip ? colors.primary : colors.inkFaint}
            />
          </View>
        </Card>

        <Card style={styles.section}>
          <SectionTitle>Dates</SectionTitle>
          <View style={styles.rowInputs}>
            <View style={styles.inputWrapper}>
              <Input label="Depart from" placeholder="YYYY-MM-DD" value={departStart} onChangeText={setDepartStart} />
            </View>
            <View style={styles.inputWrapper}>
              <Input label="Depart to" placeholder="YYYY-MM-DD" value={departEnd} onChangeText={setDepartEnd} />
            </View>
          </View>

          {isRoundTrip && (
            <View style={styles.rowInputs}>
              <View style={styles.inputWrapper}>
                <Input label="Return from" placeholder="YYYY-MM-DD" value={returnStart} onChangeText={setReturnStart} />
              </View>
              <View style={styles.inputWrapper}>
                <Input label="Return to" placeholder="YYYY-MM-DD" value={returnEnd} onChangeText={setReturnEnd} />
              </View>
            </View>
          )}
        </Card>

        <Card style={styles.section}>
          <SectionTitle>Passengers</SectionTitle>
          <View style={styles.rowInputs}>
            <View style={styles.inputWrapperThird}>
              <Input label="Adults" keyboardType="number-pad" value={adults} onChangeText={setAdults} />
            </View>
            <View style={styles.inputWrapperThird}>
              <Input label="Children" keyboardType="number-pad" value={children} onChangeText={setChildren} />
            </View>
            <View style={styles.inputWrapperThird}>
              <Input label="Infants" keyboardType="number-pad" value={infants} onChangeText={setInfants} />
            </View>
          </View>
        </Card>

        <Card style={styles.section}>
          <SectionTitle>Cabin Class</SectionTitle>
          <Pill options={CABIN_CLASSES.map((c) => c.value)} value={cabinClass} onChange={setCabinClass} labelFor={(v) => CABIN_CLASSES.find((c) => c.value === v)!.label} />

          <View style={styles.spacerSm} />

          <SectionTitle>Currency</SectionTitle>
          <Pill options={CURRENCIES} value={currency} onChange={setCurrency} />
        </Card>

        <Card style={styles.section}>
          <SectionTitle>Alert Settings</SectionTitle>
          <View style={styles.rowInputs}>
            <View style={styles.inputWrapper}>
              <Input
                label={`Current price (${currency})`}
                keyboardType="number-pad"
                value={baselinePrice}
                onChangeText={(t) => {
                  setBaselinePrice(t);
                  setPriceIsLive(false);
                }}
                placeholder={priceLoading ? 'Fetching…' : '—'}
                error={priceError || undefined}
                hint={!priceError && priceIsLive ? 'Live Duffel quote' : undefined}
                right={priceLoading ? <ActivityIndicator size="small" color={colors.primary} /> : undefined}
              />
            </View>
            <View style={styles.inputWrapper}>
              <Input label={`Alert drop (${currency})`} keyboardType="number-pad" value={priceDropAmount} onChangeText={setPriceDropAmount} />
            </View>
          </View>
          <View style={styles.helpBox}>
            <Ionicons name="notifications-outline" size={14} color={colors.primaryDark} />
            <Text style={styles.helpText}>
              You'll be notified the moment the price drops by {currency} {priceDropAmount || 0}
            </Text>
          </View>
        </Card>

        <Button label="Create Tracker" onPress={handleCreate} loading={isLoading} size="lg" style={styles.createButton} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  form: {
    padding: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  section: {
    marginBottom: spacing.sm,
  },
  // The airport-search dropdown floats below this card and needs to paint
  // over the Dates card that follows it — a child's zIndex only wins against
  // its own siblings, not a later sibling of one of its ancestors, so the
  // card itself (not just the AirportInput inside it) needs to be raised.
  routeCard: {
    zIndex: 10,
    elevation: 10,
  },
  sectionTitle: {
    ...type.caption,
    color: colors.inkMuted,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  rowInputs: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  inputWrapper: {
    flex: 1,
  },
  inputWrapperThird: {
    flex: 1,
  },
  swapIcon: {
    height: 46,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  roundTripToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.xxs,
  },
  toggleLabel: {
    ...type.bodyStrong,
    color: colors.ink,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  pillActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  pillText: {
    ...type.smallStrong,
    color: colors.inkMuted,
  },
  pillTextActive: {
    color: colors.primaryDark,
  },
  spacerSm: {
    height: spacing.sm,
  },
  helpBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    padding: spacing.xs,
  },
  helpText: {
    ...type.small,
    color: colors.primaryDark,
    flex: 1,
  },
  createButton: {
    marginTop: spacing.sm,
  },
});
