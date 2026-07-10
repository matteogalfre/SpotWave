import { Platform, useWindowDimensions } from 'react-native';

// Single source of truth for the desktop-web layout. On native (and narrow
// mobile-web viewports) everything falls back to the untouched phone layout, so
// none of these values ever affect the native app.
export const isWebPlatform = Platform.OS === 'web';

// At/above this width we treat the web viewport as a "desktop" and switch to the
// wide, multi-column web layout (top nav, grids, wider content columns).
export const WEB_WIDE_BREAKPOINT = 900;

// Width of the left sidebar navigation on desktop web.
export const WEB_SIDEBAR_WIDTH = 236;

// Content column caps. The whole desktop web app is a single, centered, phone-
// like column (the user explicitly wants the app "identical, just centered" —
// no full-width dashboards, no multi-column grids). Everything shares one width.
export const WEB_COLUMN = 760;
export const WEB_CONTENT_MAX = WEB_COLUMN; // Spots "all", Favorites
export const WEB_HOME_MAX = WEB_COLUMN;    // home
export const WEB_READ_MAX = WEB_COLUMN;    // Profile…
export const WEB_DETAIL_MAX = WEB_COLUMN;  // spot detail
export const WEB_CHART_MAX = 700;          // cap each (stacked) chart width

// Full-width frosted bottom bar (mobile web / PWA). It stays edge-to-edge and
// flush to the screen bottom, but we *cap* how much of the home-indicator safe
// area is added as padding so the bar doesn't grow a tall empty strip. Geometry
// is shared with the navigator so screens can pad their content to clear it.
export const WEB_TABBAR_BASE_HEIGHT = 64;  // icon + label row height

/** Safe-area padding added under the icons, capped so the bar stays compact. */
export function webTabBarSafePad(insetBottom: number): number {
  return Math.max(Math.min(insetBottom, 12), 4);
}

/** Bottom padding a scroll view needs so its last row clears the bottom bar. */
export function webTabBarClearance(insetBottom: number): number {
  return WEB_TABBAR_BASE_HEIGHT + webTabBarSafePad(insetBottom) + 12;
}

export interface WebLayout {
  isWeb: boolean;
  isWide: boolean;
  width: number;
  height: number;
  /** number of columns for spot grids (1 on native / narrow web) */
  columns: number;
}

export function useWebLayout(): WebLayout {
  const { width, height } = useWindowDimensions();
  const isWide = isWebPlatform && width >= WEB_WIDE_BREAKPOINT;
  // Always a single centered column on web — no multi-column grids.
  const columns = 1;
  return { isWeb: isWebPlatform, isWide, width, height, columns };
}

/** Style helper: center a scrollable in a capped-width column on wide web. */
export function webCenter(maxWidth: number, isWide: boolean) {
  return isWide
    ? ({ alignSelf: 'center', width: '100%', maxWidth } as const)
    : null;
}

/** Split an array into rows of `size` (for grid rendering in SectionList). */
export function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 1) return arr.map((x) => [x]);
  const rows: T[][] = [];
  for (let i = 0; i < arr.length; i += size) rows.push(arr.slice(i, i + size));
  return rows;
}
