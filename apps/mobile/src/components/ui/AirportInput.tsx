import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Airport, getAirportByCode, searchAirports } from '@/data/airports';
import { colors, radius, spacing, type } from '@/theme';
import Input from './Input';

interface AirportInputProps {
  label: string;
  value: string; // committed IATA code, e.g. 'DEL' — '' if nothing selected yet
  onChange: (code: string) => void;
  placeholder?: string;
}

function display(a: Airport | undefined, fallback: string): string {
  return a ? `${a.city} (${a.code})` : fallback;
}

/**
 * City/airport-name search that resolves to an IATA code — replaces raw
 * 3-letter-code text entry, which required already knowing the code. The
 * suggestion list floats over the content below it (absolute position)
 * rather than expanding inline — an earlier version pushed the rest of the
 * form down while typing and snapped back once a result was picked, which
 * read as a layout glitch rather than a dropdown.
 */
export default function AirportInput({ label, value, onChange, placeholder }: AirportInputProps) {
  const [query, setQuery] = useState(() => display(getAirportByCode(value), value));
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState<Airport[]>([]);

  // Stay in sync when the code is changed from outside (e.g. the swap button).
  useEffect(() => {
    setQuery(display(getAirportByCode(value), value));
  }, [value]);

  const handleChangeText = (text: string) => {
    setQuery(text);
    if (value) onChange(''); // typing invalidates the previously committed code
    setResults(text.trim().length >= 2 ? searchAirports(text) : []);
  };

  const handleSelect = (airport: Airport) => {
    onChange(airport.code);
    setQuery(display(airport, airport.code));
    setResults([]);
    setFocused(false);
  };

  const showDropdown = focused && results.length > 0;

  return (
    <View style={showDropdown && styles.rootRaised}>
      <Input
        label={label}
        placeholder={placeholder}
        value={query}
        onChangeText={handleChangeText}
        onFocus={() => setFocused(true)}
        // Delay so a tap on a suggestion registers before the list unmounts.
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        autoCapitalize="words"
        autoCorrect={false}
      />
      {showDropdown ? (
        <View style={styles.dropdown}>
          {results.map((airport) => (
            <TouchableOpacity key={airport.code} style={styles.row} onPress={() => handleSelect(airport)}>
              <Text style={styles.code}>{airport.code}</Text>
              <View style={styles.rowText}>
                <Text style={styles.city} numberOfLines={1}>
                  {airport.city}
                </Text>
                <Text style={styles.name} numberOfLines={1}>
                  {airport.name}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Lifts this field's own stacking context above its siblings while its
  // dropdown is open — needed on Android, which ignores zIndex between
  // siblings unless elevation is also set on the raised one.
  rootRaised: {
    position: 'relative',
    zIndex: 1000,
    elevation: 12,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: spacing.xxs,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
    zIndex: 1000,
    elevation: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  code: {
    ...type.smallStrong,
    color: colors.primary,
    width: 34,
  },
  rowText: {
    flex: 1,
  },
  city: {
    ...type.small,
    color: colors.ink,
    fontWeight: '700',
  },
  name: {
    ...type.micro,
    color: colors.inkFaint,
    marginTop: 1,
  },
});
