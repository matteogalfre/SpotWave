import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { log } from '../utils/logger';

const THEME_KEY = '@spotwave_theme';

/**
 * CARTO exige desormais une cle pour ses fonds de carte : sans elle, les tuiles
 * reviennent tatouees "API KEY REQUIRED" en diagonale, avec un code HTTP 200.
 *
 * La cle se recupere sur carto.com/basemaps/apikey. Plan gratuit : 5 millions de
 * tuiles par mois, usage non commercial. Elle est necessairement visible cote
 * client (la WebView charge les tuiles directement), donc restreindre son domaine
 * depuis le dashboard CARTO est indispensable.
 *
 * Lue dans la variable d'environnement CARTO_API_KEY (voir app.config.js et .env.example),
 * jamais ecrite dans le depot. Sans cle, on retombe
 * sur l'URL nue plutot que de casser la carte : les tuiles restent tatouees mais
 * la carte fonctionne.
 */
const CARTO_API_KEY = (
  (Constants.expoConfig?.extra as { cartoApiKey?: string } | undefined)?.cartoApiKey ?? ''
).trim();

const cartoTile = (style: 'light_all' | 'dark_all'): string =>
  `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png` +
  (CARTO_API_KEY ? `?key=${encodeURIComponent(CARTO_API_KEY)}` : '');

/**
 * Palette tokens.
 *
 * Naming convention:
 *  - `text` / `textSecondary` / `textMuted` / `textFaint` — primary → quaternary text
 *  - `border` / `bgSubtle` — surface decoration
 *  - `bg` / `card` / `cardLight` — surfaces
 *  - `accent`, `orange`, `red`, `yellow`, `blue` — semantic colors (+ `*Dim` variants)
 *
 * Legacy aliases `white`, `white70`, `white40`, `white15`, `white08` are kept for
 * compatibility but now mapped to WCAG-compliant values:
 *  - `white40` is the **muted** text color (~60% opacity, not 40%) — passes WCAG AA 4.5:1
 *  - `white15` is the **border** color (~18% opacity, not 12%) — more visible
 */
export const DARK = {
  bg: '#0B0F1A',
  card: '#151A2D',
  cardLight: '#1C2340',
  // Bottom-nav surface. In dark, card already separates from bg.
  tabBar: '#151A2D',

  text: '#EAEEF6',
  textSecondary: 'rgba(234,238,246,0.78)',
  textMuted: 'rgba(234,238,246,0.62)',
  textFaint: 'rgba(234,238,246,0.42)',
  border: 'rgba(234,238,246,0.18)',
  borderStrong: 'rgba(234,238,246,0.28)',
  bgSubtle: 'rgba(234,238,246,0.08)',

  // Legacy aliases (do not introduce new usages — kept for back-compat with existing code).
  white: '#EAEEF6',
  white70: 'rgba(234,238,246,0.78)',
  white40: 'rgba(234,238,246,0.62)',
  white15: 'rgba(234,238,246,0.18)',
  white08: 'rgba(234,238,246,0.08)',

  accent: '#23C7C2',
  onAccent: '#06121F',     // text/icons on an accent-filled button
  accentDim: 'rgba(35,199,194,0.18)',
  red: '#FF5A5A',
  redDim: 'rgba(255,90,90,0.15)',
  yellow: '#FFD060',
  yellowDim: 'rgba(255,208,96,0.15)',
  blue: '#2BA8DC',
  blueDim: 'rgba(43,168,220,0.18)',
  statusBar: 'light' as 'light' | 'dark',
  mapTile: cartoTile('dark_all'),
  mapFilter: 'contrast(1.15) brightness(1.1) saturate(1.4)',
  mapSea: '#0B0F1A',
};

// ── Lagoon Classic (default light theme) ───────────────────────────────
// Tightened palette: warm-sand bg + deep teal ink, turquoise brand accent
// (all interaction), logo blue for water/tide only, gold as the single warm
// "caution/secondary", red for danger only. Score gradient = its own scale.
export const LIGHT: ThemePalette = {
  bg: '#FBF8F2',
  card: '#FFFFFF',
  cardLight: '#F1ECE2',
  // Bottom-nav surface (M3 "tonal surface"): a faint cool tint that reads as a
  // distinct plane against both white content (#FFF) and the warm sand bg, and
  // subtly nods to the turquoise brand. Fixes the "white-on-white" blend.
  tabBar: '#F4F8F7',

  text: '#0E3A45',
  textSecondary: 'rgba(14,58,69,0.80)',
  textMuted: 'rgba(14,58,69,0.60)',
  textFaint: 'rgba(14,58,69,0.42)',
  border: 'rgba(14,58,69,0.14)',
  borderStrong: 'rgba(14,58,69,0.24)',
  bgSubtle: 'rgba(14,58,69,0.05)',

  // Legacy aliases mapped to light-theme equivalents.
  white: '#0E3A45',
  white70: 'rgba(14,58,69,0.80)',
  white40: 'rgba(14,58,69,0.60)',
  white15: 'rgba(14,58,69,0.14)',
  white08: 'rgba(14,58,69,0.05)',

  // Deeper than the dark-theme turquoise: #0E9488 only reached 3.5:1 as text on
  // the sand background and 3.0:1 on tinted chips. #0A6E65 clears 4.5:1 on
  // every light surface, and white text on it reaches 6:1.
  accent: '#0A6E65',
  accentDim: 'rgba(10,110,101,0.12)',
  onAccent: '#FFFFFF',
  red: '#E0524C',
  redDim: 'rgba(224,82,76,0.12)',
  yellow: '#E0982C',
  yellowDim: 'rgba(224,152,44,0.14)',
  blue: '#1488B5',
  blueDim: 'rgba(20,136,181,0.14)',
  statusBar: 'dark',
  mapTile: cartoTile('light_all'),
  mapFilter: 'contrast(1.06) saturate(1.25)',
  mapSea: '#DCEFEA',
};

export type ThemePalette = typeof DARK;

interface ThemeContextType {
  isDark: boolean;
  colors: ThemePalette;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  isDark: false,
  colors: LIGHT,
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Lagoon Classic (light) is the default; dark is opt-in.
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((v) => {
      if (v === 'dark') setIsDark(true);
      else if (v === 'light') setIsDark(false);
    }).catch((e) => log.warn('Theme load error:', e));
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      AsyncStorage.setItem(THEME_KEY, next ? 'dark' : 'light').catch((e) => log.warn('Theme save error:', e));
      return next;
    });
  }, []);

  const colors = useMemo(() => isDark ? DARK : LIGHT, [isDark]);

  return (
    <ThemeContext.Provider value={{ isDark, colors, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
