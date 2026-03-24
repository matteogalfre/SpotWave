import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../i18n';
import { Ionicons } from '@expo/vector-icons';
import { GuideScreenProps } from '../navigation/types';

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
  { term: 'Glassy', descFr: 'Quasiment pas de vent (< 5 km/h). Surface lisse et vitreuse, top !', descEn: 'Almost no wind (< 5 km/h). Smooth glassy surface, perfect!', icon: '✨', good: true },
];

const factorsFr = [
  { icon: '🌊', title: 'Houle (hauteur, direction, peak period)', desc: 'Le facteur principal. Hauteur comparée à l\'idéal du spot et ta préférence. Direction dans la fenêtre optimale. Peak period > 12s = ground swell puissant, < 8s = vagues désorganisées.' },
  { icon: '💨', title: 'Vent (vitesse, direction, rafales)', desc: 'Deuxième facteur clé. Houle × Vent = la base du score. Offshore = top, onshore = grosse pénalité. Rafales > 25 km/h plafonnent le score.' },
  { icon: '🔄', title: 'Propreté du swell', desc: 'Ratio wind swell / ground swell. Si le wind swell domine (> 70%), pénalité sévère (-40%). Période courte + wind swell = vagues "messy".' },
  { icon: '🌊', title: 'Marée (niveau réel + tendance)', desc: 'La vraie hauteur de la mer est analysée heure par heure. Marée montante = bonus (+8%), descendante = malus. Chaque spot a une marée optimale.' },
  { icon: '🌧️', title: 'Météo', desc: 'Pluie forte et orages réduisent le score (jusqu\'à -30%). Le confort et la visibilité comptent.' },
  { icon: '📐', title: 'Stabilité de la houle', desc: 'Direction constante = bonus (+5%). Direction chaotique (> 45° de variation) = malus (-15%).' },
  { icon: '🎯', title: 'Ton niveau', desc: 'Débutant / Intermédiaire / Expert influence le score : spots trop engagés = pénalisés, spots adaptés = boostés.' },
  { icon: '📏', title: 'Tes préférences', desc: 'Hauteur préférée : +10% si la houle correspond. Seules les heures dans ta plage dispo sont recommandées.' },
];

const factorsEn = [
  { icon: '🌊', title: 'Swell (height, direction, peak period)', desc: 'The main factor. Height compared to spot ideal and your preference. Direction in optimal window. Peak period > 12s = powerful ground swell, < 8s = disorganized waves.' },
  { icon: '💨', title: 'Wind (speed, direction, gusts)', desc: 'Second key factor. Swell × Wind = the base score. Offshore = top, onshore = big penalty. Gusts > 25 km/h cap the score.' },
  { icon: '🔄', title: 'Swell cleanness', desc: 'Wind swell / ground swell ratio. If wind swell dominates (> 70%), severe penalty (-40%). Short period + wind swell = messy waves.' },
  { icon: '🌊', title: 'Tide (real level + trend)', desc: 'The actual sea height is analyzed hourly. Rising tide = bonus (+8%), falling = penalty. Each spot has an optimal tide.' },
  { icon: '🌧️', title: 'Weather', desc: 'Heavy rain and storms reduce score (up to -30%). Comfort and visibility matter.' },
  { icon: '📐', title: 'Swell stability', desc: 'Constant direction = bonus (+5%). Chaotic direction (> 45° variation) = penalty (-15%).' },
  { icon: '🎯', title: 'Your level', desc: 'Beginner / Intermediate / Expert affects score: overly challenging spots = penalized, suited spots = boosted.' },
  { icon: '📏', title: 'Your preferences', desc: 'Preferred height: +10% if swell matches. Only hours within your available range are recommended.' },
];

const capsFr = [
  { icon: '🚫', label: 'Flat (houle < 0.3m)', desc: 'Score plafonné à 1' },
  { icon: '💨', label: 'Vent onshore > 20 km/h', desc: 'Score plafonné à 3.5' },
  { icon: '💥', label: 'Rafales > 35 km/h', desc: 'Score plafonné à 4' },
  { icon: '⏱', label: 'Période < 6s', desc: 'Score plafonné à 3' },
];

const capsEn = [
  { icon: '🚫', label: 'Flat (swell < 0.3m)', desc: 'Score capped at 1' },
  { icon: '💨', label: 'Onshore wind > 20 km/h', desc: 'Score capped at 3.5' },
  { icon: '💥', label: 'Gusts > 35 km/h', desc: 'Score capped at 4' },
  { icon: '⏱', label: 'Period < 6s', desc: 'Score capped at 3' },
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
  const { locale } = useI18n();
  const insets = useSafeAreaInsets();
  const fr = locale === 'fr';
  const factors = fr ? factorsFr : factorsEn;
  const caps = fr ? capsFr : capsEn;
  const terms = fr ? termsFr : termsEn;

  return (
    <ScrollView style={[gs.root, { backgroundColor: colors.bg }]} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
      <View style={[gs.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7} style={gs.back}>
          <Ionicons name="chevron-back" size={24} color={colors.white} />
        </TouchableOpacity>
        <Text style={[gs.title, { color: colors.white }]}>{fr ? 'Comment ça marche ?' : 'How does it work?'}</Text>
      </View>

      <View style={gs.content}>
        <Text style={[gs.secTitle, { color: colors.accent }]}>{fr ? 'Calcul du score' : 'Score calculation'}</Text>
        <Text style={[gs.desc, { color: colors.white70 }]}>
          {fr
            ? 'Chaque heure reçoit un score de 0 à 10, calculé de façon multiplicative. Les deux piliers sont la houle et le vent : ils sont multipliés ensemble pour donner la base. Si l\'un est mauvais, tout le score descend.'
            : 'Each hour receives a score from 0 to 10, calculated multiplicatively. The two pillars are swell and wind: they are multiplied together for the base. If one is bad, the entire score drops.'}
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16 },
  back: { marginRight: 12, padding: 4 },
  title: { fontSize: 20, fontWeight: '900' },
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
