import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Animated, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { ICONS, MCIName } from '../utils/icons';
import { hapticLight } from '../utils/haptics';
import { useProfile } from '../context/ProfileContext';
import { useTheme } from '../context/ThemeContext';
import { useLocation } from '../context/LocationContext';
import { SurferLevel, WaveHeightPref, SurferProfile } from '../types';
import { ProfileScreenProps } from '../navigation/types';
import { useI18n, Locale } from '../i18n';
import { requestNotifPermission, getAlertsEnabled, setAlertsEnabled as setAlertsEnabledPref, scheduleGoodConditionAlerts } from '../services/notifications';
import { getStoredForecasts } from '../context/ForecastStore';
import { useToast } from '../components/Toast';
import { getZoneCountries } from '../data/spots';
import { spacing, radius, typography, touchTarget, elevation } from '../utils/tokens';
import { useWebLayout, webCenter, WEB_READ_MAX, isWebPlatform, webTabBarClearance } from '../utils/webLayout';
import LanguageSelect from '../components/LanguageSelect';
import SuggestSpotModal from '../components/SuggestSpotModal';
import { PLAY_STORE_URL, PLAY_STORE_MARKET, SUPPORT_URL } from '../utils/constants';
import { countryLabel } from '../utils/countries';

const LEVELS_MAP = { beginner: 'levelBeginner', intermediate: 'levelIntermediate', expert: 'levelExpert' } as const;

const ZONE_COUNTRIES = getZoneCountries().map((z) => z.country);

const LEVELS: { key: SurferLevel; icon: MCIName }[] = [
  { key: 'beginner', icon: ICONS.surf },
  { key: 'intermediate', icon: ICONS.swell },
  { key: 'expert', icon: ICONS.bolt },
];

const HEIGHTS: { key: WaveHeightPref; label: string }[] = [
  { key: '0.5-1', label: '0.5–1m' },
  { key: '1-2', label: '1–2m' },
  { key: '2+', label: '2m+' },
];

const SESSION_DURATIONS = [1, 1.5, 2, 2.5, 3];

// Small double tap used to confirm an instant save (sync badge).
const hapticDouble = () => {
  hapticLight();
  setTimeout(hapticLight, 110);
};

function toggle<T>(arr: T[], item: T): T[] {
  if (arr.includes(item)) {
    const r = arr.filter((x) => x !== item);
    return r.length === 0 ? [item] : r;
  }
  return [...arr, item];
}

function ToggleSwitch({ value, onToggle, accentColor, trackBg, label }: { value: boolean; onToggle: (v: boolean) => void; accentColor: string; trackBg: string; label?: string }) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => {
        hapticLight();
        onToggle(!value);
      }}
      style={[toggleS.track, { backgroundColor: value ? accentColor : trackBg }]}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <View style={[toggleS.dot, { transform: [{ translateX: value ? 18 : 2 }] }]} />
    </TouchableOpacity>
  );
}

const toggleS = StyleSheet.create({
  track: { width: 44, height: 26, borderRadius: 13, justifyContent: 'center' },
  dot: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFF' },
});

function SettingRow({ icon, iconColor, iconBg, title, subtitle, right, onPress, colors, isLast }: {
  icon: string; iconColor: string; iconBg: string;
  title: string; subtitle?: string;
  right?: React.ReactNode; onPress?: () => void;
  colors: any; isLast?: boolean;
}) {
  const content = (
    <>
      <View style={s.settingLeft}>
        <View style={[s.settingIcon, { backgroundColor: iconBg }]}>
          <Ionicons name={icon as any} size={18} color={iconColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.settingTitle, { color: colors.white }]}>{title}</Text>
          {subtitle ? <Text style={[s.settingSub, { color: colors.textMuted }]}>{subtitle}</Text> : null}
        </View>
      </View>
      {right}
    </>
  );

  if (onPress) {
    return (
      <>
        <TouchableOpacity style={s.settingRow} onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={title}>
          {content}
        </TouchableOpacity>
        {!isLast && <View style={[s.settingDivider, { backgroundColor: colors.border }]} />}
      </>
    );
  }

  return (
    <>
      <View style={s.settingRow}>{content}</View>
      {!isLast && <View style={[s.settingDivider, { backgroundColor: colors.border }]} />}
    </>
  );
}

function HourStepper({ label, value, onChange, min, max, colors }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; colors: any }) {
  const canDec = value > min;
  const canInc = value < max;
  return (
    <View style={hs.row}>
      <Text style={[hs.label, { color: colors.textSecondary }]}>{label}</Text>
      <View style={hs.controls}>
        <TouchableOpacity
          style={[hs.btn, { backgroundColor: canDec ? colors.accentDim : colors.bgSubtle }]}
          onPress={() => { if (canDec) { hapticLight(); onChange(value - 1); } }}
          activeOpacity={0.6}
          disabled={!canDec}
          accessibilityLabel={`${label} -1`}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canDec }}
        >
          <Text style={[hs.btnTxt, { color: canDec ? colors.accent : colors.textFaint }]}>−</Text>
        </TouchableOpacity>
        <View style={[hs.valBox, { backgroundColor: colors.bgSubtle }]} accessibilityLabel={`${label}: ${value}h`}>
          <Text style={[hs.val, { color: colors.white }]}>{value}h</Text>
        </View>
        <TouchableOpacity
          style={[hs.btn, { backgroundColor: canInc ? colors.accentDim : colors.bgSubtle }]}
          onPress={() => { if (canInc) { hapticLight(); onChange(value + 1); } }}
          activeOpacity={0.6}
          disabled={!canInc}
          accessibilityLabel={`${label} +1`}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canInc }}
        >
          <Text style={[hs.btnTxt, { color: canInc ? colors.accent : colors.textFaint }]}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const hs = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md + 2 },
  label: { ...typography.body, fontWeight: '600' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  btn: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnTxt: { fontSize: 22, fontWeight: '600', marginTop: -1 },
  valBox: { minWidth: 56, borderRadius: radius.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, alignItems: 'center' },
  val: { ...typography.h3, fontSize: 16, fontWeight: '800' },
});

export default function ProfileScreen({ navigation }: ProfileScreenProps) {
  const { t, locale } = useI18n();
  const { profile, updateProfile } = useProfile();
  const { colors, isDark, toggleTheme } = useTheme();
  const { refresh: refreshLoc } = useLocation();
  const { show: showToast } = useToast();
  const insets = useSafeAreaInsets();
  const { isWide } = useWebLayout();
  const [form, setForm] = useState<SurferProfile>({ ...profile });
  const [alertsOn, setAlertsOn] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => { setForm({ ...profile }); }, [profile]);

  useEffect(() => {
    getAlertsEnabled().then(setAlertsOn).catch(() => {});
  }, []);

  const handleToggleAlerts = async (val: boolean) => {
    if (val) {
      const granted = await requestNotifPermission();
      if (!granted) {
        showToast(t.alertNeedsPermission, 'error');
        return;
      }
    }
    await setAlertsEnabledPref(val);
    setAlertsOn(val);
    // Apply right away using the forecasts already loaded in memory, so the
    // toggle takes effect without waiting for the Spots tab to reload.
    // (No-op when the store is empty or the device is offline.)
    const fc = getStoredForecasts();
    if (fc.length > 0) scheduleGoodConditionAlerts(fc, locale).catch(() => {});
  };

  const showSyncedHint = useCallback(() => {
    hapticDouble();
    fadeAnim.stopAnimation();
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1200),
      Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim]);

  // Every control saves instantly and flashes the "synced" badge — no edit mode.
  const apply = useCallback((next: SurferProfile) => {
    setForm(next);
    updateProfile(next);
    showSyncedHint();
  }, [updateProfile, showSyncedHint]);

  const LANG_LABELS: Record<Locale, string> = {
    fr: t.profileLanguageFr,
    en: t.profileLanguageEn,
    pt: t.profileLanguagePt,
    es: t.profileLanguageEs,
    de: t.profileLanguageDe,
    it: t.profileLanguageIt,
    ja: t.profileLanguageJa,
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <ScrollView style={[{ flex: 1, backgroundColor: colors.bg }, webCenter(WEB_READ_MAX, isWide)]} contentContainerStyle={isWebPlatform ? { paddingBottom: webTabBarClearance(insets.bottom) } : undefined} showsVerticalScrollIndicator={false}>
      <View style={[s.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={s.headerLeft}>
          <Text style={[s.title, { color: colors.white }]} accessibilityRole="header">{t.profileTitle}</Text>
          <Text style={[s.sub, { color: colors.textMuted }]}>{t.profileSub}</Text>
        </View>
      </View>

      <View>

      {/* Level */}
      <Section label={t.profileLevel} colors={colors}>
        <View style={s.levelRow}>
          {LEVELS.map((l) => {
            const active = form.level === l.key;
            const levelLabel = t[LEVELS_MAP[l.key]];
            return (
              <TouchableOpacity
                key={l.key}
                style={[s.levelBtn, { backgroundColor: active ? colors.accentDim : colors.bgSubtle, borderColor: active ? colors.accent : 'transparent' }]}
                activeOpacity={0.7}
                onPress={() => apply({ ...form, level: l.key })}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={levelLabel}
              >
                <MaterialCommunityIcons name={l.icon} size={24} color={active ? colors.accent : colors.textMuted} style={s.levelEmoji} />
                <Text style={[s.levelLabel, { color: active ? colors.accent : colors.textMuted }]}>{levelLabel}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Section>

      {/* Wave height */}
      <Section label={t.profileHeight} colors={colors}>
        <View style={s.chipRow}>
          {HEIGHTS.map((h) => {
            const on = form.preferredHeight.includes(h.key);
            return (
              <TouchableOpacity
                key={h.key}
                style={[s.chip, { backgroundColor: on ? colors.accentDim : colors.bgSubtle, borderColor: on ? colors.accent : 'transparent' }]}
                activeOpacity={0.7}
                onPress={() => apply({ ...form, preferredHeight: toggle(form.preferredHeight, h.key) })}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={h.label}
              >
                <Text style={[s.chipTxt, { color: on ? colors.accent : colors.textMuted }]}>{h.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Section>

      {/* Session duration */}
      <Section label={t.profileSession} colors={colors}>
        <View style={s.chipRow}>
          {SESSION_DURATIONS.map((d) => {
            const on = form.sessionDuration === d;
            return (
              <TouchableOpacity
                key={d}
                style={[s.chip, { backgroundColor: on ? colors.accentDim : colors.bgSubtle, borderColor: on ? colors.accent : 'transparent' }]}
                activeOpacity={0.7}
                onPress={() => apply({ ...form, sessionDuration: d })}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${d}h`}
              >
                <Text style={[s.chipTxt, { color: on ? colors.accent : colors.textMuted }]}>{d}h</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Section>

      {/* Hours */}
      <Section label={t.profileHours} colors={colors}>
        <HourStepper
          label={t.profileFrom}
          value={form.availableFrom}
          onChange={(v) => apply({ ...form, availableFrom: v })}
          min={5}
          max={form.availableTo - 1}
          colors={colors}
        />
        <HourStepper
          label={t.profileTo}
          value={form.availableTo}
          onChange={(v) => apply({ ...form, availableTo: v })}
          min={form.availableFrom + 1}
          max={21}
          colors={colors}
        />
        <Text style={[s.hoursSummary, { color: colors.textMuted }]}>
          {t.profileHoursSummary(form.availableFrom, form.availableTo)}
        </Text>
      </Section>

      </View>

      {/* Preferred zone — GPS (priorité) fusionné avec la zone manuelle. Sauvé instantanément. */}
      <View style={s.settingsSection}>
        <Text style={[s.secLabel, { color: colors.textSecondary }]} accessibilityRole="header">{t.profilePreferredZone}</Text>
        <View style={[s.secCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, padding: spacing.md }]}>
          <Text style={[s.hoursSummary, { color: colors.textMuted, marginBottom: spacing.md }]}>{t.profilePreferredZoneDesc}</Text>
          <TouchableOpacity
            style={[s.chip, { backgroundColor: !form.preferredZone ? colors.accentDim : colors.bgSubtle, borderColor: !form.preferredZone ? colors.accent : 'transparent', marginBottom: spacing.sm }]}
            onPress={() => { apply({ ...form, preferredZone: undefined }); refreshLoc(true).catch(() => {}); }}
            activeOpacity={0.7}
            accessibilityRole="radio"
            accessibilityState={{ selected: !form.preferredZone }}
            accessibilityLabel={t.profilePreferredZoneNone}
          >
            <Text style={[s.chipTxt, { color: !form.preferredZone ? colors.accent : colors.textMuted }]}>{t.profilePreferredZoneNone}</Text>
          </TouchableOpacity>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
            {ZONE_COUNTRIES.map(z => {
              const active = form.preferredZone === z;
              return (
                <TouchableOpacity
                  key={z}
                  style={[s.chip, { backgroundColor: active ? colors.accentDim : colors.bgSubtle, borderColor: active ? colors.accent : 'transparent' }]}
                  onPress={() => apply({ ...form, preferredZone: z })}
                  activeOpacity={0.7}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={countryLabel(z, locale)}
                >
                  <Text style={[s.chipTxt, { color: active ? colors.accent : colors.textMuted }]}>{countryLabel(z, locale)}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>

      <View style={s.settingsSection}>
        <Text style={[s.secLabel, { color: colors.textSecondary }]} accessibilityRole="header">{t.profileAppearance}</Text>
        <View style={[s.secCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth }]}>
          <SettingRow
            icon={isDark ? 'moon' : 'sunny'}
            iconColor={colors.accent}
            iconBg={colors.accentDim}
            title={isDark ? t.profileThemeDark : t.profileThemeLight}
            subtitle={t.profileThemeSub}
            colors={colors}
            right={<ToggleSwitch value={isDark} onToggle={toggleTheme} accentColor={colors.accent} trackBg={colors.border} label={isDark ? t.profileThemeDark : t.profileThemeLight} />}
          />
          <SettingRow
            icon="language"
            iconColor={colors.blue}
            iconBg={colors.blueDim}
            title={t.profileLanguage}
            subtitle={LANG_LABELS[locale]}
            colors={colors}
            isLast={isWebPlatform}
            right={<LanguageSelect compact />}
          />
          {/* Push alerts don't exist on the PWA (no service-worker push here) — hide the row on web. */}
          {!isWebPlatform && (
            <SettingRow
              icon="notifications"
              iconColor={colors.yellow}
              iconBg={colors.yellowDim}
              title={t.profileAlertsTitle}
              subtitle={t.profileAlertsSub}
              colors={colors}
              isLast
              right={<ToggleSwitch value={alertsOn} onToggle={handleToggleAlerts} accentColor={colors.accent} trackBg={colors.border} label={t.profileAlertsTitle} />}
            />
          )}
        </View>
      </View>

      <View style={s.settingsSection}>
        <Text style={[s.secLabel, { color: colors.textSecondary }]} accessibilityRole="header">{t.profileCommunity}</Text>
        <View style={[s.secCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth }]}>
          <SettingRow
            icon="add-circle"
            iconColor={colors.accent}
            iconBg={colors.accentDim}
            title={t.profileSuggestSpot}
            subtitle={t.profileSuggestSpotSub}
            colors={colors}
            isLast
            onPress={() => { hapticLight(); setSuggestOpen(true); }}
            right={<Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
          />
        </View>
      </View>

      <View style={s.settingsSection}>
        <Text style={[s.secLabel, { color: colors.textSecondary }]} accessibilityRole="header">{t.profileAbout}</Text>
        <View style={[s.secCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth }]}>
          {/* PWA users don't have the native app — offer the Play Store download. */}
          {isWebPlatform && (
            <SettingRow
              icon="logo-google-playstore"
              iconColor={colors.accent}
              iconBg={colors.accentDim}
              title={t.profileGetAndroid}
              subtitle={t.profileGetAndroidSub}
              colors={colors}
              onPress={() => { hapticLight(); Linking.openURL(PLAY_STORE_URL).catch(() => {}); }}
              right={<Ionicons name="open-outline" size={18} color={colors.textMuted} />}
            />
          )}
          <SettingRow
            icon="star"
            iconColor={colors.yellow}
            iconBg={colors.yellowDim}
            title={t.profileRateApp}
            subtitle={t.profileRateAppSub}
            colors={colors}
            onPress={() => { hapticLight(); Linking.openURL(PLAY_STORE_MARKET).catch(() => Linking.openURL(PLAY_STORE_URL).catch(() => {})); }}
            right={<Ionicons name="open-outline" size={18} color={colors.textMuted} />}
          />
          <SettingRow
            icon="heart"
            iconColor={colors.red}
            iconBg={colors.redDim}
            title={t.profileSupport}
            subtitle={t.profileSupportSub}
            colors={colors}
            onPress={() => { hapticLight(); Linking.openURL(SUPPORT_URL).catch(() => {}); }}
            right={<Ionicons name="open-outline" size={18} color={colors.textMuted} />}
          />
          <SettingRow
            icon="book"
            iconColor={colors.blue}
            iconBg={colors.blueDim}
            title={t.profileGuide}
            subtitle={t.profileGuideSub ?? undefined}
            colors={colors}
            onPress={() => { hapticLight(); navigation.navigate('Guide'); }}
            right={<Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
          />
          <SettingRow
            icon="information-circle"
            iconColor={colors.accent}
            iconBg={colors.accentDim}
            title={t.profileAboutSub}
            subtitle={t.profileAboutDesc}
            colors={colors}
            isLast
            onPress={() => { hapticLight(); navigation.navigate('About'); }}
            right={<Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
          />
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
    <Animated.View
      pointerEvents="none"
      style={[s.syncBadge, { top: insets.top + spacing.md, backgroundColor: colors.accentDim, opacity: fadeAnim }]}
    >
      <Ionicons name="checkmark-circle" size={13} color={colors.accent} />
      <Text style={[s.syncTxt, { color: colors.accent }]}>{t.profileAutoSaved}</Text>
    </Animated.View>
    <SuggestSpotModal visible={suggestOpen} onClose={() => setSuggestOpen(false)} />
    </View>
  );
}

function Section({ label, children, colors }: { label: string; children: React.ReactNode; colors: any }) {
  return (
    <View style={s.section}>
      <Text style={[s.secLabel, { color: colors.textSecondary }]} accessibilityRole="header">{label}</Text>
      <View style={[s.secCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth }]}>{children}</View>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerLeft: { flex: 1, marginRight: spacing.md },
  title: { ...typography.display },
  sub: { ...typography.body, fontWeight: '500', marginTop: 2 },
  syncBadge: {
    position: 'absolute',
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
  },
  syncTxt: { ...typography.micro, fontWeight: '700' },

  section: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  settingsSection: { marginTop: spacing.xxl, paddingHorizontal: spacing.lg },
  secLabel: { ...typography.sectionLabel, marginBottom: spacing.md - 2, marginHorizontal: spacing.xs },
  secCard: { borderRadius: radius.md, padding: spacing.md + 2, ...elevation.sm },

  levelRow: { flexDirection: 'row', gap: spacing.sm },
  levelBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
    minHeight: 80,
    justifyContent: 'center',
  },
  levelEmoji: { fontSize: 24, marginBottom: spacing.xs + 2 },
  levelLabel: { ...typography.caption },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    minHeight: touchTarget.min,
    justifyContent: 'center',
  },
  chipTxt: { ...typography.body, fontWeight: '600' },

  hoursSummary: { ...typography.micro, lineHeight: 16, marginTop: spacing.xs, fontWeight: '500' },

  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    minHeight: touchTarget.min,
  },
  settingLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: spacing.md, gap: spacing.md },
  settingIcon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  settingTitle: { ...typography.h3, fontSize: 15, fontWeight: '600' },
  settingSub: { ...typography.caption, marginTop: 2 },
  settingDivider: { height: StyleSheet.hairlineWidth, marginLeft: 52 },
});
