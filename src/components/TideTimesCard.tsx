import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MarineData } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../i18n';
import { findTideExtrema, getNextTideExtrema, formatTideTime } from '../utils/tides';
import { spacing, radius, typography } from '../utils/tokens';

interface Props {
  marine: MarineData;
}

function dayBadge(iso: string, todayStr: string, tomorrowStr: string, todayLabel: string, tomorrowLabel: string): string {
  const d = iso.slice(0, 10);
  if (d === todayStr) return todayLabel;
  if (d === tomorrowStr) return tomorrowLabel;
  const date = new Date(iso);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${day}/${month}`;
}

export default function TideTimesCard({ marine }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();

  const next = useMemo(() => {
    if (!marine.sea_level_height_msl || marine.sea_level_height_msl.length === 0) return [];
    const extrema = findTideExtrema(marine.sea_level_height_msl, marine.time);
    return getNextTideExtrema(extrema, new Date(), 6);
  }, [marine.sea_level_height_msl, marine.time]);

  if (next.length === 0) return null;

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const border = colors.border ?? colors.white15;
  const cardBg = colors.card;

  return (
    <View style={s.wrap}>
      <Text style={[s.secT, { color: colors.white }]}>{t.detailTideTimes}</Text>
      <View style={[s.card, { backgroundColor: cardBg, borderColor: border }]}>
        <Text style={[s.subT, { color: colors.textMuted ?? colors.white40 }]}>{t.detailTideNext}</Text>
        <View style={s.grid}>
          {next.map((ev, i) => {
            const isHigh = ev.type === 'high';
            const accent = isHigh ? colors.blue : colors.orange;
            return (
              <View
                key={`${ev.time}-${i}`}
                style={[s.tile, { backgroundColor: colors.white08 }]}
                accessibilityLabel={`${isHigh ? t.detailTideHigh : t.detailTideLow} ${formatTideTime(ev.time)} ${ev.level} m`}
              >
                <Text style={[s.icon, { color: accent }]}>{isHigh ? '🔺' : '🔻'}</Text>
                <Text style={[s.type, { color: accent }]}>{isHigh ? t.detailTideHigh : t.detailTideLow}</Text>
                <Text style={[s.time, { color: colors.white }]}>{formatTideTime(ev.time)}</Text>
                <Text style={[s.day, { color: colors.textMuted ?? colors.white40 }]}>
                  {dayBadge(ev.time, todayStr, tomorrowStr, t.detailTideToday, t.detailTideTomorrow)}
                </Text>
                <Text style={[s.level, { color: colors.textSecondary ?? colors.white70 }]}>
                  {ev.level >= 0 ? '+' : ''}{ev.level.toFixed(2)} m
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: spacing.lg, paddingHorizontal: spacing.md },
  secT: { ...typography.h2, fontSize: 16, marginBottom: spacing.md, marginLeft: 4 },
  card: { borderRadius: radius.lg, padding: spacing.md, borderWidth: 1 },
  subT: { ...typography.tiny, marginBottom: spacing.sm, marginLeft: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    flexBasis: '31%',
    flexGrow: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    gap: 2,
  },
  icon: { fontSize: 14 },
  type: { ...typography.tiny, fontSize: 9 },
  time: { ...typography.h2, fontSize: 16 },
  day: { ...typography.micro, fontSize: 10, fontWeight: '500', textTransform: 'none', letterSpacing: 0 },
  level: { ...typography.micro, fontSize: 10, fontWeight: '500' },
});
