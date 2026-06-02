/**
 * Design tokens — single source of truth for spacing, radius, typography.
 *
 * Use these instead of raw pixel values to keep the UI consistent.
 *
 *   import { spacing, radius, typography, touchTarget } from '../utils/tokens';
 *   <View style={{ padding: spacing.lg, borderRadius: radius.md }} />
 *   <Text style={typography.h2} />
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 28, fontWeight: '900' as const, letterSpacing: -0.5 },
  h1: { fontSize: 22, fontWeight: '800' as const },
  h2: { fontSize: 18, fontWeight: '800' as const },
  h3: { fontSize: 15, fontWeight: '700' as const },
  body: { fontSize: 14, fontWeight: '500' as const },
  bodyBold: { fontSize: 14, fontWeight: '700' as const },
  caption: { fontSize: 12, fontWeight: '600' as const },
  micro: { fontSize: 11, fontWeight: '600' as const },
  tiny: {
    fontSize: 10,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
} as const;

/** Minimum touch target size per WCAG 2.2 AA / Apple HIG / Material Design. */
export const touchTarget = {
  min: 44,
} as const;
