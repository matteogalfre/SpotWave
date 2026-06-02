import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../i18n';
import { spacing, radius, typography } from '../utils/tokens';
import { fmtElapsed } from '../utils/constants';

interface Props {
  cacheTs: number | null;
}

export default function ForecastSourceCard({ cacheTs }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const border = colors.border ?? colors.white15;
  const cardBg = colors.card;

  const updatedTxt = cacheTs
    ? t.detailDataUpdated(fmtElapsed(new Date(cacheTs), t))
    : t.detailDataUpdated(t.timeNow);

  return (
    <View style={s.wrap}>
      <View style={[s.card, { backgroundColor: cardBg, borderColor: border }]}>
        <View style={s.row}>
          <Ionicons name="cloud-outline" size={16} color={colors.accent} />
          <Text style={[s.label, { color: colors.textMuted ?? colors.white40 }]}>{t.detailDataSource}</Text>
          <Text style={[s.value, { color: colors.white }]} numberOfLines={1}>{t.detailDataSourceVal}</Text>
        </View>
        <View style={[s.sep, { backgroundColor: border }]} />
        <View style={s.row}>
          <Ionicons name="time-outline" size={16} color={colors.accent} />
          <Text style={[s.label, { color: colors.textMuted ?? colors.white40 }]}>{t.detailUpdatedShort}</Text>
          <Text style={[s.value, { color: colors.white }]} numberOfLines={1}>{updatedTxt}</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: spacing.lg, paddingHorizontal: spacing.md },
  card: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    gap: 4,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 22 },
  label: {
    ...typography.tiny,
    width: 84,
  },
  value: { ...typography.caption, flex: 1, fontWeight: '600' },
  sep: { height: 1, marginVertical: spacing.xs },
});
