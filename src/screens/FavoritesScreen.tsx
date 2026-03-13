import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, ThemePalette } from '../context/ThemeContext';
import { useProfile } from '../context/ProfileContext';
import { useLocation } from '../context/LocationContext';
import { getFavorites, toggleFavorite } from '../services/favorites';
import { fetchSpotData } from '../services/api';
import { computeSpotForecast } from '../utils/scoring';
import { haversineDistance, formatDistance } from '../services/location';
import { setStoredForecasts, getStoredForecasts } from '../context/ForecastStore';
import { useToast } from '../components/Toast';
import EmptyState from '../components/EmptyState';
import ScoreBadge from '../components/ScoreBadge';
import SPOTS from '../data/spots';
import { SpotConfig, SpotForecast } from '../types';
import { Ionicons } from '@expo/vector-icons';
import { scoreColor, scoreBg, scoreLabel, scoreEmoji, scoreShort, windLabel, weatherIcon } from '../theme';
import { LEVEL_BADGE } from '../utils/constants';
import * as Haptics from 'expo-haptics';

export default function FavoritesScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { profile } = useProfile();
  const { location } = useLocation();
  const { show: showToast } = useToast();
  const insets = useSafeAreaInsets();

  const [favIds, setFavIds] = useState<string[]>([]);
  const [forecasts, setForecasts] = useState<SpotForecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const distanceMap = useMemo(() => {
    if (!location) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const spot of SPOTS) {
      map.set(spot.id, haversineDistance(location.latitude, location.longitude, spot.latitude, spot.longitude));
    }
    return map;
  }, [location]);

  const loadFavorites = useCallback(async (force = false) => {
    const ids = await getFavorites();
    setFavIds(ids);
    if (ids.length === 0) { setLoading(false); setForecasts([]); return; }

    const stored = getStoredForecasts();
    const storedMap = new Map(stored.map(f => [f.spot.id, f]));
    const results: SpotForecast[] = [];
    const toLoad: SpotConfig[] = [];

    for (const id of ids) {
      const existing = storedMap.get(id);
      if (existing && !force) { results.push(existing); }
      else {
        const spot = SPOTS.find(s => s.id === id);
        if (spot) toLoad.push(spot);
      }
    }

    if (toLoad.length > 0) {
      const BATCH = 3;
      for (let i = 0; i < toLoad.length; i += BATCH) {
        const batch = toLoad.slice(i, i + BATCH);
        const settled = await Promise.allSettled(
          batch.map(async (spot) => {
            const { marine, weather } = await fetchSpotData(spot.latitude, spot.longitude);
            return computeSpotForecast(spot, marine, weather, profile);
          })
        );
        for (const res of settled) {
          if (res.status === 'fulfilled') results.push(res.value);
        }
      }
    }

    setForecasts(results.sort((a, b) => b.currentScore - a.currentScore));
    setLoading(false);
  }, [profile]);

  useEffect(() => { loadFavorites(); }, [loadFavorites]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFavorites(true);
    setRefreshing(false);
  }, [loadFavorites]);

  const handleRemoveFav = useCallback(async (spotId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const next = await toggleFavorite(spotId);
    setFavIds(next);
    setForecasts(prev => prev.filter(f => f.spot.id !== spotId));
    showToast('Retiré des favoris', 'info');
  }, [showToast]);

  const navigateToSpot = useCallback((forecast: SpotForecast) => {
    setStoredForecasts(forecasts);
    const idx = forecasts.findIndex(f => f.spot.id === forecast.spot.id);
    navigation.navigate('SpotDetail', { forecast, spotIndex: idx >= 0 ? idx : 0 });
  }, [navigation, forecasts]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
    >
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <Text style={[s.title, { color: colors.white }]}>Favoris</Text>
        <Text style={[s.sub, { color: colors.white40 }]}>{favIds.length} spot{favIds.length !== 1 ? 's' : ''} sauvegardé{favIds.length !== 1 ? 's' : ''}</Text>
      </View>

      {loading && (
        <View style={s.loadWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      )}

      {!loading && favIds.length === 0 && (
        <EmptyState
          emoji="⭐"
          title="Pas encore de favoris"
          subtitle="Ajoute des spots en favoris depuis l'accueil pour les retrouver ici"
        />
      )}

      {forecasts.map((f) => {
        const cc = f.currentCondition;
        const wl = cc ? windLabel(cc.windSpeed, cc.windDirection, f.spot.beachOrientation) : '';
        const badge = LEVEL_BADGE[f.spot.recommendedLevel];
        const dist = distanceMap.get(f.spot.id);
        return (
          <TouchableOpacity
            key={f.spot.id}
            style={[s.card, { backgroundColor: colors.card }]}
            activeOpacity={0.7}
            onPress={() => navigateToSpot(f)}
            accessibilityLabel={`${f.spot.name}, score ${f.currentScore.toFixed(1)}`}
            accessibilityRole="button"
          >
            <View style={s.cardHead}>
              <ScoreBadge score={f.currentScore} size="lg" />
              <View style={s.cardInfo}>
                <Text style={[s.cardName, { color: colors.white }]} numberOfLines={1}>{f.spot.name}</Text>
                <Text style={[s.cardLabel, { color: scoreColor(f.currentScore) }]}>
                  {scoreEmoji(f.currentScore)} {scoreLabel(f.currentScore)}
                </Text>
                <View style={s.cardMeta}>
                  {badge && (
                    <View style={[s.levelBadge, { backgroundColor: badge.bg }]}>
                      <Text style={[s.levelTxt, { color: badge.color }]}>{badge.label}</Text>
                    </View>
                  )}
                  <Text style={[s.cardCountry, { color: colors.white40 }]}>{f.spot.country}</Text>
                  {dist != null && <Text style={[s.cardDist, { color: colors.accent }]}>📍 {formatDistance(dist)}</Text>}
                </View>
              </View>
              <TouchableOpacity onPress={() => handleRemoveFav(f.spot.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Retirer des favoris" accessibilityRole="button">
                <Ionicons name="star" size={22} color={colors.yellow} />
              </TouchableOpacity>
            </View>
            {cc && (
              <View style={s.cardBar}>
                <Text style={[s.stat, { color: colors.white70 }]}>{weatherIcon(cc.weatherCode)}</Text>
                <Text style={[s.dot, { color: colors.white15 }]}>·</Text>
                <Text style={[s.stat, { color: colors.white70 }]}>🌊 {cc.swellHeight.toFixed(1)}m</Text>
                <Text style={[s.dot, { color: colors.white15 }]}>·</Text>
                <Text style={[s.stat, { color: colors.white70 }]}>{cc.swellPeriod.toFixed(0)}s</Text>
                <Text style={[s.dot, { color: colors.white15 }]}>·</Text>
                <Text style={[s.stat, { color: colors.white70 }]}>💨 {wl} {cc.windSpeed.toFixed(0)}</Text>
              </View>
            )}
            <View style={[s.bestRow, { backgroundColor: scoreBg(f.bestTime.score) }]}>
              <Text style={[s.bestTxt, { color: scoreColor(f.bestTime.score) }]}>
                ⏰ {f.bestTime.label} — {scoreShort(f.bestTime.score)} ({f.bestTime.score.toFixed(1)})
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 10 },
  title: { fontSize: 28, fontWeight: '900' },
  sub: { fontSize: 12, marginTop: 3 },
  loadWrap: { paddingVertical: 60, alignItems: 'center' },
  card: { marginHorizontal: 16, marginBottom: 10, borderRadius: 16, padding: 16 },
  cardHead: { flexDirection: 'row', alignItems: 'center' },
  cardInfo: { flex: 1, marginLeft: 14 },
  cardName: { fontSize: 17, fontWeight: '800', flexShrink: 1 },
  cardLabel: { fontSize: 13, fontWeight: '600', marginTop: 3 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  levelBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  levelTxt: { fontSize: 9, fontWeight: '700' },
  cardCountry: { fontSize: 11, fontWeight: '500' },
  cardDist: { fontSize: 11, fontWeight: '600' },
  cardBar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 12, paddingLeft: 4, gap: 2 },
  stat: { fontSize: 12, fontWeight: '500' },
  dot: { fontSize: 12, marginHorizontal: 4 },
  bestRow: { marginTop: 10, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12 },
  bestTxt: { fontSize: 12, fontWeight: '600' },
});
