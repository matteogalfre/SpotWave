import React, { Component, ErrorInfo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Appearance, Platform, NativeModules } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { log } from '../utils/logger';
import { spacing, radius, typography, touchTarget } from '../utils/tokens';
import { DARK as THEME_DARK, LIGHT as THEME_LIGHT } from '../context/ThemeContext';

interface Props { children: React.ReactNode; }
interface State { hasError: boolean; error: Error | null; key: number; }

// ErrorBoundary sits above ThemeProvider, so it can't read the chosen theme via
// context. We derive the crash-screen palette from the single source of truth
// (ThemeContext) using the system appearance to avoid duplicate-palette drift.
const DARK = { bg: THEME_DARK.bg, text: THEME_DARK.text, textDim: THEME_DARK.textMuted, accent: THEME_DARK.accent, btnTxt: '#0B0F1A' };
const LIGHT = { bg: THEME_LIGHT.bg, text: THEME_LIGHT.text, textDim: THEME_LIGHT.textMuted, accent: THEME_LIGHT.accent, btnTxt: '#FFFFFF' };

const LABELS = {
  fr: { title: 'Oups', message: 'Quelque chose s\'est mal passé', retry: 'Réessayer' },
  en: { title: 'Oops', message: 'Something went wrong', retry: 'Retry' },
  es: { title: 'Vaya', message: 'Algo salió mal', retry: 'Reintentar' },
  pt: { title: 'Ups', message: 'Algo correu mal', retry: 'Tentar de novo' },
  de: { title: 'Ups', message: 'Etwas ist schiefgelaufen', retry: 'Erneut versuchen' },
  it: { title: 'Ops', message: 'Qualcosa è andato storto', retry: 'Riprova' },
  ja: { title: 'エラー', message: '問題が発生しました', retry: '再試行' },
} as const;

function getDeviceLocale(): keyof typeof LABELS {
  try {
    const raw =
      Platform.OS === 'ios'
        ? NativeModules.SettingsManager?.settings?.AppleLocale ||
          NativeModules.SettingsManager?.settings?.AppleLanguages?.[0]
        : NativeModules.I18nManager?.localeIdentifier;
    if (raw && typeof raw === 'string') {
      const lower = raw.toLowerCase();
      if (lower.startsWith('fr')) return 'fr';
      if (lower.startsWith('es')) return 'es';
      if (lower.startsWith('pt')) return 'pt';
      if (lower.startsWith('de')) return 'de';
      if (lower.startsWith('it')) return 'it';
      if (lower.startsWith('ja')) return 'ja';
    }
  } catch {}
  return 'en';
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, key: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    log.error('Uncaught error:', error?.message, info.componentStack);
  }

  reset = () => this.setState(prev => ({ hasError: false, error: null, key: prev.key + 1 }));

  render() {
    if (this.state.hasError) {
      const c = Appearance.getColorScheme() === 'light' ? LIGHT : DARK;
      const lang = getDeviceLocale();
      const lbl = LABELS[lang];
      // Show the friendly localized message, never the raw (often English /
      // technical) error text — that stays in the log / crash reporter only.
      return (
        <View style={[s.root, { backgroundColor: c.bg }]} accessibilityRole="alert">
          <MaterialCommunityIcons name="alert-circle-outline" size={48} color={c.textDim} style={s.emoji} accessibilityElementsHidden />
          <Text style={[s.title, { color: c.text }]}>{lbl.title}</Text>
          <Text style={[s.msg, { color: c.textDim }]}>{lbl.message}</Text>
          <TouchableOpacity
            style={[s.btn, { backgroundColor: c.accent }]}
            onPress={this.reset}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={lbl.retry}
          >
            <Text style={[s.btnTxt, { color: c.btnTxt }]}>{lbl.retry}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return <React.Fragment key={this.state.key}>{this.props.children}</React.Fragment>;
  }
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xxxl },
  emoji: { fontSize: 48, marginBottom: spacing.lg },
  title: { ...typography.h1, textAlign: 'center', marginBottom: spacing.sm },
  msg: { ...typography.body, textAlign: 'center', marginBottom: spacing.xxl },
  btn: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    minHeight: touchTarget.min,
    justifyContent: 'center',
  },
  btnTxt: { ...typography.bodyBold, fontSize: 15 },
});
