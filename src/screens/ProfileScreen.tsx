import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProfile } from '../context/ProfileContext';
import { useTheme } from '../context/ThemeContext';
import { useLocation } from '../context/LocationContext';
import { useToast } from '../components/Toast';
import { SurferLevel, WaveHeightPref, BreakType, SurferProfile } from '../types';
import { ProfileScreenProps } from '../navigation/types';
import { useI18n } from '../i18n';
import { requestNotifPermission, getAlertsEnabled, setAlertsEnabled as setAlertsEnabledPref } from '../services/notifications';
import SPOTS from '../data/spots';

const LEVELS_MAP = { beginner: 'levelBeginner', intermediate: 'levelIntermediate', expert: 'levelExpert' } as const;

const ZONE_COUNTRIES = (() => {
  const counts: Record<string, number> = {};
  SPOTS.forEach(s => { counts[s.country] = (counts[s.country] || 0) + 1; });
  return Object.entries(counts)
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([country]) => country);
})();

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

const BREAK_TYPES: { key: BreakType; label: string; emoji: string }[] = [
  { key: 'beach', label: 'Beach break', emoji: '🏖' },
  { key: 'reef', label: 'Reef break', emoji: '🪸' },
  { key: 'point', label: 'Point break', emoji: '🏔' },
];

const SESSION_DURATIONS = [1, 1.5, 2, 2.5, 3, 4];

function toggle<T>(arr: T[], item: T): T[] {
  if (arr.includes(item)) {
    const r = arr.filter((x) => x !== item);
    return r.length === 0 ? [item] : r;
  }
  return [...arr, item];
}

function ToggleSwitch({ value, onToggle, accentColor, trackBg }: { value: boolean; onToggle: (v: boolean) => void; accentColor: string; trackBg: string }) {
  const { t } = useI18n();
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onToggle(!value)}
      style={[ts.track, { backgroundColor: value ? `${accentColor}40` : trackBg }]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={value ? t.profileThemeDark : t.profileThemeLight}
    >
      <View style={[ts.thumb, { backgroundColor: value ? accentColor : 'rgba(128,128,128,0.5)' }, value && ts.thumbOn]} />
    </TouchableOpacity>
  );
}

const ts = StyleSheet.create({
  track: { width: 52, height: 30, borderRadius: 15, padding: 3, justifyContent: 'center' },
  thumb: { width: 24, height: 24, borderRadius: 12 },
  thumbOn: { alignSelf: 'flex-end' },
});

function HourStepper({ label, value, onChange, min, max, colors }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; colors: any }) {
  const canDec = value > min;
  const canInc = value < max;
  return (
    <View style={hs.row}>
      <Text style={[hs.label, { color: colors.white70 }]}>{label}</Text>
      <View style={hs.controls}>
        <TouchableOpacity
          style={[hs.btn, { backgroundColor: canDec ? colors.accentDim : colors.white08 }]}
          onPress={() => canDec && onChange(value - 1)}
          activeOpacity={0.6}
        >
          <Text style={[hs.btnTxt, { color: canDec ? colors.accent : colors.white15 }]}>−</Text>
        </TouchableOpacity>
        <View style={[hs.valBox, { backgroundColor: colors.white08 }]}>
          <Text style={[hs.val, { color: colors.white }]}>{value}h</Text>
        </View>
        <TouchableOpacity
          style={[hs.btn, { backgroundColor: canInc ? colors.accentDim : colors.white08 }]}
          onPress={() => canInc && onChange(value + 1)}
          activeOpacity={0.6}
        >
          <Text style={[hs.btnTxt, { color: canInc ? colors.accent : colors.white15 }]}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const hs = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  label: { fontSize: 14, fontWeight: '600' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  btnTxt: { fontSize: 22, fontWeight: '600', marginTop: -1 },
  valBox: { minWidth: 52, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, alignItems: 'center' },
  val: { fontSize: 16, fontWeight: '800' },
});

export default function ProfileScreen({ navigation }: ProfileScreenProps) {
  const { t } = useI18n();
  const { profile, updateProfile } = useProfile();
  const { colors, isDark, toggleTheme } = useTheme();
  const { location, loading: locLoading, denied: locDenied, refresh: refreshLoc } = useLocation();
  const { show: showToast } = useToast();
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<SurferProfile>({ ...profile });
  const [saved, setSaved] = useState(false);
  const [alertsOn, setAlertsOn] = useState(false);

  useEffect(() => { setForm({ ...profile }); }, [profile]);

  const isDirty = form.level !== profile.level
    || form.sessionDuration !== profile.sessionDuration
    || form.availableFrom !== profile.availableFrom
    || form.availableTo !== profile.availableTo
    || form.preferredZone !== profile.preferredZone
    || JSON.stringify(form.preferredHeight) !== JSON.stringify(profile.preferredHeight)
    || JSON.stringify(form.breakType) !== JSON.stringify(profile.breakType);
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

  const [validationError, setValidationError] = useState<string | null>(null);

  const save = async () => {
    if (form.availableFrom >= form.availableTo) {
      setValidationError(t.profileValidFrom);
      setTimeout(() => setValidationError(null), 3000);
      return;
    }
    if (form.preferredHeight.length === 0) {
      setValidationError(t.profileValidHeight);
      setTimeout(() => setValidationError(null), 3000);
      return;
    }
    setValidationError(null);
    try {
      await updateProfile(form);
    } catch {
      showToast(t.profileSaveError, 'error');
      return;
    }
    setSaved(true);
    showToast(t.profileSaved, 'success');
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} showsVerticalScrollIndicator={false}>
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <Text style={[s.title, { color: colors.white }]}>{t.profileTitle}</Text>
        <Text style={[s.sub, { color: colors.white40 }]}>{t.profileSub}</Text>
      </View>

      <Section label={t.profileLevel} colors={colors}>
        <View style={s.levelRow}>
          {LEVELS.map((l) => {
            const active = form.level === l.key;
            const levelLabel = t[LEVELS_MAP[l.key]];
            return (
              <TouchableOpacity
                key={l.key}
                style={[s.levelBtn, { backgroundColor: active ? colors.accentDim : colors.white08, borderColor: active ? colors.accent : 'transparent' }]}
                activeOpacity={0.7}
                onPress={() => setForm({ ...form, level: l.key })}
              >
                <Text style={s.levelEmoji}>{l.emoji}</Text>
                <Text style={[s.levelLabel, { color: active ? colors.accent : colors.white40 }]}>{levelLabel}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Section>

      <Section label={t.profileHeight} colors={colors}>
        <View style={s.chipRow}>
          {HEIGHTS.map((h) => {
            const on = form.preferredHeight.includes(h.key);
            return (
              <TouchableOpacity
                key={h.key}
                style={[s.chip, { backgroundColor: on ? colors.accentDim : colors.white08, borderColor: on ? colors.accent : 'transparent' }]}
                activeOpacity={0.7}
                onPress={() => setForm({ ...form, preferredHeight: toggle(form.preferredHeight, h.key) })}
              >
                <Text style={[s.chipTxt, { color: on ? colors.accent : colors.white40 }]}>{h.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Section>

      <Section label={t.profileBreakType} colors={colors}>
        <View style={s.chipRow}>
          {BREAK_TYPES.map((b) => {
            const on = form.breakType.includes(b.key);
            return (
              <TouchableOpacity
                key={b.key}
                style={[s.chip, { backgroundColor: on ? colors.accentDim : colors.white08, borderColor: on ? colors.accent : 'transparent' }]}
                activeOpacity={0.7}
                onPress={() => setForm({ ...form, breakType: toggle(form.breakType, b.key) })}
              >
                <Text style={[s.chipTxt, { color: on ? colors.accent : colors.white40 }]}>{b.emoji} {b.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Section>

      <Section label={t.profileSession} colors={colors}>
        <View style={s.chipRow}>
          {SESSION_DURATIONS.map((d) => {
            const on = form.sessionDuration === d;
            return (
              <TouchableOpacity
                key={d}
                style={[s.chip, { backgroundColor: on ? colors.accentDim : colors.white08, borderColor: on ? colors.accent : 'transparent' }]}
                activeOpacity={0.7}
                onPress={() => setForm({ ...form, sessionDuration: d })}
              >
                <Text style={[s.chipTxt, { color: on ? colors.accent : colors.white40 }]}>{d}h</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Section>

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
        <Text style={[s.hoursSummary, { color: colors.white40 }]}>
          {t.profileHoursSummary(form.availableFrom, form.availableTo)}
        </Text>
      </Section>

      <Section label={t.profileLocation} colors={colors}>
        <View style={s.notifRow}>
          <View style={s.notifLeft}>
            <Text style={s.notifIcon}>📍</Text>
            <View>
              <Text style={[s.notifTitle, { color: colors.white }]}>
                {locLoading ? t.profileLocSearching : location ? t.profileLocActive : t.profileLocInactive}
              </Text>
              <Text style={[s.notifSub, { color: colors.white40 }]}>
                {location
                  ? t.profileLocCoords(location.latitude.toFixed(2), location.longitude.toFixed(2))
                  : locDenied
                    ? t.profileLocDenied
                    : t.profileLocDisabled}
              </Text>
            </View>
          </View>
          {!location && !locLoading && (
            <TouchableOpacity
              style={[s.chip, { backgroundColor: colors.accentDim, borderColor: colors.accent }]}
              onPress={refreshLoc}
              activeOpacity={0.7}
            >
              <Text style={[s.chipTxt, { color: colors.accent }]}>{t.profileLocEnable}</Text>
            </TouchableOpacity>
          )}
        </View>
      </Section>

      <Section label={t.profilePreferredZone} colors={colors}>
        <Text style={[s.hoursSummary, { color: colors.white40, marginBottom: 10 }]}>{t.profilePreferredZoneDesc}</Text>
        <TouchableOpacity
          style={[s.chip, { backgroundColor: !form.preferredZone ? colors.accentDim : colors.white08, borderColor: !form.preferredZone ? colors.accent : 'transparent', marginBottom: 8 }]}
          onPress={() => setForm({ ...form, preferredZone: undefined })}
          activeOpacity={0.7}
        >
          <Text style={[s.chipTxt, { color: !form.preferredZone ? colors.accent : colors.white40 }]}>{t.profilePreferredZoneNone}</Text>
        </TouchableOpacity>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
          {ZONE_COUNTRIES.map(z => {
            const active = form.preferredZone === z;
            return (
              <TouchableOpacity
                key={z}
                style={[s.chip, { backgroundColor: active ? colors.accentDim : colors.white08, borderColor: active ? colors.accent : 'transparent' }]}
                onPress={() => setForm({ ...form, preferredZone: z })}
                activeOpacity={0.7}
              >
                <Text style={[s.chipTxt, { color: active ? colors.accent : colors.white40 }]}>{z}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Section>

      {validationError && (
        <View style={[s.errorBox, { backgroundColor: colors.redDim }]}>
          <Text style={[s.errorTxt, { color: colors.red }]}>⚠️ {validationError}</Text>
        </View>
      )}
      <TouchableOpacity
        style={[s.saveBtn, { backgroundColor: saved ? '#2E7D32' : isDirty ? colors.accent : colors.white15 }]}
        activeOpacity={isDirty ? 0.8 : 1}
        onPress={isDirty ? save : undefined}
        disabled={!isDirty && !saved}
        accessibilityLabel={t.save}
        accessibilityRole="button"
      >
        <Text style={[s.saveTxt, !isDirty && !saved && { color: colors.white40 }]}>{saved ? t.saved : t.save}</Text>
      </TouchableOpacity>

      <GuideSection colors={colors} guideTitle={t.profileGuide} />

      <Section label={t.profileAlerts} colors={colors}>
        <View style={s.notifRow}>
          <View style={s.notifLeft}>
            <Text style={s.notifIcon}>🔔</Text>
            <View>
              <Text style={[s.notifTitle, { color: colors.white }]}>{t.profileAlertsTitle}</Text>
              <Text style={[s.notifSub, { color: colors.white40 }]}>{t.profileAlertsSub}</Text>
            </View>
          </View>
          <ToggleSwitch value={alertsOn} onToggle={handleToggleAlerts} accentColor={colors.accent} trackBg={colors.white15} />
        </View>
      </Section>

      <Section label={t.profileAppearance} colors={colors}>
        <View style={s.notifRow}>
          <View style={s.notifLeft}>
            <Text style={s.notifIcon}>{isDark ? '🌙' : '☀️'}</Text>
            <View>
              <Text style={[s.notifTitle, { color: colors.white }]}>{isDark ? t.profileThemeDark : t.profileThemeLight}</Text>
              <Text style={[s.notifSub, { color: colors.white40 }]}>{t.profileThemeSub}</Text>
            </View>
          </View>
          <ToggleSwitch value={isDark} onToggle={toggleTheme} accentColor={colors.accent} trackBg={colors.white15} />
        </View>
      </Section>

      <Section label={t.profileAbout} colors={colors}>
        <TouchableOpacity
          style={[s.notifRow, { paddingVertical: 4 }]}
          onPress={() => navigation.navigate('About')}
          activeOpacity={0.7}
          accessibilityLabel={`${t.profileAbout}, ${t.profileAboutSub}`}
          accessibilityRole="button"
        >
          <View style={s.notifLeft}>
            <Text style={s.notifIcon}>ℹ️</Text>
            <View>
              <Text style={[s.notifTitle, { color: colors.white }]}>{t.profileAboutSub}</Text>
              <Text style={[s.notifSub, { color: colors.white40 }]}>{t.profileAboutDesc}</Text>
            </View>
          </View>
          <Text style={[s.arrow, { color: colors.white40 }]}>›</Text>
        </TouchableOpacity>
      </Section>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

function GuideSection({ colors, guideTitle }: { colors: any; guideTitle: string }) {
  const [open, setOpen] = useState(false);

  const scoreRows = [
    { range: '8.0 – 10', label: 'Parfait (rare)', emoji: '🔥', color: '#00D4AA' },
    { range: '6.5 – 7.9', label: 'On fonce', emoji: '🤙', color: '#00D4AA' },
    { range: '5.0 – 6.4', label: 'Correct', emoji: '👍', color: '#FF8A50' },
    { range: '3.5 – 4.9', label: 'Moyen', emoji: '😐', color: '#FF8A50' },
    { range: '2.0 – 3.4', label: 'Mauvais', emoji: '👎', color: '#FF5A5A' },
    { range: '0 – 1.9', label: 'Flat / nul', emoji: '🚫', color: '#FF5A5A' },
  ];

  const windTerms = [
    { term: 'Offshore', desc: 'Vent venant de la terre vers la mer. Lisse les vagues, conditions idéales.', icon: '🌬️', good: true },
    { term: 'Cross-off', desc: 'Vent latéral tendance offshore. Bonnes conditions, léger clapot possible.', icon: '↗️', good: true },
    { term: 'Cross-on', desc: 'Vent latéral tendance onshore. Surface perturbée, vagues moins propres.', icon: '↘️', good: false },
    { term: 'Onshore', desc: 'Vent venant de la mer vers la terre. Surface hachée, mauvaises conditions.', icon: '💨', good: false },
    { term: 'Glassy', desc: 'Quasiment pas de vent (< 5 km/h). Surface lisse et vitreuse, top !', icon: '✨', good: true },
  ];

  const factors = [
    { icon: '🌊', title: 'Houle (hauteur, direction, peak period)', desc: 'Le facteur principal. Hauteur comparée à l\'idéal du spot et ta préférence. Direction dans la fenêtre optimale. On utilise le peak period (pic d\'énergie dominant) pour évaluer la qualité : > 12s = ground swell puissant, < 8s = vagues désorganisées.' },
    { icon: '💨', title: 'Vent (vitesse, direction, rafales)', desc: 'Deuxième facteur clé. Houle × Vent = la base du score. Si l\'un est mauvais, tout baisse. Offshore = top, onshore = grosse pénalité. Rafales > 25 km/h plafonnent le score. Le ratio rafales/vent moyen aggrave aussi.' },
    { icon: '🔄', title: 'Propreté du swell', desc: 'Analyse le ratio wind swell / ground swell. Si le wind swell domine (> 70%), pénalité sévère (-40%). Période courte + wind swell = vagues "messy". On regarde aussi la période de la wind wave pour détecter le clapot local.' },
    { icon: '🌊', title: 'Marée (niveau réel + tendance)', desc: 'La vraie hauteur de la mer est analysée heure par heure. Marée montante = bonus (+8%), descendante = malus. Chaque spot a une marée optimale. Beach breaks : pénalisés à marée très haute (shore break) et très basse (closeouts). Reef breaks : dangereux à marée très basse.' },
    { icon: '🌧️', title: 'Météo', desc: 'Pluie forte et orages réduisent le score (jusqu\'à -30%). Bruine et pluie légère ont un impact modéré. Le confort et la visibilité comptent.' },
    { icon: '📐', title: 'Stabilité de la houle', desc: 'On analyse si la direction de houle est stable sur les 3 dernières heures. Direction constante = bonus (+5%). Direction chaotique (> 45° de variation) = malus (-15%). Une houle stable produit des vagues plus régulières.' },
    { icon: '🎯', title: 'Ton niveau', desc: 'Débutant / Intermédiaire / Expert influence le score : spots trop engagés = pénalisés, spots adaptés = boostés.' },
    { icon: '📏', title: 'Tes préférences', desc: 'Hauteur préférée : +10% si la houle correspond. Seules les heures dans ta plage dispo sont recommandées.' },
  ];

  return (
    <View style={s.section}>
      <TouchableOpacity
        style={[g.header, { backgroundColor: colors.card }]}
        onPress={() => setOpen(!open)}
        activeOpacity={0.7}
      >
        <Text style={[g.headerIcon]}>📖</Text>
        <Text style={[g.headerTitle, { color: colors.white }]}>{guideTitle}</Text>
        <Text style={[g.arrow, { color: colors.white40 }]}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {open && (
        <View style={[g.body, { backgroundColor: colors.card }]}>
          <Text style={[g.sectionTitle, { color: colors.accent }]}>Calcul du score</Text>
          <Text style={[g.desc, { color: colors.white70 }]}>
            Chaque heure reçoit un score de 0 à 10, calculé de façon multiplicative. Les deux piliers sont la houle et le vent : ils sont multipliés ensemble pour donner la base. Si l'un est mauvais, tout le score descend.
          </Text>
          <Text style={[g.desc, { color: colors.white70 }]}>
            Ensuite, 6 ajustements modifient cette base : marée (niveau réel + montante/descendante), propreté du swell (ratio wind swell vs ground swell), météo (pluie/orage), stabilité de direction, ton niveau, et tes préférences de hauteur.
          </Text>
          <Text style={[g.desc, { color: colors.white70 }]}>
            Les scores au-dessus de 7 sont compressés pour que le 8-10 reste réservé aux journées vraiment exceptionnelles. Certains "deal-breakers" plafonnent le score automatiquement (voir ci-dessous).
          </Text>

          {factors.map((f, i) => (
            <View key={i} style={g.factorRow}>
              <Text style={g.factorIcon}>{f.icon}</Text>
              <View style={g.factorInfo}>
                <Text style={[g.factorTitle, { color: colors.white }]}>{f.title}</Text>
                <Text style={[g.factorDesc, { color: colors.white40 }]}>{f.desc}</Text>
              </View>
            </View>
          ))}

          <View style={[g.divider, { backgroundColor: colors.white15 }]} />

          <Text style={[g.sectionTitle, { color: colors.accent }]}>Plafonds automatiques</Text>
          <Text style={[g.desc, { color: colors.white70 }]}>
            Certaines conditions plafonnent le score quoi qu'il arrive :
          </Text>
          <View style={[g.windRow, { backgroundColor: 'rgba(255,90,90,0.06)' }]}>
            <Text style={g.windIcon}>🚫</Text>
            <View style={g.windInfo}>
              <Text style={[g.windTerm, { color: '#FF5A5A' }]}>Flat (houle {'<'} 0.3m)</Text>
              <Text style={[g.windDesc, { color: colors.white40 }]}>Score plafonné à 1</Text>
            </View>
          </View>
          <View style={[g.windRow, { backgroundColor: 'rgba(255,90,90,0.06)' }]}>
            <Text style={g.windIcon}>💨</Text>
            <View style={g.windInfo}>
              <Text style={[g.windTerm, { color: '#FF5A5A' }]}>Vent onshore {'>'} 20 km/h</Text>
              <Text style={[g.windDesc, { color: colors.white40 }]}>Score plafonné à 3.5</Text>
            </View>
          </View>
          <View style={[g.windRow, { backgroundColor: 'rgba(255,90,90,0.06)' }]}>
            <Text style={g.windIcon}>💥</Text>
            <View style={g.windInfo}>
              <Text style={[g.windTerm, { color: '#FF5A5A' }]}>Rafales {'>'} 35 km/h</Text>
              <Text style={[g.windDesc, { color: colors.white40 }]}>Score plafonné à 4</Text>
            </View>
          </View>
          <View style={[g.windRow, { backgroundColor: 'rgba(255,90,90,0.06)' }]}>
            <Text style={g.windIcon}>⏱</Text>
            <View style={g.windInfo}>
              <Text style={[g.windTerm, { color: '#FF5A5A' }]}>Période {'<'} 6s</Text>
              <Text style={[g.windDesc, { color: colors.white40 }]}>Score plafonné à 3</Text>
            </View>
          </View>

          <View style={[g.divider, { backgroundColor: colors.white15 }]} />

          <Text style={[g.sectionTitle, { color: colors.accent }]}>Échelle des scores</Text>
          {scoreRows.map((r, i) => (
            <View key={i} style={g.scoreRow}>
              <Text style={g.scoreEmoji}>{r.emoji}</Text>
              <Text style={[g.scoreRange, { color: colors.white70 }]}>{r.range}</Text>
              <Text style={[g.scoreLabel, { color: r.color }]}>{r.label}</Text>
            </View>
          ))}

          <View style={[g.divider, { backgroundColor: colors.white15 }]} />

          <Text style={[g.sectionTitle, { color: colors.accent }]}>Lexique du vent</Text>
          <Text style={[g.desc, { color: colors.white70 }]}>
            Le type de vent dépend de son angle par rapport à la plage :
          </Text>

          {windTerms.map((w, i) => (
            <View key={i} style={[g.windRow, { backgroundColor: w.good ? 'rgba(0,212,170,0.06)' : 'rgba(255,90,90,0.06)' }]}>
              <Text style={g.windIcon}>{w.icon}</Text>
              <View style={g.windInfo}>
                <Text style={[g.windTerm, { color: w.good ? '#00D4AA' : '#FF5A5A' }]}>{w.term}</Text>
                <Text style={[g.windDesc, { color: colors.white40 }]}>{w.desc}</Text>
              </View>
            </View>
          ))}

          <View style={[g.divider, { backgroundColor: colors.white15 }]} />

          <Text style={[g.sectionTitle, { color: colors.accent }]}>Autres termes</Text>
          <View style={g.termGrid}>
            <TermBubble term="Période" desc="Temps entre 2 vagues (secondes). > 10s = puissant" colors={colors} />
            <TermBubble term="Swell" desc="Houle générée au large, plus propre que le wind swell" colors={colors} />
            <TermBubble term="Beach break" desc="Fond de sable, vagues changeantes" colors={colors} />
            <TermBubble term="Reef break" desc="Fond de roche/récif, vagues régulières" colors={colors} />
            <TermBubble term="Point break" desc="Vague qui déroule le long d'une pointe" colors={colors} />
            <TermBubble term="Shore break" desc="Vague qui casse directement sur le bord" colors={colors} />
          </View>
        </View>
      )}
    </View>
  );
}

function TermBubble({ term, desc, colors }: { term: string; desc: string; colors: any }) {
  return (
    <View style={[g.termItem, { backgroundColor: colors.white08 }]}>
      <Text style={[g.termWord, { color: colors.white }]}>{term}</Text>
      <Text style={[g.termDesc, { color: colors.white40 }]}>{desc}</Text>
    </View>
  );
}

const g = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 16 },
  headerIcon: { fontSize: 20, marginRight: 10 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '800' },
  arrow: { fontSize: 12, fontWeight: '600' },

  body: { borderBottomLeftRadius: 16, borderBottomRightRadius: 16, paddingHorizontal: 16, paddingBottom: 20, marginTop: -8 },
  sectionTitle: { fontSize: 15, fontWeight: '800', marginTop: 16, marginBottom: 8 },
  desc: { fontSize: 13, lineHeight: 20, marginBottom: 10 },
  divider: { height: 1, marginVertical: 16, borderRadius: 1 },

  factorRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  factorIcon: { fontSize: 16, marginRight: 10, marginTop: 1 },
  factorInfo: { flex: 1 },
  factorTitle: { fontSize: 13, fontWeight: '700' },
  factorDesc: { fontSize: 12, lineHeight: 18, marginTop: 2 },

  scoreRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  scoreEmoji: { fontSize: 16, width: 28 },
  scoreRange: { fontSize: 13, fontWeight: '600', width: 80 },
  scoreLabel: { fontSize: 13, fontWeight: '800' },

  windRow: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 10, padding: 10, marginBottom: 6 },
  windIcon: { fontSize: 16, marginRight: 10, marginTop: 1 },
  windInfo: { flex: 1 },
  windTerm: { fontSize: 14, fontWeight: '800' },
  windDesc: { fontSize: 12, lineHeight: 18, marginTop: 2 },

  termGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  termItem: { borderRadius: 10, padding: 10, flexBasis: '46%', flexGrow: 1 },
  termWord: { fontSize: 13, fontWeight: '800', marginBottom: 3 },
  termDesc: { fontSize: 11, lineHeight: 16 },
});

function Section({ label, children, colors }: { label: string; children: React.ReactNode; colors: any }) {
  return (
    <View style={s.section}>
      <Text style={[s.secLabel, { color: colors.white70 }]}>{label}</Text>
      <View style={[s.secCard, { backgroundColor: colors.card }]}>{children}</View>
    </View>
  );
}

const s = StyleSheet.create({
  header: { paddingTop: 12, paddingHorizontal: 20, paddingBottom: 8 },
  title: { fontSize: 28, fontWeight: '900' },
  sub: { fontSize: 13, marginTop: 2 },

  section: { marginTop: 20, paddingHorizontal: 16 },
  secLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  secCard: { borderRadius: 16, padding: 14 },

  levelRow: { flexDirection: 'row', gap: 8 },
  levelBtn: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12, borderWidth: 1.5 },
  levelEmoji: { fontSize: 24, marginBottom: 6 },
  levelLabel: { fontSize: 12, fontWeight: '600' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1.5 },
  chipTxt: { fontSize: 14, fontWeight: '600' },

  hoursSummary: { fontSize: 11, marginTop: 4, lineHeight: 16 },

  notifRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  notifLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 },
  notifIcon: { fontSize: 22, marginRight: 12 },
  notifTitle: { fontSize: 15, fontWeight: '700' },
  notifSub: { fontSize: 11, marginTop: 2, lineHeight: 16, maxWidth: 220 },
  arrow: { fontSize: 20, fontWeight: '300' },

  errorBox: { marginHorizontal: 16, marginTop: 16, borderRadius: 10, padding: 12, alignItems: 'center' },
  errorTxt: { fontSize: 13, fontWeight: '600' },
  saveBtn: { marginHorizontal: 16, marginTop: 16, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  saveTxt: { color: '#000', fontSize: 16, fontWeight: '800' },
});
