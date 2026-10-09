import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { colors, radius, spacing, type } from '@/theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  suffix?: string;
  /** Right-aligned status element inside the input row — a spinner, a "LIVE" badge, etc. */
  right?: React.ReactNode;
}

export default function Input({ label, error, hint, suffix, right, style, onFocus, onBlur, ...rest }: InputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.inputRow,
          focused && styles.inputRowFocused,
          !!error && styles.inputRowError,
        ]}
      >
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={colors.inkFaint}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
        {right}
      </View>
      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hintText}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.md,
  },
  label: {
    ...type.caption,
    color: colors.inkMuted,
    marginBottom: spacing.xxs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
  },
  inputRowFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  inputRowError: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerBg,
  },
  input: {
    flex: 1,
    ...type.body,
    color: colors.ink,
    paddingVertical: spacing.sm,
    // react-native-web renders TextInput as a real <input>, which keeps the
    // browser's own focus outline in addition to our custom focus border
    // above — doubling up into a boxed-in-a-box look. This is a web-only
    // style prop (RNW-specific), harmless/no-op on native.
    outlineStyle: 'none',
  } as any,
  suffix: {
    ...type.small,
    color: colors.inkFaint,
    marginLeft: spacing.xs,
  },
  errorText: {
    ...type.small,
    color: colors.danger,
    marginTop: spacing.xxs,
  },
  hintText: {
    ...type.small,
    color: colors.inkFaint,
    marginTop: spacing.xxs,
  },
});
