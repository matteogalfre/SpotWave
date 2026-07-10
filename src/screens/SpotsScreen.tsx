import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import {
  View,
  Text,
  ScrollView,
  SectionList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  AccessibilityInfo,
  ListRenderItemInfo,
} from 'react-native';
import { useProfile } from '../context/ProfileContext';
import { useTheme } from '../context/ThemeContext';
import { useLocation } from '../context/LocationContext';
import { useNetwork } from '../context/NetworkContext';
import { fetchSpotData } from '../services/api';
import { computeSpotForecast, RIDABLE_SCORE, bestTimeLabel } from '../utils/scoring';
import { getFavorites, toggleFavorite } from '../services/favorites';
import { getNearbySpotsWithFallback, getGlobalShowcase, haversineDistance, formatDistance } from '../services/location';
import { setStoredForecasts } from '../context/ForecastStore';
import SPOTS from '../data/spots';
import ScoreBadge from '../components/ScoreBadge';
import SkeletonCard from '../components/SkeletonCard';
import PressableScale from '../components/PressableScale';
import Logo from '../components/Logo';
import { SpotConfig, SpotForecast, HourlyCondition, SurferLevel, BreakType } from '../types';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { scoreColor, scoreBg, scoreLabel, scoreShort, windLabel, windConditionKey, isDaytime } from '../theme';
import { scoreIcon, weatherMCIcon, ICONS, MCIName } from '../utils/icons';
import { SurferProfile } from '../types';
import { SpotsScreenProps } from '../navigation/types';
import { hapticLight, hapticMedium } from '../utils/haptics';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import { scheduleGoodConditionAlerts } from '../services/notifications';
import { getLevelBadge, getLevelLabel, fmtDayLabel, fmtRange } from '../utils/constants';
import { countryLabel } from '../utils/countries';
import { spacing, radius, typography, touchTarget, elevation } from '../utils/tokens';
import { getConfidenceForDate, confidenceColor, confidenceLabel } from '../utils/confidence';
import { useWebLayout, webCenter, chunk, WEB_CONTENT_MAX, WEB_HOME_MAX, isWebPlatform, webTabBarClearance } from '../utils/webLayout';

interface BestPick {
  spotName: string;
  spotId: string;
  forecast: SpotForecast;
  cond: HourlyCondition;
  beachOrientation: number;
  dayLabel: string;
  timeRange: string;
}

// Spot-local "now"/"today" keys derived from the forecast's UTC offset, so that
// "today's recommendation" follows the SPOT's calendar — not the device's. For a
// surfer in France looking at Hawaii this is the difference between "rien
// aujourd'hui" and the right answer.
function localKeys(f: SpotForecast): { nowKey: string; todayStr: string } {
  const offset = f.utcOffsetSeconds;
  const d = typeof offset === 'number' ? new Date(Date.now() + offset * 1000) : new Date();
  const get = typeof offset === 'number'
    ? { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, day: d.getUTCDate(), h: d.getUTCHours() }
    : { y: d.getFullYear(), m: d.getMonth() + 1, day: d.getDate(), h: d.getHours() };
  const dateStr = `${get.y}-${String(get.m).padStart(2, '0')}-${String(get.day).padStart(2, '0')}`;
  return { nowKey: `${dateStr}T${String(get.h).padStart(2, '0')}`, todayStr: dateStr };
}

function findBestPicks(
  forecasts: SpotForecast[],
  profile: SurferProfile,
  locale: string = 'fr',
): { bestToday: BestPick | null; bestWeek: BestPick[]; nightNow: boolean; outsideHoursNow: boolean } {
  const now = new Date();
  const { sessionDuration, availableFrom, availableTo } = profile;

  let bestToday: BestPick | null = null;
  const dayBest: Record<string, BestPick> = {};

  for (const f of forecasts) {
    const { nowKey, todayStr } = localKeys(f);
    for (const c of f.hourlyConditions) {
      if (c.time.slice(0, 13) < nowKey) continue;
      if (!isDaytime(c.time, availableFrom, availableTo)) continue;
      const dateKey = c.time.slice(0, 10);
      const isToday = dateKey === todayStr;
      const pick: BestPick = {
        spotName: f.spot.name, spotId: f.spot.id, forecast: f, cond: c,
        beachOrientation: f.spot.beachOrientation,
        dayLabel: fmtDayLabel(c.time, now, undefined, locale),
        timeRange: fmtRange(c.time, sessionDuration, availableTo),
      };
      if (isToday && (!bestToday || c.score > bestToday.cond.score)) bestToday = pick;
      if (!dayBest[dateKey] || c.score > dayBest[dateKey].cond.score) dayBest[dateKey] = pick;
    }
  }

  // "Night now" if every loaded spot is currently in its local night. With
  // nearby spots (same timezone) this is unanimous; for the global showcase we
  // require all of them so we don't wrongly claim night.
  const nightNow = forecasts.length > 0 && forecasts.every(f => f.isNightNow);

  // "Outside hours" = it's daytime (not night) but the spot-local time is past /
  // before the surfer's available window (e.g. window 8–19h and it's 20h). We
  // don't want to claim "no good conditions" — the day just isn't over.
  const localHours = forecasts.map(f => parseInt(localKeys(f).nowKey.slice(-2), 10));
  const allOutsideWindow = forecasts.length > 0
    && localHours.every(h => h < availableFrom || h >= availableTo);
  const outsideHoursNow = allOutsideWindow && !nightNow;

  return {
    bestToday,
    bestWeek: Object.values(dayBest).sort((a, b) => a.cond.time.localeCompare(b.cond.time)).slice(0, 5),
    nightNow,
    outsideHoursNow,
  };
}

type Mode = 'today' | 'all';
type LevelFilter = 'all' | SurferLevel;
type BreakFilter = 'all' | BreakType;
type MinScoreFilter = 0 | 4 | 6;

export default function SpotsScreen({ navigation }: SpotsScreenProps) {
  const { profile, version, isLoading: profileLoading } = useProfile();
  const { colors } = useTheme();
  const { location, loading: locLoading } = useLocation();
  const { offline } = useNetwork();
  const { show: showToast } = useToast();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const { isWide, columns } = useWebLayout();

  const [mode, setMode] = useState<Mode>('today');
  const [forecasts, setForecasts] = useState<SpotForecast[]>([]);
  const [favs, setFavs] = useState<string[]>([]);
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [breakFilter, setBreakFilter] = useState<BreakFilter>('all');
  const [minScoreFilter, setMinScoreFilter] = useState<MinScoreFilter>(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingSearchSpot, setLoadingSearchSpot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const initialLoad = useRef(true);
  const prevVersion = useRef(version);
  const prevLocationKey = useRef('');
  const prevZone = useRef(profile.preferredZone);
  const prevLocale = useRef(locale);
  // Monotonic token so an older overlapping load can't overwrite a newer one.
  const loadGen = useRef(0);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then(setReduceMotion).catch(() => {});
  }, []);

  const distanceMap = useMemo(() => {
    if (!location) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const spot of SPOTS) {
      map.set(spot.id, haversineDistance(location.latitude, location.longitude, spot.latitude, spot.longitude));
    }
    return map;
  }, [location]);

  const activeSpots = useMemo((): SpotConfig[] => {
    if (profile.preferredZone) {
      let zoneSpots = SPOTS.filter(s => s.country === profile.preferredZone);
      if (zoneSpots.length >= 3) {
        // Cap the number of spots fetched for a zone so a country with dozens of
        // spots doesn't fire dozens of API calls (slow + rate-limit risk). When
        // we know the user's position, keep the closest ones first.
        if (location) {
          zoneSpots = [...zoneSpots].sort((a, b) =>
            haversineDistance(location.latitude, location.longitude, a.latitude, a.longitude) -
            haversineDistance(location.latitude, location.longitude, b.latitude, b.longitude),
          );
        }
        return zoneSpots.slice(0, 30);
      }
    }
    if (location) {
      return getNearbySpotsWithFallback(SPOTS, location.latitude, location.longitude, 200, 5, 1000);
    }
    return getGlobalShowcase(SPOTS, 15);
  }, [location, profile.preferredZone]);

  const favSpotsOutsideZone = useMemo(() => {
    return SPOTS.filter(s => favs.includes(s.id) && !activeSpots.find(a => a.id === s.id));
  }, [favs, activeSpots]);

  const allSpotsToLoad = useMemo(() => {
    const ids = new Set(activeSpots.map(s => s.id));
    const extra = favSpotsOutsideZone.filter(s => !ids.has(s.id));
    return [...activeSpots, ...extra];
  }, [activeSpots, favSpotsOutsideZone]);

  useEffect(() => { getFavorites().then(setFavs); }, []);

  const handleToggleFav = useCallback(async (spotId: string) => {
    hapticLight();
    const wasFav = favs.includes(spotId);
    const next = await toggleFavorite(spotId);
    setFavs(next);
    if (wasFav) {
      showToast(t.favRemovedUndo, 'info', {
        action: {
          label: t.undo,
          onPress: async () => {
            const restored = await toggleFavorite(spotId);
            setFavs(restored);
          },
        },
      });
    } else {
      showToast(t.spotsAddedFav, 'success');
    }
  }, [favs, showToast, t]);

  const forecastsRef2 = useRef<SpotForecast[]>([]);
  forecastsRef2.current = forecasts;
  const loadedCountRef = useRef(0);
  loadedCountRef.current = loadedCount;

  const loadData = useCallback(async (force = false) => {
    const gen = ++loadGen.current;
    const spotsToLoad = allSpotsToLoad;
    try {
      setError(null);
      if (force) { setForecasts([]); setLoadedCount(0); setFailedCount(0); }
      setTotalCount(spotsToLoad.length);
      const results: SpotForecast[] = force ? [] : [...forecastsRef2.current];
      let count = force ? 0 : loadedCountRef.current;
      let failed = 0;

      const BATCH_SIZE = 6;
      const loadedIds = new Set(results.map(r => r.spot.id));
      for (let i = 0; i < spotsToLoad.length; i += BATCH_SIZE) {
        const batch = spotsToLoad.slice(i, i + BATCH_SIZE).filter(
          sp => force || !loadedIds.has(sp.id)
        );
        if (batch.length === 0) continue;

        const settled = await Promise.allSettled(
          batch.map(async (spot) => {
            const { marine, weather } = await fetchSpotData(spot.latitude, spot.longitude, { daily: false });
            return computeSpotForecast(spot, marine, weather, profile, locale);
          })
        );

        // A newer load (profile/zone/location/refresh) started while we awaited:
        // abandon this run so it can't clobber fresher data.
        if (gen !== loadGen.current) return;

        for (const res of settled) {
          if (res.status === 'fulfilled') {
            const forecast = res.value;
            const existing = results.findIndex(r => r.spot.id === forecast.spot.id);
            if (existing >= 0) results[existing] = forecast;
            else results.push(forecast);
            loadedIds.add(forecast.spot.id);
            count++;
          } else { failed++; }
        }

        setForecasts([...results].sort((a, b) => b.currentScore - a.currentScore));
        setLoadedCount(count);
        setFailedCount(failed);

        // Fast-fail: once a whole batch has completed with zero successes, the
        // weather API or the network is down. Surface the error + retry now
        // instead of grinding through every remaining batch (each request can
        // hang up to the timeout → minutes of skeleton). Each request was
        // already retried once internally, so this isn't a transient blip.
        if (count === 0 && failed > 0) {
          setError(t.spotsLoadError);
          return;
        }
      }
      // Every spot failed (e.g. the weather API is down): surface a real error
      // + retry instead of spinning on skeletons forever.
      if (count === 0 && failed > 0) {
        setError(t.spotsLoadError);
      }
      // The scheduler itself checks the global toggle AND per-spot alerts, so
      // we always call it (per-spot alerts work even with the global toggle off).
      scheduleGoodConditionAlerts(results, locale).catch(() => {});
    } catch (e: any) {
      if (gen !== loadGen.current) return;
      setError(e.message || t.spotsLoadError);
    }
  }, [profile, allSpotsToLoad, locale, t]);

  useEffect(() => {
    if (locLoading) return;
    // Wait for the stored profile to hydrate before the first fetch, otherwise
    // scores are computed with DEFAULT_PROFILE and never recomputed on launch.
    if (profileLoading) return;
    const locKey = location ? `${location.latitude.toFixed(2)}_${location.longitude.toFixed(2)}` : 'none';
    if (initialLoad.current || prevLocationKey.current !== locKey) {
      initialLoad.current = false;
      prevLocationKey.current = locKey;
      loadData(true);
    }
  }, [locLoading, profileLoading, location, loadData]);

  useEffect(() => {
    const zoneChanged = prevZone.current !== profile.preferredZone;
    if (prevVersion.current !== version) {
      prevVersion.current = version;
      prevZone.current = profile.preferredZone;
      if (forecasts.length > 0 || zoneChanged) {
        loadData(true);
      }
    }
  }, [version, forecasts.length, loadData, profile.preferredZone]);

  // Language change: forecast labels (best-time, day labels) are baked at compute
  // time, so recompute them in the new locale instead of forcing a manual refresh.
  useEffect(() => {
    if (prevLocale.current !== locale) {
      prevLocale.current = locale;
      if (forecasts.length > 0) loadData(true);
    }
  }, [locale, forecasts.length, loadData]);

  const onRefresh = useCallback(async () => {
    hapticMedium();
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  }, [loadData]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const searchResults = useMemo(() => {
    if (!debouncedQuery.trim()) return [];
    const q = debouncedQuery.toLowerCase().trim();
    return SPOTS.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.region.toLowerCase().includes(q) ||
      s.country.toLowerCase().includes(q)
    ).slice(0, 15);
  }, [debouncedQuery]);

  const { bestToday, bestWeek, nightNow, outsideHoursNow } = useMemo(() => findBestPicks(forecasts, profile, locale), [forecasts, profile, locale]);
  const levelTxt = getLevelLabel(profile.level, t);

  const locationLabel = useMemo(() => {
    if (locLoading) return t.spotsLocating;
    if (location && activeSpots.length > 0) {
      const nearCountries = Array.from(new Set(activeSpots.slice(0, 10).map(s => countryLabel(s.country, locale))));
      return nearCountries.length <= 2 ? nearCountries.join(' · ') : t.spotsNearby(activeSpots.length);
    }
    return t.spotsGlobal;
  }, [locLoading, location, activeSpots, t, locale]);

  // O(1) favorite lookups + stable identity per `favs` change, so memoized
  // SpotCards only re-render when the favorite set actually changes.
  const favSet = useMemo(() => new Set(favs), [favs]);

  const sortedForecasts = useMemo(() => {
    const fav = forecasts.filter(f => favSet.has(f.spot.id));
    const rest = forecasts.filter(f => !favSet.has(f.spot.id));
    return [...fav, ...rest];
  }, [forecasts, favSet]);

  const filteredForecasts = useMemo(() => {
    return sortedForecasts.filter(f => {
      if (levelFilter !== 'all' && f.spot.recommendedLevel !== levelFilter) return false;
      if (breakFilter !== 'all' && f.spot.bottomType !== breakFilter) return false;
      if (minScoreFilter > 0 && f.currentScore < minScoreFilter) return false;
      return true;
    });
  }, [sortedForecasts, levelFilter, breakFilter, minScoreFilter]);

  const hasActiveFilters = levelFilter !== 'all' || breakFilter !== 'all' || minScoreFilter > 0;
  const resetFilters = useCallback(() => {
    hapticLight();
    setLevelFilter('all');
    setBreakFilter('all');
    setMinScoreFilter(0);
  }, []);

  const regionSections = useMemo(() => {
    const map = new Map<string, SpotForecast[]>();
    for (const f of filteredForecasts) {
      const r = f.spot.region || t.spotsRegionOther;
      const arr = map.get(r) ?? [];
      arr.push(f);
      map.set(r, arr);
    }
    return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
  }, [filteredForecasts, t.spotsRegionOther]);

  // Desktop web: pack each region's spots into rows of `columns` so the
  // SectionList (which has no numColumns) renders a real multi-column grid.
  const displaySections = useMemo(() => {
    if (!isWide) return regionSections.map(s => ({ title: s.title, data: s.data as any[] }));
    return regionSections.map(s => ({ title: s.title, data: chunk(s.data, columns) as any[] }));
  }, [regionSections, isWide, columns]);

  useEffect(() => {
    if (sortedForecasts.length > 0) setStoredForecasts(sortedForecasts);
    else if (forecasts.length > 0) setStoredForecasts(forecasts);
  }, [sortedForecasts, forecasts]);

  const navigateToSpot = useCallback((forecast: SpotForecast) => {
    hapticLight();
    const allList = sortedForecasts.length > 0 ? sortedForecasts : forecasts;
    setStoredForecasts(allList);
    navigation.navigate('SpotDetail', { forecast });
  }, [navigation, sortedForecasts, forecasts]);

  const navigateToPick = useCallback((pick: BestPick) => { navigateToSpot(pick.forecast); }, [navigateToSpot]);

  const loadAndNavigateToSpot = useCallback(async (spot: SpotConfig) => {
    setLoadingSearchSpot(spot.id);
    try {
      const { marine, weather } = await fetchSpotData(spot.latitude, spot.longitude, { daily: false });
      const forecast = computeSpotForecast(spot, marine, weather, profile, locale);
      setForecasts(prev => {
        const next = [...prev.filter(f => f.spot.id !== spot.id), forecast].sort((a, b) => b.currentScore - a.currentScore);
        setStoredForecasts(next);
        setTimeout(() => navigation.navigate('SpotDetail', { forecast }), 0);
        return next;
      });
      setLoadingSearchSpot(null);
      setSearchQuery('');
    } catch {
      setLoadingSearchSpot(null);
      showToast(t.spotsSearchError, 'error');
    }
  }, [profile, navigation, showToast, locale, t]);

  // Only show the full-screen skeleton when we have nothing to display yet. A
  // location refresh (locLoading) must not blank an already-populated list.
  const isLoading = forecasts.length === 0 && !error && (locLoading || loadedCount === 0 || profileLoading);
  // "Enough to render" = we have a few cards, OR everything finished (so partial
  // failures don't leave the screen stuck on a skeleton forever).
  const hasEnoughData = totalCount > 0 && (
    forecasts.length >= Math.min(4, totalCount)
    || loadedCount >= totalCount
    || loadedCount + failedCount >= totalCount
  );

  const renderHeader = () => (
    <View style={[ss.header, { paddingTop: insets.top + (isWide ? 28 : spacing.md) }]}>
      <View style={ss.headerLeft}>
        <View style={ss.logoRow}>
          <Logo size={26} />
          <Text style={[ss.logo, { color: colors.white }]} accessibilityRole="header">SpotWave</Text>
        </View>
        <Text style={[ss.subtitle, { color: colors.textMuted }]}>
          {location ? <><MaterialCommunityIcons name={ICONS.location} size={11} color={colors.textMuted} />{' '}</> : null}{locationLabel} · {levelTxt}
        </Text>
      </View>
      <View style={ss.headerRight}>
        {refreshing && (
          <View style={[ss.loadingPill, { backgroundColor: colors.cardLight }]}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={[ss.loadingTxt, { color: colors.textMuted }]}>{loadedCount}/{totalCount}</Text>
          </View>
        )}
        <TouchableOpacity
          style={[ss.headerBtn, { backgroundColor: colors.cardLight }]}
          onPress={() => navigation.navigate('Guide')}
          activeOpacity={0.7}
          accessibilityLabel={t.profileGuide}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="help-circle-outline" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderModeTabs = () => (
    <View style={[ss.tabsRow, { backgroundColor: colors.cardLight }]} accessibilityRole="tablist">
      {(['today', 'all'] as Mode[]).map(m => {
        const active = mode === m;
        const label = m === 'today' ? t.spotsTabToday : t.spotsTabAll;
        return (
          <TouchableOpacity
            key={m}
            style={[ss.tabPill, active && { backgroundColor: colors.card }]}
            onPress={() => {
              hapticLight();
              setMode(m);
              if (m === 'today') setSearchQuery('');
            }}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={label}
          >
            <Text style={[ss.tabTxt, { color: active ? colors.accent : colors.textMuted }]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderFilterBar = () => (
    <View style={ss.filtersBlock}>
      <View style={ss.filterHeader}>
        <Text style={[ss.filterHeaderTxt, { color: colors.textMuted }]}>{t.spotsFilters}</Text>
        {hasActiveFilters && (
          <TouchableOpacity
            onPress={resetFilters}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t.spotsFilterReset}
          >
            <Text style={[ss.filterReset, { color: colors.accent }]}>{t.spotsFilterReset}</Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ss.filterChipsRow}>
        <FilterChip label={t.spotsFilterAllLevels} active={levelFilter === 'all'} onPress={() => setLevelFilter('all')} colors={colors} />
        <FilterChip label={t.levelBeginner} active={levelFilter === 'beginner'} onPress={() => setLevelFilter('beginner')} colors={colors} />
        <FilterChip label={t.levelIntermediate} active={levelFilter === 'intermediate'} onPress={() => setLevelFilter('intermediate')} colors={colors} />
        <FilterChip label={t.levelExpert} active={levelFilter === 'expert'} onPress={() => setLevelFilter('expert')} colors={colors} />
        <View style={[ss.filterSep, { backgroundColor: colors.border }]} />
        <FilterChip label={t.spotsFilterAllTypes} active={breakFilter === 'all'} onPress={() => setBreakFilter('all')} colors={colors} />
        <FilterChip label={t.breakBeach} active={breakFilter === 'beach'} onPress={() => setBreakFilter('beach')} colors={colors} />
        <FilterChip label={t.breakReef} active={breakFilter === 'reef'} onPress={() => setBreakFilter('reef')} colors={colors} />
        <FilterChip label={t.breakPoint} active={breakFilter === 'point'} onPress={() => setBreakFilter('point')} colors={colors} />
        <View style={[ss.filterSep, { backgroundColor: colors.border }]} />
        <FilterChip label={`${t.spotsFilterMinScore} 0`} active={minScoreFilter === 0} onPress={() => setMinScoreFilter(0)} colors={colors} />
        <FilterChip label={`${t.spotsFilterMinScore} ≥4`} active={minScoreFilter === 4} onPress={() => setMinScoreFilter(4)} colors={colors} />
        <FilterChip label={`${t.spotsFilterMinScore} ≥6`} active={minScoreFilter === 6} onPress={() => setMinScoreFilter(6)} colors={colors} />
      </ScrollView>
    </View>
  );

  const renderSearchBar = () => (
    <View style={[ss.searchWrap, { backgroundColor: colors.card, borderColor: searchFocused ? colors.accent : colors.border }]}>
      <Ionicons name="search" size={18} color={colors.textMuted} />
      <TextInput
        style={[ss.searchInput, { color: colors.white }]}
        placeholder={t.spotsSearchPlaceholder}
        placeholderTextColor={colors.textMuted}
        value={searchQuery}
        onChangeText={setSearchQuery}
        onFocus={() => setSearchFocused(true)}
        onBlur={() => setSearchFocused(false)}
        accessibilityLabel={t.spotsSearch}
        accessibilityRole="search"
        returnKeyType="search"
      />
      {searchQuery.length > 0 && (
        <TouchableOpacity
          onPress={() => setSearchQuery('')}
          accessibilityLabel={t.spotsClearSearch}
          accessibilityRole="button"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close-circle" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );

  const renderSearchOverlay = () => {
    const hasQuery = searchQuery.length > 0;

    if (!hasQuery) return null;

    return (
      <View style={ss.searchResults}>
        {hasQuery && searchResults.length === 0 && (
          <Text style={[ss.searchEmpty, { color: colors.textMuted }]}>{t.spotsSearchEmpty(searchQuery)}</Text>
        )}

        {hasQuery && searchResults.map((spot) => {
          const forecast = forecasts.find(f => f.spot.id === spot.id);
          const dist = distanceMap.get(spot.id);
          const isLoadingThis = loadingSearchSpot === spot.id;
          const levelBadge = getLevelBadge(spot.recommendedLevel, t);
          return (
            <TouchableOpacity
              key={spot.id}
              style={[ss.searchItem, { backgroundColor: colors.card }, isLoadingThis && { opacity: 0.6 }]}
              activeOpacity={0.7}
              disabled={isLoadingThis}
              onPress={() => {
                if (forecast) {
                  navigateToSpot(forecast);
                  setSearchQuery('');
                } else {
                  loadAndNavigateToSpot(spot);
                }
              }}
              accessibilityRole="button"
              accessibilityLabel={`${spot.name}, ${spot.region}, ${spot.country}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={[ss.searchName, { color: colors.white }]}>{spot.name}</Text>
                <Text style={[ss.searchMeta, { color: colors.textMuted }]}>
                  {spot.region} · {countryLabel(spot.country, locale)}
                  {dist != null ? (
                    <Text>{'  ·  '}<MaterialCommunityIcons name={ICONS.location} size={11} color={colors.textMuted} /> {formatDistance(dist)}</Text>
                  ) : ''}
                </Text>
                {isLoadingThis && (
                  <Text style={[ss.searchLoading, { color: colors.accent }]}>{t.spotsSearchLoading}</Text>
                )}
              </View>
              <View style={[ss.levelBadge, { backgroundColor: levelBadge.bg }]}>
                <Text style={[ss.levelBadgeTxt, { color: levelBadge.color }]}>{levelBadge.label}</Text>
              </View>
              {forecast && <ScoreBadge score={forecast.currentScore} size="sm" />}
              {isLoadingThis && <ActivityIndicator size="small" color={colors.accent} />}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  // ─── Error state (checked before loading so a total failure shows a retry,
  //     not an endless skeleton) ───
  if (error && forecasts.length === 0) {
    return (
      <View style={[ss.loadWrap, { backgroundColor: colors.bg, paddingTop: insets.top + 40 }]}>
        <MaterialCommunityIcons name={offline ? 'wifi-off' : 'cloud-off-outline'} size={44} color={colors.textMuted} style={{ marginBottom: spacing.md }} />
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.white, textAlign: 'center', marginBottom: spacing.xs }}>
          {offline ? t.offlineMsg : t.spotsLoadError}
        </Text>
        <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.lg, paddingHorizontal: spacing.xl }}>
          {t.spotsLoadErrorHint}
        </Text>
        <TouchableOpacity
          onPress={onRefresh}
          style={[ss.retryBtn, { backgroundColor: colors.cardLight }]}
          accessibilityLabel={t.retry}
          accessibilityRole="button"
        >
          <Text style={[ss.retryTxt, { color: colors.accent }]}>{t.retry}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Loading state ───
  if (isLoading || !hasEnoughData) {
    return (
      <ScrollView style={[{ flex: 1, backgroundColor: colors.bg }, webCenter(WEB_HOME_MAX, isWide)]} showsVerticalScrollIndicator={false}>
        {renderHeader()}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg }}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={[ss.metaTxt, { color: colors.textMuted, marginLeft: spacing.sm }]}>{t.spotsLoading}</Text>
        </View>
        <View style={{ marginTop: spacing.md }}>
          {[0, 1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
        </View>
      </ScrollView>
    );
  }

  // ─── Today mode: vertical scroll with Hero + Best Week + Explorer ───
  if (mode === 'today') {
    return (
      <ScrollView
        style={[{ flex: 1, backgroundColor: colors.bg }, webCenter(WEB_HOME_MAX, isWide)]}
        contentContainerStyle={isWebPlatform ? { paddingBottom: webTabBarClearance(insets.bottom) } : undefined}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
      >
        {renderHeader()}
        <View style={ss.controlsWrap}>
          {renderModeTabs()}
        </View>

        {searchQuery.length === 0 && (
          <>
            {((loadedCount < totalCount && totalCount > 0) || failedCount > 0) && (
              <View style={ss.metaRow}>
                {loadedCount < totalCount && totalCount > 0 && (
                  <View style={ss.progressRow}>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={[ss.metaTxt, { color: colors.textMuted }]}>{loadedCount}/{totalCount} spot{totalCount !== 1 ? 's' : ''}</Text>
                  </View>
                )}
                {failedCount > 0 && <Text style={[ss.metaTxt, { color: colors.yellow }]}>{t.spotsUnavailable(failedCount)}</Text>}
              </View>
            )}

            <View style={isWide ? ss.homeRow : undefined}>
            <View style={isWide ? ss.homeColMain : undefined}>
            {/* HERO simplifié */}
            {bestToday ? (
              <PressableScale
                style={[ss.hero, isWide && ss.heroWide, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => navigateToPick(bestToday)}
                accessibilityRole="button"
                accessibilityLabel={`${t.spotsWhereToSurf} ${bestToday.spotName} ${bestToday.timeRange}`}
              >
                <Text style={[ss.heroQ, { color: colors.textMuted }]}>{t.spotsWhereToSurf}</Text>
                <View style={ss.heroMain}>
                  <ScoreBadge score={bestToday.cond.score} size="hero" animated={!reduceMotion} />
                  <View style={ss.heroRight}>
                    <Text style={[ss.heroSpot, { color: colors.white }]} numberOfLines={1}>{bestToday.spotName}</Text>
                    <Text style={[ss.heroRange, { color: colors.textSecondary }]}>{bestToday.timeRange}</Text>
                    <Text style={[ss.heroLabel, { color: scoreColor(bestToday.cond.score) }]}>
                      <MaterialCommunityIcons name={scoreIcon(bestToday.cond.score)} size={12} color={scoreColor(bestToday.cond.score)} /> {scoreLabel(bestToday.cond.score, t)}
                    </Text>
                  </View>
                </View>
                <View style={[ss.heroBar, { borderTopColor: colors.border }]}>
                  <MiniStat icon={ICONS.swell} value={`${bestToday.cond.swellHeight.toFixed(1)}m`} sub={t.spotsSwell} colors={colors} />
                  <MiniStat icon={ICONS.period} value={`${bestToday.cond.swellPeriod.toFixed(0)}s`} sub={t.spotsPeriod} colors={colors} />
                  <MiniStat icon={ICONS.wind} value={windLabel(bestToday.cond.windSpeed, bestToday.cond.windDirection, bestToday.beachOrientation)} sub={`${bestToday.cond.windSpeed.toFixed(0)} km/h`} colors={colors} />
                  <MiniStat icon={ICONS.seaTemp} value={`${bestToday.cond.seaTemp.toFixed(0)}°`} sub={t.spotsSeaTemp} colors={colors} />
                </View>
              </PressableScale>
            ) : (
              <View style={[ss.emptyHero, isWide && ss.heroWide, { backgroundColor: colors.card }]}>
                <View style={[ss.emptyIconWrap, { backgroundColor: colors.bgSubtle }]}>
                  <MaterialCommunityIcons
                    name={nightNow ? 'weather-night' : outsideHoursNow ? 'clock-outline' : ICONS.swell}
                    size={30}
                    color={colors.textSecondary}
                  />
                </View>
                <Text style={[ss.emptyTitle, { color: colors.white }]}>
                  {nightNow ? t.spotsNightTitle : outsideHoursNow ? t.spotsOutsideHours : t.spotsNoConditions}
                </Text>
                <Text style={[ss.emptySubtitle, { color: colors.textMuted }]}>
                  {nightNow
                    ? (bestWeek.length > 0 ? t.spotsNightSub(bestWeek[0].dayLabel, bestWeek[0].spotName) : t.spotsNightNoSlot)
                    : (bestWeek.length > 0 ? t.spotsNextSlot(bestWeek[0].dayLabel, bestWeek[0].spotName) : t.spotsNoSlotWeek)}
                </Text>
                {bestWeek.length > 0 && (
                  <PressableScale
                    style={[ss.emptyCta, { backgroundColor: scoreBg(bestWeek[0].cond.score), borderColor: scoreColor(bestWeek[0].cond.score) }]}
                    onPress={() => navigateToPick(bestWeek[0])}
                    accessibilityRole="button"
                    accessibilityLabel={`${t.spotsSeeBestWeek} ${bestWeek[0].dayLabel} ${bestWeek[0].spotName}`}
                  >
                    <MaterialCommunityIcons name={ICONS.bestTime} size={14} color={scoreColor(bestWeek[0].cond.score)} />
                    <Text style={[ss.emptyCtaTxt, { color: scoreColor(bestWeek[0].cond.score) }]}>{t.spotsSeeBestWeek}</Text>
                  </PressableScale>
                )}
              </View>
            )}
            </View>

            {/* Best week */}
            {bestWeek.length > 0 && (
              <View style={[ss.weekSection, isWide && ss.weekWide]}>
                <Text style={[ss.weekTitle, { color: colors.textSecondary }]} accessibilityRole="header">{t.spotsBestWeek}</Text>
                {bestWeek.map((pick, idx) => {
                  const conf = getConfidenceForDate(pick.cond.time);
                  const confCol = confidenceColor(conf, colors);
                  return (
                    <PressableScale
                      key={`${pick.spotId}-${pick.cond.time}`}
                      style={[ss.weekCard, { backgroundColor: colors.card }, idx === 0 && { borderColor: scoreColor(pick.cond.score), borderWidth: 1 }]}
                      onPress={() => navigateToPick(pick)}
                      accessibilityRole="button"
                      accessibilityLabel={`${pick.dayLabel} ${pick.spotName} ${pick.timeRange}`}
                    >
                      <View style={ss.weekLeft}>
                        <View style={[ss.weekRank, { backgroundColor: idx === 0 ? scoreBg(pick.cond.score) : colors.bgSubtle }]}>
                          <Text style={[ss.weekRankTxt, { color: idx === 0 ? scoreColor(pick.cond.score) : colors.textMuted }]}>#{idx + 1}</Text>
                        </View>
                        <View style={ss.weekInfo}>
                          <View style={ss.weekDayRow}>
                            <Text style={[ss.weekDay, { color: colors.white }]}>{pick.dayLabel}</Text>
                            {conf !== 'high' && (
                              <View style={[ss.confDot, { backgroundColor: confCol }]} accessibilityLabel={`${t.detailDataAccuracy} ${confidenceLabel(conf, t)}`} />
                            )}
                          </View>
                          <Text style={[ss.weekSpot, { color: colors.textSecondary }]}>{pick.spotName} · {pick.timeRange}</Text>
                          <View style={ss.weekStats}>
                            <Text style={[ss.weekStat, { color: colors.textMuted }]}><MaterialCommunityIcons name={ICONS.swell} size={11} color={colors.textMuted} /> {pick.cond.swellHeight.toFixed(1)}m</Text>
                            <Text style={[ss.weekStat, { color: colors.textMuted }]}><MaterialCommunityIcons name={ICONS.period} size={11} color={colors.textMuted} /> {pick.cond.swellPeriod.toFixed(0)}s</Text>
                            <Text style={[ss.weekStat, { color: colors.textMuted }]}><MaterialCommunityIcons name={ICONS.wind} size={11} color={colors.textMuted} /> {pick.cond.windSpeed.toFixed(0)} km/h</Text>
                          </View>
                        </View>
                      </View>
                      <View style={ss.weekRight}>
                        <ScoreBadge score={pick.cond.score} size="md" />
                        <Text style={[ss.weekLabel, { color: scoreColor(pick.cond.score) }]} numberOfLines={1}>{scoreShort(pick.cond.score, t)}</Text>
                      </View>
                    </PressableScale>
                  );
                })}
              </View>
            )}
            </View>

            <View style={{ height: 24 }} />
          </>
        )}
      </ScrollView>
    );
  }

  // ─── All spots mode: SectionList (virtualisé) groupé par région ───
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SectionList
        key={isWide ? `grid-${columns}` : 'list'}
        style={webCenter(WEB_CONTENT_MAX, isWide) || undefined}
        sections={displaySections}
        keyExtractor={(item, index) => isWide ? `row-${index}-${(item as SpotForecast[]).map(f => f.spot.id).join('_')}` : (item as SpotForecast).spot.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
        ListHeaderComponent={
          <>
            {renderHeader()}
            <View style={ss.controlsWrap}>
              {renderModeTabs()}
              {mode === 'all' && renderSearchBar()}
            </View>
            {renderSearchOverlay()}
            {searchQuery.length === 0 && (
              <View style={ss.metaRow}>
                {loadedCount < totalCount && totalCount > 0 && (
                  <View style={ss.progressRow}>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={[ss.metaTxt, { color: colors.textMuted }]}>{loadedCount}/{totalCount} spots</Text>
                  </View>
                )}
                {failedCount > 0 && <Text style={[ss.metaTxt, { color: colors.yellow }]}>{t.spotsUnavailable(failedCount)}</Text>}
              </View>
            )}
            {searchQuery.length === 0 && renderFilterBar()}
          </>
        }
        ListEmptyComponent={
          searchQuery.length === 0 && hasActiveFilters ? (
            <View style={ss.filterEmpty}>
              <Text style={[ss.filterEmptyTxt, { color: colors.textMuted }]}>{t.spotsFilterNoResults}</Text>
              <TouchableOpacity
                onPress={resetFilters}
                style={[ss.retryBtn, { backgroundColor: colors.cardLight, marginTop: spacing.md }]}
                accessibilityRole="button"
                accessibilityLabel={t.spotsFilterReset}
              >
                <Text style={[ss.retryTxt, { color: colors.accent }]}>{t.spotsFilterReset}</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
        ListFooterComponent={<View style={{ height: isWebPlatform ? webTabBarClearance(insets.bottom) : 100 }} />}
        renderSectionHeader={searchQuery.length > 0 ? undefined : ({ section }) => (
          <Text style={[ss.secTitle, { color: colors.textSecondary, backgroundColor: colors.bg }]} accessibilityRole="header">{section.title}</Text>
        )}
        renderItem={searchQuery.length > 0 ? () => null : ({ item }: ListRenderItemInfo<any>) => {
          if (isWide) {
            const row = item as SpotForecast[];
            return (
              <View style={ss.gridRow}>
                {row.map(f => (
                  <SpotCard
                    key={f.spot.id}
                    grid
                    forecast={f}
                    isFav={favSet.has(f.spot.id)}
                    distance={distanceMap.get(f.spot.id)}
                    onPress={navigateToSpot}
                    onToggleFav={handleToggleFav}
                    colors={colors}
                  />
                ))}
                {row.length < columns && Array.from({ length: columns - row.length }).map((_, i) => (
                  <View key={`filler-${i}`} style={{ flex: 1 }} />
                ))}
              </View>
            );
          }
          const f = item as SpotForecast;
          return (
            <SpotCard
              forecast={f}
              isFav={favSet.has(f.spot.id)}
              distance={distanceMap.get(f.spot.id)}
              onPress={navigateToSpot}
              onToggleFav={handleToggleFav}
              colors={colors}
            />
          );
        }}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        maxToRenderPerBatch={4}
        windowSize={7}
        removeClippedSubviews={false}
      />
    </View>
  );
}

const SpotCard = memo(function SpotCard({
  forecast: f, isFav, distance, onPress, onToggleFav, colors, grid,
}: {
  forecast: SpotForecast; isFav: boolean; distance?: number; onPress: (f: SpotForecast) => void; onToggleFav: (id: string) => void; colors: any; grid?: boolean;
}) {
  const { t, locale } = useI18n();
  const handlePress = useCallback(() => onPress(f), [onPress, f]);
  // On web the card and the star both render as clickable elements; stop the
  // star's click from bubbling up to the card (which would also open the spot).
  // Harmless on native (GestureResponderEvent.stopPropagation is a no-op there).
  const handleFav = useCallback((e?: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
    onToggleFav(f.spot.id);
  }, [onToggleFav, f.spot.id]);
  const cc = f.currentCondition;
  const condKey = cc ? windConditionKey(cc.windSpeed, cc.windDirection, f.spot.beachOrientation) : 'clean';
  const condLabel = condKey === 'glassy' ? t.windGlassy : condKey === 'choppy' ? t.windChoppy : t.windClean;
  const condColor = condKey === 'choppy' ? colors.yellow : condKey === 'glassy' ? colors.accent : colors.blue;
  return (
    <PressableScale
      style={[ss.spot, grid && ss.spotGrid, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={handlePress}
      accessibilityLabel={`${f.spot.name}, score ${f.currentScore.toFixed(1)}`}
      accessibilityRole="button"
    >
      <View style={ss.spotHead}>
        <ScoreBadge score={f.currentScore} size="lg" />
        <View style={ss.spotInfo}>
          <View style={ss.spotNameRow}>
            <Text style={[ss.spotName, { color: colors.white }]} numberOfLines={1}>{f.spot.name}</Text>
            {isFav && <Ionicons name="star" size={14} color={colors.yellow} />}
          </View>
          <Text style={[ss.spotLabel, { color: scoreColor(f.currentScore) }]}>
            <MaterialCommunityIcons name={scoreIcon(f.currentScore)} size={13} color={scoreColor(f.currentScore)} /> {scoreLabel(f.currentScore, t)}
          </Text>
          <View style={ss.spotMeta}>
            <Text style={[ss.spotDistance, { color: colors.textMuted }]} numberOfLines={1}>{countryLabel(f.spot.country, locale)}</Text>
            {f.spot.webcamUrl && <MaterialCommunityIcons name={ICONS.webcam} size={13} color={colors.textMuted} accessibilityLabel={t.detailWebcam} />}
            {distance != null && (
              <Text style={[ss.spotDistance, { color: colors.accent }]}><MaterialCommunityIcons name={ICONS.location} size={11} color={colors.accent} /> {formatDistance(distance)}</Text>
            )}
          </View>
        </View>
        <TouchableOpacity
          onPress={handleFav}
          style={ss.favBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel={isFav ? t.spotsRemovedFav : t.spotsAddedFav}
          accessibilityRole="button"
        >
          <Ionicons name={isFav ? 'star' : 'star-outline'} size={24} color={isFav ? colors.yellow : colors.textMuted} />
        </TouchableOpacity>
      </View>
      {cc && (
        <View style={ss.spotBar}>
          <Text style={[ss.spotStat, { color: colors.textSecondary }]}><MaterialCommunityIcons name={weatherMCIcon(cc.weatherCode)} size={12} color={colors.textSecondary} /> {cc.temperature.toFixed(0)}°</Text>
          <Text style={[ss.spotDot, { color: colors.border }]}>·</Text>
          <Text style={[ss.spotStat, { color: colors.textSecondary }]}><MaterialCommunityIcons name={ICONS.swell} size={12} color={colors.textSecondary} /> {cc.swellHeight.toFixed(1)}m</Text>
          <Text style={[ss.spotDot, { color: colors.border }]}>·</Text>
          <Text style={[ss.spotStat, { color: colors.textSecondary }]}>{cc.swellPeriod.toFixed(0)}s</Text>
          <Text style={[ss.spotDot, { color: colors.border }]}>·</Text>
          <Text style={[ss.spotStat, { color: condColor }]}><MaterialCommunityIcons name={ICONS.wind} size={12} color={condColor} /> {condLabel} {cc.windSpeed.toFixed(0)}</Text>
          {cc.windGusts > 20 && (
            <><Text style={[ss.spotDot, { color: colors.border }]}>·</Text><Text style={[ss.spotStat, { color: colors.yellow }]}><MaterialCommunityIcons name={ICONS.gust} size={12} color={colors.yellow} /> {cc.windGusts.toFixed(0)}</Text></>
          )}
          <Text style={[ss.spotDot, { color: colors.border }]}>·</Text>
          <Text style={[ss.spotStat, { color: colors.blue }]}><MaterialCommunityIcons name={ICONS.seaTemp} size={12} color={colors.blue} /> {cc.seaTemp.toFixed(0)}°</Text>
        </View>
      )}
      {f.bestTime.score >= RIDABLE_SCORE ? (
        <View style={[ss.spotBest, { backgroundColor: scoreBg(f.bestTime.score) }]}>
          <Text style={[ss.spotBestTxt, { color: scoreColor(f.bestTime.score) }]}>
            <MaterialCommunityIcons name={ICONS.bestTime} size={12} color={scoreColor(f.bestTime.score)} /> {bestTimeLabel(f, locale)} — {scoreShort(f.bestTime.score, t)} ({f.bestTime.score.toFixed(1)})
          </Text>
        </View>
      ) : (
        <View style={[ss.spotBest, { backgroundColor: colors.cardLight }]}>
          <Text style={[ss.spotBestTxt, { color: colors.textMuted }]}>
            <MaterialCommunityIcons name={ICONS.flat} size={12} color={colors.textMuted} /> {t.spotsNoGoodWindow}
          </Text>
        </View>
      )}
    </PressableScale>
  );
});

function FilterChip({ label, active, onPress, colors }: { label: string; active: boolean; onPress: () => void; colors: any }) {
  return (
    <TouchableOpacity
      onPress={() => {
        hapticLight();
        onPress();
      }}
      style={[
        ss.filterChip,
        { backgroundColor: active ? colors.accentDim : colors.cardLight, borderColor: active ? colors.accent : 'transparent' },
      ]}
      hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Text style={[ss.filterChipTxt, { color: active ? colors.accent : colors.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function MiniStat({ icon, value, sub, colors }: { icon: MCIName; value: string; sub: string; colors: any }) {
  return (
    <View style={ss.ms} accessibilityLabel={`${sub} ${value}`}>
      <MaterialCommunityIcons name={icon} size={15} color={colors.textSecondary} style={ss.msIcon} />
      <Text style={[ss.msVal, { color: colors.white }]}>{value}</Text>
      <Text style={[ss.msSub, { color: colors.textMuted }]}>{sub}</Text>
    </View>
  );
}

const ss = StyleSheet.create({
  loadWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  retryBtn: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    minHeight: touchTarget.min,
    justifyContent: 'center',
  },
  retryTxt: { ...typography.bodyBold },

  header: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  headerLeft: { flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerBtn: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logo: { ...typography.display, fontSize: 30 },
  subtitle: { ...typography.caption, marginTop: 3 },
  loadingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  loadingTxt: { ...typography.micro },

  controlsWrap: { paddingHorizontal: spacing.lg, marginTop: spacing.md, gap: spacing.md },
  tabsRow: { flexDirection: 'row', borderRadius: radius.pill, padding: 4 },
  tabPill: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radius.pill - 4,
    minHeight: touchTarget.min,
    justifyContent: 'center',
  },
  tabTxt: { ...typography.bodyBold, fontSize: 13 },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderWidth: 1,
    minHeight: touchTarget.min,
  },
  searchInput: { flex: 1, ...typography.bodyBold, fontWeight: '500', padding: 0 },

  filtersBlock: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  filterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  filterHeaderTxt: { ...typography.tiny },
  filterReset: { ...typography.micro },
  filterChipsRow: { gap: spacing.sm, paddingVertical: 2, paddingRight: spacing.lg },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    minHeight: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChipTxt: { ...typography.micro, fontWeight: '700' },
  filterSep: { width: 1, height: 22, alignSelf: 'center', marginHorizontal: spacing.xs },
  filterEmpty: { paddingHorizontal: spacing.xxxl, paddingTop: spacing.xxxl, alignItems: 'center' },
  filterEmptyTxt: { ...typography.body, fontSize: 13, textAlign: 'center' },

  searchResults: { marginHorizontal: spacing.lg, marginTop: spacing.sm, gap: spacing.xs },
  searchEmpty: { ...typography.caption, fontSize: 13, fontWeight: '500', textAlign: 'center', paddingVertical: spacing.xl },
  searchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  searchName: { ...typography.h3, fontSize: 15, fontWeight: '700' },
  searchMeta: { ...typography.micro, fontWeight: '500', marginTop: 2 },
  searchLoading: { ...typography.micro, marginTop: 3 },
  levelBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm },
  levelBadgeTxt: { fontSize: 10, fontWeight: '700' },

  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
  },
  metaTxt: { ...typography.micro, fontWeight: '500' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },

  emptyHero: {
    margin: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    alignItems: 'center',
  },
  emptyEmoji: { fontSize: 32, marginBottom: spacing.md },
  emptyIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: { ...typography.h2, fontSize: 17, textAlign: 'center' },
  emptySubtitle: { ...typography.caption, fontSize: 13, marginTop: spacing.xs, textAlign: 'center' },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: touchTarget.min,
  },
  emptyCtaTxt: { ...typography.bodyBold, fontSize: 13 },

  hero: {
    margin: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: StyleSheet.hairlineWidth,
    ...elevation.md,
  },
  heroQ: { ...typography.tiny, marginBottom: spacing.md },
  heroMain: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg, gap: spacing.lg },
  heroRight: { flex: 1 },
  heroSpot: { ...typography.h1 },
  heroRange: { ...typography.body, fontSize: 16, fontWeight: '600', marginTop: spacing.xs },
  heroLabel: { ...typography.tiny, fontSize: 12, marginTop: spacing.sm },
  heroBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ms: { flex: 1, alignItems: 'center' },
  msIcon: { fontSize: 14, marginBottom: spacing.xs },
  msVal: { ...typography.bodyBold, fontWeight: '800', fontVariant: ['tabular-nums'] },
  msSub: { ...typography.tiny, fontSize: 10, marginTop: 2 },

  weekSection: { marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  weekTitle: { ...typography.sectionLabel, marginBottom: spacing.md, marginLeft: spacing.xs },
  weekCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    ...elevation.sm,
  },
  weekLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  weekRank: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  weekRankTxt: { ...typography.caption, fontWeight: '800', fontVariant: ['tabular-nums'] },
  weekInfo: { flex: 1 },
  weekDayRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  weekDay: { ...typography.h3, fontSize: 15 },
  confDot: { width: 6, height: 6, borderRadius: 3 },
  weekSpot: { ...typography.caption, marginTop: 2 },
  weekStats: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  weekStat: { ...typography.micro, fontWeight: '500', fontVariant: ['tabular-nums'] },
  weekRight: { alignItems: 'center', justifyContent: 'center', marginLeft: spacing.md, width: 62 },
  weekLabel: { ...typography.tiny, marginTop: spacing.xs, textAlign: 'center' },

  secTitle: {
    ...typography.sectionLabel,
    paddingLeft: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },

  spot: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    ...elevation.sm,
  },
  spotGrid: { flex: 1, marginHorizontal: 0, marginBottom: 0 },
  gridRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    alignItems: 'stretch',
  },
  // Desktop home: single centered vertical column (hero, then best-week below).
  homeRow: {
    paddingHorizontal: spacing.lg,
  },
  homeColMain: {},
  heroWide: { marginHorizontal: 0, marginTop: spacing.md, marginBottom: spacing.md },
  weekWide: { marginHorizontal: 0, marginTop: 0 },
  spotHead: { flexDirection: 'row', alignItems: 'center' },
  spotInfo: { flex: 1, marginLeft: spacing.md },
  spotNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  spotName: { ...typography.h2, fontSize: 17, flexShrink: 1 },
  spotLabel: { ...typography.caption, fontSize: 13, marginTop: 3 },
  spotMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  spotDistance: { ...typography.micro, fontSize: 11 },
  favBtn: {
    width: touchTarget.min,
    height: touchTarget.min,
    justifyContent: 'center',
    alignItems: 'center',
  },
  spotBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: spacing.md,
    paddingLeft: spacing.xs,
    rowGap: spacing.xs,
    columnGap: spacing.xs,
  },
  spotStat: { ...typography.caption, fontWeight: '500', fontVariant: ['tabular-nums'] },
  spotDot: { fontSize: 12 },
  spotBest: {
    marginTop: spacing.md,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm - 1,
    paddingHorizontal: spacing.md,
  },
  spotBestTxt: { ...typography.caption, fontWeight: '600' },
});
