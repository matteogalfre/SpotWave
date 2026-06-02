import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../i18n';
import { Ionicons } from '@expo/vector-icons';
import { GuideScreenProps } from '../navigation/types';
import { spacing, radius, typography, touchTarget } from '../utils/tokens';

const scoreRows = [
  { range: '8.0 – 10', labelFr: 'Parfait (rare)', labelEn: 'Perfect (rare)', emoji: '🔥', color: '#00D4AA' },
  { range: '6.5 – 7.9', labelFr: 'On fonce', labelEn: 'Let\'s go', emoji: '🤙', color: '#00D4AA' },
  { range: '5.0 – 6.4', labelFr: 'Correct', labelEn: 'Decent', emoji: '👍', color: '#FF8A50' },
  { range: '3.5 – 4.9', labelFr: 'Moyen', labelEn: 'Average', emoji: '😐', color: '#FF8A50' },
  { range: '2.0 – 3.4', labelFr: 'Mauvais', labelEn: 'Bad', emoji: '👎', color: '#FF5A5A' },
  { range: '0 – 1.9', labelFr: 'Flat / nul', labelEn: 'Flat / awful', emoji: '🚫', color: '#FF5A5A' },
];

const windTerms = [
  { term: 'Offshore', descFr: 'Vent venant de la terre vers la mer. Lisse les vagues, conditions idéales.', descEn: 'Wind blowing from land to sea. Smooths waves, ideal conditions.', icon: '🌬️', good: true },
  { term: 'Cross-off', descFr: 'Vent latéral tendance offshore. Bonnes conditions, léger clapot possible.', descEn: 'Side-wind tending offshore. Good conditions, slight chop possible.', icon: '↗️', good: true },
  { term: 'Cross-on', descFr: 'Vent latéral tendance onshore. Surface perturbée, vagues moins propres.', descEn: 'Side-wind tending onshore. Disrupted surface, messier waves.', icon: '↘️', good: false },
  { term: 'Onshore', descFr: 'Vent venant de la mer vers la terre. Surface hachée, mauvaises conditions.', descEn: 'Wind blowing from sea to land. Choppy surface, poor conditions.', icon: '💨', good: false },
  { term: 'Glassy', descFr: 'Quasiment pas de vent (< 3 km/h). Surface vitreuse = score vent parfait (1.0). Les meilleures conditions possibles.', descEn: 'Almost no wind (< 3 km/h). Glassy surface = perfect wind score (1.0). The best possible conditions.', icon: '✨', good: true },
];

const factorsFr = [
  { icon: '🌊', title: 'Houle (hauteur × période × direction)', desc: 'Le pilier #1. La hauteur est comparée à l\'idéal du spot et ton niveau. La période pèse 35% du score houle — c\'est elle qui sépare le vrai surf du clapot. Un bonus "puissance" récompense les combinaisons hauteur × longue période (ex : 1.5m @ 14s >> 2m @ 7s).' },
  { icon: '💨', title: 'Vent (vitesse, direction, rafales, tendance)', desc: 'Pilier #2. Houle × Vent = la base. Glassy (< 3 km/h) = score parfait (1.0). Offshore léger = quasi parfait. Offshore fort (> 25 km/h) = pénalisé (spray, paddle impossible). Onshore = grosse pénalité. La tendance du vent est aussi prise en compte : un vent qui faiblit = bonus, qui monte = malus.' },
  { icon: '⚡', title: 'Interaction vent × taille de houle', desc: 'Le même vent cross/onshore est plus pénalisant sur une grosse houle (la face est plus exposée au clapot) que sur du 0.5m.' },
  { icon: '🔄', title: 'Propreté du swell', desc: 'Ratio wind swell / ground swell. Si le wind swell domine (> 70%), pénalité sévère. Si les houles se croisent (wind wave vs ground swell à > 90°), la surface est chaotique = malus. Swell pur sans ground swell = pénalité -35%.' },
  { icon: '🌊', title: 'Marée (selon le type de fond)', desc: 'Bonus/malus adapté au type de spot. Beach break : marée descendante expose les bancs de sable (+6%). Point break : montante sculpte la vague (+8%). Reef : montante = plus sûr (+6%), très basse = dangereux.' },
  { icon: '🌀', title: 'Courants marins', desc: 'Des courants forts (> 0.5 m/s) rendent le paddle plus dur et créent de la dérive. Pénalité progressive jusqu\'à -25%.' },
  { icon: '🌧️', title: 'Météo', desc: 'Pluie forte et orages réduisent le score (jusqu\'à -30%). Le confort et la visibilité comptent.' },
  { icon: '📐', title: 'Stabilité de la houle', desc: 'Direction constante = bonus (+5%). Direction chaotique (> 45° de variation) = malus (-15%).' },
  { icon: '🎯', title: 'Ton niveau', desc: 'Débutant / Intermédiaire / Expert influence le score : spots trop engagés = pénalisés, spots adaptés = boostés.' },
  { icon: '📏', title: 'Tes préférences', desc: 'Hauteur préférée : +10% si la houle correspond. Seules les heures dans ta plage dispo sont recommandées.' },
];

const factorsEn = [
  { icon: '🌊', title: 'Swell (height × period × direction)', desc: 'Pillar #1. Height compared to spot ideal and your level. Period weighs 35% of the swell score — it separates real surf from chop. A "power" bonus rewards height × long period combos (e.g. 1.5m @ 14s >> 2m @ 7s).' },
  { icon: '💨', title: 'Wind (speed, direction, gusts, trend)', desc: 'Pillar #2. Swell × Wind = the base. Glassy (< 3 km/h) = perfect score (1.0). Light offshore = near-perfect. Strong offshore (> 25 km/h) = penalized (spray, impossible paddle). Onshore = big penalty. Wind trend also matters: dropping wind = bonus, rising = penalty.' },
  { icon: '⚡', title: 'Wind × swell height interaction', desc: 'The same cross/onshore wind is more damaging on bigger waves (larger face exposed to chop) than on 0.5m surf.' },
  { icon: '🔄', title: 'Swell cleanness', desc: 'Wind swell / ground swell ratio. If wind swell dominates (> 70%), severe penalty. Crossing swells (wind wave vs ground swell > 90° apart) = chaotic surface = penalty. Pure wind swell with no ground swell = -35% penalty.' },
  { icon: '🌊', title: 'Tide (by bottom type)', desc: 'Bonus/penalty adapted to spot type. Beach break: falling tide exposes sandbars (+6%). Point break: rising tide shapes the wave (+8%). Reef: rising = safer (+6%), very low = dangerous.' },
  { icon: '🌀', title: 'Ocean currents', desc: 'Strong currents (> 0.5 m/s) make paddling harder and cause drift. Progressive penalty up to -25%.' },
  { icon: '🌧️', title: 'Weather', desc: 'Heavy rain and storms reduce score (up to -30%). Comfort and visibility matter.' },
  { icon: '📐', title: 'Swell stability', desc: 'Constant direction = bonus (+5%). Chaotic direction (> 45° variation) = penalty (-15%).' },
  { icon: '🎯', title: 'Your level', desc: 'Beginner / Intermediate / Expert affects score: overly challenging spots = penalized, suited spots = boosted.' },
  { icon: '📏', title: 'Your preferences', desc: 'Preferred height: +10% if swell matches. Only hours within your available range are recommended.' },
];

const capsFr = [
  { icon: '🚫', label: 'Flat (houle < 0.3m)', desc: 'Score plafonné à 1.5' },
  { icon: '💨', label: 'Vent onshore > 20 km/h', desc: 'Score plafonné à 3.5' },
  { icon: '💨', label: 'Offshore violent > 30 km/h', desc: 'Score plafonné à 5.5' },
  { icon: '💥', label: 'Rafales > 40 km/h', desc: 'Score plafonné à 3.5' },
  { icon: '⏱', label: 'Période < 5s', desc: 'Score plafonné à 3' },
  { icon: '🌊', label: 'Wind swell pur (pas de ground swell)', desc: 'Pénalité -35%' },
];

const capsEn = [
  { icon: '🚫', label: 'Flat (swell < 0.3m)', desc: 'Score capped at 1.5' },
  { icon: '💨', label: 'Onshore wind > 20 km/h', desc: 'Score capped at 3.5' },
  { icon: '💨', label: 'Brutal offshore > 30 km/h', desc: 'Score capped at 5.5' },
  { icon: '💥', label: 'Gusts > 40 km/h', desc: 'Score capped at 3.5' },
  { icon: '⏱', label: 'Period < 5s', desc: 'Score capped at 3' },
  { icon: '🌊', label: 'Pure wind swell (no ground swell)', desc: '-35% penalty' },
];

const termsFr = [
  { term: 'Période', desc: 'Temps entre 2 vagues (secondes). > 10s = puissant' },
  { term: 'Swell', desc: 'Houle générée au large, plus propre que le wind swell' },
  { term: 'Beach break', desc: 'Fond de sable, vagues changeantes' },
  { term: 'Reef break', desc: 'Fond de roche/récif, vagues régulières' },
  { term: 'Point break', desc: 'Vague qui déroule le long d\'une pointe' },
  { term: 'Shore break', desc: 'Vague qui casse directement sur le bord' },
];

const termsEn = [
  { term: 'Period', desc: 'Time between 2 waves (seconds). > 10s = powerful' },
  { term: 'Swell', desc: 'Ocean-generated waves, cleaner than wind swell' },
  { term: 'Beach break', desc: 'Sandy bottom, changing waves' },
  { term: 'Reef break', desc: 'Rock/reef bottom, consistent waves' },
  { term: 'Point break', desc: 'Wave wrapping along a headland' },
  { term: 'Shore break', desc: 'Wave breaking directly on shore' },
];

export default function GuideScreen({ navigation }: GuideScreenProps) {
  const { colors } = useTheme();
  const { locale, t } = useI18n();
  const insets = useSafeAreaInsets();
  const fr = locale === 'fr';
  const factors = fr ? factorsFr : factorsEn;
  const caps = fr ? capsFr : capsEn;
  const terms = fr ? termsFr : termsEn;

  return (
    <ScrollView style={[gs.root, { backgroundColor: colors.bg }]} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
      <View style={[gs.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          style={[gs.back, { backgroundColor: colors.cardLight }]}
          accessibilityLabel={t.back}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.white} />
        </TouchableOpacity>
        <Text style={[gs.title, { color: colors.white }]} accessibilityRole="header">{fr ? 'Comment ça marche ?' : 'How does it work?'}</Text>
      </View>

      <View style={gs.content}>
        <Text style={[gs.secTitle, { color: colors.accent }]}>{fr ? 'Calcul du score' : 'Score calculation'}</Text>
        <Text style={[gs.desc, { color: colors.white70 }]}>
          {fr
            ? 'Chaque heure reçoit un score de 0 à 10, calculé de façon multiplicative. Les deux piliers sont la houle et le vent : Houle × Vent = la base. Si l\'un est nul, tout le score descend. Ensuite, 8 facteurs ajustent la note : marée (adaptée au type de fond), propreté du swell, courants, tendance du vent, météo, stabilité, ton niveau et tes préférences. Des plafonds bloquent le score en cas de conditions deal-breaker.'
            : 'Each hour gets a 0-10 score, calculated multiplicatively. The two pillars are swell and wind: Swell × Wind = the base. If either is zero, the whole score drops. Then 8 factors adjust the score: tide (adapted to bottom type), swell cleanness, currents, wind trend, weather, consistency, your level and preferences. Hard caps block the score when deal-breaker conditions apply.'}
        </Text>

        {factors.map((f, i) => (
          <View key={i} style={gs.factorRow}>
            <Text style={gs.factorIcon}>{f.icon}</Text>
            <View style={gs.factorInfo}>
              <Text style={[gs.factorTitle, { color: colors.white }]}>{f.title}</Text>
              <Text style={[gs.factorDesc, { color: colors.white40 }]}>{f.desc}</Text>
            </View>
          </View>
        ))}

        <View style={[gs.divider, { backgroundColor: colors.white15 }]} />

        <Text style={[gs.secTitle, { color: colors.accent }]}>{fr ? 'Plafonds automatiques' : 'Automatic caps'}</Text>
        {caps.map((c, i) => (
          <View key={i} style={[gs.windRow, { backgroundColor: 'rgba(255,90,90,0.06)' }]}>
            <Text style={gs.windIcon}>{c.icon}</Text>
            <View style={gs.windInfo}>
              <Text style={[gs.windTerm, { color: '#FF5A5A' }]}>{c.label}</Text>
              <Text style={[gs.windDesc, { color: colors.white40 }]}>{c.desc}</Text>
            </View>
          </View>
        ))}

        <View style={[gs.divider, { backgroundColor: colors.white15 }]} />

        <Text style={[gs.secTitle, { color: colors.accent }]}>{fr ? 'Échelle des scores' : 'Score scale'}</Text>
        {scoreRows.map((r, i) => (
          <View key={i} style={gs.scoreRow}>
            <Text style={gs.scoreEmoji}>{r.emoji}</Text>
            <Text style={[gs.scoreRange, { color: colors.white70 }]}>{r.range}</Text>
            <Text style={[gs.scoreLabel, { color: r.color }]}>{fr ? r.labelFr : r.labelEn}</Text>
          </View>
        ))}

        <View style={[gs.divider, { backgroundColor: colors.white15 }]} />

        <Text style={[gs.secTitle, { color: colors.accent }]}>{fr ? 'Lexique du vent' : 'Wind glossary'}</Text>
        {windTerms.map((w, i) => (
          <View key={i} style={[gs.windRow, { backgroundColor: w.good ? 'rgba(0,212,170,0.06)' : 'rgba(255,90,90,0.06)' }]}>
            <Text style={gs.windIcon}>{w.icon}</Text>
            <View style={gs.windInfo}>
              <Text style={[gs.windTerm, { color: w.good ? '#00D4AA' : '#FF5A5A' }]}>{w.term}</Text>
              <Text style={[gs.windDesc, { color: colors.white40 }]}>{fr ? w.descFr : w.descEn}</Text>
            </View>
          </View>
        ))}

        <View style={[gs.divider, { backgroundColor: colors.white15 }]} />

        <Text style={[gs.secTitle, { color: colors.accent }]}>{fr ? 'Autres termes' : 'Glossary'}</Text>
        <View style={gs.termGrid}>
          {terms.map((t, i) => (
            <View key={i} style={[gs.termItem, { backgroundColor: colors.white08 }]}>
              <Text style={[gs.termWord, { color: colors.white }]}>{t.term}</Text>
              <Text style={[gs.termDesc, { color: colors.white40 }]}>{t.desc}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const gs = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  back: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  title: { ...typography.h1, fontSize: 20, fontWeight: '900' },
  content: { paddingHorizontal: 20 },
  secTitle: { fontSize: 15, fontWeight: '800', marginTop: 20, marginBottom: 10 },
  desc: { fontSize: 13, lineHeight: 20, marginBottom: 12 },
  divider: { height: 1, marginVertical: 16, borderRadius: 1 },

  factorRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  factorIcon: { fontSize: 16, marginRight: 10, marginTop: 1 },
  factorInfo: { flex: 1 },
  factorTitle: { fontSize: 13, fontWeight: '700' },
  factorDesc: { fontSize: 12, lineHeight: 18, marginTop: 2 },

  scoreRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  scoreEmoji: { fontSize: 16, width: 28 },
  scoreRange: { width: 80, fontSize: 13, fontWeight: '700' },
  scoreLabel: { flex: 1, fontSize: 13, fontWeight: '600' },

  windRow: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 12, padding: 12, marginBottom: 6 },
  windIcon: { fontSize: 16, marginRight: 10, marginTop: 1 },
  windInfo: { flex: 1 },
  windTerm: { fontSize: 13, fontWeight: '700' },
  windDesc: { fontSize: 12, lineHeight: 18, marginTop: 2 },

  termGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  termItem: { borderRadius: 10, padding: 10, flexBasis: '46%', flexGrow: 1 },
  termWord: { fontSize: 13, fontWeight: '800', marginBottom: 3 },
  termDesc: { fontSize: 11, lineHeight: 16 },
});
