import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, type } from '@/theme';

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

interface BadgeProps {
  label: string;
  tone?: Tone;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Pulsing dot instead of an icon — reserved for genuinely live states. */
  pulse?: boolean;
}

const toneStyles: Record<Tone, { bg: string; fg: string }> = {
  success: { bg: colors.successBg, fg: colors.success },
  warning: { bg: colors.warningBg, fg: colors.warning },
  danger: { bg: colors.dangerBg, fg: colors.danger },
  info: { bg: colors.infoBg, fg: colors.info },
  neutral: { bg: colors.surfaceAlt, fg: colors.inkMuted },
};

function PulseDot({ color }: { color: string }) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.4, duration: 900, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);

  return (
    <View style={styles.dotWrap}>
      <View style={[styles.dotCore, { backgroundColor: color }]} />
      <Animated.View style={[styles.dotRing, { borderColor: color, transform: [{ scale }] }]} />
    </View>
  );
}

export default function Badge({ label, tone = 'neutral', icon, pulse = false }: BadgeProps) {
  const t = toneStyles[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg, borderColor: t.fg }]}>
      {pulse ? (
        <PulseDot color={t.fg} />
      ) : icon ? (
        <Ionicons name={icon} size={11} color={t.fg} style={styles.icon} />
      ) : null}
      <Text style={[styles.label, { color: t.fg }]}>
        [ {label} ]
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  icon: {
    marginRight: 4,
  },
  label: {
    ...type.micro,
  },
  dotWrap: {
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 5,
  },
  dotCore: {
    width: 6,
    height: 6,
    borderRadius: 3,
    position: 'absolute',
  },
  dotRing: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
  },
});
