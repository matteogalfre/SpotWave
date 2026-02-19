import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = '@spotwave_theme';

export const DARK = {
  bg: '#0B0F1A',
  card: '#151A2D',
  cardLight: '#1C2340',
  white: '#EAEEF6',
  white70: 'rgba(234,238,246,0.7)',
  white40: 'rgba(234,238,246,0.4)',
  white15: 'rgba(234,238,246,0.12)',
  white08: 'rgba(234,238,246,0.06)',
  accent: '#00D4AA',
  accentDim: 'rgba(0,212,170,0.15)',
  orange: '#FF8A50',
  orangeDim: 'rgba(255,138,80,0.15)',
  red: '#FF5A5A',
  redDim: 'rgba(255,90,90,0.12)',
  yellow: '#FFD060',
  yellowDim: 'rgba(255,208,96,0.12)',
  blue: '#4A90FF',
  blueDim: 'rgba(74,144,255,0.15)',
  statusBar: 'light' as const,
  mapTile: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
};

export const LIGHT = {
  bg: '#F2F4F8',
  card: '#FFFFFF',
  cardLight: '#E8EBF0',
  white: '#1A1D2E',
  white70: 'rgba(26,29,46,0.7)',
  white40: 'rgba(26,29,46,0.4)',
  white15: 'rgba(26,29,46,0.10)',
  white08: 'rgba(26,29,46,0.05)',
  accent: '#00B894',
  accentDim: 'rgba(0,184,148,0.12)',
  orange: '#E67E4A',
  orangeDim: 'rgba(230,126,74,0.12)',
  red: '#E04848',
  redDim: 'rgba(224,72,72,0.10)',
  yellow: '#D4A840',
  yellowDim: 'rgba(212,168,64,0.10)',
  blue: '#3A7BDB',
  blueDim: 'rgba(58,123,219,0.12)',
  statusBar: 'dark' as const,
  mapTile: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
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
    }).catch(() => {});
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      AsyncStorage.setItem(THEME_KEY, next ? 'dark' : 'light').catch(() => {});
      return next;
    });
  }, []);

  const colors = isDark ? DARK : LIGHT;

  return (
    <ThemeContext.Provider value={{ isDark, colors, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
