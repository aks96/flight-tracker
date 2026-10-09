import { Platform } from 'react-native';

// Terminal / hacker console theme — dark, monospace, bordered panels instead
// of soft shadowed cards. Toned down from the first pass: a calmer, less
// saturated green (was pure-neon #39FF88), and glow effects reserved for a
// couple of truly key moments rather than applied everywhere — same
// identity, quieter execution. Everything else in the app (screens, ui/*
// components) pulls from here, so re-skinning happens mostly by changing
// these tokens.

export const FONT_MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

export const colors = {
  // Signal colors
  primary: '#4ADE94',
  primaryDim: '#2C8F62',
  primaryBg: 'rgba(74, 222, 148, 0.08)',

  success: '#4ADE94',
  successBg: 'rgba(74, 222, 148, 0.08)',
  danger: '#E5677E',
  dangerBg: 'rgba(229, 103, 126, 0.10)',
  warning: '#E0B159',
  warningBg: 'rgba(224, 177, 89, 0.08)',
  info: '#5FBFDB',
  infoBg: 'rgba(95, 191, 219, 0.08)',

  // Ground
  ink: '#DCEBE2',
  inkMuted: '#7C9188',
  inkFaint: '#4E5E57',
  border: '#212B26',
  borderStrong: '#2E3B34',
  surface: '#0E1210',
  surfaceAlt: '#121714',
  background: '#0A0D0B',
  white: '#DCEBE2',
  overlay: 'rgba(4, 6, 5, 0.78)',

  // Legacy aliases still referenced by a few components
  primaryDark: '#4ADE94',
  primaryLight: 'rgba(74, 222, 148, 0.08)',
  successLight: 'rgba(74, 222, 148, 0.08)',
  dangerLight: 'rgba(229, 103, 126, 0.10)',
  warningLight: 'rgba(224, 177, 89, 0.08)',
  infoLight: 'rgba(95, 191, 219, 0.08)',
};

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
};

// Sharper corners than a typical consumer app — terminal panels, not
// friendly bubbles.
export const radius = {
  sm: 3,
  md: 5,
  lg: 7,
  xl: 10,
  pill: 999,
};

export const type = {
  display: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.3, fontFamily: FONT_MONO },
  h1: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.2, fontFamily: FONT_MONO },
  h2: { fontSize: 16, fontWeight: '700' as const, fontFamily: FONT_MONO },
  h3: { fontSize: 14, fontWeight: '700' as const, fontFamily: FONT_MONO },
  body: { fontSize: 14, fontWeight: '400' as const, fontFamily: FONT_MONO },
  bodyStrong: { fontSize: 14, fontWeight: '700' as const, fontFamily: FONT_MONO },
  small: { fontSize: 12, fontWeight: '400' as const, fontFamily: FONT_MONO },
  smallStrong: { fontSize: 12, fontWeight: '700' as const, fontFamily: FONT_MONO },
  caption: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1.2, fontFamily: FONT_MONO },
  micro: { fontSize: 10, fontWeight: '700' as const, letterSpacing: 0.6, fontFamily: FONT_MONO },
};

// Ordinary near-black shadows for elevation — panels sit on the surface,
// they don't glow. Glow is reserved for the couple of spots that opt in via
// glow() below, not the default for every card/button.
export const shadow = {
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.24,
    shadowRadius: 6,
    elevation: 2,
  },
  lg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
    elevation: 6,
  },
};

// A restrained text glow — used in exactly one or two spots (the brand mark)
// rather than as the house style for every label and price.
export const glow = (color: string = colors.primary) => ({
  textShadowColor: color,
  textShadowOffset: { width: 0, height: 0 },
  textShadowRadius: 4,
});

const theme = { colors, spacing, radius, type, shadow, glow, FONT_MONO };
export default theme;
