import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, ActivityIndicator, TouchableOpacity, ListRenderItemInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useProfile } from '../context/ProfileContext';
import { useLocation } from '../context/LocationContext';
import { getFavorites, toggleFavorite } from '../services/favorites';
import { fetchSpotData } from '../services/api';
import { computeSpotForecast, RIDABLE_SCORE, bestTimeLabel } from '../utils/scoring';
import { countryLabel } from '../utils/countries';
import { haversineDistance, formatDistance } from '../services/location';
import { setStoredForecasts, getStoredForecasts } from '../context/ForecastStore';
import { useToast } from '../components/Toast';
import EmptyState from '../components/EmptyState';
import ScoreBadge from '../components/ScoreBadge';
import SPOTS from '../data/spots';
import { SpotConfig, SpotForecast } from '../types';
import { FavoritesScreenProps } from '../navigation/types';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { scoreColor, scoreBg, scoreLabel, scoreShort, windLabel } from '../theme';
import { scoreIcon, weatherMCIcon, ICONS } from '../utils/icons';
import { hapticLight, hapticMedium } from '../utils/haptics';
import { useI18n } from '../i18n';
import { spacing, radius, typography, touchTarget, elevation } from '../utils/tokens';
import PressableScale from '../components/PressableScale';
import { useWebLayout, webCenter, WEB_CONTENT_MAX, isWebPlatform, webTabBarClearance } from '../utils/webLayout';

type SortFav = 'score' | 'distance' | 'name';

export default function FavoritesScreen({ navigation }: FavoritesScreenProps) {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const { profile } = useProfile();
  const { location } = useLocation();
  const { show: showToast } = useToast();
  const insets = useSafeAreaInsets();
  const { isWide, columns } = useWebLayout();

  const [favIds, setFavIds] = useState<string[]>([]);
  const [forecasts, setForecasts] = useState<SpotForecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<SortFav>('score');
  // Monotonic token so an older overlapping load (profile/locale/refresh change)
  // can't overwrite fresher favorites data.
  const loadGen = useRef(0);

  const distanceMap = useMemo(() => {
    if (!location) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const spot of SPOTS) {
      map.set(spot.id, haversineDistance(location.latitude, location.longitude, spot.latitude, spot.longitude));
    }
    return map;
  }, [location]);

  const loadFavorites = useCallback(async (force = false) => {
    const gen = ++loadGen.current;
    const isCurrent = () => gen === loadGen.current;
    const ids = await getFavorites();
    if (!isCurrent()) return;
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
            const { marine, weather } = await fetchSpotData(spot.latitude, spot.longitude, { daily: false });
            return computeSpotForecast(spot, marine, weather, profile, locale);
          })
        );
        // A newer load started while we awaited this batch: abandon this run.
        if (!isCurrent()) return;
        let failCount = 0;
        for (const res of settled) {
          if (res.status === 'fulfilled') results.push(res.value);
          else failCount++;
        }
        if (failCount > 0) {
          showToast(t.favLoadFail(failCount), 'error');
        }
        // Show results progressively as each batch lands (no long blank wait).
        setForecasts([...results].sort((a, b) => b.currentScore - a.currentScore));
      }
    }

    if (!isCurrent()) return;
    setForecasts(results.sort((a, b) => b.currentScore - a.currentScore));
    setLoading(false);
  }, [profile, showToast, t, locale]);

  // First mount uses the cached forecasts (fast); afterwards loadFavorites'
  // identity only changes when profile/locale change, so we force a recompute
  // to refresh scores & localized labels instead of serving stale cache.
  const firstFavLoad = useRef(true);
  useEffect(() => {
    loadFavorites(!firstFavLoad.current);
    firstFavLoad.current = false;
  }, [loadFavorites]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFavorites(true);
    setRefreshing(false);
  }, [loadFavorites]);

  const sortedForecasts = useMemo(() => {
    const list = [...forecasts];
    if (sortBy === 'score') return list.sort((a, b) => b.currentScore - a.currentScore);
    if (sortBy === 'distance') {
      return list.sort((a, b) => {
        const da = distanceMap.get(a.spot.id) ?? Infinity;
        const db = distanceMap.get(b.spot.id) ?? Infinity;
        return da - db;
      });
    }
    return list.sort((a, b) => a.spot.name.localeCompare(b.spot.name));
  }, [forecasts, sortBy, distanceMap]);

  const handleRemoveFav = useCallback(async (spotId: string) => {
    hapticMedium();
    const removedForecast = forecasts.find(f => f.spot.id === spotId);
    const next = await toggleFavorite(spotId);
    setFavIds(next);
    setForecasts(prev => prev.filter(f => f.spot.id !== spotId));
    showToast(t.favRemovedUndo, 'info', {
      action: {
        label: t.undo,
        onPress: async () => {
          const restored = await toggleFavorite(spotId);
          setFavIds(restored);
          if (removedForecast) setForecasts(prev => [...prev, removedForecast].sort((a, b) => b.currentScore - a.currentScore));
        },
      },
    });
  }, [forecasts, showToast, t]);

  const navigateToSpot = useCallback((forecast: SpotForecast) => {
    hapticLight();
    setStoredForecasts(sortedForecasts);
    navigation.navigate('SpotDetail', { forecast });
  }, [navigation, sortedForecasts]);

  const renderItem = useCallback(({ item: f }: ListRenderItemInfo<SpotForecast>) => {
    const cc = f.currentCondition;
    const wl = cc ? windLabel(cc.windSpeed, cc.windDirection, f.spot.beachOrientation) : '';
    const dist = distanceMap.get(f.spot.id);
    return (
      <PressableScale
        style={[s.card, isWide && columns > 1 && s.cardGrid, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => navigateToSpot(f)}
        accessibilityLabel={`${f.spot.name}, score ${f.currentScore.toFixed(1)}`}
        accessibilityRole="button"
      >
        <View style={s.cardHead}>
          <ScoreBadge score={f.currentScore} size="lg" />
          <View style={s.cardInfo}>
            <Text style={[s.cardName, { color: colors.white }]} numberOfLines={1}>{f.spot.name}</Text>
            <Text style={[s.cardLabel, { color: scoreColor(f.currentScore) }]}>
              <MaterialCommunityIcons name={scoreIcon(f.currentScore)} size={13} color={scoreColor(f.currentScore)} /> {scoreLabel(f.currentScore, t)}
            </Text>
            <View style={s.cardMeta}>
              <Text style={[s.cardCountry, { color: colors.textMuted }]}>{countryLabel(f.spot.country, locale)}</Text>
              {dist != null && <Text style={[s.cardDist, { color: colors.accent }]}><MaterialCommunityIcons name={ICONS.location} size={11} color={colors.accent} /> {formatDistance(dist)}</Text>}
            </View>
          </View>
          <TouchableOpacity
            onPress={() => handleRemoveFav(f.spot.id)}
            style={s.starBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel={t.spotsRemovedFav}
            accessibilityRole="button"
          >
            <Ionicons name="star" size={24} color={colors.yellow} />
          </TouchableOpacity>
        </View>
        {cc && (
          <View style={s.cardBar}>
            <MaterialCommunityIcons name={weatherMCIcon(cc.weatherCode)} size={13} color={colors.textSecondary} />
            <Text style={[s.dot, { color: colors.border }]}>·</Text>
            <Text style={[s.stat, { color: colors.textSecondary }]}><MaterialCommunityIcons name={ICONS.swell} size={12} color={colors.textSecondary} /> {cc.swellHeight.toFixed(1)}m</Text>
            <Text style={[s.dot, { color: colors.border }]}>·</Text>
            <Text style={[s.stat, { color: colors.textSecondary }]}>{cc.swellPeriod.toFixed(0)}s</Text>
            <Text style={[s.dot, { color: colors.border }]}>·</Text>
            <Text style={[s.stat, { color: colors.textSecondary }]}><MaterialCommunityIcons name={ICONS.wind} size={12} color={colors.textSecondary} /> {wl} {cc.windSpeed.toFixed(0)}</Text>
          </View>
        )}
        {f.bestTime.score >= RIDABLE_SCORE ? (
          <View style={[s.bestRow, { backgroundColor: scoreBg(f.bestTime.score) }]}>
            <Text style={[s.bestTxt, { color: scoreColor(f.bestTime.score) }]}>
              <MaterialCommunityIcons name={ICONS.bestTime} size={12} color={scoreColor(f.bestTime.score)} /> {bestTimeLabel(f, locale)} — {scoreShort(f.bestTime.score, t)} ({f.bestTime.score.toFixed(1)})
            </Text>
          </View>
        ) : (
          <View style={[s.bestRow, { backgroundColor: colors.cardLight }]}>
            <Text style={[s.bestTxt, { color: colors.textMuted }]}>
              <MaterialCommunityIcons name={ICONS.flat} size={12} color={colors.textMuted} /> {t.spotsNoGoodWindow}
            </Text>
          </View>
        )}
      </PressableScale>
    );
  }, [colors, distanceMap, handleRemoveFav, navigateToSpot, t, locale, isWide, columns]);

  const keyExtractor = useCallback((f: SpotForecast) => f.spot.id, []);

  return (
    <FlatList
      key={isWide ? `grid-${columns}` : 'list'}
      style={[{ flex: 1, backgroundColor: colors.bg }, webCenter(WEB_CONTENT_MAX, isWide)]}
      data={sortedForecasts}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      numColumns={isWide ? columns : 1}
      columnWrapperStyle={isWide && columns > 1 ? { gap: spacing.md, paddingHorizontal: spacing.lg } : undefined}
      contentContainerStyle={{ paddingBottom: isWebPlatform ? webTabBarClearance(insets.bottom) : 100 }}
      showsVerticalScrollIndicator={false}
      initialNumToRender={6}
      maxToRenderPerBatch={4}
      windowSize={7}
      removeClippedSubviews={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
      ListHeaderComponent={
        <View>
          <View style={[s.header, { paddingTop: insets.top + spacing.md }]}>
            <Text style={[s.title, { color: colors.white }]} accessibilityRole="header">{t.favTitle}</Text>
            <Text style={[s.sub, { color: colors.textMuted }]}>{t.favCount(favIds.length)}</Text>
          </View>

          {loading && (
            <View style={s.loadWrap}>
              <ActivityIndicator size="large" color={colors.accent} />
            </View>
          )}

          {!loading && favIds.length > 0 && (
            <View style={[s.sortRow, { borderBottomColor: colors.border }]}>
              <Text style={[s.sortLabel, { color: colors.textMuted }]}>{t.favSortBy}</Text>
              <View style={s.sortBtns}>
                {(['score', 'distance', 'name'] as const).map((key) => {
                  const label = key === 'score' ? t.favSortScore : key === 'distance' ? t.favSortDistance : t.favSortName;
                  const active = sortBy === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[s.sortBtn, { backgroundColor: active ? colors.accentDim : 'transparent' }]}
                      onPress={() => {
                        hapticLight();
                        setSortBy(key);
                      }}
                      accessibilityLabel={label}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    >
                      <Text style={[s.sortBtnTxt, { color: active ? colors.accent : colors.textMuted }]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </View>
      }
      ListEmptyComponent={
        !loading && favIds.length === 0 ? (
          <EmptyState
            icon="star"
            title={t.favEmpty}
            subtitle={t.favEmptySub}
            actionLabel={t.favEmptyAction}
            onAction={() => navigation.navigate('MapTab', undefined)}
          />
        ) : null
      }
    />
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  title: { ...typography.display },
  sub: { ...typography.caption, marginTop: 3 },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    marginBottom: spacing.md,
  },
  sortLabel: { ...typography.caption, marginRight: spacing.md },
  sortBtns: { flexDirection: 'row', gap: spacing.sm },
  sortBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    minHeight: 36,
    justifyContent: 'center',
  },
  sortBtnTxt: { ...typography.caption, fontWeight: '700' },
  loadWrap: { paddingVertical: 60, alignItems: 'center' },
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    ...elevation.sm,
  },
  cardGrid: { flex: 1, marginHorizontal: 0 },
  cardHead: { flexDirection: 'row', alignItems: 'center' },
  cardInfo: { flex: 1, marginLeft: spacing.md },
  cardName: { ...typography.h2, fontSize: 17, flexShrink: 1 },
  cardLabel: { ...typography.caption, fontSize: 13, marginTop: 3 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  cardCountry: { ...typography.micro, fontWeight: '500' },
  cardDist: { ...typography.micro },
  starBtn: {
    width: touchTarget.min,
    height: touchTarget.min,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: spacing.md,
    paddingLeft: spacing.xs,
    gap: 2,
  },
  stat: { ...typography.caption, fontWeight: '500' },
  dot: { fontSize: 12, marginHorizontal: spacing.xs },
  bestRow: {
    marginTop: spacing.md,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm - 1,
    paddingHorizontal: spacing.md,
  },
  bestTxt: { ...typography.caption, fontWeight: '600' },
});
