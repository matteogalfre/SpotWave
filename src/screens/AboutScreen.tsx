import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../i18n';
import { AboutScreenProps } from '../navigation/types';
import { spacing, radius, typography, touchTarget } from '../utils/tokens';
import Constants from 'expo-constants';

const OPEN_METEO_URL = 'https://open-meteo.com/';
const OPEN_METEO_TERMS = 'https://open-meteo.com/en/terms';
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

export default function AboutScreen({ navigation }: AboutScreenProps) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView style={[s.scroll, { backgroundColor: colors.bg }]} showsVerticalScrollIndicator={false}>
      <View style={[s.header, { paddingTop: insets.top + spacing.md }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[s.back, { backgroundColor: colors.cardLight }]}
          accessibilityLabel={t.back}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[s.backTxt, { color: colors.white }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: colors.white }]} accessibilityRole="header">{t.aboutTitle}</Text>
      </View>

      <View style={s.block}>
        <Text style={[s.sectionTitle, { color: colors.accent }]} accessibilityRole="header">{t.aboutWeatherData}</Text>
        <Text style={[s.paragraph, { color: colors.white70 }]}>
          {t.aboutWeatherDesc}
        </Text>
        <TouchableOpacity
          onPress={() => Linking.openURL(OPEN_METEO_URL).catch(() => {})}
          style={[s.link, { borderColor: colors.accent }]}
          accessibilityRole="link"
          accessibilityLabel="open-meteo.com"
        >
          <Text style={[s.linkText, { color: colors.accent }]}>open-meteo.com</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => Linking.openURL(OPEN_METEO_TERMS).catch(() => {})}
          style={[s.link, { borderColor: colors.white15 }]}
          accessibilityRole="link"
          accessibilityLabel={t.aboutTerms}
        >
          <Text style={[s.linkText, { color: colors.white70 }]}>{t.aboutTerms}</Text>
        </TouchableOpacity>
      </View>

      <View style={s.block}>
        <Text style={[s.sectionTitle, { color: colors.accent }]} accessibilityRole="header">{t.aboutDisclaimer}</Text>
        <Text style={[s.paragraph, { color: colors.white70 }]}>
          {t.aboutDisclaimerDesc}
        </Text>
      </View>

      <View style={s.block}>
        <Text style={[s.sectionTitle, { color: colors.accent }]} accessibilityRole="header">{t.aboutPrivacy}</Text>
        <Text style={[s.paragraph, { color: colors.white70 }]}>
          {t.aboutPrivacyDesc}
        </Text>
      </View>

      <View style={s.block}>
        <Text style={[s.sectionTitle, { color: colors.accent }]} accessibilityRole="header">{t.aboutContact}</Text>
        <Text style={[s.paragraph, { color: colors.white70 }]}>
          {t.aboutContactDesc}
        </Text>
      </View>

      <View style={[s.footer, { paddingBottom: insets.bottom + spacing.xxl }]}>
        <Text style={[s.version, { color: colors.white40 }]}>{t.aboutVersion(APP_VERSION)}</Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  back: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  backTxt: { fontSize: 24, fontWeight: '300', marginTop: -2 },
  title: { ...typography.h1, fontSize: 24 },
  block: { paddingHorizontal: spacing.xl, marginBottom: spacing.xxl },
  sectionTitle: { ...typography.h3, fontSize: 16, marginBottom: spacing.md },
  paragraph: { ...typography.body, lineHeight: 22, marginBottom: spacing.md },
  link: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
    paddingRight: spacing.sm,
    borderBottomWidth: 1,
    marginTop: spacing.xs,
    minHeight: touchTarget.min,
    justifyContent: 'center',
  },
  linkText: { ...typography.bodyBold, fontSize: 14, fontWeight: '600' },
  footer: { alignItems: 'center', paddingTop: spacing.xxl },
  version: { ...typography.caption },
});
