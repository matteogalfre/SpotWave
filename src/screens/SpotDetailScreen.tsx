import React, { useMemo, useRef, useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions, TouchableOpacity, Linking, RefreshControl } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import ScoreBadge from '../components/ScoreBadge';
import { useTheme } from '../context/ThemeContext';
import { useProfile } from '../context/ProfileContext';
import { fetchSpotData } from '../services/api';
import { computeSpotForecast } from '../utils/scoring';
import { SpotForecast, HourlyCondition } from '../types';
import { scoreColor, scoreBg, scoreLabel, scoreEmoji, dirLabel, windLabel, isDaytime } from '../theme';
import { SpotDetailScreenProps } from '../navigation/types';

const W = Dimensions.get('window').width;

function fmtH(iso: string) { return iso.slice(11, 16); }

function getDaySlice(conditions: HourlyCondition[], from = 7, to = 20): HourlyCondition[] {
  const now = new Date().toISOString().slice(0, 13);
  let start = 0;
  for (let i = 0; i < conditions.length; i++) {
    if (conditions[i].time.slice(0, 13) >= now) { start = i; break; }
  }
  return conditions.slice(start, start + 48).filter(c => isDaytime(c.time, from, to));
}

function buildCombinedChart(data: HourlyCondition[], accentColor: string, orangeColor: string) {
  if (data.length === 0) return { labels: [''], datasets: [{ data: [0] }], legend: [] as string[] };
  const labels = data.map((d, i) => (i % 4 === 0 ? fmtH(d.time) : ''));
  const swellValues = data.map(d => d.swellHeight);
  const windNorm = data.map(d => d.windSpeed / 10);
  return {
    labels,
    datasets: [
      { data: swellValues, color: () => accentColor, strokeWidth: 2 },
      { data: windNorm, color: () => orangeColor, strokeWidth: 2, strokeDashArray: [5, 3] },
    ],
    legend: ['Houle (m)', 'Vent (÷10)'],
  };
}

function buildTideChart(data: HourlyCondition[], blueColor: string) {
  if (data.length === 0) return { labels: [''], datasets: [{ data: [0], color: () => blueColor, strokeWidth: 2 }] };
  const labels = data.map((d, i) => (i % 4 === 0 ? fmtH(d.time) : ''));
  const values = data.map(d => d.tideHeight);
  return { labels, datasets: [{ data: values, color: () => blueColor, strokeWidth: 2 }] };
}

const TIDE_LABELS: Record<string, string> = {
  low: 'Marée basse', mid: 'Mi-marée', high: 'Marée haute', all: 'Toutes marées',
};

function getTideTrend(slice: HourlyCondition[], currentIdx: number): { arrow: string; label: string } {
  if (slice.length < 3) return { arrow: '—', label: 'N/A' };
  const idx = Math.min(currentIdx, slice.length - 2);
  const prev = slice[Math.max(0, idx - 1)]?.tideHeight ?? 0;
  const curr = slice[idx]?.tideHeight ?? 0;
  const next = slice[Math.min(slice.length - 1, idx + 1)]?.tideHeight ?? 0;
  const trend = (curr - prev) + (next - curr);
  if (trend > 0.02) return { arrow: '↑', label: 'Montante' };
  if (trend < -0.02) return { arrow: '↓', label: 'Descendante' };
  return { arrow: '→', label: 'Marée étale' };
}

function buildDaySummary(slice: HourlyCondition[], spot: any): string {
  const todayStr = new Date().toISOString().slice(0, 10);
  const todaySlice = slice.filter(c => c.time.slice(0, 10) === todayStr);
  const data = todaySlice.length > 0 ? todaySlice : slice;
  if (data.length === 0) return 'Pas de données disponibles.';

  const avgScore = data.reduce((s, c) => s + c.score, 0) / data.length;
  const maxScore = Math.max(...data.map(c => c.score));
  const avgSwell = data.reduce((s, c) => s + c.swellHeight, 0) / data.length;
  const maxSwell = Math.max(...data.map(c => c.swellHeight));
  const avgWind = data.reduce((s, c) => s + c.windSpeed, 0) / data.length;
  const maxGusts = Math.max(...data.map(c => c.windGusts));
  const avgPeriod = data.reduce((s, c) => s + c.swellPeriod, 0) / data.length;
  const bestHour = data.reduce((best, c) => c.score > best.score ? c : best, data[0]);
  const bestTime = fmtH(bestHour.time);

  const parts: string[] = [];

  if (avgSwell < 0.3) parts.push('Journée très calme, quasiment flat.');
  else if (avgSwell < 0.8) parts.push(`Petites vagues (${avgSwell.toFixed(1)}m).`);
  else if (avgSwell < 1.5) parts.push(`Houle de ${avgSwell.toFixed(1)}m, séries jusqu'à ${maxSwell.toFixed(1)}m.`);
  else if (avgSwell < 2.5) parts.push(`Belle houle (${avgSwell.toFixed(1)}m, max ${maxSwell.toFixed(1)}m).`);
  else parts.push(`Grosse houle ${avgSwell.toFixed(1)}m (max ${maxSwell.toFixed(1)}m), attention.`);

  if (avgPeriod >= 12) parts.push(`Période longue (${avgPeriod.toFixed(0)}s), vagues bien formées.`);
  else if (avgPeriod >= 8) parts.push(`Période ${avgPeriod.toFixed(0)}s.`);
  else parts.push(`Période courte (${avgPeriod.toFixed(0)}s), vagues désorganisées.`);

  const wl = windLabel(avgWind, bestHour.windDirection, spot.beachOrientation);
  if (avgWind < 8) parts.push('Vent très faible, conditions glassy.');
  else if (avgWind < 15) parts.push(`Vent modéré ${wl.toLowerCase()} (${avgWind.toFixed(0)} km/h).`);
  else parts.push(`Vent fort ${wl.toLowerCase()} (${avgWind.toFixed(0)} km/h), surface hachée.`);

  if (maxGusts > 30) parts.push(`Rafales jusqu'à ${maxGusts.toFixed(0)} km/h.`);
  if (maxScore >= 7) parts.push(`Meilleur créneau à ${bestTime} (${maxScore.toFixed(1)}/10).`);
  else if (maxScore >= 5) parts.push(`Créneau le plus favorable à ${bestTime} (${maxScore.toFixed(1)}/10).`);
  else parts.push(`Score max ${maxScore.toFixed(1)}/10 à ${bestTime} — journée difficile.`);
  if (avgScore < 3) parts.push('Pas la peine de se déplacer.');

  return parts.join(' ');
}

function rowBg(score: number): string {
  if (score >= 7.0) return 'rgba(0,212,170,0.08)';
  if (score >= 5.5) return 'rgba(0,212,170,0.04)';
  if (score >= 4.0) return 'rgba(255,208,96,0.06)';
  if (score >= 2.5) return 'rgba(255,138,80,0.05)';
  return 'rgba(255,90,90,0.05)';
}

function getNowLineX(currentIdx: number, total: number, chartWidth: number): number | null {
  if (currentIdx < 0 || total <= 1) return null;
  const leftPad = 52;
  const rightPad = 20;
  const dataW = chartWidth - leftPad - rightPad;
  return leftPad + (currentIdx / (total - 1)) * dataW;
}

function NowLine({ x, height, color }: { x: number; height: number; color: string }) {
  return (
    <View style={{ position: 'absolute', left: x, top: 8, width: 1.5, height: height - 24, backgroundColor: color, borderRadius: 1, opacity: 0.5 }} />
  );
}

export default function SpotDetailScreen({ route, navigation }: SpotDetailScreenProps) {
  const initialForecast: SpotForecast = route.params.forecast;
  const [forecast, setForecast] = useState<SpotForecast>(initialForecast);
  const [refreshing, setRefreshing] = useState(false);
  const { spot, currentCondition, bestTime } = forecast;
  const { colors } = useTheme();
  const { profile } = useProfile();
  const slice = useMemo(() => getDaySlice(forecast.hourlyConditions, profile.availableFrom, profile.availableTo), [forecast.hourlyConditions, profile.availableFrom, profile.availableTo]);
  const ref = useRef<ScrollView>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { marine, weather } = await fetchSpotData(spot.latitude, spot.longitude);
      setForecast(computeSpotForecast(spot, marine, weather, profile));
    } catch {}
    setRefreshing(false);
  }, [spot, profile]);

  const chartWidth = Math.max(W - 24, slice.length * 38);
  const chartH = 180;

  const combinedData = useMemo(() => buildCombinedChart(slice, colors.accent, colors.orange), [slice, colors.accent, colors.orange]);
  const tideData = useMemo(() => buildTideChart(slice, colors.blue), [slice, colors.blue]);

  const summary = useMemo(() => buildDaySummary(slice, spot), [slice, spot]);

  const currentIdx = useMemo(() => {
    const now = new Date().toISOString().slice(0, 13);
    return Math.max(0, slice.findIndex(c => c.time.slice(0, 13) >= now));
  }, [slice]);
  const tideTrend = useMemo(() => getTideTrend(slice, currentIdx), [slice, currentIdx]);

  const nowX = useMemo(() => getNowLineX(currentIdx, slice.length, chartWidth), [currentIdx, slice.length, chartWidth]);

  const levelLabels: Record<string, string> = { beginner: 'Débutant', intermediate: 'Intermédiaire', expert: 'Expert' };
  const breakLabels: Record<string, string> = { beach: 'Beach break', reef: 'Reef break', point: 'Point break' };

  const chartCfg = useMemo(() => ({
    backgroundGradientFrom: colors.card,
    backgroundGradientTo: colors.card,
    decimalPlaces: 1,
    color: (o = 1) => `rgba(0,212,170,${o})`,
    labelColor: () => colors.white70,
    propsForDots: { r: '3', strokeWidth: '0', fill: colors.accent },
    propsForLabels: { fontSize: 11, fontWeight: '600' },
    fillShadowGradientFrom: colors.accent,
    fillShadowGradientTo: 'transparent',
    fillShadowGradientFromOpacity: 0.2,
    fillShadowGradientToOpacity: 0,
  }), [colors]);

  const tideChartCfg = useMemo(() => ({
    ...chartCfg,
    color: (o = 1) => `rgba(74,144,255,${o})`,
    propsForDots: { r: '3', strokeWidth: '0', fill: colors.blue },
    fillShadowGradientFrom: colors.blue,
    fillShadowGradientFromOpacity: 0.15,
  }), [chartCfg, colors.blue]);

  const offshoreDir = (spot.beachOrientation + 180) % 360;

  const renderRow = useCallback((c: HourlyCondition, i: number) => {
    const wl = windLabel(c.windSpeed, c.windDirection, spot.beachOrientation);
    const isGust = c.windGusts > 25;
    return (
      <View key={i} style={[s.row, { backgroundColor: rowBg(c.score) }]}>
        <Text style={[s.rTime, { color: colors.white70 }]}>{fmtH(c.time)}</Text>
        <View style={[s.rBadge, { backgroundColor: scoreBg(c.score) }]}>
          <Text style={[s.rScore, { color: scoreColor(c.score) }]}>{c.score.toFixed(1)}</Text>
        </View>
        <Text style={[s.rMain, { color: colors.white }]}>
          {c.swellHeight.toFixed(1)}m · {c.swellPeriod.toFixed(0)}s
        </Text>
        <View style={s.rWindCol}>
          <Text style={[s.rWind, { color: colors.white40 }, isGust && { color: colors.orange }]}>{wl} {c.windSpeed.toFixed(0)}</Text>
          {isGust && <Text style={[s.rGust, { color: colors.orange }]}>💥{c.windGusts.toFixed(0)}</Text>}
        </View>
      </View>
    );
  }, [spot.beachOrientation, colors]);

  return (
    <ScrollView ref={ref} style={{ flex: 1, backgroundColor: colors.bg }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[s.back, { backgroundColor: colors.cardLight }]}>
          <Text style={[s.backTxt, { color: colors.white }]}>‹</Text>
        </TouchableOpacity>
        <View style={s.hCenter}>
          <Text style={[s.hName, { color: colors.white }]}>{spot.name}</Text>
          <Text style={[s.hRegion, { color: colors.accent }]}>{spot.region}</Text>
          {currentCondition && (
            <Text style={[s.hTemp, { color: colors.white40 }]}>{currentCondition.temperature.toFixed(0)}° air · {currentCondition.seaTemp.toFixed(0)}° eau</Text>
          )}
        </View>
        <ScoreBadge score={forecast.currentScore} size="lg" />
      </View>

      {/* Best banner */}
      <View style={[s.banner, { backgroundColor: scoreBg(bestTime.score), borderColor: scoreColor(bestTime.score) }]}>
        <Text style={[s.bannerTxt, { color: scoreColor(bestTime.score) }]}>
          {scoreEmoji(bestTime.score)} {bestTime.label} — {scoreLabel(bestTime.score)}
        </Text>
      </View>

      {/* Day summary */}
      <View style={[s.summaryBox, { backgroundColor: colors.card, borderColor: colors.white15 }]}>
        <Text style={[s.summaryTitle, { color: colors.white }]}>📝 Résumé du jour</Text>
        <Text style={[s.summaryTxt, { color: colors.white70 }]}>{summary}</Text>
      </View>

      {/* Tide + trend */}
      {currentCondition && (
        <View style={[s.tideRow, { backgroundColor: colors.card }]}>
          <View style={s.tideItem}>
            <Text style={s.tideIcon}>🌊</Text>
            <Text style={[s.tideLabel, { color: colors.white40 }]}>Courant</Text>
            <Text style={[s.tideVal, { color: colors.white }]}>{currentCondition.tideHeight.toFixed(2)} m/s</Text>
          </View>
          <View style={[s.tideSep, { backgroundColor: colors.white15 }]} />
          <View style={s.tideItem}>
            <Text style={s.tideIcon}>{tideTrend.arrow === '↑' ? '🔺' : tideTrend.arrow === '↓' ? '🔻' : '➡️'}</Text>
            <Text style={[s.tideLabel, { color: colors.white40 }]}>Marée</Text>
            <Text style={[s.tideVal, { color: tideTrend.arrow === '↑' ? colors.accent : tideTrend.arrow === '↓' ? colors.orange : colors.white }]}>{tideTrend.arrow} {tideTrend.label}</Text>
          </View>
          <View style={[s.tideSep, { backgroundColor: colors.white15 }]} />
          <View style={s.tideItem}>
            <Text style={s.tideIcon}>⚓</Text>
            <Text style={[s.tideLabel, { color: colors.white40 }]}>Optimale</Text>
            <Text style={[s.tideVal, { color: colors.white }]}>{TIDE_LABELS[spot.optimalTide]}</Text>
          </View>
        </View>
      )}

      {/* Webcam */}
      {spot.webcamUrl && (
        <TouchableOpacity
          style={[s.webcamBtn, { backgroundColor: colors.blueDim, borderColor: colors.blue }]}
          onPress={() => Linking.openURL(spot.webcamUrl!)}
          activeOpacity={0.7}
        >
          <Text style={s.webcamIcon}>📹</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.webcamTxt, { color: colors.blue }]}>Webcam live</Text>
            <Text style={[s.webcamSub, { color: colors.white40 }]}>Voir les conditions en direct</Text>
          </View>
          <View style={[s.webcamGo, { backgroundColor: colors.blue }]}>
            <Text style={s.webcamGoTxt}>OUVRIR</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Combined chart: Houle vs Vent */}
      <View style={s.sec}>
        <Text style={[s.secT, { color: colors.white }]}>📊  Houle & Vent</Text>
        <View style={[s.chartBox, { backgroundColor: colors.card }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              <LineChart
                data={combinedData}
                width={chartWidth}
                height={chartH}
                chartConfig={chartCfg}
                bezier
                style={s.chart}
                fromZero
                withInnerLines={false}
                withOuterLines={false}
                segments={4}
              />
              {nowX != null && <NowLine x={nowX} height={chartH} color={colors.white} />}
            </View>
          </ScrollView>
          <View style={s.legendRow}>
            <View style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: colors.accent }]} />
              <Text style={[s.legendTxt, { color: colors.white40 }]}>Houle (m)</Text>
            </View>
            <View style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: colors.orange }]} />
              <Text style={[s.legendTxt, { color: colors.white40 }]}>Vent (÷10 km/h)</Text>
            </View>
            <View style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: colors.white40, width: 1.5, height: 14, borderRadius: 0 }]} />
              <Text style={[s.legendTxt, { color: colors.white40 }]}>Maintenant</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Tide chart */}
      <View style={s.sec}>
        <Text style={[s.secT, { color: colors.white }]}>🌊  Marée</Text>
        <View style={[s.chartBox, { backgroundColor: colors.card }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              <LineChart
                data={tideData}
                width={chartWidth}
                height={chartH}
                chartConfig={tideChartCfg}
                bezier
                style={s.chart}
                withInnerLines={false}
                withOuterLines={false}
                segments={4}
                yAxisSuffix=" m/s"
              />
              {nowX != null && <NowLine x={nowX} height={chartH} color={colors.white} />}
            </View>
          </ScrollView>
        </View>
      </View>

      {/* Hourly rows */}
      <View style={s.sec}>
        <Text style={[s.secT, { color: colors.white }]}>📋  Prévisions heure par heure</Text>
        {slice.map(renderRow)}
      </View>

      {/* Spot info — redesigned */}
      <View style={s.sec}>
        <Text style={[s.secT, { color: colors.white }]}>📍  Fiche du spot</Text>
        <View style={[s.info, { backgroundColor: colors.card }]}>
          <Text style={[s.desc, { color: colors.white70 }]}>{spot.description}</Text>

          <Text style={[s.infoGroupTitle, { color: colors.accent }]}>Conditions idéales</Text>
          <View style={s.idealGrid}>
            <IdealCard
              icon="🧭" title="Direction houle"
              value={`${dirLabel(spot.optimalSwellDirMin)} → ${dirLabel(spot.optimalSwellDirMax)}`}
              sub={`${spot.optimalSwellDirMin}° – ${spot.optimalSwellDirMax}°`}
              colors={colors}
            />
            <IdealCard
              icon="🌊" title="Hauteur idéale"
              value={`${spot.optimalSwellHeightMin} – ${spot.optimalSwellHeightMax}m`}
              colors={colors}
            />
            <IdealCard
              icon="💨" title="Vent idéal"
              value="Offshore"
              sub={`Direction ${dirLabel(offshoreDir)} (${offshoreDir}°)`}
              colors={colors}
            />
            <IdealCard
              icon="⚓" title="Marée"
              value={TIDE_LABELS[spot.optimalTide]}
              colors={colors}
            />
            <IdealCard
              icon="🏖" title="Type de fond"
              value={breakLabels[spot.bottomType]}
              colors={colors}
            />
            <IdealCard
              icon="🎯" title="Niveau"
              value={levelLabels[spot.recommendedLevel]}
              colors={colors}
            />
          </View>

          {spot.dangers.length > 0 && (
            <>
              <Text style={[s.infoGroupTitle, { color: colors.red, marginTop: 16 }]}>Dangers</Text>
              <View style={[s.dangerBox, { backgroundColor: colors.redDim }]}>
                {spot.dangers.map((d: string, i: number) => (
                  <Text key={i} style={[s.dangerTxt, { color: colors.red }]}>⚠️  {d}</Text>
                ))}
              </View>
            </>
          )}
        </View>
      </View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

function IdealCard({ icon, title, value, sub, colors }: { icon: string; title: string; value: string; sub?: string; colors: any }) {
  return (
    <View style={[s.idealCard, { backgroundColor: colors.white08 }]}>
      <Text style={s.idealIcon}>{icon}</Text>
      <Text style={[s.idealTitle, { color: colors.white40 }]}>{title}</Text>
      <Text style={[s.idealValue, { color: colors.white }]}>{value}</Text>
      {sub && <Text style={[s.idealSub, { color: colors.white40 }]}>{sub}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 52, paddingHorizontal: 16, paddingBottom: 12 },
  back: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  backTxt: { fontSize: 24, fontWeight: '300', marginTop: -2 },
  hCenter: { flex: 1, marginHorizontal: 12 },
  hName: { fontSize: 21, fontWeight: '800' },
  hRegion: { fontSize: 12, fontWeight: '600', marginTop: 1 },
  hTemp: { fontSize: 12, marginTop: 3 },

  banner: { marginHorizontal: 16, marginBottom: 6, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1 },
  bannerTxt: { fontSize: 14, fontWeight: '700', textAlign: 'center' },

  summaryBox: { marginHorizontal: 16, marginTop: 10, marginBottom: 6, borderRadius: 14, padding: 16, borderWidth: 1 },
  summaryTitle: { fontSize: 15, fontWeight: '800', marginBottom: 8 },
  summaryTxt: { fontSize: 14, lineHeight: 22 },

  tideRow: { flexDirection: 'row', marginHorizontal: 16, marginTop: 10, marginBottom: 6, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 10 },
  tideItem: { flex: 1, alignItems: 'center' },
  tideIcon: { fontSize: 16, marginBottom: 4 },
  tideLabel: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase' },
  tideVal: { fontSize: 13, fontWeight: '800', marginTop: 4 },
  tideSep: { width: 1, marginVertical: 4 },

  webcamBtn: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 10, marginBottom: 6, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1.5 },
  webcamIcon: { fontSize: 22, marginRight: 12 },
  webcamTxt: { fontSize: 16, fontWeight: '800' },
  webcamSub: { fontSize: 11, marginTop: 2 },
  webcamGo: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  webcamGoTxt: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },

  sec: { marginTop: 18, paddingHorizontal: 12 },
  secT: { fontSize: 16, fontWeight: '800', marginBottom: 10, marginLeft: 4 },
  chartBox: { borderRadius: 16, overflow: 'hidden', paddingTop: 10, paddingBottom: 4 },
  chart: { borderRadius: 16, marginLeft: -8 },

  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, paddingBottom: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendTxt: { fontSize: 11, fontWeight: '600' },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, marginBottom: 1 },
  rTime: { width: 40, fontSize: 12, fontWeight: '700' },
  rBadge: { width: 36, borderRadius: 6, paddingVertical: 2, alignItems: 'center', marginRight: 8 },
  rScore: { fontSize: 11, fontWeight: '800' },
  rMain: { fontSize: 12, fontWeight: '600', flex: 1 },
  rWindCol: { alignItems: 'flex-end' },
  rWind: { fontSize: 11, fontWeight: '500' },
  rGust: { fontSize: 9, fontWeight: '700', marginTop: 1 },

  info: { borderRadius: 16, padding: 18 },
  desc: { fontSize: 14, lineHeight: 21, marginBottom: 12 },
  infoGroupTitle: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  idealGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  idealCard: { width: '47%' as any, borderRadius: 12, padding: 12 },
  idealIcon: { fontSize: 18, marginBottom: 6 },
  idealTitle: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  idealValue: { fontSize: 14, fontWeight: '800', marginTop: 4 },
  idealSub: { fontSize: 11, marginTop: 2 },
  dangerBox: { borderRadius: 12, padding: 14 },
  dangerTxt: { fontSize: 13, marginBottom: 4, fontWeight: '500' },
});
