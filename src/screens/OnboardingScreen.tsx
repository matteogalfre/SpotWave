import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { ICONS, MCIName } from '../utils/icons';
import { useTheme } from '../context/ThemeContext';
import { useProfile } from '../context/ProfileContext';
import { useLocation } from '../context/LocationContext';
import { useI18n } from '../i18n';
import { getZoneCountries } from '../data/spots';
import { SurferLevel, WaveHeightPref } from '../types';
import Logo from '../components/Logo';
import LanguageSelect from '../components/LanguageSelect';
import TrustBadges from '../components/TrustBadges';
import { countryLabel } from '../utils/countries';
import ScoreBadge from '../components/ScoreBadge';
import { spacing, radius, typography, touchTarget } from '../utils/tokens';
import { hapticLight } from '../utils/haptics';
import { requestNotifPermission, setAlertsEnabled } from '../services/notifications';

const LEVEL_OPTIONS: { key: SurferLevel; icon: MCIName; labelKey: 'levelBeginner' | 'levelIntermediate' | 'levelExpert' }[] = [
  { key: 'beginner', icon: ICONS.surf, labelKey: 'levelBeginner' },
  { key: 'intermediate', icon: ICONS.swell, labelKey: 'levelIntermediate' },
  { key: 'expert', icon: ICONS.bolt, labelKey: 'levelExpert' },
];

const HEIGHT_OPTIONS: { key: WaveHeightPref; label: string }[] = [
  { key: '0.5-1', label: '0.5–1m' },
  { key: '1-2', label: '1–2m' },
  { key: '2+', label: '2m+' },
];

const DURATION_OPTIONS = [1, 1.5, 2, 2.5, 3];

const ZONE_COUNTRIES = getZoneCountries(3, 20);

type Step = 0 | 1 | 2 | 3 | 4;
const TOTAL_STEPS = 5;

interface Props {
  onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: Props) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const { profile, updateProfile } = useProfile();
  const { refresh: refreshLoc } = useLocation();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>(0);
  const [selectedLevel, setSelectedLevel] = useState<SurferLevel>(profile.level);
  const [selectedHeights, setSelectedHeights] = useState<WaveHeightPref[]>(profile.preferredHeight);
  const [selectedDuration, setSelectedDuration] = useState<number>(profile.sessionDuration);
  const [selectedZone, setSelectedZone] = useState<string | undefined>(profile.preferredZone);

  const persistAndComplete = useCallback(() => {
    updateProfile({
      ...profile,
      level: selectedLevel,
      preferredHeight: selectedHeights.length > 0 ? selectedHeights : profile.preferredHeight,
      sessionDuration: selectedDuration,
      preferredZone: selectedZone,
    });
    onComplete();
  }, [profile, selectedLevel, selectedHeights, selectedDuration, selectedZone, updateProfile, onComplete]);

  // Last step is the notifications opt-in: its primary CTA enables the global
  // "good conditions" alert (the single biggest retention lever) after asking
  // for the OS permission. Scheduling itself happens on the Spots tab once
  // forecasts are loaded — here we only persist the preference. Never blocks
  // completion, even if the user denies the OS prompt.
  const enableAlertsAndComplete = useCallback(async () => {
    try {
      const granted = await requestNotifPermission();
      if (granted) await setAlertsEnabled(true);
    } catch {
      // fail soft — onboarding must always be completable
    }
    persistAndComplete();
  }, [persistAndComplete]);

  const handleNext = useCallback(() => {
    hapticLight();
    if (step < TOTAL_STEPS - 1) {
      setStep((step + 1) as Step);
    } else {
      enableAlertsAndComplete();
    }
  }, [step, enableAlertsAndComplete]);

  const handleSkip = useCallback(() => {
    hapticLight();
    persistAndComplete();
  }, [persistAndComplete]);

  // The user opted into location ("Ma position"): trigger the OS permission
  // prompt now, contextually, instead of nagging at app startup.
  const chooseMyLocation = useCallback(() => {
    hapticLight();
    setSelectedZone(undefined);
    refreshLoc(true).catch(() => {});
  }, [refreshLoc]);

  const toggleHeight = (h: WaveHeightPref) => {
    hapticLight();
    setSelectedHeights(prev => {
      if (prev.includes(h)) {
        const r = prev.filter(x => x !== h);
        return r.length === 0 ? [h] : r;
      }
      return [...prev, h];
    });
  };

  return (
    <View style={[s.root, { backgroundColor: colors.bg, paddingTop: insets.top + spacing.xl }]}>
      {/* ─── Step 0 : Welcome (language auto-detected from the device, kept here
          only as a discreet override — it is also changeable in Profile) ─── */}
      {step === 0 && (
        <View style={s.slide}>
          <View style={s.logoWrap}>
            <Logo size={60} />
          </View>
          <Text style={[s.title, { color: colors.white }]} accessibilityRole="header">{t.onboardWelcome}</Text>
          <Text style={[s.sub, { color: colors.textMuted }]}>{t.onboardWelcomeSub}</Text>
          <View style={s.langWrap}>
            <LanguageSelect compact />
          </View>
          <View style={s.trustWrap}>
            <TrustBadges />
          </View>
        </View>
      )}

      {/* ─── Step 1 : Level ─── */}
      {step === 1 && (
        <View style={s.slide}>
          <MaterialCommunityIcons name={ICONS.surf} size={48} color={colors.accent} style={s.stepEmoji} accessibilityElementsHidden />
          <Text style={[s.title, { color: colors.white }]} accessibilityRole="header">{t.onboardProfile}</Text>
          <Text style={[s.sub, { color: colors.textMuted }]}>{t.onboardProfileSub}</Text>
          <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>{t.profileLevel}</Text>
          <View style={s.options}>
            {LEVEL_OPTIONS.map(opt => {
              const active = selectedLevel === opt.key;
              const label = t[opt.labelKey];
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[s.levelBtn, { backgroundColor: active ? colors.accentDim : colors.card, borderColor: active ? colors.accent : colors.border }]}
                  onPress={() => { hapticLight(); setSelectedLevel(opt.key); }}
                  activeOpacity={0.7}
                  accessibilityLabel={label}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <MaterialCommunityIcons name={opt.icon} size={28} color={active ? colors.accent : colors.textMuted} style={s.levelEmoji} />
                  <Text style={[s.levelLabel, { color: active ? colors.accent : colors.textMuted }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* ─── Step 2 : Preferences (height + duration + zone) ─── */}
      {step === 2 && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.slideScrollContent} showsVerticalScrollIndicator={false}>
          <MaterialCommunityIcons name={ICONS.swell} size={48} color={colors.accent} style={s.stepEmoji} accessibilityElementsHidden />
          <Text style={[s.title, { color: colors.white }]} accessibilityRole="header">{t.onboardPrefs}</Text>
          <Text style={[s.sub, { color: colors.textMuted }]}>{t.onboardPrefsSub}</Text>

          <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>{t.onboardPrefsHeight}</Text>
          <View style={s.chipRow}>
            {HEIGHT_OPTIONS.map(h => {
              const on = selectedHeights.includes(h.key);
              return (
                <TouchableOpacity
                  key={h.key}
                  style={[s.chip, { backgroundColor: on ? colors.accentDim : colors.card, borderColor: on ? colors.accent : colors.border }]}
                  onPress={() => toggleHeight(h.key)}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={h.label}
                >
                  <Text style={[s.chipTxt, { color: on ? colors.accent : colors.white }]}>{h.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[s.sectionLabel, { color: colors.textSecondary, marginTop: spacing.xxl }]}>{t.onboardPrefsDuration}</Text>
          <View style={s.chipRow}>
            {DURATION_OPTIONS.map(d => {
              const on = selectedDuration === d;
              return (
                <TouchableOpacity
                  key={d}
                  style={[s.chip, { backgroundColor: on ? colors.accentDim : colors.card, borderColor: on ? colors.accent : colors.border }]}
                  onPress={() => { hapticLight(); setSelectedDuration(d); }}
                  activeOpacity={0.7}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${d}h`}
                >
                  <Text style={[s.chipTxt, { color: on ? colors.accent : colors.white }]}>{d}h</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[s.sectionLabel, { color: colors.textSecondary, marginTop: spacing.xxl }]}>{t.onboardZone}</Text>
          <Text style={[s.sub, { color: colors.textMuted, marginBottom: spacing.md }]}>{t.onboardZoneSub}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
            <TouchableOpacity
              style={[s.chip, { backgroundColor: !selectedZone ? colors.accentDim : colors.card, borderColor: !selectedZone ? colors.accent : colors.border }]}
              onPress={chooseMyLocation}
              activeOpacity={0.7}
              accessibilityRole="radio"
              accessibilityState={{ selected: !selectedZone }}
              accessibilityLabel={t.onboardZoneAuto}
            >
              <Text style={[s.chipTxt, { color: !selectedZone ? colors.accent : colors.white }]}><MaterialCommunityIcons name={ICONS.location} size={14} color={!selectedZone ? colors.accent : colors.white} /> {t.onboardZoneAuto}</Text>
            </TouchableOpacity>
            {ZONE_COUNTRIES.map(z => {
              const active = selectedZone === z.country;
              return (
                <TouchableOpacity
                  key={z.country}
                  style={[s.chip, { backgroundColor: active ? colors.accentDim : colors.card, borderColor: active ? colors.accent : colors.border }]}
                  onPress={() => { hapticLight(); setSelectedZone(z.country); }}
                  activeOpacity={0.7}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${countryLabel(z.country, locale)}, ${z.spots} spots`}
                >
                  <Text style={[s.chipTxt, { color: active ? colors.accent : colors.white }]}>{countryLabel(z.country, locale)}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </ScrollView>
      )}

      {/* ─── Step 3 : Demo - how to read a spot score ─── */}
      {step === 3 && (
        <View style={s.slide}>
          <Text style={[s.title, { color: colors.white }]} accessibilityRole="header">{t.onboardDemo}</Text>
          <Text style={[s.sub, { color: colors.textMuted }]}>{t.onboardDemoSub}</Text>

          <View style={[s.demoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.demoHead}>
              <ScoreBadge score={7.4} size="lg" animated />
              <View style={s.demoInfo}>
                <Text style={[s.demoSpotName, { color: colors.white }]}>Hossegor — La Gravière</Text>
                <Text style={[s.demoSpotLabel, { color: colors.accent }]}><MaterialCommunityIcons name="thumb-up" size={13} color={colors.accent} /> {t.onboardDemoSpotLabel}</Text>
                <Text style={[s.demoSpotMeta, { color: colors.textMuted }]}><MaterialCommunityIcons name={ICONS.swell} size={11} color={colors.textMuted} /> 1.6m · <MaterialCommunityIcons name={ICONS.period} size={11} color={colors.textMuted} /> 12s · <MaterialCommunityIcons name={ICONS.wind} size={11} color={colors.textMuted} /> Offshore 8</Text>
              </View>
            </View>
          </View>

          <View style={s.demoList}>
            <DemoBullet color={colors.accent} icon="ellipse" text={t.onboardDemoScore} colors={colors} />
            <DemoBullet color={colors.accent} icon="color-palette" text={t.onboardDemoColor} colors={colors} />
            <DemoBullet color={colors.accent} icon="text" text={t.onboardDemoLabel} colors={colors} />
            <DemoBullet color={colors.accent} icon="stats-chart" text={t.onboardDemoStats} colors={colors} />
          </View>
        </View>
      )}

      {/* ─── Step 4 : Notifications opt-in (retention lever) ─── */}
      {step === 4 && (
        <View style={s.slide}>
          <View style={[s.notifIconWrap, { backgroundColor: colors.accentDim }]}>
            <Ionicons name="notifications" size={40} color={colors.accent} />
          </View>
          <Text style={[s.title, { color: colors.white }]} accessibilityRole="header">{t.onboardNotifTitle}</Text>
          <Text style={[s.sub, { color: colors.textMuted }]}>{t.onboardNotifSub}</Text>
          <View style={s.demoList}>
            <DemoBullet color={colors.accent} icon="checkmark-circle" text={t.onboardNotifPoint1} colors={colors} />
            <DemoBullet color={colors.accent} icon="person-circle" text={t.onboardNotifPoint2} colors={colors} />
            <DemoBullet color={colors.accent} icon="settings" text={t.onboardNotifPoint3} colors={colors} />
          </View>
        </View>
      )}

      <View style={[s.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={s.dots} accessibilityLabel={t.onboardStep(step + 1, TOTAL_STEPS)}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View key={i} style={[s.dot, { backgroundColor: i === step ? colors.accent : colors.border, width: i === step ? 24 : 8 }]} />
          ))}
        </View>
        <View style={s.footerBtns}>
          {step > 0 ? (
            <TouchableOpacity
              onPress={() => { hapticLight(); setStep((step - 1) as Step); }}
              style={s.backBtn}
              activeOpacity={0.7}
              accessibilityLabel={t.back}
              accessibilityRole="button"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={[s.backBtnTxt, { color: colors.textSecondary }]}>‹ {t.back}</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.backBtn} />
          )}
          <TouchableOpacity
            style={[s.nextBtn, { backgroundColor: colors.accent }]}
            onPress={handleNext}
            activeOpacity={0.8}
            accessibilityLabel={step === TOTAL_STEPS - 1 ? t.onboardNotifEnable : t.onboardNext}
            accessibilityRole="button"
          >
            <Text style={s.nextTxt}>{step === TOTAL_STEPS - 1 ? t.onboardNotifEnable : t.onboardNext}</Text>
          </TouchableOpacity>
        </View>
        {step > 0 && (
          <TouchableOpacity
            onPress={handleSkip}
            style={s.skipBtn}
            activeOpacity={0.7}
            accessibilityLabel={step === TOTAL_STEPS - 1 ? t.onboardNotifLater : t.onboardSkip}
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
          >
            <Text style={[s.skipTxt, { color: colors.textMuted }]}>{step === TOTAL_STEPS - 1 ? t.onboardNotifLater : t.onboardSkip}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function DemoBullet({ color, icon, text, colors }: { color: string; icon: string; text: string; colors: any }) {
  return (
    <View style={s.demoBullet}>
      <View style={[s.demoBulletDot, { backgroundColor: `${color}25` }]}>
        <Ionicons name={icon as any} size={14} color={color} />
      </View>
      <Text style={[s.demoBulletTxt, { color: colors.textSecondary }]}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  slide: { flex: 1, paddingHorizontal: spacing.xxl, justifyContent: 'center' },
  slideScrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xxl, paddingBottom: spacing.xl },
  logoWrap: { alignItems: 'center', marginBottom: spacing.xxl },
  langWrap: { alignItems: 'center', marginTop: spacing.xl },
  trustWrap: { alignItems: 'center', marginTop: spacing.xxl },
  stepEmoji: { fontSize: 48, textAlign: 'center', marginBottom: spacing.lg },
  title: { ...typography.display, textAlign: 'center', marginBottom: spacing.sm },
  sub: { ...typography.body, fontSize: 15, textAlign: 'center', marginBottom: spacing.xxl, lineHeight: 22 },
  sectionLabel: { ...typography.tiny, fontSize: 13, letterSpacing: 1, marginBottom: spacing.md + 2 },

  options: { flexDirection: 'row', gap: spacing.md },
  optionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    paddingVertical: spacing.lg + 2,
    borderWidth: 2,
    gap: spacing.sm + 2,
    minHeight: touchTarget.min + 8,
  },
  optionEmoji: { fontSize: 24 },
  optionLabel: { ...typography.h3, fontSize: 16 },

  levelBtn: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radius.lg,
    paddingVertical: spacing.xl,
    borderWidth: 2,
    minHeight: 90,
    justifyContent: 'center',
  },
  levelEmoji: { fontSize: 28, marginBottom: spacing.sm },
  levelLabel: { ...typography.h3, fontSize: 13 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md - 2,
    borderRadius: radius.pill,
    borderWidth: 2,
    minHeight: touchTarget.min,
    justifyContent: 'center',
  },
  chipTxt: { ...typography.body, fontWeight: '600' },

  demoCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    marginBottom: spacing.xl,
  },
  demoHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  demoInfo: { flex: 1 },
  demoSpotName: { ...typography.h3, fontSize: 16, fontWeight: '800' },
  demoSpotLabel: { ...typography.caption, fontSize: 13, marginTop: 3 },
  demoSpotMeta: { ...typography.micro, fontWeight: '500', marginTop: spacing.xs },
  notifIconWrap: {
    width: 84,
    height: 84,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.xl,
  },
  demoList: { gap: spacing.md },
  demoBullet: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  demoBulletDot: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoBulletTxt: { ...typography.body, fontSize: 13, lineHeight: 19, flex: 1 },

  footer: { paddingHorizontal: spacing.xxl, paddingTop: spacing.md },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  dot: { height: 8, borderRadius: 4 },
  footerBtns: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 90, paddingVertical: spacing.lg, minHeight: touchTarget.min, justifyContent: 'center' },
  backBtnTxt: { ...typography.h3, fontSize: 15, fontWeight: '600' },
  skipBtn: { alignSelf: 'center', paddingVertical: spacing.md - 2, paddingHorizontal: spacing.lg, marginTop: spacing.sm, minHeight: touchTarget.min, justifyContent: 'center' },
  skipTxt: { ...typography.caption, fontSize: 13, fontWeight: '600' },
  nextBtn: {
    flex: 1,
    marginLeft: spacing.md,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg + 2,
    alignItems: 'center',
    minHeight: touchTarget.min + 8,
    justifyContent: 'center',
  },
  nextTxt: { color: '#000', ...typography.h3, fontSize: 16, fontWeight: '800' },
});
