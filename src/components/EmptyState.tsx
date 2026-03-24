import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface Props {
  emoji?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({ emoji = '🏖️', title, subtitle, actionLabel, onAction }: Props) {
  const { colors } = useTheme();
  return (
    <View style={s.root} accessibilityRole="summary" accessibilityLabel={`${title}. ${subtitle ?? ''}`}>
      <Text style={s.emoji}>{emoji}</Text>
      <Text style={[s.title, { color: colors.white }]}>{title}</Text>
      {subtitle && <Text style={[s.sub, { color: colors.white40 }]}>{subtitle}</Text>}
      {actionLabel && onAction && (
        <TouchableOpacity style={[s.btn, { backgroundColor: colors.accentDim }]} onPress={onAction} activeOpacity={0.7}>
          <Text style={[s.btnTxt, { color: colors.accent }]}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 32 },
  emoji: { fontSize: 40, marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  sub: { fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 20 },
  btn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  btnTxt: { fontSize: 14, fontWeight: '700' },
});
