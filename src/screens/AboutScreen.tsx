import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../i18n';
import { AboutScreenProps } from '../navigation/types';
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
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[s.back, { backgroundColor: colors.cardLight }]} accessibilityLabel="Retour" accessibilityRole="button">
          <Text style={[s.backTxt, { color: colors.white }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: colors.white }]}>{t.aboutTitle}</Text>
      </View>

      <View style={s.block}>
        <Text style={[s.sectionTitle, { color: colors.accent }]}>{t.aboutWeatherData}</Text>
        <Text style={[s.paragraph, { color: colors.white70 }]}>
          {t.aboutWeatherDesc}
        </Text>
        <TouchableOpacity onPress={() => Linking.openURL(OPEN_METEO_URL).catch(() => {})} style={[s.link, { borderColor: colors.accent }]} accessibilityRole="link">
          <Text style={[s.linkText, { color: colors.accent }]}>open-meteo.com</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => Linking.openURL(OPEN_METEO_TERMS).catch(() => {})} style={[s.link, { borderColor: colors.white15 }]} accessibilityRole="link">
          <Text style={[s.linkText, { color: colors.white70 }]}>{t.aboutTerms}</Text>
        </TouchableOpacity>
      </View>

      <View style={s.block}>
        <Text style={[s.sectionTitle, { color: colors.accent }]}>{t.aboutDisclaimer}</Text>
        <Text style={[s.paragraph, { color: colors.white70 }]}>
          {t.aboutDisclaimerDesc}
        </Text>
      </View>

      <View style={s.block}>
        <Text style={[s.sectionTitle, { color: colors.accent }]}>{t.aboutPrivacy}</Text>
        <Text style={[s.paragraph, { color: colors.white70 }]}>
          {t.aboutPrivacyDesc}
        </Text>
      </View>

      <View style={s.block}>
        <Text style={[s.sectionTitle, { color: colors.accent }]}>{t.aboutContact}</Text>
        <Text style={[s.paragraph, { color: colors.white70 }]}>
          {t.aboutContactDesc}
        </Text>
      </View>

      <View style={[s.footer, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={[s.version, { color: colors.white40 }]}>SpotWave · Version {APP_VERSION}</Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16 },
  back: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  backTxt: { fontSize: 24, fontWeight: '300', marginTop: -2 },
  title: { fontSize: 24, fontWeight: '800' },
  block: { paddingHorizontal: 20, marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 10 },
  paragraph: { fontSize: 14, lineHeight: 22, marginBottom: 12 },
  link: { alignSelf: 'flex-start', paddingVertical: 6, paddingRight: 8, borderBottomWidth: 1, marginTop: 4 },
  linkText: { fontSize: 14, fontWeight: '600' },
  footer: { alignItems: 'center', paddingTop: 24 },
  version: { fontSize: 12, fontWeight: '600' },
});
