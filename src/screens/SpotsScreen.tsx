import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useProfile } from '../context/ProfileContext';
import { useTheme } from '../context/ThemeContext';
import { fetchSpotData } from '../services/api';
import { computeSpotForecast } from '../utils/scoring';
import { getFavorites, toggleFavorite } from '../services/favorites';
import SPOTS from '../data/spots';
import ScoreBadge from '../components/ScoreBadge';
import { SpotForecast, HourlyCondition } from '../types';
import { Ionicons } from '@expo/vector-icons';
import { scoreColor, scoreBg, scoreLabel, scoreEmoji, scoreShort, dirLabel, windLabel, isDaytime } from '../theme';
import { SurferProfile } from '../types';
import { SpotsScreenProps } from '../navigation/types';

const DAY_FULL = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function fmtElapsed(d: Date): string {
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  return `il y a ${Math.floor(mins / 60)}h`;
}
const ALL_REGIONS = ['Tous', ...Array.from(new Set(SPOTS.map(s => s.region)))];

interface BestPick {
  spotName: string;
  spotId: string;
  forecast: SpotForecast;
  cond: HourlyCondition;
  beachOrientation: number;
  dayLabel: string;
  timeRange: string;
}

function fmtRange(iso: string, duration: number, maxH: number): string {
  const h = parseInt(iso.slice(11, 13), 10);
  const end = Math.min(h + duration, maxH);
  return `${h}h–${end}h`;
}

function fmtDayLabel(iso: string, now: Date): string {
  const d = new Date(iso);
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  const dateStr = d.toISOString().slice(0, 10);

  if (dateStr === todayStr) return "Aujourd'hui";
  if (dateStr === tomorrowStr) return 'Demain';
  const day = DAY_FULL[d.getDay()];
  return `${day} ${d.getDate()}/${d.getMonth() + 1}`;
}

function findBestPicks(forecasts: SpotForecast[], profile: SurferProfile): { bestToday: BestPick | null; bestWeek: BestPick[] } {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const nowStr = now.toISOString().slice(0, 13);
  const { sessionDuration, availableFrom, availableTo } = profile;

  let bestToday: BestPick | null = null;
  const dayBest: Record<string, BestPick> = {};

  for (const f of forecasts) {
    for (const c of f.hourlyConditions) {
      if (c.time.slice(0, 13) < nowStr) continue;
      if (!isDaytime(c.time, availableFrom, availableTo)) continue;

      const dateKey = c.time.slice(0, 10);
      const isToday = dateKey === todayStr;

      const pick: BestPick = {
        spotName: f.spot.name,
        spotId: f.spot.id,
        forecast: f,
        cond: c,
        beachOrientation: f.spot.beachOrientation,
        dayLabel: fmtDayLabel(c.time, now),
        timeRange: fmtRange(c.time, sessionDuration, availableTo),
      };

      if (isToday) {
        if (!bestToday || c.score > bestToday.cond.score) {
          bestToday = pick;
        }
      }

      if (!dayBest[dateKey] || c.score > dayBest[dateKey].cond.score) {
        dayBest[dateKey] = pick;
      }
    }
  }

  const bestWeek = Object.values(dayBest)
    .sort((a, b) => a.cond.time.localeCompare(b.cond.time))
    .slice(0, 5);

  return { bestToday, bestWeek };
}

export default function SpotsScreen({ navigation }: SpotsScreenProps) {
  const { profile } = useProfile();
  const { colors } = useTheme();
  const [forecasts, setForecasts] = useState<SpotForecast[]>([]);
  const [favs, setFavs] = useState<string[]>([]);
  const [regionFilter, setRegionFilter] = useState('Tous');
  const [loadedCount, setLoadedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [totalCount] = useState(SPOTS.length);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const initialLoad = useRef(true);

  useEffect(() => { getFavorites().then(setFavs); }, []);

  const handleToggleFav = useCallback(async (spotId: string) => {
    const next = await toggleFavorite(spotId);
    setFavs(next);
  }, []);

  const loadData = useCallback(async (force = false) => {
    try {
      setError(null);
      if (force) {
        setForecasts([]);
        setLoadedCount(0);
        setFailedCount(0);
      }

      const results: SpotForecast[] = force ? [] : [...forecasts];
      let count = force ? 0 : loadedCount;
      let failed = 0;
      const spots = [...SPOTS];

      const BATCH_SIZE = 4;
      for (let i = 0; i < spots.length; i += BATCH_SIZE) {
        const batch = spots.slice(i, i + BATCH_SIZE).filter(
          sp => force || !results.find(r => r.spot.id === sp.id)
        );
        if (batch.length === 0) continue;

        const settled = await Promise.allSettled(
          batch.map(async (spot) => {
            const { marine, weather } = await fetchSpotData(spot.latitude, spot.longitude);
            return computeSpotForecast(spot, marine, weather, profile);
          })
        );

        for (const res of settled) {
          if (res.status === 'fulfilled') {
            const forecast = res.value;
            const existing = results.findIndex(r => r.spot.id === forecast.spot.id);
            if (existing >= 0) results[existing] = forecast;
            else results.push(forecast);
            count++;
          } else {
            failed++;
          }
        }

        setForecasts([...results].sort((a, b) => b.currentScore - a.currentScore));
        setLoadedCount(count);
        setFailedCount(failed);
      }
      setLastUpdate(new Date());
    } catch (e: any) {
      setError(e.message || 'Erreur de chargement');
    }
  }, [profile]);

  useEffect(() => {
    if (initialLoad.current) {
      initialLoad.current = false;
      loadData(true);
    }
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  }, [loadData]);

  const filteredForBest = useMemo(() => {
    if (regionFilter === 'Tous') return forecasts;
    return forecasts.filter(f => f.spot.region === regionFilter);
  }, [forecasts, regionFilter]);
  const { bestToday, bestWeek } = useMemo(() => findBestPicks(filteredForBest, profile), [filteredForBest, profile]);
  const levelTxt = profile.level === 'beginner' ? 'Débutant' : profile.level === 'intermediate' ? 'Intermédiaire' : 'Expert';

  const sortedForecasts = useMemo(() => {
    let list = forecasts;
    if (regionFilter !== 'Tous') {
      list = list.filter(f => f.spot.region === regionFilter);
    }
    const fav = list.filter(f => favs.includes(f.spot.id));
    const rest = list.filter(f => !favs.includes(f.spot.id));
    return [...fav, ...rest];
  }, [forecasts, favs, regionFilter]);

  const regions = useMemo(() => {
    const map: Record<string, SpotForecast[]> = {};
    for (const f of sortedForecasts) {
      const r = f.spot.region || 'Autre';
      if (!map[r]) map[r] = [];
      map[r].push(f);
    }
    return Object.entries(map);
  }, [sortedForecasts]);

  const navigateToPick = useCallback((pick: BestPick) => {
    navigation.navigate('SpotDetail', { forecast: pick.forecast });
  }, [navigation]);

  const isLoading = loadedCount === 0 && forecasts.length === 0 && !error;

  if (isLoading) {
    return (
      <View style={[ss.loadWrap, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[ss.loadTxt, { color: colors.white40 }]}>Analyse des conditions...</Text>
      </View>
    );
  }

  if (error && forecasts.length === 0) {
    return (
      <View style={[ss.loadWrap, { backgroundColor: colors.bg }]}>
        <Text style={[ss.errTxt, { color: colors.red }]}>{error}</Text>
        <TouchableOpacity onPress={onRefresh} style={[ss.retryBtn, { backgroundColor: colors.cardLight }]}>
          <Text style={[ss.retryTxt, { color: colors.accent }]}>Réessayer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
    >
      {/* Header */}
      <View style={ss.header}>
        <View style={ss.headerLeft}>
          <Text style={[ss.logo, { color: colors.white }]}>SpotWave</Text>
          <Text style={[ss.subtitle, { color: colors.white40 }]}>Portugal · {levelTxt}</Text>
        </View>
        <View style={ss.headerRight}>
          {loadedCount < totalCount && (
            <View style={[ss.loadingPill, { backgroundColor: colors.cardLight }]}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={[ss.loadingTxt, { color: colors.white40 }]}>{loadedCount}/{totalCount}</Text>
            </View>
          )}
          <TouchableOpacity style={[ss.headerBtn, { backgroundColor: colors.cardLight }]} onPress={() => navigation.navigate('Map', { forecasts })} activeOpacity={0.7}>
            <Ionicons name="map-outline" size={20} color={colors.white70} />
          </TouchableOpacity>
          <TouchableOpacity style={[ss.headerBtn, { backgroundColor: colors.cardLight }]} onPress={() => navigation.navigate('Profile')} activeOpacity={0.7}>
            <Ionicons name="settings-outline" size={20} color={colors.white70} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Region filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={ss.filterRow} contentContainerStyle={ss.filterContent}>
        {ALL_REGIONS.map(r => {
          const active = regionFilter === r;
          return (
            <TouchableOpacity
              key={r}
              style={[ss.filterChip, { backgroundColor: active ? colors.accentDim : colors.cardLight, borderColor: active ? colors.accent : 'transparent' }]}
              onPress={() => setRegionFilter(r)}
              activeOpacity={0.7}
            >
              <Text style={[ss.filterTxt, { color: active ? colors.accent : colors.white40 }]}>{r}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Last update + failed count */}
      <View style={ss.metaRow}>
        {lastUpdate && (
          <Text style={[ss.metaTxt, { color: colors.white40 }]}>Mis à jour {fmtElapsed(lastUpdate)}</Text>
        )}
        {failedCount > 0 && (
          <Text style={[ss.metaTxt, { color: colors.orange }]}>{failedCount} spot{failedCount > 1 ? 's' : ''} indisponible{failedCount > 1 ? 's' : ''}</Text>
        )}
      </View>

      {/* HERO — Aujourd'hui */}
      {bestToday ? (
        <TouchableOpacity
          style={[ss.hero, { backgroundColor: colors.card, borderColor: `${colors.accent}25` }]}
          activeOpacity={0.8}
          onPress={() => navigateToPick(bestToday)}
        >
          <Text style={[ss.heroQ, { color: colors.white }]}>Où surfer aujourd'hui ?</Text>
          <View style={ss.heroMain}>
            <View style={ss.heroLeft}>
              <Text style={ss.heroEmoji}>{scoreEmoji(bestToday.cond.score)}</Text>
              <ScoreBadge score={bestToday.cond.score} size="hero" />
            </View>
            <View style={ss.heroRight}>
              <Text style={[ss.heroSpot, { color: colors.white }]}>{bestToday.spotName}</Text>
              <Text style={[ss.heroRange, { color: colors.white70 }]}>{bestToday.timeRange}</Text>
              <Text style={[ss.heroLabel, { color: scoreColor(bestToday.cond.score) }]}>
                {scoreLabel(bestToday.cond.score)}
              </Text>
            </View>
          </View>
          <View style={[ss.heroBar, { backgroundColor: colors.white08 }]}>
            <MiniStat icon="🌊" value={`${bestToday.cond.swellHeight.toFixed(1)}m`} sub="houle" colors={colors} />
            <View style={[ss.heroDiv, { backgroundColor: colors.white15 }]} />
            <MiniStat icon="⏱" value={`${bestToday.cond.swellPeriod.toFixed(0)}s`} sub="période" colors={colors} />
            <View style={[ss.heroDiv, { backgroundColor: colors.white15 }]} />
            <MiniStat icon="💨" value={windLabel(bestToday.cond.windSpeed, bestToday.cond.windDirection, bestToday.beachOrientation)} sub={`${bestToday.cond.windSpeed.toFixed(0)} km/h`} colors={colors} />
            <View style={[ss.heroDiv, { backgroundColor: colors.white15 }]} />
            <MiniStat icon="🧭" value={dirLabel(bestToday.cond.swellDirection)} sub="houle dir." colors={colors} />
          </View>
        </TouchableOpacity>
      ) : (
        <View style={[ss.emptyHero, { backgroundColor: colors.card }]}>
          <Text style={ss.emptyEmoji}>🏖️</Text>
          <Text style={[ss.emptyTitle, { color: colors.white }]}>Pas de bonnes conditions aujourd'hui</Text>
          <Text style={[ss.emptySubtitle, { color: colors.white40 }]}>
            {bestWeek.length > 0
              ? `Prochain bon créneau : ${bestWeek[0].dayLabel} à ${bestWeek[0].spotName}`
              : 'Aucun bon créneau cette semaine'}
          </Text>
        </View>
      )}

      {/* Top 5 jours */}
      {bestWeek.length > 0 && (
        <View style={ss.weekSection}>
          <Text style={[ss.weekTitle, { color: colors.white }]}>Meilleurs créneaux cette semaine</Text>
          {bestWeek.map((pick, idx) => (
            <TouchableOpacity
              key={`${pick.spotId}-${pick.cond.time}`}
              style={[ss.weekCard, { backgroundColor: colors.card }, idx === 0 && { borderColor: scoreColor(pick.cond.score), borderWidth: 1 }]}
              activeOpacity={0.7}
              onPress={() => navigateToPick(pick)}
            >
              <View style={ss.weekLeft}>
                <View style={[ss.weekRank, { backgroundColor: idx === 0 ? scoreBg(pick.cond.score) : colors.white08 }]}>
                  <Text style={[ss.weekRankTxt, { color: idx === 0 ? scoreColor(pick.cond.score) : colors.white40 }]}>#{idx + 1}</Text>
                </View>
                <View style={ss.weekInfo}>
                  <Text style={[ss.weekDay, { color: colors.white }]}>{pick.dayLabel}</Text>
                  <Text style={[ss.weekSpot, { color: colors.white70 }]}>{pick.spotName} · {pick.timeRange}</Text>
                  <View style={ss.weekStats}>
                    <Text style={[ss.weekStat, { color: colors.white40 }]}>🌊 {pick.cond.swellHeight.toFixed(1)}m</Text>
                    <Text style={[ss.weekStat, { color: colors.white40 }]}>⏱ {pick.cond.swellPeriod.toFixed(0)}s</Text>
                    <Text style={[ss.weekStat, { color: colors.white40 }]}>💨 {pick.cond.windSpeed.toFixed(0)} km/h</Text>
                  </View>
                </View>
              </View>
              <View style={ss.weekRight}>
                <ScoreBadge score={pick.cond.score} size="md" />
                <Text style={[ss.weekLabel, { color: scoreColor(pick.cond.score) }]}>{scoreShort(pick.cond.score)}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Spots par région */}
      {regions.map(([region, regionForecasts]) => (
        <View key={region}>
          <Text style={[ss.secTitle, { color: colors.white }]}>{region}</Text>
          {regionForecasts.map((f) => {
            const cc = f.currentCondition;
            const wl = cc ? windLabel(cc.windSpeed, cc.windDirection, f.spot.beachOrientation) : '';
            const isOnshore = wl === 'Onshore' || wl === 'Cross-on';
            const isFav = favs.includes(f.spot.id);
            return (
              <TouchableOpacity
                key={f.spot.id}
                style={[ss.spot, { backgroundColor: colors.card }]}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('SpotDetail', { forecast: f })}
              >
                <View style={ss.spotHead}>
                  <ScoreBadge score={f.currentScore} size="lg" />
                  <View style={ss.spotInfo}>
                    <View style={ss.spotNameRow}>
                      <Text style={[ss.spotName, { color: colors.white }]}>{f.spot.name}</Text>
                      {isFav && <Text style={ss.favStar}>★</Text>}
                    </View>
                    <Text style={[ss.spotLabel, { color: scoreColor(f.currentScore) }]}>
                      {scoreEmoji(f.currentScore)} {scoreLabel(f.currentScore)}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => handleToggleFav(f.spot.id)} style={ss.favBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name={isFav ? 'star' : 'star-outline'} size={22} color={isFav ? colors.yellow : colors.white40} />
                  </TouchableOpacity>
                </View>

                {cc && (
                  <View style={ss.spotBar}>
                    <Text style={[ss.spotStat, { color: colors.white70 }]}>🌊 {cc.swellHeight.toFixed(1)}m</Text>
                    <Text style={[ss.spotDot, { color: colors.white15 }]}>·</Text>
                    <Text style={[ss.spotStat, { color: colors.white70 }]}>{cc.swellPeriod.toFixed(0)}s</Text>
                    <Text style={[ss.spotDot, { color: colors.white15 }]}>·</Text>
                    <Text style={[ss.spotStat, isOnshore && { color: colors.red }]}>💨 {wl} {cc.windSpeed.toFixed(0)}</Text>
                    {cc.windGusts > 20 && (
                      <>
                        <Text style={[ss.spotDot, { color: colors.white15 }]}>·</Text>
                        <Text style={[ss.spotStat, { color: colors.orange }]}>💥 {cc.windGusts.toFixed(0)}</Text>
                      </>
                    )}
                  </View>
                )}

                <View style={[ss.spotBest, { backgroundColor: scoreBg(f.bestTime.score) }]}>
                  <Text style={[ss.spotBestTxt, { color: scoreColor(f.bestTime.score) }]}>
                    ⏰ {f.bestTime.label} — {scoreShort(f.bestTime.score)} ({f.bestTime.score.toFixed(1)})
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

function MiniStat({ icon, value, sub, colors }: { icon: string; value: string; sub: string; colors: any }) {
  return (
    <View style={ss.ms}>
      <Text style={ss.msIcon}>{icon}</Text>
      <Text style={[ss.msVal, { color: colors.white }]}>{value}</Text>
      <Text style={[ss.msSub, { color: colors.white40 }]}>{sub}</Text>
    </View>
  );
}

const ss = StyleSheet.create({
  loadWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadTxt: { marginTop: 14, fontSize: 14, fontWeight: '500' },
  errTxt: { fontSize: 15, textAlign: 'center', paddingHorizontal: 30 },
  retryBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  retryTxt: { fontWeight: '700', fontSize: 14 },

  header: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  headerLeft: { flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerBtn: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  logo: { fontSize: 30, fontWeight: '900', letterSpacing: -1 },
  subtitle: { fontSize: 12, marginTop: 3 },
  loadingPill: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, gap: 6 },
  loadingTxt: { fontSize: 11, fontWeight: '600' },

  filterRow: { marginTop: 10, maxHeight: 44 },
  filterContent: { paddingHorizontal: 16, gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  filterTxt: { fontSize: 13, fontWeight: '700' },

  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 8 },
  metaTxt: { fontSize: 11, fontWeight: '500' },

  emptyHero: { margin: 16, marginBottom: 10, borderRadius: 22, padding: 28, alignItems: 'center' },
  emptyEmoji: { fontSize: 32, marginBottom: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  emptySubtitle: { fontSize: 13, marginTop: 6, textAlign: 'center' },

  hero: { margin: 16, marginBottom: 10, borderRadius: 22, padding: 20, borderWidth: 1 },
  heroQ: { fontSize: 19, fontWeight: '800', marginBottom: 16 },
  heroMain: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  heroLeft: { alignItems: 'center', marginRight: 18 },
  heroEmoji: { fontSize: 24, marginBottom: 8 },
  heroRight: { flex: 1 },
  heroSpot: { fontSize: 24, fontWeight: '800' },
  heroRange: { fontSize: 32, fontWeight: '200', marginTop: 4 },
  heroLabel: { fontSize: 14, fontWeight: '700', marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  heroBar: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingVertical: 14 },
  heroDiv: { width: 1, height: 32 },
  ms: { flex: 1, alignItems: 'center' },
  msIcon: { fontSize: 14, marginBottom: 4 },
  msVal: { fontSize: 14, fontWeight: '800' },
  msSub: { fontSize: 10, marginTop: 2, textTransform: 'uppercase' },

  weekSection: { marginHorizontal: 16, marginBottom: 6 },
  weekTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  weekCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8 },
  weekLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  weekRank: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  weekRankTxt: { fontSize: 12, fontWeight: '800' },
  weekInfo: { flex: 1 },
  weekDay: { fontSize: 15, fontWeight: '700' },
  weekSpot: { fontSize: 12, marginTop: 2 },
  weekStats: { flexDirection: 'row', gap: 10, marginTop: 4 },
  weekStat: { fontSize: 11, fontWeight: '500' },
  weekRight: { alignItems: 'center', marginLeft: 10 },
  weekLabel: { fontSize: 10, fontWeight: '700', marginTop: 4, textTransform: 'uppercase' },

  secTitle: { fontSize: 20, fontWeight: '800', marginLeft: 20, marginTop: 22, marginBottom: 10 },

  spot: { marginHorizontal: 16, marginBottom: 10, borderRadius: 16, padding: 16 },
  spotHead: { flexDirection: 'row', alignItems: 'center' },
  spotInfo: { flex: 1, marginLeft: 14 },
  spotNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  spotName: { fontSize: 17, fontWeight: '800' },
  favStar: { color: '#FFD060', fontSize: 14 },
  spotLabel: { fontSize: 13, fontWeight: '600', marginTop: 3 },
  favBtn: { padding: 4 },
  spotBar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 12, paddingLeft: 4, gap: 2 },
  spotStat: { fontSize: 12, fontWeight: '500' },
  spotDot: { fontSize: 12, marginHorizontal: 4 },
  spotBest: { marginTop: 10, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12 },
  spotBestTxt: { fontSize: 12, fontWeight: '600' },
});
