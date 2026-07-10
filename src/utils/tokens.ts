/**
 * Design tokens — single source of truth for spacing, radius, typography.
 *
 * Use these instead of raw pixel values to keep the UI consistent.
 *
 *   import { spacing, radius, typography, touchTarget } from '../utils/tokens';
 *   <View style={{ padding: spacing.lg, borderRadius: radius.md }} />
 *   <Text style={typography.h2} />
 */
import { Platform, ViewStyle } from 'react-native';

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
  // Slightly less shouty than before (900/800 everywhere read "AI template"):
  // a couple of anchor weights + subtle negative tracking on large headings.
  display: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.6 },
  h1: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.4 },
  h2: { fontSize: 18, fontWeight: '700' as const, letterSpacing: -0.2 },
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
  // Unified section header across the app: small, tracked uppercase for a calm,
  // editorial rhythm (instead of a mix of big bold titles + small caps).
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
} as const;

/** Minimum touch target size per WCAG 2.2 AA / Apple HIG / Material Design. */
export const touchTarget = {
  min: 44,
} as const;

/**
 * Soft, consistent elevation for floating surfaces (cards, hero).
 *
 * `elevation` = cross-platform depth. iOS gets a soft blurred shadow; Android
 * gets native `elevation`. Use it on OPAQUE, STATIC surfaces (home hero, list
 * cards, favorites, profile) where Android's shadow renders cleanly.
 *
 * `elevationIOS` = iOS-only shadow, flat on Android. Use it on surfaces that
 * live on a PUSHED screen (e.g. the spot detail), because Android's elevation
 * shadow visibly "sweeps" during the slide-in transition. Also prefer it (or
 * no elevation at all) on TRANSLUCENT fills, where Android's shadow shows
 * through as a boxy/octagonal artifact.
 */
const iosShadow = (height: number, opacity: number, r: number): ViewStyle => ({
  shadowColor: '#0E2A33',
  shadowOffset: { width: 0, height },
  shadowOpacity: opacity,
  shadowRadius: r,
});

const crossElevation = (height: number, opacity: number, r: number, e: number): ViewStyle =>
  Platform.select<ViewStyle>({
    ios: iosShadow(height, opacity, r),
    android: { elevation: e },
    default: {},
  }) ?? {};

const iosOnly = (height: number, opacity: number, r: number): ViewStyle =>
  Platform.select<ViewStyle>({ ios: iosShadow(height, opacity, r), default: {} }) ?? {};

export const elevation = {
  sm: crossElevation(1, 0.06, 3, 1),
  md: crossElevation(4, 0.08, 10, 3),
  lg: crossElevation(8, 0.12, 20, 6),
} as const;

/** iOS-only depth for pushed screens / translucent surfaces (flat on Android). */
export const elevationIOS = {
  sm: iosOnly(1, 0.06, 3),
  md: iosOnly(4, 0.08, 10),
  lg: iosOnly(8, 0.12, 20),
} as const;

/** Tabular figures so numbers align in columns and don't jitter when animating. */
export const tabularNums = { fontVariant: ['tabular-nums'] as ['tabular-nums'] };
