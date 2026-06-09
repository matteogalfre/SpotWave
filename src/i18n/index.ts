import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, NativeModules } from 'react-native';
import fr from './fr';
import en from './en';
import pt from './pt';

export type Locale = 'fr' | 'en' | 'pt';
type DeepString<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R ? (...args: A) => R : string;
};
export type Translations = DeepString<typeof fr>;

const translations: Record<Locale, Translations> = { fr, en, pt };

const STORAGE_KEY = '@spotwave_locale';

function getDeviceLocale(): Locale {
  try {
    const raw =
      Platform.OS === 'ios'
        ? NativeModules.SettingsManager?.settings?.AppleLocale ||
          NativeModules.SettingsManager?.settings?.AppleLanguages?.[0]
        : NativeModules.I18nManager?.localeIdentifier;
    if (raw && typeof raw === 'string') {
      const lower = raw.toLowerCase();
      if (lower.startsWith('fr')) return 'fr';
      if (lower.startsWith('pt')) return 'pt';
    }
  } catch {}
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

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getDeviceLocale());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(saved => {
        if (saved === 'fr' || saved === 'en' || saved === 'pt') setLocaleState(saved);
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
