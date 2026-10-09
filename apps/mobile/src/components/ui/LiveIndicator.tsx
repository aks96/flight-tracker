import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type } from '@/theme';
import Badge from './Badge';

interface LiveIndicatorProps {
  secondsAgo: number;
}

function formatAgo(seconds: number): string {
  if (seconds < 2) return 'now';
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  return `${mins}m ago`;
}

/** Visible proof the screen is actually polling — a pulsing "LIVE" chip plus a synced-Ns-ago clock. */
export default function LiveIndicator({ secondsAgo }: LiveIndicatorProps) {
  return (
    <View style={styles.row}>
      <Badge label="LIVE" tone="success" pulse />
      <Text style={styles.text}>synced {formatAgo(secondsAgo)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  text: {
    ...type.micro,
    color: colors.inkFaint,
  },
});
