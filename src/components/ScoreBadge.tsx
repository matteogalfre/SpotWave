import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

function scoreColor(score: number, accent: string, orange: string, red: string): string {
  if (score >= 7.0) return accent;
  if (score >= 4.5) return orange;
  return red;
}

function scoreBg(score: number, accentDim: string, orangeDim: string, redDim: string): string {
  if (score >= 7.0) return accentDim;
  if (score >= 4.5) return orangeDim;
  return redDim;
}

interface Props {
  score: number;
  size?: 'sm' | 'md' | 'lg' | 'hero';
}

const DIM = {
  sm:   { box: 34, font: 13 },
  md:   { box: 46, font: 17 },
  lg:   { box: 60, font: 22 },
  hero: { box: 80, font: 30 },
};

export default function ScoreBadge({ score, size = 'md' }: Props) {
  const { colors } = useTheme();
  const color = scoreColor(score, colors.accent, colors.orange, colors.red);
  const bg = scoreBg(score, colors.accentDim, colors.orangeDim, colors.redDim);
  const d = DIM[size];

  return (
    <View style={[s.box, { width: d.box, height: d.box, borderRadius: d.box / 2, backgroundColor: bg, borderColor: color }]}>
      <Text style={[s.txt, { fontSize: d.font, color }]}>{score.toFixed(1)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  box: { justifyContent: 'center', alignItems: 'center', borderWidth: 2 },
  txt: { fontWeight: '800' },
});
