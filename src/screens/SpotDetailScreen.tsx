import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions, TouchableOpacity, Linking, RefreshControl, Animated, NativeSyntheticEvent, NativeScrollEvent, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LineChart } from 'react-native-chart-kit';
import ScoreBadge from '../components/ScoreBadge';
import ScoreBreakdown from '../components/ScoreBreakdown';
import RateSpotModal from '../components/RateSpotModal';
import AlertSpotModal from '../components/AlertSpotModal';
import { buildRatingPayload, submitRating, hasRatedToday } from '../services/ratings';
import { getSpotAlert, setSpotAlert, removeSpotAlert } from '../services/alerts';
import { requestReviewOnPositiveMoment } from '../services/review';
import { requestNotifPermission, rescheduleSpotAlert } from '../services/notifications';
import { useTheme } from '../context/ThemeContext';
import { useProfile } from '../context/ProfileContext';
import { useLocation } from '../context/LocationContext';
import { fetchSpotData, fetchDailyData, DailyData } from '../services/api';
import { computeSpotForecast, spotLocalNowKey, isNightAtSpot } from '../utils/scoring';
import { haversineDistance, formatDistance } from '../services/location';
import { getFavorites, toggleFavorite } from '../services/favorites';
import { useToast } from '../components/Toast';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SpotForecast, HourlyCondition } from '../types';
import SPOTS from '../data/spots';
import { scoreColor, scoreInk, scoreBg, scoreLabel, dirLabel, windLabel, windConditionKey, isDaytime } from '../theme';
import { wetsuitRecommendation, uvRiskKey } from '../utils/comfort';
import { findTideExtrema, getNextTideExtrema, formatTideTime } from '../utils/tides';
import { scoreIcon, weatherMCIcon, ICONS, MCIName } from '../utils/icons';
import { SpotDetailScreenProps } from '../navigation/types';
import { getLevelLabel, getBreakLabel, getTideLabel, fmtDayLabelShort, fmtRange, fmtH } from '../utils/constants';
import { spotDescription, spotDangers } from '../utils/spotI18n';
import { elevationIOS, typography } from '../utils/tokens';
import { Shimmer, useSharedShimmer } from '../components/SkeletonCard';
import { hapticLight, hapticSuccess } from '../utils/haptics';
import { log } from '../utils/logger';
import { useI18n, fmtDec } from '../i18n';
import { useWebLayout, webCenter, WEB_DETAIL_MAX, WEB_CHART_MAX, isWebPlatform } from '../utils/webLayout';
// On desktop web the raw window width can be huge; cap the base used for chart
// sizing so charts stay readable inside the centered detail column.
const W = isWebPlatform
  ? Math.min(Dimensions.get('window').width, WEB_CHART_MAX)
  : Dimensions.get('window').width;

function getDaySlice(conditions: HourlyCondition[], nowKey: string, from = 7, to = 20): HourlyCondition[] {
  let nowIdx = 0;
  for (let i = 0; i < conditions.length; i++) {
    if (conditions[i].time.slice(0, 13) >= nowKey) { nowIdx = i; break; }
  }
  const pastHours = 1;
  const start = Math.max(0, nowIdx - pastHours);
  return conditions.slice(start, start + 49).filter(c => isDaytime(c.time, from, to));
}

// Charts run on a CONTINUOUS window, night included. The daytime-only slice
// used to glue 20:00 to 07:00: the night high and low tide vanished and the
// tide curve contradicted the tide times listed right under it.
const CHART_HOURS = 36;
function getChartSlice(conditions: HourlyCondition[], nowKey: string): HourlyCondition[] {
  const nowIdx = Math.max(0, conditions.findIndex(c => c.time.slice(0, 13) >= nowKey));
  const start = Math.max(0, nowIdx - 1);
  return conditions.slice(start, start + CHART_HOURS);
}

// Same night definition as isNightAtSpot (scoring.ts).
const isNightHour = (iso: string): boolean => {
  const h = parseInt(iso.slice(11, 13), 10);
  return h < 6 || h >= 21;
};

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


// `best` is the very slot shown in the "best today" card, so the summary can't
// name another hour than the card right above it.
function buildDaySummary(
  slice: HourlyCondition[], spot: any, todayStr: string, locale: string = 'fr',
  best?: { range: string; score: number } | null,
): string {
  const todaySlice = slice.filter(c => c.time.slice(0, 10) === todayStr);
  const data = todaySlice.length > 0 ? todaySlice : slice;
  if (data.length === 0) {
    return locale === 'fr' ? 'Pas de données disponibles.'
      : locale === 'es' ? 'No hay datos disponibles.'
      : locale === 'pt' ? 'Sem dados disponíveis.'
      : locale === 'de' ? 'Keine Daten verfügbar.'
      : locale === 'it' ? 'Nessun dato disponibile.'
      : locale === 'ja' ? 'データがありません。'
      : 'No data available.';
  }

  const avgScore = data.reduce((s, c) => s + c.score, 0) / data.length;
  const maxScore = Math.max(...data.map(c => c.score));
  const avgSwell = data.reduce((s, c) => s + c.swellHeight, 0) / data.length;
  const maxSwell = Math.max(...data.map(c => c.swellHeight));
  const avgWind = data.reduce((s, c) => s + c.windSpeed, 0) / data.length;
  const maxGusts = Math.max(...data.map(c => c.windGusts));
  const avgPeriod = data.reduce((s, c) => s + c.swellPeriod, 0) / data.length;
  const bestHour = data.reduce((b, c) => c.score > b.score ? c : b, data[0]);
  const bestTime = best ? best.range : fmtH(bestHour.time);
  const bestScore = best ? best.score : maxScore;

  const parts: string[] = [];
  const sw = fmtDec(avgSwell);
  const mx = fmtDec(maxSwell);
  const per = avgPeriod.toFixed(0);
  const wnd = avgWind.toFixed(0);
  const gst = maxGusts.toFixed(0);
  const ms = fmtDec(bestScore);
  const wll = windLabel(avgWind, bestHour.windDirection, spot.beachOrientation).toLowerCase();
  // Same surface rule as the "Surface" tile: an offshore breeze grooms the
  // waves, only onshore / strong cross wind makes them choppy.
  const choppy = windConditionKey(avgWind, bestHour.windDirection, spot.beachOrientation) === 'choppy';

  if (locale === 'es') {
    if (avgSwell < 0.3) parts.push('Día muy tranquilo, casi plano.');
    else if (avgSwell < 0.8) parts.push(`Olas pequeñas (${sw}m).`);
    else if (avgSwell < 1.5) parts.push(`Oleaje de ${sw}m, series hasta ${mx}m.`);
    else if (avgSwell < 2.5) parts.push(`Buen oleaje (${sw}m, máx ${mx}m).`);
    else parts.push(`Oleaje grande ${sw}m (máx ${mx}m), cuidado.`);

    if (avgPeriod >= 12) parts.push(`Periodo largo (${per}s), olas bien formadas.`);
    else if (avgPeriod >= 8) parts.push(`Periodo ${per}s.`);
    else parts.push(`Periodo corto (${per}s), olas desorganizadas.`);

    if (avgWind < 8) parts.push('Viento muy flojo, condiciones glassy.');
    else if (avgWind < 15) parts.push(`Viento moderado ${wll} (${wnd} km/h).`);
    else if (choppy) parts.push(`Viento fuerte ${wll} (${wnd} km/h), superficie picada.`);
    else parts.push(`Viento sostenido ${wll} (${wnd} km/h), superficie limpia.`);

    if (maxGusts > 30) parts.push(`Rachas de hasta ${gst} km/h.`);
    if (bestScore >= 7) parts.push(`Mejor franja: ${bestTime} (${ms}/10).`);
    else if (bestScore >= 5) parts.push(`Franja más favorable: ${bestTime} (${ms}/10).`);
    else parts.push(`Puntuación máx ${ms}/10 (${bestTime}), día difícil.`);
    if (avgScore < 3) parts.push('No merece la pena desplazarse.');
  } else if (locale === 'pt') {
    if (avgSwell < 0.3) parts.push('Dia muito calmo, quase flat.');
    else if (avgSwell < 0.8) parts.push(`Ondas pequenas (${sw}m).`);
    else if (avgSwell < 1.5) parts.push(`Ondulação de ${sw}m, séries até ${mx}m.`);
    else if (avgSwell < 2.5) parts.push(`Boa ondulação (${sw}m, máx ${mx}m).`);
    else parts.push(`Ondulação grande ${sw}m (máx ${mx}m), atenção.`);

    if (avgPeriod >= 12) parts.push(`Período longo (${per}s), ondas bem formadas.`);
    else if (avgPeriod >= 8) parts.push(`Período ${per}s.`);
    else parts.push(`Período curto (${per}s), ondas desorganizadas.`);

    if (avgWind < 8) parts.push('Vento muito fraco, condições glassy.');
    else if (avgWind < 15) parts.push(`Vento moderado ${wll} (${wnd} km/h).`);
    else if (choppy) parts.push(`Vento forte ${wll} (${wnd} km/h), superfície picada.`);
    else parts.push(`Vento sustentado ${wll} (${wnd} km/h), superfície limpa.`);

    if (maxGusts > 30) parts.push(`Rajadas até ${gst} km/h.`);
    if (bestScore >= 7) parts.push(`Melhor janela: ${bestTime} (${ms}/10).`);
    else if (bestScore >= 5) parts.push(`Janela mais favorável: ${bestTime} (${ms}/10).`);
    else parts.push(`Pontuação máx ${ms}/10 (${bestTime}), dia difícil.`);
    if (avgScore < 3) parts.push('Não vale a pena deslocar-se.');
  } else if (locale === 'fr') {
    if (avgSwell < 0.3) parts.push('Journée très calme, quasiment flat.');
    else if (avgSwell < 0.8) parts.push(`Petites vagues (${sw}m).`);
    else if (avgSwell < 1.5) parts.push(`Houle de ${sw}m, séries jusqu'à ${mx}m.`);
    else if (avgSwell < 2.5) parts.push(`Belle houle (${sw}m, max ${mx}m).`);
    else parts.push(`Grosse houle ${sw}m (max ${mx}m), attention.`);

    if (avgPeriod >= 12) parts.push(`Période longue (${per}s), vagues bien formées.`);
    else if (avgPeriod >= 8) parts.push(`Période ${per}s.`);
    else parts.push(`Période courte (${per}s), vagues désorganisées.`);

    if (avgWind < 8) parts.push('Vent très faible, conditions glassy.');
    else if (avgWind < 15) parts.push(`Vent modéré ${wll} (${wnd} km/h).`);
    else if (choppy) parts.push(`Vent fort ${wll} (${wnd} km/h), surface hachée.`);
    else parts.push(`Vent soutenu ${wll} (${wnd} km/h), surface propre.`);

    if (maxGusts > 30) parts.push(`Rafales jusqu'à ${gst} km/h.`);
    if (bestScore >= 7) parts.push(`Meilleur créneau : ${bestTime} (${ms}/10).`);
    else if (bestScore >= 5) parts.push(`Créneau le plus favorable : ${bestTime} (${ms}/10).`);
    else parts.push(`Score max ${ms}/10 (${bestTime}), journée difficile.`);
    if (avgScore < 3) parts.push('Pas la peine de se déplacer.');
  } else if (locale === 'de') {
    if (avgSwell < 0.3) parts.push('Sehr ruhiger Tag, fast flat.');
    else if (avgSwell < 0.8) parts.push(`Kleine Wellen (${sw}m).`);
    else if (avgSwell < 1.5) parts.push(`Swell von ${sw}m, Sets bis ${mx}m.`);
    else if (avgSwell < 2.5) parts.push(`Schöner Swell (${sw}m, max ${mx}m).`);
    else parts.push(`Großer Swell ${sw}m (max ${mx}m), Vorsicht.`);

    if (avgPeriod >= 12) parts.push(`Lange Periode (${per}s), gut geformte Wellen.`);
    else if (avgPeriod >= 8) parts.push(`Periode ${per}s.`);
    else parts.push(`Kurze Periode (${per}s), unorganisierte Wellen.`);

    if (avgWind < 8) parts.push('Sehr schwacher Wind, glassy Bedingungen.');
    else if (avgWind < 15) parts.push(`Mäßiger Wind ${wll} (${wnd} km/h).`);
    else if (choppy) parts.push(`Starker Wind ${wll} (${wnd} km/h), kabbelige Oberfläche.`);
    else parts.push(`Kräftiger Wind ${wll} (${wnd} km/h), saubere Oberfläche.`);

    if (maxGusts > 30) parts.push(`Böen bis ${gst} km/h.`);
    if (bestScore >= 7) parts.push(`Bestes Fenster: ${bestTime} (${ms}/10).`);
    else if (bestScore >= 5) parts.push(`Günstigstes Fenster: ${bestTime} (${ms}/10).`);
    else parts.push(`Max. Bewertung ${ms}/10 (${bestTime}), schwieriger Tag.`);
    if (avgScore < 3) parts.push('Die Fahrt lohnt sich nicht.');
  } else if (locale === 'it') {
    if (avgSwell < 0.3) parts.push('Giornata molto calma, quasi flat.');
    else if (avgSwell < 0.8) parts.push(`Onde piccole (${sw}m).`);
    else if (avgSwell < 1.5) parts.push(`Swell di ${sw}m, set fino a ${mx}m.`);
    else if (avgSwell < 2.5) parts.push(`Bel swell (${sw}m, max ${mx}m).`);
    else parts.push(`Swell grosso ${sw}m (max ${mx}m), attenzione.`);

    if (avgPeriod >= 12) parts.push(`Periodo lungo (${per}s), onde ben formate.`);
    else if (avgPeriod >= 8) parts.push(`Periodo ${per}s.`);
    else parts.push(`Periodo corto (${per}s), onde disorganizzate.`);

    if (avgWind < 8) parts.push('Vento molto debole, condizioni glassy.');
    else if (avgWind < 15) parts.push(`Vento moderato ${wll} (${wnd} km/h).`);
    else if (choppy) parts.push(`Vento forte ${wll} (${wnd} km/h), superficie mossa.`);
    else parts.push(`Vento sostenuto ${wll} (${wnd} km/h), superficie pulita.`);

    if (maxGusts > 30) parts.push(`Raffiche fino a ${gst} km/h.`);
    if (bestScore >= 7) parts.push(`Migliore finestra: ${bestTime} (${ms}/10).`);
    else if (bestScore >= 5) parts.push(`Finestra più favorevole: ${bestTime} (${ms}/10).`);
    else parts.push(`Punteggio max ${ms}/10 (${bestTime}), giornata difficile.`);
    if (avgScore < 3) parts.push('Non vale la pena spostarsi.');
  } else if (locale === 'ja') {
    if (avgSwell < 0.3) parts.push('とても穏やかな日、ほぼフラット。');
    else if (avgSwell < 0.8) parts.push(`小さい波（${sw}m）。`);
    else if (avgSwell < 1.5) parts.push(`スウェル ${sw}m、セットは最大 ${mx}m。`);
    else if (avgSwell < 2.5) parts.push(`良いスウェル（${sw}m、最大 ${mx}m）。`);
    else parts.push(`大きいスウェル ${sw}m（最大 ${mx}m）、要注意。`);

    if (avgPeriod >= 12) parts.push(`周期が長い（${per}s）、よく整った波。`);
    else if (avgPeriod >= 8) parts.push(`周期 ${per}s。`);
    else parts.push(`周期が短い（${per}s）、まとまりのない波。`);

    if (avgWind < 8) parts.push('風が非常に弱く、グラッシーなコンディション。');
    else if (avgWind < 15) parts.push(`中程度の風 ${wll}（${wnd} km/h）。`);
    else if (choppy) parts.push(`強い風 ${wll}（${wnd} km/h）、海面はチョッピー。`);
    else parts.push(`やや強い風 ${wll}（${wnd} km/h）、海面はクリーン。`);

    if (maxGusts > 30) parts.push(`最大 ${gst} km/h の突風。`);
    if (bestScore >= 7) parts.push(`ベストタイミングは ${bestTime}（${ms}/10）。`);
    else if (bestScore >= 5) parts.push(`最も良いタイミングは ${bestTime}（${ms}/10）。`);
    else parts.push(`最高スコア ${ms}/10（${bestTime}）、厳しい一日。`);
    if (avgScore < 3) parts.push('わざわざ行く価値はありません。');
  } else {
    if (avgSwell < 0.3) parts.push('Very calm day, almost flat.');
    else if (avgSwell < 0.8) parts.push(`Small waves (${sw}m).`);
    else if (avgSwell < 1.5) parts.push(`Swell ${sw}m, sets up to ${mx}m.`);
    else if (avgSwell < 2.5) parts.push(`Nice swell (${sw}m, max ${mx}m).`);
    else parts.push(`Big swell ${sw}m (max ${mx}m), be careful.`);

    if (avgPeriod >= 12) parts.push(`Long period (${per}s), well-formed waves.`);
    else if (avgPeriod >= 8) parts.push(`Period ${per}s.`);
    else parts.push(`Short period (${per}s), disorganized waves.`);

    if (avgWind < 8) parts.push('Very light wind, glassy conditions.');
    else if (avgWind < 15) parts.push(`Moderate ${wll} wind (${wnd} km/h).`);
    else if (choppy) parts.push(`Strong ${wll} wind (${wnd} km/h), choppy surface.`);
    else parts.push(`Steady ${wll} wind (${wnd} km/h), clean surface.`);

    if (maxGusts > 30) parts.push(`Gusts up to ${gst} km/h.`);
    if (bestScore >= 7) parts.push(`Best slot: ${bestTime} (${ms}/10).`);
    else if (bestScore >= 5) parts.push(`Most favorable slot: ${bestTime} (${ms}/10).`);
    else parts.push(`Max score ${ms}/10 (${bestTime}), tough day.`);
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

// On the web the route lives in the URL. The forecast param is reduced to the
// spot id there ("/spot/<id>", see linking in AppNavigator), so after a reload
// or a shared link it comes back as a string: rebuild the forecast from the
// API instead of rendering "[object Object]" data.
export default function SpotDetailScreen(props: SpotDetailScreenProps) {
  const raw = props.route.params?.forecast as unknown;
  if (raw && typeof raw === 'object' && 'spot' in raw) return <SpotDetailContent {...props} />;
  return <SpotDetailLoader {...props} spotId={typeof raw === 'string' ? raw : ''} />;
}

function SpotDetailLoader({ navigation, spotId }: SpotDetailScreenProps & { spotId: string }) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const { profile } = useProfile();
  const insets = useSafeAreaInsets();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const spot = SPOTS.find(sp => sp.id === spotId);
    if (!spot) { setFailed(true); return; }
    let cancelled = false;
    fetchSpotData(spot.latitude, spot.longitude)
      .then(({ marine, weather }) => {
        if (!cancelled) navigation.setParams({ forecast: computeSpotForecast(spot, marine, weather, profile, locale) });
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotId]);

  return (
    <View style={[s.loaderWrap, { backgroundColor: colors.bg, paddingTop: insets.top + 60 }]}>
      {failed ? (
        <>
          <Text style={[s.loaderTxt, { color: colors.white }]}>{t.detailLoadFailed}</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('MainTabs', { screen: 'SpotsTab' })}
            style={[s.loaderBtn, { backgroundColor: colors.cardLight }]}
            accessibilityRole="button"
          >
            <Text style={[s.loaderBtnTxt, { color: colors.accent }]}>{t.back}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <ActivityIndicator size="large" color={colors.accent} />
      )}
    </View>
  );
}

function SpotDetailContent({ route, navigation }: SpotDetailScreenProps) {
  const initialForecast: SpotForecast = route.params.forecast;

  const [forecast, setForecast] = useState<SpotForecast>(initialForecast);
  const [refreshing, setRefreshing] = useState(false);
  const [dailyData, setDailyData] = useState<DailyData | null>(null);
  const [ready, setReady] = useState(false);
  const shimmerAnim = useSharedShimmer();
  const [isFav, setIsFav] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertScore, setAlertScore] = useState<number | null>(null);
  const { show: showToast } = useToast();
  const { t, locale } = useI18n();
  const { spot, currentCondition } = forecast;
  const { colors, isDark } = useTheme();
  const { profile } = useProfile();
  const { location } = useLocation();
  const insets = useSafeAreaInsets();
  const { isWide } = useWebLayout();
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
    getSpotAlert(spot.id).then(a => setAlertScore(a ? a.minScore : null)).catch(() => {});
  }, [spot.id]);

  useEffect(() => {
    // Positive moment: the user is looking at genuinely good conditions (the
    // "go" score). Much higher intent than a raw launch count — best place to
    // surface the native review prompt. Deferred so it never fights first paint.
    if (forecast.currentScore < 7) return;
    const timer = setTimeout(() => { requestReviewOnPositiveMoment(); }, 3500);
    return () => clearTimeout(timer);
  }, [forecast.currentScore]);

  const handleToggleFav = useCallback(async () => {
    hapticLight();
    const next = await toggleFavorite(spot.id);
    const nowFav = next.includes(spot.id);
    setIsFav(nowFav);
    showToast(nowFav ? t.spotsAddedFav : t.spotsRemovedFav, 'success');
  }, [spot.id, showToast, t]);

  const openAlert = useCallback(async () => {
    hapticLight();
    setAlertOpen(true);
  }, []);

  const handleSaveAlert = useCallback(async (minScore: number) => {
    setAlertOpen(false);
    const granted = await requestNotifPermission();
    if (!granted) {
      showToast(t.alertNeedsPermission, 'error');
      return;
    }
    await setSpotAlert(spot.id, { minScore });
    setAlertScore(minScore);
    hapticSuccess();
    showToast(t.alertEnabled, 'success');
    // Additively (re)schedule just this spot — leaves other spots' alerts intact.
    rescheduleSpotAlert(forecast, locale).catch(() => {});
  }, [spot.id, forecast, locale, showToast, t]);

  const handleDisableAlert = useCallback(async () => {
    setAlertOpen(false);
    await removeSpotAlert(spot.id);
    setAlertScore(null);
    hapticLight();
    showToast(t.alertDisabled, 'success');
    rescheduleSpotAlert(forecast, locale).catch(() => {});
  }, [spot.id, forecast, locale, showToast, t]);

  // "Now"/"today" anchored to the SPOT's timezone (not the device), so charts,
  // sun times and "best today" stay correct when viewing a far-away spot.
  const nowKey = useMemo(() => spotLocalNowKey(forecast.utcOffsetSeconds), [forecast.utcOffsetSeconds]);
  const spotTodayStr = nowKey.slice(0, 10);

  const openRate = useCallback(async () => {
    hapticLight();
    // A rating describes the conditions "right now"; at night nobody is in the
    // water, so it can't be compared with the score (a 9.8 was logged at 22:40).
    if (isNightAtSpot(forecast.utcOffsetSeconds)) {
      showToast(t.rateNight, 'info');
      return;
    }
    if (await hasRatedToday(spot.id, spotTodayStr, profile.level)) {
      showToast(t.rateAlready, 'info');
      return;
    }
    setRateOpen(true);
  }, [spot.id, spotTodayStr, profile.level, showToast, t, forecast.utcOffsetSeconds]);

  const handleSubmitRating = useCallback(async (score: number) => {
    setRateOpen(false);
    hapticSuccess();
    const payload = buildRatingPayload(spot, forecast, currentCondition, score, locale, spotTodayStr, profile.level);
    const sent = await submitRating(payload).catch(() => false);
    showToast(sent ? t.rateThanks : t.rateQueued, 'success');
  }, [spot, forecast, currentCondition, locale, spotTodayStr, profile.level, showToast, t]);
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
    // shown while the new spot loads. Only the daily block (sunrise/tide) is
    // needed here — marine/weather already come with the forecast.
    setDailyData(null);
    fetchDailyData(spot.latitude, spot.longitude)
      .then((daily) => {
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
      const msg = e instanceof Error ? e.message : 'unknown error';
      log.warn('Refresh failed:', msg);
      showToast(t.detailRefreshError, 'error');
    }
    setRefreshing(false);
  }, [spot, profile, locale, t]);

  const chartSlice = useMemo(() => getChartSlice(forecast.hourlyConditions, nowKey), [forecast.hourlyConditions, nowKey]);
  const chartWidth = Math.max(W - 24, chartSlice.length * 38);
  const chartH = 180;

  const combinedData = useMemo(() => buildCombinedChart(chartSlice, colors.accent, colors.yellow), [chartSlice, colors.accent, colors.yellow]);
  const tideData = useMemo(() => buildTideChart(chartSlice, colors.blue), [chartSlice, colors.blue]);

  // Shaded night spans, so the hours you can't surf still show but read as night.
  const nightBands = useMemo(() => {
    const bands: { left: number; width: number }[] = [];
    let i = 0;
    while (i < chartSlice.length) {
      if (!isNightHour(chartSlice[i].time)) { i++; continue; }
      let j = i;
      while (j + 1 < chartSlice.length && isNightHour(chartSlice[j + 1].time)) j++;
      const x1 = getNowLineX(Math.max(0, i - 0.5), chartSlice.length, chartWidth);
      const x2 = getNowLineX(Math.min(chartSlice.length - 1, j + 0.5), chartSlice.length, chartWidth);
      if (x1 != null && x2 != null) bands.push({ left: x1, width: x2 - x1 });
      i = j + 1;
    }
    return bands;
  }, [chartSlice, chartWidth]);

  // Next high/low tide times — computed from the FULL hourly series (tides happen
  // at night too) and anchored to the spot's local "now".
  const nextTides = useMemo(() => {
    const sea = forecast.hourlyConditions.map(h => h.seaLevel);
    const times = forecast.hourlyConditions.map(h => h.time);
    const extrema = findTideExtrema(sea, times);
    const ref = new Date(`${nowKey}:00:00`);
    return getNextTideExtrema(extrema, Number.isNaN(ref.getTime()) ? new Date() : ref, 4);
  }, [forecast.hourlyConditions, nowKey]);



  const chartNowIdx = useMemo(() => {
    const i = chartSlice.findIndex(c => c.time.slice(0, 13) >= nowKey);
    return i < 0 ? -1 : i + new Date().getMinutes() / 60;
  }, [chartSlice, nowKey]);
  const nowX = useMemo(() => getNowLineX(chartNowIdx, chartSlice.length, chartWidth), [chartNowIdx, chartSlice.length, chartWidth]);

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
      next: bestNextC ? { cond: bestNextC, dayLabel: fmtDayLabelShort(bestNextC.time, spotTodayStr, t, locale), timeRange: fmtRange(bestNextC.time, profile.sessionDuration, profile.availableTo) } : null,
    };
  }, [forecast.hourlyConditions, profile, t, locale, nowKey, spotTodayStr]);

  const summary = useMemo(() => buildDaySummary(
    slice, spot, spotTodayStr, locale,
    spotBests.today ? { range: spotBests.today.timeRange, score: spotBests.today.cond.score } : null,
  ), [slice, spot, spotTodayStr, locale, spotBests.today]);


  const chartCfg = useMemo(() => ({
    backgroundGradientFrom: colors.card,
    backgroundGradientTo: colors.card,
    decimalPlaces: 1,
    color: (o = 1) => `rgba(0,212,170,${o})`,
    labelColor: () => colors.white70,
    propsForDots: { r: '2.5', strokeWidth: '0', fill: colors.accent },
    propsForLabels: { fontSize: 12, fontWeight: '600' },
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
      <View key={c.time} style={[s.row, { backgroundColor: rowBg(c.score) }]} accessibilityLabel={`${fmtH(c.time)} · ${t.a11yScore(fmtDec(c.score))} · ${t.spotsSwell} ${fmtDec(c.swellHeight)}m · ${wl} ${c.windSpeed.toFixed(0)} km/h`}>
        <Text style={[s.rTime, { color: colors.white70 }]}>{fmtH(c.time)}</Text>
        <MaterialCommunityIcons name={weatherMCIcon(c.weatherCode)} size={14} color={colors.white70} style={s.rWeather} />
        <View style={[s.rBadge, { backgroundColor: scoreBg(c.score) }]}>
          <Text style={[s.rScore, { color: scoreInk(c.score, isDark) }]}>{fmtDec(c.score)}</Text>
        </View>
        <Text style={[s.rMain, { color: colors.white }]}>
          {fmtDec(c.swellHeight)}m · {c.swellPeriod.toFixed(0)}s · {dirLabel(c.swellDirection)}
        </Text>
        <View style={s.rWindCol}>
          <Text style={[s.rWind, { color: colors.white40 }, isGust && { color: colors.yellow }]}>{wl} {c.windSpeed.toFixed(0)}</Text>
          {isGust && <Text style={[s.rGust, { color: colors.yellow }]}><MaterialCommunityIcons name={ICONS.gust} size={9} color={colors.yellow} />{c.windGusts.toFixed(0)}</Text>}
        </View>
      </View>
    );
  }, [spot.beachOrientation, colors, t]);


  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
    {/* Sticky header — frosted glass: blurs the content scrolling underneath */}
    <Animated.View style={[s.stickyHeader, { paddingTop: insets.top + 4, opacity: stickyOpacity, borderBottomColor: colors.white15 }]} pointerEvents={showStickyHeader ? 'auto' : 'none'}>
      {/* Only mount the (GPU-expensive) blur while the sticky header is visible. */}
      {showStickyHeader && <BlurView intensity={40} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, opacity: 0.55 }]} />
      <TouchableOpacity onPress={() => navigation.goBack()} style={s.stickyBack} accessibilityLabel={t.back} accessibilityRole="button">
        <Text style={[s.backTxt, { color: colors.white }]}>‹</Text>
      </TouchableOpacity>
      <Text style={[s.stickyName, { color: colors.white }]} numberOfLines={1}>{spot.name}</Text>
      <ScoreBadge score={forecast.currentScore} size="sm" />
    </Animated.View>
    <ScrollView ref={scrollRef} style={[{ flex: 1 }, webCenter(WEB_DETAIL_MAX, isWide)]} showsVerticalScrollIndicator={false} scrollEventThrottle={16} onScroll={onScroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}>
      {/* Header: actions on their own row, so the name gets the full width
          and the current score reads as THE score (labelled "now"). */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <View style={s.hTopRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={[s.back, { backgroundColor: colors.cardLight }]} accessibilityLabel={t.back} accessibilityRole="button">
            <Text style={[s.backTxt, { color: colors.white }]}>‹</Text>
          </TouchableOpacity>
          <View style={s.hRightBtns}>
            <TouchableOpacity
              onPress={openAlert}
              style={[s.favBtn, { backgroundColor: alertScore != null ? colors.accentDim : colors.white08 }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
              accessibilityLabel={t.alertTitle}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons
                name={alertScore != null ? ICONS.bellRing : ICONS.bellOutline}
                size={19}
                color={alertScore != null ? colors.accent : colors.white40}
              />
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
        </View>
        <View style={s.hBody}>
          <View style={s.hCenter}>
            <Text style={[s.hName, { color: colors.white }]} numberOfLines={2}>{spot.name}</Text>
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
          <View style={s.hNow}>
            <ScoreBadge score={forecast.currentScore} size="lg" animated />
            <Text style={[s.hNowTxt, { color: colors.white40 }]}>{t.detailNow}</Text>
          </View>
        </View>
      </View>

      {/* Best moments */}
      {spotBests.today && (
        <View style={[s.bestCard, { backgroundColor: scoreBg(spotBests.today.cond.score), borderColor: scoreColor(spotBests.today.cond.score) }]}>
          <View style={s.bestCardLeft}>
            <Text style={[s.bestCardLabel, { color: colors.white40 }]}>{t.detailBestToday}</Text>
            <Text style={[s.bestCardTime, { color: scoreInk(spotBests.today.cond.score, isDark) }]}>
              <MaterialCommunityIcons name={scoreIcon(spotBests.today.cond.score)} size={16} color={scoreInk(spotBests.today.cond.score, isDark)} />  {spotBests.today.timeRange}
            </Text>
            <Text style={[s.bestCardDesc, { color: colors.white70 }]}>{scoreLabel(spotBests.today.cond.score, t)}</Text>
          </View>
          <ScoreBadge score={spotBests.today.cond.score} size="md" />
        </View>
      )}
      {spotBests.next && (
        <View style={[s.bestCard, { backgroundColor: colors.card, borderColor: colors.white15 }]}>
          <View style={s.bestCardLeft}>
            <Text style={[s.bestCardLabel, { color: colors.white40 }]}>{t.detailBestNext}</Text>
            <Text style={[s.bestCardTime, { color: colors.white }]}>
              <MaterialCommunityIcons name={scoreIcon(spotBests.next.cond.score)} size={16} color={scoreInk(spotBests.next.cond.score, isDark)} />  {spotBests.next.dayLabel} · {spotBests.next.timeRange}
            </Text>
            <Text style={[s.bestCardDesc, { color: colors.white70 }]}>{scoreLabel(spotBests.next.cond.score, t)}</Text>
          </View>
          <ScoreBadge score={spotBests.next.cond.score} size="md" />
        </View>
      )}

      {/* Webcam — remontée en haut : les surfeurs regardent la cam en premier */}
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
              <Text style={[s.tideVal, { color: colors.white }]}>{fmtDec(currentCondition.swellHeight)} m</Text>
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
              <Text style={[s.tideLabel, { color: colors.white40 }]} numberOfLines={1}>{t.detailSwellDirShort}</Text>
              <Text style={[s.tideVal, { color: colors.white }]} numberOfLines={1}>{dirLabel(currentCondition.swellDirection)} · {currentCondition.swellDirection.toFixed(0)}°</Text>
            </View>
          </View>
        </FadeInView>
      )}

      {/* Vent & surface — lecture "propre / clapoteux" en clair + force et rafales */}
      {currentCondition && (() => {
        const ck = windConditionKey(currentCondition.windSpeed, currentCondition.windDirection, spot.beachOrientation);
        const ckLabel = ck === 'glassy' ? t.windGlassy : ck === 'choppy' ? t.windChoppy : t.windClean;
        const ckColor = ck === 'choppy' ? colors.yellow : ck === 'glassy' ? colors.accent : colors.blue;
        const wl = windLabel(currentCondition.windSpeed, currentCondition.windDirection, spot.beachOrientation);
        return (
          <FadeInView delay={140}>
            <View style={[s.tideRow, { backgroundColor: colors.card }]}>
              <View style={s.tideItem}>
                <MaterialCommunityIcons name={ICONS.surface} size={16} color={ckColor} style={s.tideIcon} />
                <Text style={[s.tideLabel, { color: colors.white40 }]}>{t.detailSurface}</Text>
                <Text style={[s.tideVal, { color: ckColor }]}>{ckLabel}</Text>
              </View>
              <View style={[s.tideSep, { backgroundColor: colors.white15 }]} />
              <View style={s.tideItem}>
                <MaterialCommunityIcons name={ICONS.wind} size={16} color={colors.white70} style={s.tideIcon} />
                <Text style={[s.tideLabel, { color: colors.white40 }]}>{t.detailWindLabel}</Text>
                <Text style={[s.tideVal, { color: colors.white }]}>{wl} · {currentCondition.windSpeed.toFixed(0)}</Text>
              </View>
              <View style={[s.tideSep, { backgroundColor: colors.white15 }]} />
              <View style={s.tideItem}>
                <MaterialCommunityIcons name={ICONS.gust} size={16} color={currentCondition.windGusts > 25 ? colors.yellow : colors.white70} style={s.tideIcon} />
                <Text style={[s.tideLabel, { color: colors.white40 }]}>{t.detailGusts}</Text>
                <Text style={[s.tideVal, { color: currentCondition.windGusts > 25 ? colors.yellow : colors.white }]}>{currentCondition.windGusts.toFixed(0)} km/h</Text>
              </View>
            </View>
          </FadeInView>
        );
      })()}

      {/* Score breakdown (P1 — Why this score) */}
      {currentCondition?.factors && (
        <FadeInView delay={200}>
          <ScoreBreakdown factors={currentCondition.factors} finalScore={forecast.currentScore} />
        </FadeInView>
      )}

      {/* Confort & équipement — combinaison conseillée (selon temp. eau) + UV / pluie / nébulosité */}
      {currentCondition && (() => {
        const wet = wetsuitRecommendation(currentCondition.seaTemp);
        const accNames = wet.accessories.map(a => a === 'boots' ? t.wetsuitBoots : a === 'gloves' ? t.wetsuitGloves : t.wetsuitHood);
        const wetMain = wet.none ? t.detailWetsuitNone : `${wet.thickness} mm`;
        const wetSub = accNames.length ? `+ ${accNames.join(' · ')}` : '';
        const uv = currentCondition.uvIndex;
        const uvKey = uv != null ? uvRiskKey(uv) : null;
        const uvRiskLabel = uvKey === 'low' ? t.uvLow : uvKey === 'moderate' ? t.uvModerate : uvKey === 'high' ? t.uvHigh : uvKey === 'veryHigh' ? t.uvVeryHigh : uvKey === 'extreme' ? t.uvExtreme : '';
        const rain = currentCondition.precipProb;
        const cloud = currentCondition.cloudCover;
        return (
          <FadeInView delay={170}>
            <View style={s.sec}>
              <Text style={[s.secT, { color: colors.textSecondary }]}>{t.detailComfort}</Text>
              <View style={[s.comfortBox, { backgroundColor: colors.card }]}>
                <View style={s.comfortTop}>
                  <MaterialCommunityIcons name={ICONS.wetsuit} size={20} color={colors.blue} style={{ marginRight: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.comfortLabel, { color: colors.white40 }]}>{t.detailWetsuit}</Text>
                    <Text style={[s.comfortVal, { color: colors.white }]}>
                      {wetMain}{wetSub ? <Text style={[s.comfortSub, { color: colors.white70 }]}>  {wetSub}</Text> : null}
                    </Text>
                  </View>
                  <View style={[s.comfortTempPill, { backgroundColor: colors.blueDim }]}>
                    <MaterialCommunityIcons name={ICONS.seaTemp} size={13} color={colors.blue} />
                    <Text style={[s.comfortTempTxt, { color: colors.blue }]}>{currentCondition.seaTemp.toFixed(0)}°</Text>
                  </View>
                </View>
                <View style={[s.comfortStatsRow, { borderTopColor: colors.white15 }]}>
                  <View style={s.tideItem}>
                    <MaterialCommunityIcons name={ICONS.uv} size={16} color={colors.white70} style={s.tideIcon} />
                    <Text style={[s.tideLabel, { color: colors.white40 }]} numberOfLines={1}>{uvRiskLabel || t.detailUV}</Text>
                    <Text style={[s.tideVal, { color: colors.white }]} numberOfLines={1}>{uv != null ? Math.round(uv) : '—'}</Text>
                  </View>
                  <View style={[s.tideSep, { backgroundColor: colors.white15 }]} />
                  <View style={s.tideItem}>
                    <MaterialCommunityIcons name={ICONS.rain} size={16} color={colors.white70} style={s.tideIcon} />
                    <Text style={[s.tideLabel, { color: colors.white40 }]} numberOfLines={1}>{t.detailRain}</Text>
                    <Text style={[s.tideVal, { color: colors.white }]} numberOfLines={1}>{rain != null ? `${Math.round(rain)}%` : '—'}</Text>
                  </View>
                  <View style={[s.tideSep, { backgroundColor: colors.white15 }]} />
                  <View style={s.tideItem}>
                    <MaterialCommunityIcons name={ICONS.cloud} size={16} color={colors.white70} style={s.tideIcon} />
                    <Text style={[s.tideLabel, { color: colors.white40 }]} numberOfLines={1}>{t.detailCloud}</Text>
                    <Text style={[s.tideVal, { color: colors.white }]} numberOfLines={1}>{cloud != null ? `${Math.round(cloud)}%` : '—'}</Text>
                  </View>
                </View>
              </View>
            </View>
          </FadeInView>
        );
      })()}

      {/* Deferred heavy content */}
      {!ready ? (
        <View style={s.deferredSkeleton}>
          <Shimmer w={160} h={16} r={6} anim={shimmerAnim} />
          <View style={[s.chartBox, { backgroundColor: colors.card, height: 200, padding: 16, justifyContent: 'flex-end', gap: 10 }]}>
            <Shimmer w="90%" h={90} r={12} anim={shimmerAnim} />
            <Shimmer w="60%" h={12} r={6} anim={shimmerAnim} />
          </View>
          <Shimmer w={140} h={16} r={6} anim={shimmerAnim} />
          <View style={[s.info, { backgroundColor: colors.card, gap: 12 }]}>
            <Shimmer w="80%" h={14} r={6} anim={shimmerAnim} />
            <Shimmer w="95%" h={14} r={6} anim={shimmerAnim} />
            <Shimmer w="70%" h={14} r={6} anim={shimmerAnim} />
          </View>
        </View>
      ) : (
        <>
          <View>
          <View>
          {/* Combined chart: Houle vs Vent */}
          <FadeInView delay={50}>
            <View style={s.sec}>
              <Text style={[s.secT, { color: colors.textSecondary }]}>{t.detailSwellWind}</Text>
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
                    {nightBands.map((b) => (
                      <View key={b.left} pointerEvents="none" style={[s.nightBand, { left: b.left, width: b.width, height: chartH - 24, backgroundColor: colors.white08 }]} />
                    ))}
                    {nowX != null && <NowLine x={nowX} height={chartH} color={colors.white} />}
                  </View>
                </ScrollView>
                <View style={s.legendRow}>
                  <View style={s.legendItem}>
                    <View style={[s.legendDot, { backgroundColor: colors.accent }]} />
                    <Text style={[s.legendTxt, { color: colors.white40 }]}>{t.detailSwellM}</Text>
                  </View>
                  <View style={s.legendItem}>
                    <View style={[s.legendDot, { backgroundColor: colors.yellow }]} />
                    <Text style={[s.legendTxt, { color: colors.white40 }]}>{t.detailWindDiv}</Text>
                  </View>
                  <View style={s.legendItem}>
                    <View style={[s.legendDot, { backgroundColor: colors.white40, width: 1.5, height: 14, borderRadius: 0 }]} />
                    <Text style={[s.legendTxt, { color: colors.white40 }]}>{t.detailNow}</Text>
                  </View>
                  <View style={s.legendItem}>
                    <View style={[s.legendDot, { backgroundColor: colors.white15, width: 12, height: 10, borderRadius: 2 }]} />
                    <Text style={[s.legendTxt, { color: colors.white40 }]}>{t.detailNight}</Text>
                  </View>
                </View>
              </View>
            </View>
          </FadeInView>
          </View>
          <View>
          {/* Tide chart */}
          <FadeInView delay={150}>
            <View style={s.sec}>
              <Text style={[s.secT, { color: colors.textSecondary }]}>{t.detailTideChart}</Text>
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
                    {nightBands.map((b) => (
                      <View key={b.left} pointerEvents="none" style={[s.nightBand, { left: b.left, width: b.width, height: chartH - 24, backgroundColor: colors.white08 }]} />
                    ))}
                    {nowX != null && <NowLine x={nowX} height={chartH} color={colors.white} />}
                  </View>
                </ScrollView>
              </View>
              {nextTides.length > 0 && (
                <View style={s.tideTimesRow}>
                  {nextTides.map((e, i) => (
                    <View key={`${e.time}-${i}`} style={[s.tideTimeChip, { backgroundColor: colors.card }]}>
                      <MaterialCommunityIcons
                        name={e.type === 'high' ? ICONS.tideUp : ICONS.tideDown}
                        size={15}
                        color={e.type === 'high' ? colors.blue : colors.accent}
                      />
                      <Text style={[s.tideTimeType, { color: colors.white40 }]} numberOfLines={2}>
                        {e.type === 'high' ? t.tideHigh : t.tideLow}
                      </Text>
                      <Text style={[s.tideTimeVal, { color: colors.white }]}>{formatTideTime(e.time)}</Text>
                      <Text style={[s.tideTimeLvl, { color: colors.white40 }]}>{fmtDec(e.level)} m</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </FadeInView>
          </View>
          </View>

          {/* Hourly rows */}
          <FadeInView delay={250}>
            <HourlySection slice={slice} renderRow={renderRow} colors={colors} t={t} />
          </FadeInView>

          {/* Spot info */}
          <FadeInView delay={350}>
            <View style={s.sec}>
              <Text style={[s.secT, { color: colors.textSecondary }]}>{t.detailSpotInfo}</Text>
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
                    value={`${fmtDec(spot.optimalSwellHeightMin)} – ${fmtDec(spot.optimalSwellHeightMax)} m`}
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

      {/* Rate the conditions — community ground-truth (bottom of page) */}
      <View style={s.rateSection}>
        <TouchableOpacity
          onPress={openRate}
          activeOpacity={0.85}
          style={[s.rateBtn, { backgroundColor: colors.card, borderColor: colors.white15 }]}
          accessibilityRole="button"
          accessibilityLabel={t.rateButton}
        >
          <MaterialCommunityIcons name="star-plus-outline" size={18} color={colors.accent} />
          <Text style={[s.rateBtnTxt, { color: colors.white }]}>{t.rateButton}</Text>
        </TouchableOpacity>
        <Text style={[s.rateSectionHint, { color: colors.white40 }]}>{t.rateHint}</Text>
      </View>

      <View style={{ height: insets.bottom + 24 }} />
    </ScrollView>
    <RateSpotModal
      visible={rateOpen}
      spotName={spot.name}
      appScore={forecast.currentScore}
      onClose={() => setRateOpen(false)}
      onSubmit={handleSubmitRating}
    />
    <AlertSpotModal
      visible={alertOpen}
      spotName={spot.name}
      initialScore={alertScore}
      onClose={() => setAlertOpen(false)}
      onSave={handleSaveAlert}
      onDisable={handleDisableAlert}
    />
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
      <Text style={[s.secT, { color: colors.textSecondary }]}>{t.detailHourly}</Text>
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
  stickyHeader: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 1, overflow: 'hidden' },
  stickyBack: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  stickyName: { flex: 1, fontSize: 16, fontWeight: '800' },
  header: { paddingTop: 8, paddingHorizontal: 16, paddingBottom: 12 },
  loaderWrap: { flex: 1, alignItems: 'center', paddingHorizontal: 32 },
  loaderTxt: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  loaderBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 22 },
  loaderBtnTxt: { fontSize: 15, fontWeight: '700' },
  hTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hBody: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  hNow: { alignItems: 'center', marginLeft: 12 },
  hNowTxt: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
  back: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  backTxt: { fontSize: 24, fontWeight: '300', marginTop: -2 },
  hCenter: { flex: 1 },
  hRightBtns: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  favBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  rateSection: { marginHorizontal: 16, marginTop: 18 },
  rateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 14, borderWidth: 1 },
  rateBtnTxt: { fontSize: 14, fontWeight: '700' },
  rateSectionHint: { fontSize: 12, fontWeight: '500', textAlign: 'center', marginTop: 8, lineHeight: 15 },
  hName: { fontSize: 21, fontWeight: '800' },
  hRegion: { fontSize: 12, fontWeight: '600', marginTop: 1 },
  hMetaRow: { gap: 2, marginTop: 3 },
  hTemp: { fontSize: 12 },

  // No elevation here: the "today" variant uses a translucent scoreBg fill, and
  // Android's elevation shadow shows through it as an ugly rectangle. The colored
  // fill + border already make this card pop.
  bestCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 6, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, borderWidth: StyleSheet.hairlineWidth },
  bestCardLeft: { flex: 1, marginRight: 12 },
  bestCardLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  bestCardTime: { fontSize: 17, fontWeight: '800' },
  bestCardDesc: { fontSize: 12, marginTop: 3 },
  deferredSkeleton: { paddingHorizontal: 16, paddingTop: 10, gap: 12 },

  summaryBox: { marginHorizontal: 16, marginTop: 10, marginBottom: 6, borderRadius: 14, padding: 16, borderWidth: StyleSheet.hairlineWidth, ...elevationIOS.sm },
  summaryTitle: { fontSize: 15, fontWeight: '800', marginBottom: 8 },
  summaryTxt: { fontSize: 14, lineHeight: 22 },

  tideRow: { flexDirection: 'row', marginHorizontal: 16, marginTop: 10, marginBottom: 6, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 10 },
  tideItem: { flex: 1, alignItems: 'center' },
  tideIcon: { fontSize: 16, marginBottom: 4 },
  tideLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', textAlign: 'center' },
  tideVal: { fontSize: 13, fontWeight: '800', marginTop: 4 },
  tideSep: { width: 1, marginVertical: 4 },
  tideTimesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  tideTimeChip: { flex: 1, minWidth: 70, alignItems: 'center', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 6 },
  tideTimeType: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginTop: 3, textAlign: 'center' },
  tideTimeVal: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  tideTimeLvl: { fontSize: 11, fontWeight: '600', marginTop: 1 },

  webcamBtn: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 10, marginBottom: 6, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1.5 },
  webcamIcon: { fontSize: 22, marginRight: 12 },
  webcamTxt: { fontSize: 16, fontWeight: '800' },
  webcamSub: { fontSize: 12, marginTop: 2 },
  webcamGo: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  webcamGoTxt: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },

  sec: { marginTop: 18, paddingHorizontal: 12 },
  chartRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  chartCol: { flex: 1, minWidth: 0 },
  secT: { ...typography.sectionLabel, marginBottom: 10, marginLeft: 4 },
  chartBox: { borderRadius: 16, overflow: 'hidden', paddingTop: 10, paddingBottom: 4 },
  chart: { borderRadius: 16, marginLeft: -8 },

  legendRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 16, rowGap: 6, paddingBottom: 10, paddingHorizontal: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  nightBand: { position: 'absolute', top: 8 },
  legendTxt: { fontSize: 12, fontWeight: '600' },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, marginBottom: 1 },
  rTime: { width: 40, fontSize: 12, fontWeight: '700' },
  rWeather: { fontSize: 12, width: 22 },
  rBadge: { width: 36, borderRadius: 6, paddingVertical: 2, alignItems: 'center', marginRight: 8 },
  rScore: { fontSize: 12, fontWeight: '800' },
  rMain: { fontSize: 12, fontWeight: '600', flex: 1 },
  rWindCol: { alignItems: 'flex-end' },
  rWind: { fontSize: 12, fontWeight: '500' },
  rGust: { fontSize: 10, fontWeight: '700', marginTop: 1 },

  info: { borderRadius: 16, padding: 18, ...elevationIOS.sm },
  desc: { fontSize: 14, lineHeight: 21, marginBottom: 12 },
  infoGroupTitle: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  idealGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  idealCard: { flexBasis: '46%', flexGrow: 1, borderRadius: 12, padding: 12 },
  idealIcon: { fontSize: 18, marginBottom: 6 },
  idealTitle: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  idealValue: { fontSize: 14, fontWeight: '800', marginTop: 4 },
  idealSub: { fontSize: 12, marginTop: 2 },
  comfortBox: { borderRadius: 16, paddingVertical: 14, paddingHorizontal: 14, ...elevationIOS.sm },
  comfortTop: { flexDirection: 'row', alignItems: 'center' },
  comfortLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  comfortVal: { fontSize: 15, fontWeight: '800', marginTop: 1 },
  comfortSub: { fontSize: 12, fontWeight: '600' },
  comfortTempPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginLeft: 8 },
  comfortTempTxt: { fontSize: 14, fontWeight: '800' },
  comfortStatsRow: { flexDirection: 'row', borderTopWidth: 1, marginTop: 12, paddingTop: 12 },
  dangerBox: { borderRadius: 12, padding: 14 },
  dangerTxt: { fontSize: 13, marginBottom: 4, fontWeight: '500' },
  showMore: { marginTop: 8, borderRadius: 10, paddingVertical: 12, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  showMoreTxt: { fontSize: 13, fontWeight: '700' },
});
