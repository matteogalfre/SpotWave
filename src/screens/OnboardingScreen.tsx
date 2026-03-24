import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useProfile } from '../context/ProfileContext';
import { useI18n, Locale } from '../i18n';
import SPOTS from '../data/spots';
import { SurferLevel } from '../types';
import Logo from '../components/Logo';

const W = Dimensions.get('window').width;

const LANG_OPTIONS: { locale: Locale; label: string; flag: string }[] = [
  { locale: 'fr', label: 'Français', flag: '🇫🇷' },
  { locale: 'en', label: 'English', flag: '🇬🇧' },
];

const LEVEL_OPTIONS: { key: SurferLevel; emoji: string; labelFr: string; labelEn: string }[] = [
  { key: 'beginner', emoji: '🏄', labelFr: 'Débutant', labelEn: 'Beginner' },
  { key: 'intermediate', emoji: '🌊', labelFr: 'Intermédiaire', labelEn: 'Intermediate' },
  { key: 'expert', emoji: '⚡', labelFr: 'Expert', labelEn: 'Expert' },
];

const ZONE_COUNTRIES = (() => {
  const counts: Record<string, number> = {};
  SPOTS.forEach(s => { counts[s.country] = (counts[s.country] || 0) + 1; });
  return Object.entries(counts)
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([country, n]) => ({ country, spots: n }));
})();

interface Props {
  onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: Props) {
  const { colors } = useTheme();
  const { t, locale, setLocale } = useI18n();
  const { profile, updateProfile } = useProfile();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState(0);
  const [selectedLevel, setSelectedLevel] = useState<SurferLevel>(profile.level);
  const [selectedZone, setSelectedZone] = useState<string | undefined>(profile.preferredZone);

  const handleNext = useCallback(() => {
    if (step === 0) {
      setStep(1);
    } else if (step === 1) {
      setStep(2);
    } else {
      updateProfile({ ...profile, level: selectedLevel, preferredZone: selectedZone });
      onComplete();
    }
  }, [step, selectedLevel, selectedZone, profile, updateProfile, onComplete]);

  const handleSkip = useCallback(() => {
    updateProfile({ ...profile, level: selectedLevel, preferredZone: selectedZone });
    onComplete();
  }, [selectedLevel, selectedZone, profile, updateProfile, onComplete]);

  return (
    <View style={[s.root, { backgroundColor: colors.bg, paddingTop: insets.top + 20 }]}>
      {step === 0 && (
        <View style={s.slide}>
          <View style={s.logoWrap}>
            <Logo size={60} color={colors.accent} />
          </View>
          <Text style={[s.title, { color: colors.white }]}>{t.onboardWelcome}</Text>
          <Text style={[s.sub, { color: colors.white40 }]}>{t.onboardWelcomeSub}</Text>
          <Text style={[s.sectionLabel, { color: colors.white70 }]}>{t.onboardLang}</Text>
          <View style={s.options}>
            {LANG_OPTIONS.map(opt => {
              const active = locale === opt.locale;
              return (
                <TouchableOpacity
                  key={opt.locale}
                  style={[s.optionBtn, { backgroundColor: active ? colors.accentDim : colors.card, borderColor: active ? colors.accent : 'transparent' }]}
                  onPress={() => setLocale(opt.locale)}
                  activeOpacity={0.7}
                >
                  <Text style={s.optionEmoji}>{opt.flag}</Text>
                  <Text style={[s.optionLabel, { color: active ? colors.accent : colors.white }]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {step === 1 && (
        <View style={s.slide}>
          <Text style={s.stepEmoji}>🏄‍♂️</Text>
          <Text style={[s.title, { color: colors.white }]}>{t.onboardProfile}</Text>
          <Text style={[s.sub, { color: colors.white40 }]}>{t.onboardProfileSub}</Text>
          <Text style={[s.sectionLabel, { color: colors.white70 }]}>{t.profileLevel}</Text>
          <View style={s.options}>
            {LEVEL_OPTIONS.map(opt => {
              const active = selectedLevel === opt.key;
              const label = locale === 'fr' ? opt.labelFr : opt.labelEn;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[s.levelBtn, { backgroundColor: active ? colors.accentDim : colors.card, borderColor: active ? colors.accent : 'transparent' }]}
                  onPress={() => setSelectedLevel(opt.key)}
                  activeOpacity={0.7}
                >
                  <Text style={s.levelEmoji}>{opt.emoji}</Text>
                  <Text style={[s.levelLabel, { color: active ? colors.accent : colors.white40 }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {step === 2 && (
        <View style={s.slide}>
          <Text style={s.stepEmoji}>🌍</Text>
          <Text style={[s.title, { color: colors.white }]}>{t.onboardZone}</Text>
          <Text style={[s.sub, { color: colors.white40 }]}>{t.onboardZoneSub}</Text>
          <ScrollView style={s.zoneScroll} showsVerticalScrollIndicator={false}>
            <TouchableOpacity
              style={[s.zoneBtn, { backgroundColor: !selectedZone ? colors.accentDim : colors.card, borderColor: !selectedZone ? colors.accent : 'transparent' }]}
              onPress={() => setSelectedZone(undefined)}
              activeOpacity={0.7}
            >
              <Text style={s.zoneEmoji}>📍</Text>
              <Text style={[s.zoneLabel, { color: !selectedZone ? colors.accent : colors.white }]}>{t.onboardZoneAuto}</Text>
            </TouchableOpacity>
            {ZONE_COUNTRIES.map(z => {
              const active = selectedZone === z.country;
              return (
                <TouchableOpacity
                  key={z.country}
                  style={[s.zoneBtn, { backgroundColor: active ? colors.accentDim : colors.card, borderColor: active ? colors.accent : 'transparent' }]}
                  onPress={() => setSelectedZone(z.country)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.zoneLabel, { color: active ? colors.accent : colors.white }]}>{z.country}</Text>
                  <Text style={[s.zoneCount, { color: colors.white40 }]}>{z.spots} spots</Text>
                </TouchableOpacity>
              );
            })}
            <View style={{ height: 120 }} />
          </ScrollView>
        </View>
      )}

      <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
        <View style={s.dots}>
          {[0, 1, 2].map(i => (
            <View key={i} style={[s.dot, { backgroundColor: i === step ? colors.accent : colors.white15 }]} />
          ))}
        </View>
        <View style={s.footerBtns}>
          {step > 0 && (
            <TouchableOpacity onPress={handleSkip} style={s.skipBtn} activeOpacity={0.7}>
              <Text style={[s.skipTxt, { color: colors.white40 }]}>{t.onboardSkip}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[s.nextBtn, { backgroundColor: colors.accent }]}
            onPress={handleNext}
            activeOpacity={0.8}
          >
            <Text style={s.nextTxt}>{step === 2 ? t.onboardStart : t.onboardNext}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  slide: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  logoWrap: { alignItems: 'center', marginBottom: 24 },
  stepEmoji: { fontSize: 48, textAlign: 'center', marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '900', textAlign: 'center', marginBottom: 8 },
  sub: { fontSize: 15, textAlign: 'center', marginBottom: 32, lineHeight: 22 },
  sectionLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 },
  options: { flexDirection: 'row', gap: 12 },
  optionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 16, paddingVertical: 18, borderWidth: 2, gap: 10 },
  optionEmoji: { fontSize: 24 },
  optionLabel: { fontSize: 16, fontWeight: '700' },
  levelBtn: { flex: 1, alignItems: 'center', borderRadius: 16, paddingVertical: 20, borderWidth: 2 },
  levelEmoji: { fontSize: 28, marginBottom: 8 },
  levelLabel: { fontSize: 13, fontWeight: '700' },
  zoneScroll: { flex: 1, marginTop: 8 },
  zoneBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18, marginBottom: 8, borderWidth: 2 },
  zoneEmoji: { fontSize: 18, marginRight: 10 },
  zoneLabel: { fontSize: 15, fontWeight: '700', flex: 1 },
  zoneCount: { fontSize: 12, fontWeight: '600' },
  footer: { paddingHorizontal: 24, paddingTop: 12 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  footerBtns: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skipBtn: { paddingVertical: 16, paddingHorizontal: 16 },
  skipTxt: { fontSize: 14, fontWeight: '600' },
  nextBtn: { flex: 1, marginLeft: 12, borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  nextTxt: { color: '#000', fontSize: 16, fontWeight: '800' },
});
