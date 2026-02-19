import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useProfile } from '../context/ProfileContext';
import { useTheme } from '../context/ThemeContext';
import { SurferLevel, WaveHeightPref, SurferProfile } from '../types';
import { ProfileScreenProps } from '../navigation/types';

const LEVELS: { key: SurferLevel; label: string; emoji: string }[] = [
  { key: 'beginner', label: 'Débutant', emoji: '🏄' },
  { key: 'intermediate', label: 'Intermédiaire', emoji: '🌊' },
  { key: 'expert', label: 'Expert', emoji: '⚡' },
];

const HEIGHTS: { key: WaveHeightPref; label: string }[] = [
  { key: '0.5-1', label: '0.5–1m' },
  { key: '1-2', label: '1–2m' },
  { key: '2+', label: '2m+' },
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
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onToggle(!value)}
      style={[ts.track, { backgroundColor: value ? `${accentColor}40` : trackBg }]}
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
  const { profile, updateProfile } = useProfile();
  const { colors, isDark, toggleTheme } = useTheme();
  const [form, setForm] = useState<SurferProfile>({ ...profile });
  const [saved, setSaved] = useState(false);

  useEffect(() => { setForm({ ...profile }); }, [profile]);

  const save = async () => {
    await updateProfile(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} showsVerticalScrollIndicator={false}>
      <View style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={[s.backBtn, { backgroundColor: colors.cardLight }]}>
            <Text style={[s.backTxt, { color: colors.white }]}>‹</Text>
          </TouchableOpacity>
          <View style={s.headerText}>
            <Text style={[s.title, { color: colors.white }]}>Réglages</Text>
            <Text style={[s.sub, { color: colors.white40 }]}>Personnalise tes recommandations</Text>
          </View>
        </View>
      </View>

      <Section label="Niveau" colors={colors}>
        <View style={s.levelRow}>
          {LEVELS.map((l) => {
            const active = form.level === l.key;
            return (
              <TouchableOpacity
                key={l.key}
                style={[s.levelBtn, { backgroundColor: active ? colors.accentDim : colors.white08, borderColor: active ? colors.accent : 'transparent' }]}
                activeOpacity={0.7}
                onPress={() => setForm({ ...form, level: l.key })}
              >
                <Text style={s.levelEmoji}>{l.emoji}</Text>
                <Text style={[s.levelLabel, { color: active ? colors.accent : colors.white40 }]}>{l.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Section>

      <Section label="Hauteur préférée" colors={colors}>
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

      <Section label="Durée de session" colors={colors}>
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

      <Section label="Heures disponibles" colors={colors}>
        <HourStepper
          label="À partir de"
          value={form.availableFrom}
          onChange={(v) => setForm({ ...form, availableFrom: v })}
          min={5}
          max={form.availableTo - 1}
          colors={colors}
        />
        <HourStepper
          label="Jusqu'à"
          value={form.availableTo}
          onChange={(v) => setForm({ ...form, availableTo: v })}
          min={form.availableFrom + 1}
          max={21}
          colors={colors}
        />
        <Text style={[s.hoursSummary, { color: colors.white40 }]}>
          Recommandations entre {form.availableFrom}h et {form.availableTo}h
        </Text>
      </Section>

      <Section label="Apparence" colors={colors}>
        <View style={s.notifRow}>
          <View style={s.notifLeft}>
            <Text style={s.notifIcon}>{isDark ? '🌙' : '☀️'}</Text>
            <View>
              <Text style={[s.notifTitle, { color: colors.white }]}>Thème {isDark ? 'sombre' : 'clair'}</Text>
              <Text style={[s.notifSub, { color: colors.white40 }]}>Changer l'apparence de l'app</Text>
            </View>
          </View>
          <ToggleSwitch value={isDark} onToggle={toggleTheme} accentColor={colors.accent} trackBg={colors.white15} />
        </View>
      </Section>

      <TouchableOpacity style={[s.saveBtn, { backgroundColor: colors.accent }, saved && s.saveDone]} activeOpacity={0.8} onPress={save}>
        <Text style={s.saveTxt}>{saved ? '✓  Sauvegardé' : 'Sauvegarder'}</Text>
      </TouchableOpacity>

      <GuideSection colors={colors} />

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

function GuideSection({ colors }: { colors: any }) {
  const [open, setOpen] = useState(false);

  const scoreRows = [
    { range: '8.5 – 10', label: 'Parfait', emoji: '🔥', color: '#00D4AA' },
    { range: '7.0 – 8.4', label: 'On fonce', emoji: '🤙', color: '#00D4AA' },
    { range: '5.5 – 6.9', label: 'Correct', emoji: '👍', color: '#FF8A50' },
    { range: '4.0 – 5.4', label: 'Moyen', emoji: '😐', color: '#FF8A50' },
    { range: '2.0 – 3.9', label: 'Mauvais', emoji: '👎', color: '#FF5A5A' },
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
    { icon: '🌊', title: 'Hauteur de houle', desc: 'Comparée à la plage optimale du spot et à ta préférence de hauteur définie dans ton profil.' },
    { icon: '⏱', title: 'Période', desc: 'Plus la période est longue (> 10s), plus les vagues sont puissantes et bien formées.' },
    { icon: '🧭', title: 'Direction de houle', desc: 'Chaque spot a une orientation idéale. Plus la houle arrive dans le bon angle, meilleur le score.' },
    { icon: '💨', title: 'Vent', desc: 'Offshore = bonus. Onshore = malus. Les rafales > 25 km/h pénalisent fortement.' },
    { icon: '🌊', title: 'Marée', desc: 'Marée montante souvent favorable. Marée basse peut casser les vagues trop tôt.' },
    { icon: '🎯', title: 'Ton niveau', desc: 'Ton niveau (Débutant / Intermédiaire / Expert) défini dans les réglages ci-dessus influence le score : les spots trop engagés pour toi sont pénalisés, les spots adaptés sont boostés.' },
    { icon: '⏰', title: 'Tes créneaux', desc: 'Les recommandations ne proposent que des heures dans ta plage horaire disponible, et la durée de session est utilisée pour calculer le créneau optimal.' },
  ];

  return (
    <View style={s.section}>
      <TouchableOpacity
        style={[g.header, { backgroundColor: colors.card }]}
        onPress={() => setOpen(!open)}
        activeOpacity={0.7}
      >
        <Text style={[g.headerIcon]}>📖</Text>
        <Text style={[g.headerTitle, { color: colors.white }]}>Comment ça marche ?</Text>
        <Text style={[g.arrow, { color: colors.white40 }]}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {open && (
        <View style={[g.body, { backgroundColor: colors.card }]}>
          <Text style={[g.sectionTitle, { color: colors.accent }]}>Calcul du score</Text>
          <Text style={[g.desc, { color: colors.white70 }]}>
            Chaque heure reçoit un score de 0 à 10 basé sur 7 facteurs combinés. Tes réglages (niveau, hauteur préférée, heures dispo, durée de session) personnalisent les recommandations :
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
  termItem: { borderRadius: 10, padding: 10, width: '47%' as any },
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
  header: { paddingTop: 52, paddingHorizontal: 16, paddingBottom: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  backTxt: { fontSize: 24, fontWeight: '300', marginTop: -2 },
  headerText: { flex: 1 },
  title: { fontSize: 24, fontWeight: '900' },
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

  saveBtn: { marginHorizontal: 16, marginTop: 28, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  saveDone: { backgroundColor: '#2E7D32' },
  saveTxt: { color: '#000', fontSize: 16, fontWeight: '800' },
});
