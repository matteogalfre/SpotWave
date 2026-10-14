import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, NativeModules } from 'react-native';
import fr from './fr';
import en from './en';
import pt from './pt';
import es from './es';
import de from './de';
import it from './it';
import ja from './ja';

export type Locale = 'fr' | 'en' | 'pt' | 'es' | 'de' | 'it' | 'ja';
type DeepString<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R ? (...args: A) => R : string;
};
export type Translations = DeepString<typeof fr>;

const translations: Record<Locale, Translations> = { fr, en, pt, es, de, it, ja };

const STORAGE_KEY = '@spotwave_locale';

function getDeviceLocale(): Locale {
  let raw = '';

  // Primary: the JS engine (Hermes) resolves the real device locale via ICU.
  // This is far more reliable than NativeModules, which returns empty on recent
  // React Native versions (that bug made every device default to English).
  try {
    raw = Intl.DateTimeFormat().resolvedOptions().locale || '';
  } catch {}

  // Fallback: legacy native bridge read, in case Intl is unavailable.
  if (!raw) {
    try {
      raw =
        (Platform.OS === 'ios'
          ? NativeModules.SettingsManager?.settings?.AppleLocale ||
            NativeModules.SettingsManager?.settings?.AppleLanguages?.[0]
          : NativeModules.I18nManager?.localeIdentifier) || '';
    } catch {}
  }

  const lower = raw.toLowerCase();
  if (lower.startsWith('fr')) return 'fr';
  if (lower.startsWith('pt')) return 'pt';
  if (lower.startsWith('es')) return 'es';
  if (lower.startsWith('de')) return 'de';
  if (lower.startsWith('it')) return 'it';
  if (lower.startsWith('ja')) return 'ja';
  return 'en';
}

interface I18nContextType {
  locale: Locale;
  t: Translations;
  setLocale: (l: Locale) => void;
  ready: boolean;
}

const I18nContext = createContext<I18nContextType>({
  locale: 'en',
  t: en,
  setLocale: () => {},
  ready: false,
});

// Locale of the running app, mirrored here so plain helpers (chart labels,
// summaries) can format numbers without threading the locale through.
let activeLocale: Locale = getDeviceLocale();
const COMMA_LOCALES: Locale[] = ['fr', 'es', 'pt', 'de', 'it'];

/** One-decimal display ("0,9" in French, "0.9" in English/Japanese). */
export function fmtDec(value: number, digits = 1, l: Locale = activeLocale): string {
  const s = value.toFixed(digits);
  return COMMA_LOCALES.includes(l) ? s.replace('.', ',') : s;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getDeviceLocale());
  const [ready, setReady] = useState(false);
  activeLocale = locale;

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(saved => {
        if (saved === 'fr' || saved === 'en' || saved === 'pt' || saved === 'es' || saved === 'de' || saved === 'it' || saved === 'ja') setLocaleState(saved);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    AsyncStorage.setItem(STORAGE_KEY, l).catch(() => {});
  }, []);

  const value = {
    locale,
    t: translations[locale],
    setLocale,
    ready,
  };

  return React.createElement(I18nContext.Provider, { value }, children);
}

export function useI18n() {
  return useContext(I18nContext);
}
