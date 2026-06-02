import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { log } from '../utils/logger';

const THEME_KEY = '@spotwave_theme';

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

  accent: '#00D4AA',
  accentDim: 'rgba(0,212,170,0.18)',
  orange: '#FF8A50',
  orangeDim: 'rgba(255,138,80,0.18)',
  red: '#FF5A5A',
  redDim: 'rgba(255,90,90,0.15)',
  yellow: '#FFD060',
  yellowDim: 'rgba(255,208,96,0.15)',
  blue: '#4A90FF',
  blueDim: 'rgba(74,144,255,0.18)',
  statusBar: 'light' as 'light' | 'dark',
  mapTile: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  mapFilter: 'contrast(1.15) brightness(1.1) saturate(1.4)',
  mapSea: '#0B0F1A',
};

export const LIGHT: ThemePalette = {
  bg: '#F2F4F8',
  card: '#FFFFFF',
  cardLight: '#E8EBF0',

  text: '#1A1D2E',
  textSecondary: 'rgba(26,29,46,0.78)',
  textMuted: 'rgba(26,29,46,0.62)',
  textFaint: 'rgba(26,29,46,0.42)',
  border: 'rgba(26,29,46,0.14)',
  borderStrong: 'rgba(26,29,46,0.22)',
  bgSubtle: 'rgba(26,29,46,0.05)',

  // Legacy aliases mapped to light-theme equivalents.
  white: '#1A1D2E',
  white70: 'rgba(26,29,46,0.78)',
  white40: 'rgba(26,29,46,0.62)',
  white15: 'rgba(26,29,46,0.14)',
  white08: 'rgba(26,29,46,0.05)',

  accent: '#00B894',
  accentDim: 'rgba(0,184,148,0.15)',
  orange: '#E67E4A',
  orangeDim: 'rgba(230,126,74,0.15)',
  red: '#E04848',
  redDim: 'rgba(224,72,72,0.12)',
  yellow: '#D4A840',
  yellowDim: 'rgba(212,168,64,0.12)',
  blue: '#3A7BDB',
  blueDim: 'rgba(58,123,219,0.15)',
  statusBar: 'dark',
  mapTile: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  mapFilter: 'contrast(1.08) saturate(1.3)',
  mapSea: '#F2F4F8',
};

export type ThemePalette = typeof DARK;

interface ThemeContextType {
  isDark: boolean;
  colors: ThemePalette;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  isDark: true,
  colors: DARK,
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((v) => {
      if (v === 'light') setIsDark(false);
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
