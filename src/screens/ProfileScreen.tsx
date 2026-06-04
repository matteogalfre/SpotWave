import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useProfile } from '../context/ProfileContext';
import { useTheme } from '../context/ThemeContext';
import { useLocation } from '../context/LocationContext';
import { useToast } from '../components/Toast';
import { SurferLevel, WaveHeightPref, SurferProfile, DEFAULT_PROFILE } from '../types';
import { ProfileScreenProps } from '../navigation/types';
import { useI18n, Locale } from '../i18n';
import { requestNotifPermission, getAlertsEnabled, setAlertsEnabled as setAlertsEnabledPref } from '../services/notifications';
import { getZoneCountries } from '../data/spots';
import { spacing, radius, typography, touchTarget } from '../utils/tokens';
import { BreakType, WindPref } from '../types';

const LEVELS_MAP = { beginner: 'levelBeginner', intermediate: 'levelIntermediate', expert: 'levelExpert' } as const;

const BREAK_TYPES: { key: BreakType; labelKey: 'breakBeach' | 'breakReef' | 'breakPoint'; emoji: string }[] = [
  { key: 'beach', labelKey: 'breakBeach', emoji: '🏖️' },
  { key: 'reef', labelKey: 'breakReef', emoji: '🪨' },
  { key: 'point', labelKey: 'breakPoint', emoji: '⛰️' },
];

const WIND_PREFS: { key: WindPref; labelKey: 'profileWindOffshore' | 'profileWindSideShore' | 'profileWindAny' }[] = [
  { key: 'offshore', labelKey: 'profileWindOffshore' },
  { key: 'side-shore', labelKey: 'profileWindSideShore' },
  { key: 'any', labelKey: 'profileWindAny' },
];

const ZONE_COUNTRIES = getZoneCountries().map((z) => z.country);

const LEVELS: { key: SurferLevel; emoji: string }[] = [
  { key: 'beginner', emoji: '🏄' },
  { key: 'intermediate', emoji: '🌊' },
  { key: 'expert', emoji: '⚡' },
];

const HEIGHTS: { key: WaveHeightPref; label: string }[] = [
  { key: '0.5-1', label: '0.5–1m' },
  { key: '1-2', label: '1–2m' },
  { key: '2+', label: '2m+' },
];

const SESSION_DURATIONS = [1, 1.5, 2, 2.5, 3];

const hapticLight = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
const hapticError = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
const hapticSuccess = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

function toggle<T>(arr: T[], item: T): T[] {
  if (arr.includes(item)) {
    const r = arr.filter((x) => x !== item);
    return r.length === 0 ? [item] : r;
  }
  return [...arr, item];
}

function ToggleSwitch({ value, onToggle, accentColor, trackBg }: { value: boolean; onToggle: (v: boolean) => void; accentColor: string; trackBg: string }) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => {
        hapticLight();
        onToggle(!value);
      }}
      style={[toggleS.track, { backgroundColor: value ? accentColor : trackBg }]}
      accessibilityRole="switch"
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
  const { t, locale, setLocale } = useI18n();
  const { profile, updateProfile } = useProfile();
  const { colors, isDark, toggleTheme } = useTheme();
  const { location, loading: locLoading, denied: locDenied, refresh: refreshLoc } = useLocation();
  const { show: showToast } = useToast();
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<SurferProfile>({ ...profile });
  const [alertsOn, setAlertsOn] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [syncedHint, setSyncedHint] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => { setForm({ ...profile }); }, [profile]);

  useEffect(() => {
    getAlertsEnabled().then(setAlertsOn).catch(() => {});
  }, []);

  const handleToggleAlerts = async (val: boolean) => {
    if (val) {
      const granted = await requestNotifPermission();
      if (!granted) return;
    }
    await setAlertsEnabledPref(val);
    setAlertsOn(val);
  };

  const showSyncedHint = useCallback(() => {
    setSyncedHint(true);
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1200),
      Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setSyncedHint(false));
  }, [fadeAnim]);

  const handleStartEdit = useCallback(() => {
    hapticLight();
    setIsEditing(true);
  }, []);

  const handleCancel = useCallback(() => {
    hapticLight();
    setForm({ ...profile });
    setIsEditing(false);
  }, [profile]);

  const handleSave = useCallback(async () => {
    if (form.availableFrom >= form.availableTo) {
      hapticError();
      showToast(t.profileValidFrom, 'error');
      return;
    }
    if (form.preferredHeight.length === 0) {
      hapticError();
      showToast(t.profileValidHeight, 'error');
      return;
    }
    try {
      await updateProfile(form);
      hapticSuccess();
      showSyncedHint();
      setIsEditing(false);
    } catch {
      hapticError();
      showToast(t.profileSaveError, 'error');
    }
  }, [form, updateProfile, t, showToast, showSyncedHint]);

  const handleReset = useCallback(() => {
    hapticLight();
    setForm({ ...DEFAULT_PROFILE });
  }, []);

  // True when the form differs from the saved profile (arrays compared as sets).
  const isDirty = useMemo(() => {
    const sameSet = (x: string[] = [], y: string[] = []) =>
      x.length === y.length && [...x].sort().join(',') === [...y].sort().join(',');
    return (
      form.level !== profile.level ||
      form.windPref !== profile.windPref ||
      form.sessionDuration !== profile.sessionDuration ||
      form.availableFrom !== profile.availableFrom ||
      form.availableTo !== profile.availableTo ||
      (form.preferredZone ?? '') !== (profile.preferredZone ?? '') ||
      !sameSet(form.preferredHeight, profile.preferredHeight) ||
      !sameSet(form.breakType, profile.breakType)
    );
  }, [form, profile]);

  const locSubtitle = location
    ? t.profileLocCoords(location.latitude.toFixed(2), location.longitude.toFixed(2))
    : locDenied ? t.profileLocDenied : t.profileLocDisabled;

  const editBtnTextColor = isDark ? '#0B0F1A' : '#FFFFFF';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} showsVerticalScrollIndicator={false}>
      <View style={[s.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={s.headerLeft}>
          <Text style={[s.title, { color: colors.white }]} accessibilityRole="header">{t.profileTitle}</Text>
          <Text style={[s.sub, { color: colors.textMuted }]}>
            {isEditing ? t.profileEditing : t.profileLockedHint}
          </Text>
          {syncedHint && (
            <Animated.View style={[s.syncBadge, { backgroundColor: colors.accentDim, opacity: fadeAnim }]}>
              <Text style={[s.syncTxt, { color: colors.accent }]}>{t.profileAutoSaved}</Text>
            </Animated.View>
          )}
        </View>
        {isEditing && (
          <View style={s.editActions}>
            <TouchableOpacity
              style={[s.editCancelBtn, { borderColor: colors.border }]}
              onPress={handleCancel}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t.cancel}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[s.editCancelTxt, { color: colors.textMuted }]}>{t.cancel}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View
        pointerEvents={isEditing ? 'auto' : 'none'}
        style={{ opacity: isEditing ? 1 : 0.55 }}
      >

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
                onPress={() => { hapticLight(); setForm({ ...form, level: l.key }); }}
                accessibilityRole="radio"
                accessibilityState={{ selected: active, disabled: !isEditing }}
                accessibilityLabel={levelLabel}
                disabled={!isEditing}
              >
                <Text style={s.levelEmoji}>{l.emoji}</Text>
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
                onPress={() => { hapticLight(); setForm({ ...form, preferredHeight: toggle(form.preferredHeight, h.key) }); }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: !isEditing }}
                accessibilityLabel={h.label}
                disabled={!isEditing}
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
                onPress={() => { hapticLight(); setForm({ ...form, sessionDuration: d }); }}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, disabled: !isEditing }}
                accessibilityLabel={`${d}h`}
                disabled={!isEditing}
              >
                <Text style={[s.chipTxt, { color: on ? colors.accent : colors.textMuted }]}>{d}h</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Section>

      {/* Break type favorite */}
      <Section label={t.profileBreakType} colors={colors}>
        <Text style={[s.hoursSummary, { color: colors.textMuted, marginBottom: spacing.md }]}>{t.profileBreakTypeHint}</Text>
        <View style={s.chipRow}>
          {BREAK_TYPES.map((b) => {
            const on = form.breakType.includes(b.key);
            const label = t[b.labelKey];
            return (
              <TouchableOpacity
                key={b.key}
                style={[s.chip, { backgroundColor: on ? colors.accentDim : colors.bgSubtle, borderColor: on ? colors.accent : 'transparent', flexDirection: 'row', gap: 6 }]}
                activeOpacity={0.7}
                onPress={() => {
                  hapticLight();
                  setForm({ ...form, breakType: toggle(form.breakType, b.key) });
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: !isEditing }}
                accessibilityLabel={label}
                disabled={!isEditing}
              >
                <Text style={{ fontSize: 14 }}>{b.emoji}</Text>
                <Text style={[s.chipTxt, { color: on ? colors.accent : colors.textMuted }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Section>

      {/* Wind preference */}
      <Section label={t.profileWindPref} colors={colors}>
        <View style={s.chipRow}>
          {WIND_PREFS.map((w) => {
            const on = form.windPref === w.key;
            const label = t[w.labelKey];
            return (
              <TouchableOpacity
                key={w.key}
                style={[s.chip, { backgroundColor: on ? colors.accentDim : colors.bgSubtle, borderColor: on ? colors.accent : 'transparent' }]}
                activeOpacity={0.7}
                onPress={() => { hapticLight(); setForm({ ...form, windPref: w.key }); }}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, disabled: !isEditing }}
                accessibilityLabel={label}
                disabled={!isEditing}
              >
                <Text style={[s.chipTxt, { color: on ? colors.accent : colors.textMuted }]}>{label}</Text>
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
          onChange={(v) => setForm({ ...form, availableFrom: v })}
          min={5}
          max={form.availableTo - 1}
          colors={colors}
        />
        <HourStepper
          label={t.profileTo}
          value={form.availableTo}
          onChange={(v) => setForm({ ...form, availableTo: v })}
          min={form.availableFrom + 1}
          max={21}
          colors={colors}
        />
        <Text style={[s.hoursSummary, { color: colors.textMuted }]}>
          {t.profileHoursSummary(form.availableFrom, form.availableTo)}
        </Text>
      </Section>

      {/* Preferred zone */}
      <Section label={t.profilePreferredZone} colors={colors}>
        <Text style={[s.hoursSummary, { color: colors.textMuted, marginBottom: spacing.md }]}>{t.profilePreferredZoneDesc}</Text>
        <TouchableOpacity
          style={[s.chip, { backgroundColor: !form.preferredZone ? colors.accentDim : colors.bgSubtle, borderColor: !form.preferredZone ? colors.accent : 'transparent', marginBottom: spacing.sm }]}
          onPress={() => { hapticLight(); setForm({ ...form, preferredZone: undefined }); }}
          activeOpacity={0.7}
          accessibilityRole="radio"
          accessibilityState={{ selected: !form.preferredZone, disabled: !isEditing }}
          accessibilityLabel={t.profilePreferredZoneNone}
          disabled={!isEditing}
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
                onPress={() => { hapticLight(); setForm({ ...form, preferredZone: z }); }}
                activeOpacity={0.7}
                accessibilityRole="radio"
                accessibilityState={{ selected: active, disabled: !isEditing }}
                accessibilityLabel={z}
                disabled={!isEditing}
              >
                <Text style={[s.chipTxt, { color: active ? colors.accent : colors.textMuted }]}>{z}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Section>

      {/* Reset to defaults — only available while editing */}
      {isEditing && (
        <TouchableOpacity
          style={[s.resetBtn, { borderColor: colors.border }]}
          onPress={handleReset}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t.profileReset}
        >
          <Ionicons name="refresh" size={16} color={colors.textMuted} />
          <Text style={[s.resetTxt, { color: colors.textMuted }]}>{t.profileReset}</Text>
        </TouchableOpacity>
      )}

      </View>

      {/* Settings section: Location, Alerts, Appearance, Guide, About */}
      <View style={s.settingsSection}>
        <Text style={[s.secLabel, { color: colors.textSecondary }]} accessibilityRole="header">{t.profileLocation}</Text>
        <View style={[s.secCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
          <SettingRow
            icon={locLoading ? 'navigate' : location ? 'location' : 'location-outline'}
            iconColor={colors.accent}
            iconBg={colors.accentDim}
            title={locLoading ? t.profileLocSearching : location ? t.profileLocActive : t.profileLocInactive}
            subtitle={locSubtitle}
            colors={colors}
            isLast
            right={!location && !locLoading ? (
              <TouchableOpacity
                style={[s.chip, { backgroundColor: colors.accentDim, borderColor: colors.accent }]}
                onPress={() => { hapticLight(); refreshLoc(); }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t.profileLocEnable}
              >
                <Text style={[s.chipTxt, { color: colors.accent }]}>{t.profileLocEnable}</Text>
              </TouchableOpacity>
            ) : undefined}
          />
        </View>
      </View>

      <View style={s.settingsSection}>
        <Text style={[s.secLabel, { color: colors.textSecondary }]} accessibilityRole="header">{t.profileAppearance}</Text>
        <View style={[s.secCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
          <SettingRow
            icon={isDark ? 'moon' : 'sunny'}
            iconColor={colors.accent}
            iconBg={colors.accentDim}
            title={isDark ? t.profileThemeDark : t.profileThemeLight}
            subtitle={t.profileThemeSub}
            colors={colors}
            right={<ToggleSwitch value={isDark} onToggle={toggleTheme} accentColor={colors.accent} trackBg={colors.border} />}
          />
          <SettingRow
            icon="language"
            iconColor={colors.blue}
            iconBg={colors.blueDim}
            title={t.profileLanguage}
            subtitle={locale === 'fr' ? t.profileLanguageFr : t.profileLanguageEn}
            colors={colors}
            right={
              <View style={s.langSwitcher}>
                {(['fr', 'en'] as Locale[]).map(l => {
                  const active = locale === l;
                  return (
                    <TouchableOpacity
                      key={l}
                      onPress={() => { hapticLight(); setLocale(l); }}
                      style={[s.langChip, { backgroundColor: active ? colors.accentDim : colors.bgSubtle, borderColor: active ? colors.accent : 'transparent' }]}
                      activeOpacity={0.7}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={l === 'fr' ? t.profileLanguageFr : t.profileLanguageEn}
                    >
                      <Text style={[s.langChipTxt, { color: active ? colors.accent : colors.textMuted }]}>
                        {l === 'fr' ? 'FR' : 'EN'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            }
          />
          <SettingRow
            icon="notifications"
            iconColor={colors.orange}
            iconBg={colors.orangeDim}
            title={t.profileAlertsTitle}
            subtitle={t.profileAlertsSub}
            colors={colors}
            isLast
            right={<ToggleSwitch value={alertsOn} onToggle={handleToggleAlerts} accentColor={colors.accent} trackBg={colors.border} />}
          />
        </View>
      </View>

      <View style={s.settingsSection}>
        <Text style={[s.secLabel, { color: colors.textSecondary }]} accessibilityRole="header">{t.profileAbout}</Text>
        <View style={[s.secCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
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

      <View style={{ height: 120 }} />
    </ScrollView>

      <View style={s.floatBar} pointerEvents="box-none">
        {isEditing ? (
          <TouchableOpacity
            style={[
              s.floatSaveBtn,
              { backgroundColor: isDirty ? colors.accent : colors.card, shadowColor: isDirty ? colors.accent : '#000' },
            ]}
            onPress={handleSave}
            disabled={!isDirty}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ disabled: !isDirty }}
            accessibilityLabel={t.profileEditSave}
          >
            <Ionicons
              name="checkmark-circle"
              size={20}
              color={isDirty ? editBtnTextColor : colors.textMuted}
            />
            <Text style={[s.floatSaveTxt, { color: isDirty ? editBtnTextColor : colors.textMuted }]}>
              {isDirty ? t.profileEditSave : t.profileNoChanges}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[s.floatSaveBtn, { backgroundColor: colors.accent, shadowColor: colors.accent }]}
            onPress={handleStartEdit}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t.profileEdit}
          >
            <Ionicons name="pencil" size={18} color={editBtnTextColor} />
            <Text style={[s.floatSaveTxt, { color: editBtnTextColor }]}>{t.profileEdit}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function Section({ label, children, colors }: { label: string; children: React.ReactNode; colors: any }) {
  return (
    <View style={s.section}>
      <Text style={[s.secLabel, { color: colors.textSecondary }]} accessibilityRole="header">{label}</Text>
      <View style={[s.secCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>{children}</View>
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
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    marginTop: spacing.sm,
  },
  syncTxt: { ...typography.micro, fontWeight: '700' },

  floatBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  floatSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.pill,
    minHeight: touchTarget.min,
    paddingHorizontal: spacing.lg,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 8,
  },
  floatSaveTxt: { ...typography.bodyBold, fontSize: 15 },
  editActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 6,
  },
  editCancelBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editCancelTxt: { ...typography.caption, fontWeight: '600' },

  section: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  settingsSection: { marginTop: spacing.xxl, paddingHorizontal: spacing.lg },
  secLabel: { ...typography.tiny, letterSpacing: 1, marginBottom: spacing.md - 2, marginHorizontal: spacing.xs },
  secCard: { borderRadius: radius.md, padding: spacing.md + 2 },

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

  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'center',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: touchTarget.min,
  },
  resetTxt: { ...typography.caption, fontWeight: '600' },

  langSwitcher: { flexDirection: 'row', gap: 6 },
  langChip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    minWidth: 38,
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langChipTxt: { ...typography.micro, fontWeight: '800' },
});
