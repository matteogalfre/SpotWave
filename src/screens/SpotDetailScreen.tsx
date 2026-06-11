import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions, TouchableOpacity, Linking, RefreshControl, Animated, ActivityIndicator, NativeSyntheticEvent, NativeScrollEvent, Share } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-chart-kit';
import ScoreBadge from '../components/ScoreBadge';
import ScoreBreakdown from '../components/ScoreBreakdown';
import { useTheme } from '../context/ThemeContext';
import { useProfile } from '../context/ProfileContext';
import { useLocation } from '../context/LocationContext';
import { fetchSpotData, DailyData } from '../services/api';
import { computeSpotForecast, spotLocalNowKey } from '../utils/scoring';
import { haversineDistance, formatDistance } from '../services/location';
import { getStoredForecasts } from '../context/ForecastStore';
import { getFavorites, toggleFavorite } from '../services/favorites';
import { useToast } from '../components/Toast';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SpotForecast, HourlyCondition } from '../types';
import { scoreColor, scoreBg, scoreLabel, dirLabel, windLabel, isDaytime } from '../theme';
import { scoreIcon, weatherMCIcon, ICONS, MCIName } from '../utils/icons';
import { SpotDetailScreenProps } from '../navigation/types';
import { getLevelLabel, getBreakLabel, getTideLabel, fmtDayLabelShort, fmtRange, fmtH } from '../utils/constants';
import { spotDescription, spotDangers } from '../utils/spotI18n';
import * as Haptics from 'expo-haptics';
import { log } from '../utils/logger';
import { useI18n } from '../i18n';
const W = Dimensions.get('window').width;

function getDaySlice(conditions: HourlyCondition[], nowKey: string, from = 7, to = 20): HourlyCondition[] {
  let nowIdx = 0;
  for (let i = 0; i < conditions.length; i++) {
    if (conditions[i].time.slice(0, 13) >= nowKey) { nowIdx = i; break; }
  }
  const pastHours = 1;
  const start = Math.max(0, nowIdx - pastHours);
  return conditions.slice(start, start + 49).filter(c => isDaytime(c.time, from, to));
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
    legend: [] as string[],
  };
}

function buildTideChart(data: HourlyCondition[], blueColor: string) {
  if (data.length === 0) return { labels: [''], datasets: [{ data: [0], color: () => blueColor, strokeWidth: 2 }] };
  const labels = data.map((d, i) => (i % 4 === 0 ? fmtH(d.time) : ''));
  const values = data.map(d => d.seaLevel);
  return { labels, datasets: [{ data: values, color: () => blueColor, strokeWidth: 2 }] };
}


function getTideTrend(slice: HourlyCondition[], currentIdx: number, t: any): { arrow: string; label: string } {
  if (slice.length < 3) return { arrow: '—', label: 'N/A' };
  const idx = Math.min(currentIdx, slice.length - 2);
  const prev = slice[Math.max(0, idx - 1)]?.seaLevel ?? 0;
  const curr = slice[idx]?.seaLevel ?? 0;
  const next = slice[Math.min(slice.length - 1, idx + 1)]?.seaLevel ?? 0;
  const trend = (curr - prev) + (next - curr);
  if (trend > 0.02) return { arrow: '↑', label: t.detailTideRising };
  if (trend < -0.02) return { arrow: '↓', label: t.detailTideFalling };
  return { arrow: '→', label: t.detailTideSlack };
}

function buildDaySummary(slice: HourlyCondition[], spot: any, todayStr: string, locale: string = 'fr'): string {
  const todaySlice = slice.filter(c => c.time.slice(0, 10) === todayStr);
  const data = todaySlice.length > 0 ? todaySlice : slice;
  const fr = locale === 'fr';
  if (data.length === 0) return fr ? 'Pas de données disponibles.' : 'No data available.';

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
  const sw = avgSwell.toFixed(1);
  const mx = maxSwell.toFixed(1);
  const per = avgPeriod.toFixed(0);
  const wnd = avgWind.toFixed(0);
  const gst = maxGusts.toFixed(0);
  const ms = maxScore.toFixed(1);

  if (fr) {
    if (avgSwell < 0.3) parts.push('Journée très calme, quasiment flat.');
    else if (avgSwell < 0.8) parts.push(`Petites vagues (${sw}m).`);
    else if (avgSwell < 1.5) parts.push(`Houle de ${sw}m, séries jusqu'à ${mx}m.`);
    else if (avgSwell < 2.5) parts.push(`Belle houle (${sw}m, max ${mx}m).`);
    else parts.push(`Grosse houle ${sw}m (max ${mx}m), attention.`);

    if (avgPeriod >= 12) parts.push(`Période longue (${per}s), vagues bien formées.`);
    else if (avgPeriod >= 8) parts.push(`Période ${per}s.`);
    else parts.push(`Période courte (${per}s), vagues désorganisées.`);

    const wl = windLabel(avgWind, bestHour.windDirection, spot.beachOrientation);
    if (avgWind < 8) parts.push('Vent très faible, conditions glassy.');
    else if (avgWind < 15) parts.push(`Vent modéré ${wl.toLowerCase()} (${wnd} km/h).`);
    else parts.push(`Vent fort ${wl.toLowerCase()} (${wnd} km/h), surface hachée.`);

    if (maxGusts > 30) parts.push(`Rafales jusqu'à ${gst} km/h.`);
    if (maxScore >= 7) parts.push(`Meilleur créneau à ${bestTime} (${ms}/10).`);
    else if (maxScore >= 5) parts.push(`Créneau le plus favorable à ${bestTime} (${ms}/10).`);
    else parts.push(`Score max ${ms}/10 à ${bestTime} — journée difficile.`);
    if (avgScore < 3) parts.push('Pas la peine de se déplacer.');
  } else {
    if (avgSwell < 0.3) parts.push('Very calm day, almost flat.');
    else if (avgSwell < 0.8) parts.push(`Small waves (${sw}m).`);
    else if (avgSwell < 1.5) parts.push(`Swell ${sw}m, sets up to ${mx}m.`);
    else if (avgSwell < 2.5) parts.push(`Nice swell (${sw}m, max ${mx}m).`);
    else parts.push(`Big swell ${sw}m (max ${mx}m), be careful.`);

    if (avgPeriod >= 12) parts.push(`Long period (${per}s), well-formed waves.`);
    else if (avgPeriod >= 8) parts.push(`Period ${per}s.`);
    else parts.push(`Short period (${per}s), disorganized waves.`);

    const wl = windLabel(avgWind, bestHour.windDirection, spot.beachOrientation);
    if (avgWind < 8) parts.push('Very light wind, glassy conditions.');
    else if (avgWind < 15) parts.push(`Moderate ${wl.toLowerCase()} wind (${wnd} km/h).`);
    else parts.push(`Strong ${wl.toLowerCase()} wind (${wnd} km/h), choppy surface.`);

    if (maxGusts > 30) parts.push(`Gusts up to ${gst} km/h.`);
    if (maxScore >= 7) parts.push(`Best slot at ${bestTime} (${ms}/10).`);
    else if (maxScore >= 5) parts.push(`Most favorable slot at ${bestTime} (${ms}/10).`);
    else parts.push(`Max score ${ms}/10 at ${bestTime} — tough day.`);
    if (avgScore < 3) parts.push('Not worth the trip.');
  }

  return parts.join(' ');
}

function rowBg(score: number): string {
  const s = Math.max(0, Math.min(10, score));
  if (s >= 6.0) return `rgba(0,212,170,${0.04 + (s - 6) * 0.01})`;
  if (s >= 4.0) return `rgba(255,210,80,${0.03 + (s - 4) * 0.01})`;
  if (s >= 2.0) return `rgba(255,138,80,${0.03 + (s - 2) * 0.01})`;
  return `rgba(255,90,90,${0.03 + s * 0.01})`;
}

function getNowLineX(fractionalIdx: number, total: number, chartWidth: number): number | null {
  if (fractionalIdx < 0 || total <= 1) return null;
  const leftPad = 52;
  const rightPad = 20;
  const dataW = chartWidth - leftPad - rightPad;
  return leftPad + (fractionalIdx / (total - 1)) * dataW;
}

function NowLine({ x, height, color }: { x: number; height: number; color: string }) {
  return (
    <View style={{ position: 'absolute', left: x, top: 8, width: 1.5, height: height - 24, backgroundColor: color, borderRadius: 1, opacity: 0.5 }} />
  );
}

function getSunTimes(daily: DailyData | null, todayStr: string): { sunrise: string; sunset: string } | null {
  if (!daily?.sunrise?.length) return null;
  const idx = daily.time.findIndex(t => t === todayStr);
  if (idx < 0) return null;
  const sr = daily.sunrise[idx];
  const ss = daily.sunset[idx];
  if (!sr || !ss) return null;
  return { sunrise: sr.slice(11, 16), sunset: ss.slice(11, 16) };
}

function FadeInView({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }, delay);
    return () => clearTimeout(timer);
  }, [opacity, delay]);
  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}

export default function SpotDetailScreen({ route, navigation }: SpotDetailScreenProps) {
  const initialForecast: SpotForecast = route.params.forecast;
  const allForecasts = getStoredForecasts();
  const initialIndex = route.params.spotIndex ?? 0;

  const [forecast, setForecast] = useState<SpotForecast>(initialForecast);
  const [currentSpotIdx, setCurrentSpotIdx] = useState(initialIndex);
  const [refreshing, setRefreshing] = useState(false);
  const [dailyData, setDailyData] = useState<DailyData | null>(null);
  const [ready, setReady] = useState(false);
  const [isFav, setIsFav] = useState(false);
  const { show: showToast } = useToast();
  const { t, locale } = useI18n();
  const { spot, currentCondition } = forecast;
  const { colors } = useTheme();
  const { profile } = useProfile();
  const { location } = useLocation();
  const insets = useSafeAreaInsets();
  const spotDistance = useMemo(() => {
    if (!location) return null;
    return haversineDistance(location.latitude, location.longitude, spot.latitude, spot.longitude);
  }, [location, spot.latitude, spot.longitude]);

  useEffect(() => {
    // Defer heavy content until the screen is idle. RN 0.85 deprecates
    // InteractionManager in favour of requestIdleCallback; we use it when
    // available and fall back to a microtask-ish timeout otherwise.
    const ric = (globalThis as any).requestIdleCallback as
      | undefined
      | ((cb: () => void, opts?: { timeout: number }) => number);
    const cic = (globalThis as any).cancelIdleCallback as undefined | ((handle: number) => void);
    if (ric) {
      const handle = ric(() => setReady(true), { timeout: 500 });
      return () => cic?.(handle);
    }
    const timer = setTimeout(() => setReady(true), 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    getFavorites().then(ids => setIsFav(ids.includes(spot.id)));
  }, [spot.id]);

  const handleToggleFav = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const next = await toggleFavorite(spot.id);
    const nowFav = next.includes(spot.id);
    setIsFav(nowFav);
    showToast(nowFav ? t.spotsAddedFav : t.spotsRemovedFav, 'success');
  }, [spot.id, showToast, t]);

  const handleShare = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await Share.share({
        message: t.detailShareMessage(
          spot.name,
          spot.region,
          forecast.currentScore.toFixed(1),
          scoreLabel(forecast.currentScore, t),
        ),
      });
    } catch (e) {
      log.warn('Share failed:', e);
    }
  }, [spot.name, spot.region, forecast.currentScore, t]);
  // "Now"/"today" anchored to the SPOT's timezone (not the device), so charts,
  // sun times and "best today" stay correct when viewing a far-away spot.
  const nowKey = useMemo(() => spotLocalNowKey(forecast.utcOffsetSeconds), [forecast.utcOffsetSeconds]);
  const spotTodayStr = nowKey.slice(0, 10);
  const slice = useMemo(() => getDaySlice(forecast.hourlyConditions, nowKey, profile.availableFrom, profile.availableTo), [forecast.hourlyConditions, nowKey, profile.availableFrom, profile.availableTo]);
  const scrollRef = useRef<ScrollView>(null);
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const stickyOpacity = useRef(new Animated.Value(0)).current;

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const threshold = 120;
    const shouldShow = y > threshold;
    if (shouldShow !== showStickyHeader) {
      setShowStickyHeader(shouldShow);
      Animated.timing(stickyOpacity, { toValue: shouldShow ? 1 : 0, duration: 200, useNativeDriver: true }).start();
    }
  }, [showStickyHeader, stickyOpacity]);

  useEffect(() => {
    let cancelled = false;
    // Clear the previous spot's data so stale tide times / sun times are never
    // shown while the new spot loads (e.g. prev/next swipe).
    setDailyData(null);
    fetchSpotData(spot.latitude, spot.longitude)
      .then(({ daily }) => {
        if (cancelled) return;
        if (daily) setDailyData(daily);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [spot.latitude, spot.longitude]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { marine, weather, daily } = await fetchSpotData(spot.latitude, spot.longitude);
      setForecast(computeSpotForecast(spot, marine, weather, profile, locale));
      if (daily) setDailyData(daily);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur inconnue';
      log.warn('Refresh failed:', msg);
      showToast(t.detailRefreshError, 'error');
    }
    setRefreshing(false);
  }, [spot, profile, locale, t]);

  const navigateToSpot = useCallback((dir: 'prev' | 'next') => {
    if (!allForecasts || allForecasts.length <= 1) return;
    const newIdx = dir === 'next'
      ? (currentSpotIdx + 1) % allForecasts.length
      : (currentSpotIdx - 1 + allForecasts.length) % allForecasts.length;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setCurrentSpotIdx(newIdx);
    setForecast(allForecasts[newIdx]);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [allForecasts, currentSpotIdx]);

  const chartWidth = Math.max(W - 24, slice.length * 38);
  const chartH = 180;

  const combinedData = useMemo(() => buildCombinedChart(slice, colors.accent, colors.orange), [slice, colors.accent, colors.orange]);
  const tideData = useMemo(() => buildTideChart(slice, colors.blue), [slice, colors.blue]);

  const summary = useMemo(() => buildDaySummary(slice, spot, spotTodayStr, locale), [slice, spot, spotTodayStr, locale]);

  const currentIdx = useMemo(() => {
    return Math.max(0, slice.findIndex(c => c.time.slice(0, 13) >= nowKey));
  }, [slice, nowKey]);

  const nowFractionalIdx = useMemo(() => {
    const minutes = new Date().getMinutes();
    return currentIdx + minutes / 60;
  }, [currentIdx]);

  const tideTrend = useMemo(() => getTideTrend(slice, currentIdx, t), [slice, currentIdx, t]);

  const nowX = useMemo(() => getNowLineX(nowFractionalIdx, slice.length, chartWidth), [nowFractionalIdx, slice.length, chartWidth]);

  const sunTimes = useMemo(() => getSunTimes(dailyData, spotTodayStr), [dailyData, spotTodayStr]);

  const spotBests = useMemo(() => {
    const todayStr = spotTodayStr;
    const nowStr = nowKey;
    const valid = forecast.hourlyConditions.filter(c =>
      c.time.slice(0, 13) >= nowStr && isDaytime(c.time, profile.availableFrom, profile.availableTo)
    );
    let bestTodayC: HourlyCondition | null = null;
    let bestNextC: HourlyCondition | null = null;
    for (const c of valid) {
      if (c.time.slice(0, 10) === todayStr) {
        if (!bestTodayC || c.score > bestTodayC.score) bestTodayC = c;
      } else {
        if (!bestNextC || c.score > bestNextC.score) bestNextC = c;
      }
    }
    return {
      today: bestTodayC ? { cond: bestTodayC, timeRange: fmtRange(bestTodayC.time, profile.sessionDuration, profile.availableTo) } : null,
      next: bestNextC ? { cond: bestNextC, dayLabel: fmtDayLabelShort(bestNextC.time, t, locale), timeRange: fmtRange(bestNextC.time, profile.sessionDuration, profile.availableTo) } : null,
    };
  }, [forecast.hourlyConditions, profile, t, locale, nowKey, spotTodayStr]);


  const chartCfg = useMemo(() => ({
    backgroundGradientFrom: colors.card,
    backgroundGradientTo: colors.card,
    decimalPlaces: 1,
    color: (o = 1) => `rgba(0,212,170,${o})`,
    labelColor: () => colors.white70,
    propsForDots: { r: '2.5', strokeWidth: '0', fill: colors.accent },
    propsForLabels: { fontSize: 11, fontWeight: '600' },
    fillShadowGradientFrom: colors.accent,
    fillShadowGradientTo: 'transparent',
    fillShadowGradientFromOpacity: 0.35,
    fillShadowGradientToOpacity: 0,
  }), [colors]);

  const tideChartCfg = useMemo(() => ({
    ...chartCfg,
    color: (o = 1) => `rgba(74,144,255,${o})`,
    propsForDots: { r: '2.5', strokeWidth: '0', fill: colors.blue },
    fillShadowGradientFrom: colors.blue,
    fillShadowGradientTo: 'transparent',
    fillShadowGradientFromOpacity: 0.30,
    fillShadowGradientToOpacity: 0,
  }), [chartCfg, colors.blue]);

  const offshoreDir = (spot.beachOrientation + 180) % 360;

  const renderRow = useCallback((c: HourlyCondition) => {
    const wl = windLabel(c.windSpeed, c.windDirection, spot.beachOrientation);
    const isGust = c.windGusts > 25;
    return (
      <View key={c.time} style={[s.row, { backgroundColor: rowBg(c.score) }]} accessibilityLabel={`${fmtH(c.time)} · ${t.a11yScore(c.score.toFixed(1))} · ${t.spotsSwell} ${c.swellHeight.toFixed(1)}m · ${wl} ${c.windSpeed.toFixed(0)} km/h`}>
        <Text style={[s.rTime, { color: colors.white70 }]}>{fmtH(c.time)}</Text>
        <MaterialCommunityIcons name={weatherMCIcon(c.weatherCode)} size={14} color={colors.white70} style={s.rWeather} />
        <View style={[s.rBadge, { backgroundColor: scoreBg(c.score) }]}>
          <Text style={[s.rScore, { color: scoreColor(c.score) }]}>{c.score.toFixed(1)}</Text>
        </View>
        <Text style={[s.rMain, { color: colors.white }]}>
          {c.swellHeight.toFixed(1)}m · {c.swellPeriod.toFixed(0)}s · {dirLabel(c.swellDirection)}
        </Text>
        <View style={s.rWindCol}>
          <Text style={[s.rWind, { color: colors.white40 }, isGust && { color: colors.orange }]}>{wl} {c.windSpeed.toFixed(0)}</Text>
          {isGust && <Text style={[s.rGust, { color: colors.orange }]}><MaterialCommunityIcons name={ICONS.gust} size={9} color={colors.orange} />{c.windGusts.toFixed(0)}</Text>}
        </View>
      </View>
    );
  }, [spot.beachOrientation, colors, t]);


  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
    {/* Sticky header */}
    <Animated.View style={[s.stickyHeader, { paddingTop: insets.top + 4, backgroundColor: colors.bg, opacity: stickyOpacity, borderBottomColor: colors.white15 }]} pointerEvents={showStickyHeader ? 'auto' : 'none'}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={s.stickyBack} accessibilityLabel={t.back} accessibilityRole="button">
        <Text style={[s.backTxt, { color: colors.white }]}>‹</Text>
      </TouchableOpacity>
      <Text style={[s.stickyName, { color: colors.white }]} numberOfLines={1}>{spot.name}</Text>
      <ScoreBadge score={forecast.currentScore} size="sm" />
    </Animated.View>
    <ScrollView ref={scrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false} scrollEventThrottle={16} onScroll={onScroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[s.back, { backgroundColor: colors.cardLight }]} accessibilityLabel={t.back} accessibilityRole="button">
          <Text style={[s.backTxt, { color: colors.white }]}>‹</Text>
        </TouchableOpacity>
        <View style={s.hCenter}>
          <Text style={[s.hName, { color: colors.white }]} numberOfLines={1}>{spot.name}</Text>
          <Text style={[s.hRegion, { color: colors.accent }]}>
            {spot.region} · {spot.country}
            {spotDistance != null ? (
              <Text>{'  '}<MaterialCommunityIcons name={ICONS.location} size={11} color={colors.accent} /> {formatDistance(spotDistance)}</Text>
            ) : ''}
          </Text>
          <View style={s.hMetaRow}>
            {currentCondition && (
              <Text style={[s.hTemp, { color: colors.white40 }]}>
                <MaterialCommunityIcons name={weatherMCIcon(currentCondition.weatherCode)} size={12} color={colors.white40} /> {currentCondition.temperature.toFixed(0)}° · {currentCondition.seaTemp.toFixed(0)}° {t.spotsSeaTemp}
              </Text>
            )}
            {sunTimes && (
              <Text style={[s.hTemp, { color: colors.white40 }]}>
                <MaterialCommunityIcons name={ICONS.sunrise} size={12} color={colors.white40} /> {sunTimes.sunrise} · <MaterialCommunityIcons name={ICONS.sunset} size={12} color={colors.white40} /> {sunTimes.sunset}
              </Text>
            )}
          </View>
        </View>
        <View style={s.hRight}>
          <View style={s.hRightBtns}>
            <TouchableOpacity
              onPress={handleShare}
              style={[s.favBtn, { backgroundColor: colors.white08 }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
              accessibilityLabel={t.detailShare}
              accessibilityRole="button"
            >
              <Ionicons name="share-outline" size={19} color={colors.white40} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleToggleFav}
              style={[s.favBtn, { backgroundColor: isFav ? colors.yellowDim : colors.white08 }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
              accessibilityLabel={isFav ? t.spotsRemovedFav : t.spotsAddedFav}
              accessibilityRole="button"
            >
              <Ionicons name={isFav ? 'star' : 'star-outline'} size={20} color={isFav ? colors.yellow : colors.white40} />
            </TouchableOpacity>
          </View>
          <ScoreBadge score={forecast.currentScore} size="lg" animated />
        </View>
      </View>

      {/* Swipe navigation */}
      {allForecasts && allForecasts.length > 1 && (
        <View style={s.swipeNav}>
          <TouchableOpacity onPress={() => navigateToSpot('prev')} style={[s.swipeBtn, { backgroundColor: colors.cardLight }]} accessibilityLabel={t.detailPrev} accessibilityRole="button">
            <Text style={[s.swipeTxt, { color: colors.white70 }]}>{t.detailPrev}</Text>
          </TouchableOpacity>
          <Text style={[s.swipeCounter, { color: colors.white40 }]}>{currentSpotIdx + 1}/{allForecasts.length}</Text>
          <TouchableOpacity onPress={() => navigateToSpot('next')} style={[s.swipeBtn, { backgroundColor: colors.cardLight }]} accessibilityLabel={t.detailNext} accessibilityRole="button">
            <Text style={[s.swipeTxt, { color: colors.white70 }]}>{t.detailNext}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Best moments */}
      {spotBests.today && (
        <View style={[s.bestCard, { backgroundColor: scoreBg(spotBests.today.cond.score), borderColor: scoreColor(spotBests.today.cond.score) }]}>
          <View style={s.bestCardLeft}>
            <Text style={[s.bestCardLabel, { color: colors.white40 }]}>{t.detailBestToday}</Text>
            <Text style={[s.bestCardTime, { color: scoreColor(spotBests.today.cond.score) }]}>
              <MaterialCommunityIcons name={scoreIcon(spotBests.today.cond.score)} size={16} color={scoreColor(spotBests.today.cond.score)} />  {spotBests.today.timeRange}
            </Text>
            <Text style={[s.bestCardDesc, { color: colors.white70 }]}>{scoreLabel(spotBests.today.cond.score, t)}</Text>
          </View>
          <ScoreBadge score={spotBests.today.cond.score} size="lg" animated />
        </View>
      )}
      {spotBests.next && (
        <View style={[s.bestCard, { backgroundColor: colors.card, borderColor: colors.white15 }]}>
          <View style={s.bestCardLeft}>
            <Text style={[s.bestCardLabel, { color: colors.white40 }]}>{t.detailBestNext}</Text>
            <Text style={[s.bestCardTime, { color: colors.white }]}>
              <MaterialCommunityIcons name={scoreIcon(spotBests.next.cond.score)} size={16} color={scoreColor(spotBests.next.cond.score)} />  {spotBests.next.dayLabel} · {spotBests.next.timeRange}
            </Text>
            <Text style={[s.bestCardDesc, { color: colors.white70 }]}>{scoreLabel(spotBests.next.cond.score, t)}</Text>
          </View>
          <ScoreBadge score={spotBests.next.cond.score} size="md" />
        </View>
      )}

      {/* Day summary */}
      <FadeInView delay={100}>
        <View style={[s.summaryBox, { backgroundColor: colors.card, borderColor: colors.white15 }]}>
          <Text style={[s.summaryTitle, { color: colors.white }]}>{t.detailDaySummary}</Text>
          <Text style={[s.summaryTxt, { color: colors.white70 }]}>{summary}</Text>
        </View>
      </FadeInView>

      {/* Conditions actuelles (temps réel) — la direction de houle est ce que les
          surfeurs regardent en premier, on l'affiche donc explicitement ici. */}
      {currentCondition && (
        <FadeInView delay={120}>
          <View style={[s.tideRow, { backgroundColor: colors.card }]}>
            <View style={s.tideItem}>
              <MaterialCommunityIcons name={ICONS.swell} size={16} color={colors.white70} style={s.tideIcon} />
              <Text style={[s.tideLabel, { color: colors.white40 }]}>{t.spotsSwell}</Text>
              <Text style={[s.tideVal, { color: colors.white }]}>{currentCondition.swellHeight.toFixed(1)} m</Text>
            </View>
            <View style={[s.tideSep, { backgroundColor: colors.white15 }]} />
            <View style={s.tideItem}>
              <MaterialCommunityIcons name={ICONS.period} size={16} color={colors.white70} style={s.tideIcon} />
              <Text style={[s.tideLabel, { color: colors.white40 }]}>{t.spotsPeriod}</Text>
              <Text style={[s.tideVal, { color: colors.white }]}>{currentCondition.swellPeriod.toFixed(0)} s</Text>
            </View>
            <View style={[s.tideSep, { backgroundColor: colors.white15 }]} />
            <View style={s.tideItem}>
              <MaterialCommunityIcons
                name={ICONS.swellArrow}
                size={16}
                color={colors.accent}
                style={[s.tideIcon, { transform: [{ rotate: `${(currentCondition.swellDirection + 180) % 360}deg` }] }]}
              />
              <Text style={[s.tideLabel, { color: colors.white40 }]}>{t.detailSwellDir}</Text>
              <Text style={[s.tideVal, { color: colors.white }]}>{dirLabel(currentCondition.swellDirection)} · {currentCondition.swellDirection.toFixed(0)}°</Text>
            </View>
          </View>
        </FadeInView>
      )}

      {/* Score breakdown (P1 — Why this score) */}
      {currentCondition?.factors && (
        <FadeInView delay={150}>
          <ScoreBreakdown factors={currentCondition.factors} finalScore={forecast.currentScore} />
        </FadeInView>
      )}

      {/* Tide + trend */}
      {currentCondition && (
        <FadeInView delay={200}>
          <View style={[s.tideRow, { backgroundColor: colors.card }]}>
            <View style={s.tideItem}>
              <MaterialCommunityIcons name={ICONS.seaLevel} size={16} color={colors.white70} style={s.tideIcon} />
              <Text style={[s.tideLabel, { color: colors.white40 }]}>{t.detailSeaLevel}</Text>
              <Text style={[s.tideVal, { color: colors.white }]}>{currentCondition.seaLevel >= 0 ? '+' : ''}{currentCondition.seaLevel.toFixed(2)} m</Text>
            </View>
            <View style={[s.tideSep, { backgroundColor: colors.white15 }]} />
            <View style={s.tideItem}>
              <MaterialCommunityIcons
                name={tideTrend.arrow === '↑' ? 'arrow-up-bold' : tideTrend.arrow === '↓' ? 'arrow-down-bold' : 'arrow-right-bold'}
                size={16}
                color={tideTrend.arrow === '↑' ? colors.accent : tideTrend.arrow === '↓' ? colors.orange : colors.white70}
                style={s.tideIcon}
              />
              <Text style={[s.tideLabel, { color: colors.white40 }]}>{t.detailTide}</Text>
              <Text style={[s.tideVal, { color: tideTrend.arrow === '↑' ? colors.accent : tideTrend.arrow === '↓' ? colors.orange : colors.white }]}>{tideTrend.label}</Text>
            </View>
            <View style={[s.tideSep, { backgroundColor: colors.white15 }]} />
            <View style={s.tideItem}>
              <MaterialCommunityIcons name={ICONS.anchor} size={16} color={colors.white70} style={s.tideIcon} />
              <Text style={[s.tideLabel, { color: colors.white40 }]}>{t.detailOptimalTide}</Text>
              <Text style={[s.tideVal, { color: colors.white }]}>{getTideLabel(spot.optimalTide, t)}</Text>
            </View>
          </View>
        </FadeInView>
      )}

      {/* Webcam */}
      {spot.webcamUrl && (
        <TouchableOpacity
          style={[s.webcamBtn, { backgroundColor: colors.blueDim, borderColor: colors.blue }]}
          onPress={() => Linking.openURL(spot.webcamUrl!).catch(() => showToast(t.detailRefreshError, 'error'))}
          activeOpacity={0.7}
          accessibilityLabel={t.detailWebcam}
          accessibilityRole="link"
        >
        <MaterialCommunityIcons name={ICONS.webcam} size={24} color={colors.blue} style={s.webcamIcon} />
        <View style={{ flex: 1 }}>
          <Text style={[s.webcamTxt, { color: colors.blue }]}>{t.detailWebcam}</Text>
            <Text style={[s.webcamSub, { color: colors.white40 }]}>{t.detailWebcamSub}</Text>
          </View>
          <View style={[s.webcamGo, { backgroundColor: colors.blue }]}>
            <Text style={s.webcamGoTxt}>{t.detailWebcamOpen}</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Voir sur la carte */}
      <TouchableOpacity
        style={[s.webcamBtn, { backgroundColor: colors.accentDim, borderColor: colors.accent }]}
        onPress={() => navigation.navigate('MainTabs', { screen: 'MapTab', params: { focusSpotId: spot.id } })}
        activeOpacity={0.7}
        accessibilityLabel={t.detailMap}
        accessibilityRole="button"
      >
        <MaterialCommunityIcons name={ICONS.map} size={24} color={colors.accent} style={s.webcamIcon} />
        <View style={{ flex: 1 }}>
          <Text style={[s.webcamTxt, { color: colors.accent }]}>{t.detailMap}</Text>
          <Text style={[s.webcamSub, { color: colors.white40 }]}>{t.detailMapSub}</Text>
        </View>
          <View style={[s.webcamGo, { backgroundColor: colors.accent }]}>
            <Text style={s.webcamGoTxt}>{t.detailMapBtn}</Text>
        </View>
      </TouchableOpacity>

      {/* Deferred heavy content */}
      {!ready ? (
        <View style={s.deferredLoading}>
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
      ) : (
        <>
          {/* Combined chart: Houle vs Vent */}
          <FadeInView delay={50}>
            <View style={s.sec}>
              <Text style={[s.secT, { color: colors.white }]}>{t.detailSwellWind}</Text>
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
                    <Text style={[s.legendTxt, { color: colors.white40 }]}>{t.detailSwellM}</Text>
                  </View>
                  <View style={s.legendItem}>
                    <View style={[s.legendDot, { backgroundColor: colors.orange }]} />
                    <Text style={[s.legendTxt, { color: colors.white40 }]}>{t.detailWindDiv}</Text>
                  </View>
                  <View style={s.legendItem}>
                    <View style={[s.legendDot, { backgroundColor: colors.white40, width: 1.5, height: 14, borderRadius: 0 }]} />
                    <Text style={[s.legendTxt, { color: colors.white40 }]}>{t.detailNow}</Text>
                  </View>
                </View>
              </View>
            </View>
          </FadeInView>

          {/* Tide chart */}
          <FadeInView delay={150}>
            <View style={s.sec}>
              <Text style={[s.secT, { color: colors.white }]}>{t.detailTideChart}</Text>
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
                      yAxisSuffix=" m"
                    />
                    {nowX != null && <NowLine x={nowX} height={chartH} color={colors.white} />}
                  </View>
                </ScrollView>
              </View>
            </View>
          </FadeInView>

          {/* Hourly rows */}
          <FadeInView delay={250}>
            <HourlySection slice={slice} renderRow={renderRow} colors={colors} t={t} />
          </FadeInView>

          {/* Spot info */}
          <FadeInView delay={350}>
            <View style={s.sec}>
              <Text style={[s.secT, { color: colors.white }]}>{t.detailSpotInfo}</Text>
              <View style={[s.info, { backgroundColor: colors.card }]}>
                <Text style={[s.desc, { color: colors.white70 }]}>{spotDescription(spot, locale)}</Text>

                <Text style={[s.infoGroupTitle, { color: colors.accent }]}>{t.detailIdealCond}</Text>
                <View style={s.idealGrid}>
                  <IdealCard
                    icon={ICONS.swellDir} title={t.detailSwellDir}
                    value={`${dirLabel(spot.optimalSwellDirMin)} → ${dirLabel(spot.optimalSwellDirMax)}`}
                    sub={`${spot.optimalSwellDirMin}° – ${spot.optimalSwellDirMax}°`}
                    colors={colors}
                  />
                  <IdealCard
                    icon={ICONS.swell} title={t.detailSwellHeight}
                    value={`${spot.optimalSwellHeightMin} – ${spot.optimalSwellHeightMax}m`}
                    colors={colors}
                  />
                  <IdealCard
                    icon={ICONS.wind} title={t.detailIdealWind}
                    value={t.detailOffshore}
                    sub={t.detailWindDir(dirLabel(offshoreDir), offshoreDir)}
                    colors={colors}
                  />
                  <IdealCard
                    icon={ICONS.anchor} title={t.detailTideLabel}
                    value={getTideLabel(spot.optimalTide, t)}
                    colors={colors}
                  />
                  <IdealCard
                    icon={ICONS.bottom} title={t.detailBottom}
                    value={getBreakLabel(spot.bottomType, t)}
                    colors={colors}
                  />
                  <IdealCard
                    icon={ICONS.target} title={t.detailLevel}
                    value={getLevelLabel(spot.recommendedLevel, t)}
                    colors={colors}
                  />
                </View>

                {spot.dangers.length > 0 && (
                  <>
                    <Text style={[s.infoGroupTitle, { color: colors.red, marginTop: 16 }]}>{t.detailDangers}</Text>
                    <View style={[s.dangerBox, { backgroundColor: colors.redDim }]}>
                      {spotDangers(spot, locale).map((d: string, i: number) => (
                        <Text key={i} style={[s.dangerTxt, { color: colors.red }]}><MaterialCommunityIcons name={ICONS.danger} size={13} color={colors.red} />  {d}</Text>
                      ))}
                    </View>
                  </>
                )}
              </View>
            </View>
          </FadeInView>
        </>
      )}

      <View style={{ height: 100 }} />
    </ScrollView>
    </View>
  );
}

const INITIAL_ROWS = 8;

function HourlySection({ slice, renderRow, colors, t }: { slice: HourlyCondition[]; renderRow: (c: HourlyCondition, i: number) => React.ReactNode; colors: import('../context/ThemeContext').ThemePalette; t: any }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? slice : slice.slice(0, INITIAL_ROWS);
  const hasMore = slice.length > INITIAL_ROWS;

  return (
    <View style={s.sec}>
      <Text style={[s.secT, { color: colors.white }]}>{t.detailHourly}</Text>
      {visible.map(renderRow)}
      {hasMore && !expanded && (
        <TouchableOpacity
          style={[s.showMore, { backgroundColor: colors.accentDim }]}
          onPress={() => setExpanded(true)}
          activeOpacity={0.7}
          accessibilityLabel={t.detailShowMore(slice.length - INITIAL_ROWS)}
          accessibilityRole="button"
        >
          <Text style={[s.showMoreTxt, { color: colors.accent }]}>
            {t.detailShowMore(slice.length - INITIAL_ROWS)}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function IdealCard({ icon, title, value, sub, colors }: { icon: MCIName; title: string; value: string; sub?: string; colors: import('../context/ThemeContext').ThemePalette }) {
  return (
    <View style={[s.idealCard, { backgroundColor: colors.white08 }]} accessibilityLabel={`${title}: ${value}${sub ? `, ${sub}` : ''}`}>
      <MaterialCommunityIcons name={icon} size={18} color={colors.accent} style={s.idealIcon} />

      <Text style={[s.idealTitle, { color: colors.white40 }]}>{title}</Text>
      <Text style={[s.idealValue, { color: colors.white }]}>{value}</Text>
      {sub && <Text style={[s.idealSub, { color: colors.white40 }]}>{sub}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  stickyHeader: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 1 },
  stickyBack: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  stickyName: { flex: 1, fontSize: 16, fontWeight: '800' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 8, paddingHorizontal: 16, paddingBottom: 12 },
  back: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  backTxt: { fontSize: 24, fontWeight: '300', marginTop: -2 },
  hCenter: { flex: 1, marginHorizontal: 12 },
  hRight: { alignItems: 'center', gap: 8 },
  hRightBtns: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  favBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  hName: { fontSize: 21, fontWeight: '800' },
  hRegion: { fontSize: 12, fontWeight: '600', marginTop: 1 },
  hMetaRow: { gap: 2, marginTop: 3 },
  hTemp: { fontSize: 12 },

  swipeNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 10 },
  swipeBtn: { borderRadius: 10, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' },
  swipeTxt: { fontSize: 13, fontWeight: '600' },
  swipeCounter: { fontSize: 12, fontWeight: '600' },

  bestCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 8, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1 },
  bestCardLeft: { flex: 1, marginRight: 12 },
  bestCardLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  bestCardTime: { fontSize: 17, fontWeight: '800' },
  bestCardDesc: { fontSize: 12, marginTop: 3 },
  deferredLoading: { paddingVertical: 60, alignItems: 'center' },

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
  rWeather: { fontSize: 12, width: 22 },
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
  idealCard: { flexBasis: '46%', flexGrow: 1, borderRadius: 12, padding: 12 },
  idealIcon: { fontSize: 18, marginBottom: 6 },
  idealTitle: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  idealValue: { fontSize: 14, fontWeight: '800', marginTop: 4 },
  idealSub: { fontSize: 11, marginTop: 2 },
  dangerBox: { borderRadius: 12, padding: 14 },
  dangerTxt: { fontSize: 13, marginBottom: 4, fontWeight: '500' },
  showMore: { marginTop: 8, borderRadius: 10, paddingVertical: 12, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  showMoreTxt: { fontSize: 13, fontWeight: '700' },
});
