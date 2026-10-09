import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { colors, radius, spacing, type } from '@/theme';

const LABEL_TRANSFORM = 'uppercase' as const;

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  fullWidth?: boolean;
}

export default function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  style,
  fullWidth = true,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.base,
        variantStyles[variant].base,
        size === 'lg' && styles.lg,
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variantStyles[variant].spinnerColor} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text style={[styles.label, variantStyles[variant].label]}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lg: {
    paddingVertical: spacing.md,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  disabled: {
    opacity: 0.5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  label: {
    ...type.bodyStrong,
    textTransform: LABEL_TRANSFORM,
    letterSpacing: 0.8,
  },
});

// Bordered terminal-button look: black fill, quiet outline — rather than a
// solid fill or a glowing label.
const variantStyles: Record<Variant, { base: ViewStyle; label: any; spinnerColor: string }> = {
  primary: {
    base: {
      backgroundColor: colors.primaryBg,
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
    label: { color: colors.primary },
    spinnerColor: colors.primary,
  },
  secondary: {
    base: { backgroundColor: colors.surfaceAlt, borderWidth: 1.5, borderColor: colors.border },
    label: { color: colors.ink },
    spinnerColor: colors.ink,
  },
  danger: {
    base: { backgroundColor: colors.dangerBg, borderWidth: 1.5, borderColor: colors.danger },
    label: { color: colors.danger },
    spinnerColor: colors.danger,
  },
  ghost: {
    base: { backgroundColor: 'transparent' },
    label: { color: colors.primary },
    spinnerColor: colors.primary,
  },
};
