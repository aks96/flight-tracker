import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { colors } from '@/theme';

interface BlinkingCursorProps {
  color?: string;
  size?: number;
}

/** A single terminal-style blinking block cursor — used sparingly as a brand accent. */
export default function BlinkingCursor({ color = colors.primary, size = 18 }: BlinkingCursorProps) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.cursor,
        { backgroundColor: color, width: size * 0.55, height: size, opacity },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  cursor: {
    marginLeft: 2,
  },
});
