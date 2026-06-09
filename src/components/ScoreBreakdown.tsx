import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { ScoreFactors, ScoreCap } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../i18n';
import { spacing, radius, typography } from '../utils/tokens';

interface Props {
  factors: ScoreFactors;
  finalScore: number;
}

interface Bar {
  key: string;
  label: string;
  value: number;
  ideal: number;
  // For multiplicative factors near 1.0 we show deviation from 1
  type: 'quality' | 'modifier';
  weight?: number;
}

function pctOfIdeal(v: number, ideal: number): number {
  return Math.max(0, Math.min(1, v / ideal));
}

function modifierColor(v: number, colors: any): string {
  if (v >= 1.03) return colors.accent;
  if (v <= 0.85) return colors.red;
  if (v <= 0.95) return colors.orange;
  return colors.textSecondary;
}

function modifierLabel(v: number): string {
  const pct = Math.round((v - 1) * 100);
  if (pct > 0) return `+${pct}%`;
  if (pct < 0) return `${pct}%`;
  return '±0%';
}

export default function ScoreBreakdown({ factors, finalScore }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const capLabels: Record<ScoreCap, string> = {
    flat: t.capFlat,
    period: t.capPeriod,
    onshore: t.capOnshore,
    offshoreStorm: t.capOffshoreStorm,
    gusts: t.capGusts,
    windSwell: t.capWindSwell,
    beginnerExpert: t.capBeginnerExpert,
    beginnerBigWaves: t.capBeginnerBigWaves,
  };

  const qualityBars: Bar[] = [
    { key: 'swell', label: t.detailWhySwell, value: factors.swellQuality, ideal: 1, type: 'quality', weight: 40 },
    { key: 'wind', label: t.detailWhyWind, value: factors.windQuality, ideal: 1, type: 'quality', weight: 35 },
    { key: 'clean', label: t.detailWhyClean, value: factors.cleanFactor, ideal: 1, type: 'quality', weight: 15 },
  ];

  const modifierBars: Bar[] = [
    { key: 'tide', label: t.detailWhyTide, value: factors.tideMatch, ideal: 1, type: 'modifier' },
    { key: 'level', label: t.detailWhyLevel, value: factors.levelFit, ideal: 1, type: 'modifier' },
    { key: 'prefs', label: t.detailWhyPrefs, value: factors.profileMatch, ideal: 1, type: 'modifier' },
    { key: 'weather', label: t.detailWhyWeather, value: factors.weatherPenalty, ideal: 1, type: 'modifier' },
    { key: 'consistency', label: t.detailWhyConsistency, value: factors.consistency, ideal: 1, type: 'modifier' },
    { key: 'trend', label: t.detailWhyTrend, value: factors.windTrend, ideal: 1, type: 'modifier' },
    { key: 'current', label: t.detailWhyCurrent, value: factors.currentPenalty, ideal: 1, type: 'modifier' },
  ];

  const cardBg = colors.card;
  const border = colors.border ?? colors.white15;

  return (
    <View style={s.wrap}>
      <Text style={[s.secT, { color: colors.white }]}>{t.detailWhyScore}</Text>
      <View style={[s.card, { backgroundColor: cardBg, borderColor: border }]}>
        <View style={s.summaryRow}>
          <View style={s.summaryItem}>
            <Text style={[s.summaryLbl, { color: colors.textMuted ?? colors.white40 }]}>{t.detailWhyRaw}</Text>
            <Text style={[s.summaryVal, { color: colors.white }]}>{factors.rawScore.toFixed(1)}</Text>
          </View>
          {factors.cappedScore < factors.rawScore - 0.05 && (
            <>
              <Ionicons name="arrow-forward" size={14} color={colors.textMuted ?? colors.white40} />
              <View style={s.summaryItem}>
                <Text style={[s.summaryLbl, { color: colors.orange }]}>{t.detailWhyCapped}</Text>
                <Text style={[s.summaryVal, { color: colors.orange }]}>{factors.cappedScore.toFixed(1)}</Text>
              </View>
            </>
          )}
          <Ionicons name="arrow-forward" size={14} color={colors.textMuted ?? colors.white40} />
          <View style={s.summaryItem}>
            <Text style={[s.summaryLbl, { color: colors.accent }]}>{t.detailWhyFinal}</Text>
            <Text style={[s.summaryVal, { color: colors.accent }]}>{finalScore.toFixed(1)}</Text>
          </View>
        </View>

        {factors.caps.length > 0 && (
          <View style={[s.capsBox, { backgroundColor: colors.redDim ?? 'rgba(255,90,90,0.12)' }]}>
            {factors.caps.map(c => (
              <Text key={c} style={[s.capTxt, { color: colors.red }]}><MaterialCommunityIcons name="alert" size={13} color={colors.red} />  {capLabels[c]}</Text>
            ))}
          </View>
        )}

        {factors.windSwellOnly && (
          <View style={[s.capsBox, { backgroundColor: colors.orangeDim ?? 'rgba(255,138,80,0.12)' }]}>
            <Text style={[s.capTxt, { color: colors.orange }]}><MaterialCommunityIcons name="alert" size={13} color={colors.orange} />  {t.detailWhyWindSwell}</Text>
          </View>
        )}

        {qualityBars.map((b, i) => (
          <BarRow key={b.key + i} bar={b} colors={colors} t={t} kind="quality" />
        ))}

        {open && modifierBars.map((b, i) => (
          <BarRow key={b.key + i} bar={b} colors={colors} t={t} kind="modifier" />
        ))}

        <TouchableOpacity
          onPress={() => setOpen(o => !o)}
          style={[s.toggle, { borderTopColor: border }]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={open ? t.detailWhyScoreCollapse : t.detailWhyScoreExpand}
        >
          <Text style={[s.toggleTxt, { color: colors.accent }]}>
            {open ? t.detailWhyScoreCollapse : t.detailWhyScoreExpand}
          </Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.accent} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function BarRow({ bar, colors, t, kind }: { bar: Bar; colors: any; t: any; kind: 'quality' | 'modifier' }) {
  if (kind === 'quality') {
    const pct = pctOfIdeal(bar.value, bar.ideal);
    const color = pct >= 0.75 ? colors.accent : pct >= 0.5 ? colors.orange : colors.red;
    return (
      <View style={s.barRow} accessibilityLabel={`${bar.label}: ${Math.round(pct * 100)}%`}>
        <Text style={[s.barLbl, { color: colors.white }]}>{bar.label}</Text>
        <View style={[s.barTrack, { backgroundColor: colors.bgSubtle ?? colors.white08 }]}>
          <View style={[s.barFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
        </View>
        <Text style={[s.barPct, { color }]}>{Math.round(pct * 100)}%</Text>
      </View>
    );
  }

  const color = modifierColor(bar.value, colors);
  const lbl = modifierLabel(bar.value);
  const dev = Math.abs(bar.value - 1);
  const intensity = Math.min(1, dev / 0.25);
  return (
    <View style={s.barRow} accessibilityLabel={`${bar.label}: ${lbl}`}>
      <Text style={[s.barLbl, { color: colors.white }]}>{bar.label}</Text>
      <View style={[s.barTrack, s.barTrackCenter, { backgroundColor: colors.bgSubtle ?? colors.white08 }]}>
        <View style={s.barTrackMid} />
        <View
          style={[
            s.barFillMod,
            bar.value >= 1
              ? { left: '50%', width: `${intensity * 50}%`, backgroundColor: color }
              : { right: '50%', width: `${intensity * 50}%`, backgroundColor: color },
          ]}
        />
      </View>
      <Text style={[s.barPct, { color }]}>{lbl}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: spacing.lg, paddingHorizontal: spacing.md },
  secT: { ...typography.h2, fontSize: 16, marginBottom: spacing.md, marginLeft: 4 },
  card: { borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, gap: spacing.sm },

  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  summaryItem: { alignItems: 'center', flex: 1 },
  summaryLbl: { ...typography.micro, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryVal: { ...typography.h1, fontSize: 22, marginTop: 2 },

  capsBox: {
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginVertical: spacing.xs,
    gap: 4,
  },
  capTxt: { ...typography.caption, fontWeight: '700' },

  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 6 },
  barLbl: { ...typography.caption, width: 88, fontWeight: '600' },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  barTrackCenter: {},
  barTrackMid: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 1.5,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  barFill: { height: '100%', borderRadius: 4 },
  barFillMod: { position: 'absolute', top: 0, bottom: 0, borderRadius: 4 },
  barPct: { ...typography.micro, width: 44, textAlign: 'right' },

  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: spacing.md,
    marginTop: spacing.xs,
    borderTopWidth: 1,
  },
  toggleTxt: { ...typography.caption, fontWeight: '700' },
});
