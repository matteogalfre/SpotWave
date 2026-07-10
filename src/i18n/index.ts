import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, NativeModules } from 'react-native';
import { translations, type Locale, type Translations } from '@spotwave/core/i18n';

// The translation tables + shape now live in @spotwave/core so the web app can
// reuse them. This module keeps only the React/native glue (device-locale
// detection, persistence, provider, hook).
export type { Locale, Translations } from '@spotwave/core/i18n';
export { fr, en, pt, es, de, it, ja, getTranslations, LOCALES } from '@spotwave/core/i18n';

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
  t: translations.en,
  setLocale: () => {},
  ready: false,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getDeviceLocale());
  const [ready, setReady] = useState(false);

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
