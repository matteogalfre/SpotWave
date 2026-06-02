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
  Animated,
  AccessibilityInfo,
  ListRenderItemInfo,
} from 'react-native';
import { useProfile } from '../context/ProfileContext';
import { useTheme } from '../context/ThemeContext';
import { useLocation } from '../context/LocationContext';
import { fetchSpotData } from '../services/api';
import { computeSpotForecast, RIDABLE_SCORE } from '../utils/scoring';
import { getFavorites, toggleFavorite } from '../services/favorites';
import { getNearbySpotsWithFallback, getGlobalShowcase, haversineDistance, formatDistance } from '../services/location';
import { getSearchHistory, addSearchHistory, clearSearchHistory } from '../services/searchHistory';
import { setStoredForecasts } from '../context/ForecastStore';
import SPOTS from '../data/spots';
import ScoreBadge from '../components/ScoreBadge';
import SkeletonCard from '../components/SkeletonCard';
import Logo from '../components/Logo';
import { SpotConfig, SpotForecast, HourlyCondition, SurferLevel, BreakType } from '../types';
import { Ionicons } from '@expo/vector-icons';
import { scoreColor, scoreBg, scoreLabel, scoreEmoji, scoreShort, windLabel, isDaytime, weatherIcon } from '../theme';
import { SurferProfile } from '../types';
import { SpotsScreenProps } from '../navigation/types';
import { CONTINENTS, COUNTRY_TO_CONTINENT } from '../data/continents';
import * as Haptics from 'expo-haptics';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import { scheduleGoodConditionAlerts, getAlertsEnabled } from '../services/notifications';
import { getLevelBadge, getLevelLabel, fmtDayLabel, fmtRange, fmtElapsed } from '../utils/constants';
import { spacing, radius, typography, touchTarget } from '../utils/tokens';
import { getConfidenceForDate, confidenceColor } from '../utils/confidence';

const COUNTRY_EMOJI: Record<string, string> = {
  'Portugal': '🇵🇹', 'France': '🇫🇷', 'Espagne': '🇪🇸', 'Indonésie': '🇮🇩',
  'Australie': '🇦🇺', 'USA - Californie': '🌴', 'USA - Hawaii': '🌺',
  'USA - Floride': '🇺🇸', 'USA - Est': '🇺🇸', 'USA - Oregon': '🇺🇸',
  'USA - Washington': '🇺🇸', 'USA - New York': '🇺🇸',
  'Maroc': '🇲🇦', 'Afrique du Sud': '🇿🇦', 'Costa Rica': '🇨🇷',
  'Mexique': '🇲🇽', 'Brésil': '🇧🇷', 'Pérou': '🇵🇪', 'Royaume-Uni': '🇬🇧',
  'Irlande': '🇮🇪', 'Fidji': '🇫🇯', 'Maldives': '🇲🇻', 'Sri Lanka': '🇱🇰',
  'Nouvelle-Zélande': '🇳🇿', 'Philippines': '🇵🇭', 'Chili': '🇨🇱',
  'Japon': '🇯🇵', 'Nicaragua': '🇳🇮', 'Panama': '🇵🇦', 'Taïwan': '🇹🇼',
  'Canada': '🇨🇦', 'Italie': '🇮🇹', 'Polynésie française': '🇵🇫',
  'Sénégal': '🇸🇳', 'Namibie': '🇳🇦', 'El Salvador': '🇸🇻',
  'Équateur': '🇪🇨', 'La Réunion': '🇷🇪', 'Colombie': '🇨🇴',
  'Uruguay': '🇺🇾', 'Samoa': '🇼🇸', 'Porto Rico': '🇵🇷',
  'Inde': '🇮🇳', 'Argentine': '🇦🇷', 'Grèce': '🇬🇷', 'Turquie': '🇹🇷',
  'Thaïlande': '🇹🇭', 'Corée du Sud': '🇰🇷', 'Madagascar': '🇲🇬',
};

const DESTINATIONS = (() => {
  const counts: Record<string, number> = {};
  SPOTS.forEach(s => { counts[s.country] = (counts[s.country] || 0) + 1; });
  return Object.entries(counts)
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([country, spots]) => ({
      country,
      emoji: COUNTRY_EMOJI[country] || '🏄',
      spots,
    }));
})();

interface BestPick {
  spotName: string;
  spotId: string;
  forecast: SpotForecast;
  cond: HourlyCondition;
  beachOrientation: number;
  dayLabel: string;
  timeRange: string;
}

function findBestPicks(forecasts: SpotForecast[], profile: SurferProfile, locale: string = 'fr'): { bestToday: BestPick | null; bestWeek: BestPick[] } {
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
        spotName: f.spot.name, spotId: f.spot.id, forecast: f, cond: c,
        beachOrientation: f.spot.beachOrientation,
        dayLabel: fmtDayLabel(c.time, now, undefined, locale),
        timeRange: fmtRange(c.time, sessionDuration, availableTo),
      };
      if (isToday && (!bestToday || c.score > bestToday.cond.score)) bestToday = pick;
      if (!dayBest[dateKey] || c.score > dayBest[dateKey].cond.score) dayBest[dateKey] = pick;
    }
  }

  return { bestToday, bestWeek: Object.values(dayBest).sort((a, b) => a.cond.time.localeCompare(b.cond.time)).slice(0, 5) };
}

type Mode = 'today' | 'all';
type LevelFilter = 'all' | SurferLevel;
type BreakFilter = 'all' | BreakType;
type MinScoreFilter = 0 | 4 | 6;

export default function SpotsScreen({ navigation }: SpotsScreenProps) {
  const { profile, version } = useProfile();
  const { colors } = useTheme();
  const { location, loading: locLoading } = useLocation();
  const { show: showToast } = useToast();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<Mode>('today');
  const [exploreOpen, setExploreOpen] = useState(false);
  const [forecasts, setForecasts] = useState<SpotForecast[]>([]);
  const [favs, setFavs] = useState<string[]>([]);
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [breakFilter, setBreakFilter] = useState<BreakFilter>('all');
  const [minScoreFilter, setMinScoreFilter] = useState<MinScoreFilter>(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [loadedCount, setLoadedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingSearchSpot, setLoadingSearchSpot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const initialLoad = useRef(true);
  const prevVersion = useRef(version);
  const prevLocationKey = useRef('');
  const prevZone = useRef(profile.preferredZone);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then(setReduceMotion).catch(() => {});
  }, []);

  useEffect(() => { getSearchHistory().then(setSearchHistory); }, []);

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
      const zoneSpots = SPOTS.filter(s => s.country === profile.preferredZone);
      if (zoneSpots.length >= 3) return zoneSpots;
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
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
            const { marine, weather } = await fetchSpotData(spot.latitude, spot.longitude);
            return computeSpotForecast(spot, marine, weather, profile, locale);
          })
        );

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
      }
      setLastUpdate(new Date());
      getAlertsEnabled().then(on => {
        if (on) scheduleGoodConditionAlerts(results, locale === 'fr').catch(() => {});
      }).catch(() => {});
    } catch (e: any) {
      setError(e.message || t.spotsLoadError);
    }
  }, [profile, allSpotsToLoad, locale, t]);

  useEffect(() => {
    if (locLoading) return;
    const locKey = location ? `${location.latitude.toFixed(2)}_${location.longitude.toFixed(2)}` : 'none';
    if (initialLoad.current || prevLocationKey.current !== locKey) {
      initialLoad.current = false;
      prevLocationKey.current = locKey;
      loadData(true);
    }
  }, [locLoading, location, loadData]);

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

  const onRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
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

  const onSubmitSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (q.length >= 2) {
      const next = await addSearchHistory(q);
      setSearchHistory(next);
    }
  }, [searchQuery]);

  const handleClearHistory = useCallback(async () => {
    await clearSearchHistory();
    setSearchHistory([]);
  }, []);

  const { bestToday, bestWeek } = useMemo(() => findBestPicks(forecasts, profile, locale), [forecasts, profile, locale]);
  const levelTxt = getLevelLabel(profile.level, t);

  const locationLabel = useMemo(() => {
    if (locLoading) return t.spotsLocating;
    if (location && activeSpots.length > 0) {
      const nearCountries = Array.from(new Set(activeSpots.slice(0, 10).map(s => s.country)));
      return nearCountries.length <= 2 ? nearCountries.join(' · ') : t.spotsNearby(activeSpots.length);
    }
    return t.spotsGlobal;
  }, [locLoading, location, activeSpots, t]);

  const sortedForecasts = useMemo(() => {
    const fav = forecasts.filter(f => favs.includes(f.spot.id));
    const rest = forecasts.filter(f => !favs.includes(f.spot.id));
    return [...fav, ...rest];
  }, [forecasts, favs]);

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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
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

  useEffect(() => {
    if (sortedForecasts.length > 0) setStoredForecasts(sortedForecasts);
    else if (forecasts.length > 0) setStoredForecasts(forecasts);
  }, [sortedForecasts, forecasts]);

  const navigateToSpot = useCallback((forecast: SpotForecast) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const allList = sortedForecasts.length > 0 ? sortedForecasts : forecasts;
    setStoredForecasts(allList);
    const idx = allList.findIndex(f => f.spot.id === forecast.spot.id);
    navigation.navigate('SpotDetail', { forecast, spotIndex: idx >= 0 ? idx : 0 });
  }, [navigation, sortedForecasts, forecasts]);

  const navigateToPick = useCallback((pick: BestPick) => { navigateToSpot(pick.forecast); }, [navigateToSpot]);

  const loadAndNavigateToSpot = useCallback(async (spot: SpotConfig) => {
    setLoadingSearchSpot(spot.id);
    try {
      const { marine, weather } = await fetchSpotData(spot.latitude, spot.longitude);
      const forecast = computeSpotForecast(spot, marine, weather, profile, locale);
      setForecasts(prev => {
        const next = [...prev.filter(f => f.spot.id !== spot.id), forecast].sort((a, b) => b.currentScore - a.currentScore);
        setStoredForecasts(next);
        const idx = next.findIndex(f => f.spot.id === spot.id);
        setTimeout(() => navigation.navigate('SpotDetail', { forecast, spotIndex: idx >= 0 ? idx : 0 }), 0);
        return next;
      });
      setLoadingSearchSpot(null);
      onSubmitSearch();
      setSearchQuery('');
    } catch {
      setLoadingSearchSpot(null);
      showToast(t.spotsSearchError, 'error');
    }
  }, [profile, navigation, showToast, onSubmitSearch, locale, t]);

  const isLoading = (loadedCount === 0 && forecasts.length === 0 && !error) || locLoading;
  const hasEnoughData = totalCount > 0 && (forecasts.length >= Math.min(4, totalCount) || loadedCount >= totalCount);

  const renderHeader = () => (
    <View style={[ss.header, { paddingTop: insets.top + spacing.md }]}>
      <View style={ss.headerLeft}>
        <View style={ss.logoRow}>
          <Logo size={26} color={colors.accent} />
          <Text style={[ss.logo, { color: colors.white }]} accessibilityRole="header">SpotWave</Text>
        </View>
        <Text style={[ss.subtitle, { color: colors.textMuted }]}>
          {location ? '📍 ' : ''}{locationLabel} · {levelTxt}
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
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setMode(m);
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
      <Text style={[ss.filterCount, { color: colors.textMuted }]}>
        {t.spotsFilterResultsCount(filteredForecasts.length)}
      </Text>
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
        onSubmitEditing={onSubmitSearch}
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
    const showRecents = !hasQuery && searchHistory.length > 0;

    if (!hasQuery && !showRecents) return null;

    return (
      <View style={ss.searchResults}>
        {hasQuery && searchResults.length === 0 && (
          <Text style={[ss.searchEmpty, { color: colors.textMuted }]}>{t.spotsSearchEmpty(searchQuery)}</Text>
        )}

        {showRecents && (
          <>
            <View style={ss.recentsHeader}>
              <Text style={[ss.recentsLabel, { color: colors.textMuted }]}>{t.spotsSearchRecent}</Text>
              <TouchableOpacity
                onPress={handleClearHistory}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t.spotsSearchClearHistory}
              >
                <Text style={[ss.recentsClear, { color: colors.accent }]}>{t.spotsSearchClearHistory}</Text>
              </TouchableOpacity>
            </View>
            {searchHistory.map(q => (
              <TouchableOpacity
                key={q}
                style={[ss.recentItem, { backgroundColor: colors.card }]}
                onPress={() => setSearchQuery(q)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={q}
              >
                <Ionicons name="time-outline" size={16} color={colors.textMuted} />
                <Text style={[ss.recentTxt, { color: colors.white }]}>{q}</Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        {hasQuery && searchResults.map((spot) => {
          const forecast = forecasts.find(f => f.spot.id === spot.id);
          const dist = distanceMap.get(spot.id);
          const isLoadingThis = loadingSearchSpot === spot.id;
          return (
            <TouchableOpacity
              key={spot.id}
              style={[ss.searchItem, { backgroundColor: colors.card }, isLoadingThis && { opacity: 0.6 }]}
              activeOpacity={0.7}
              disabled={isLoadingThis}
              onPress={() => {
                onSubmitSearch();
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
                  {spot.region} · {spot.country}
                  {dist != null ? `  ·  📍 ${formatDistance(dist)}` : ''}
                </Text>
                {isLoadingThis && (
                  <Text style={[ss.searchLoading, { color: colors.accent }]}>{t.spotsSearchLoading}</Text>
                )}
              </View>
              <View style={[ss.levelBadge, { backgroundColor: getLevelBadge(spot.recommendedLevel, t).bg }]}>
                <Text style={[ss.levelBadgeTxt, { color: getLevelBadge(spot.recommendedLevel, t).color }]}>{getLevelBadge(spot.recommendedLevel, t).label}</Text>
              </View>
              {forecast && <ScoreBadge score={forecast.currentScore} size="sm" />}
              {isLoadingThis && <ActivityIndicator size="small" color={colors.accent} />}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  // ─── Loading state ───
  if (isLoading || !hasEnoughData) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} showsVerticalScrollIndicator={false}>
        {renderHeader()}
        <View style={{ marginTop: spacing.xl }}>
          {[0, 1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
        </View>
      </ScrollView>
    );
  }

  // ─── Error state ───
  if (error && forecasts.length === 0) {
    return (
      <View style={[ss.loadWrap, { backgroundColor: colors.bg, paddingTop: insets.top + 40 }]}>
        <Text style={[ss.errTxt, { color: colors.red }]}>{error}</Text>
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

  // ─── Today mode: vertical scroll with Hero + Best Week + Explorer ───
  if (mode === 'today') {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
      >
        {renderHeader()}
        <View style={ss.controlsWrap}>
          {renderModeTabs()}
          {renderSearchBar()}
        </View>
        {renderSearchOverlay()}

        {searchQuery.length === 0 && (
          <>
            <View style={ss.metaRow}>
              {loadedCount < totalCount && totalCount > 0 ? (
                <View style={ss.progressRow}>
                  <ActivityIndicator size="small" color={colors.accent} />
                  <Text style={[ss.metaTxt, { color: colors.textMuted }]}>{loadedCount}/{totalCount} spot{totalCount !== 1 ? 's' : ''}</Text>
                </View>
              ) : lastUpdate ? (
                <Text style={[ss.metaTxt, { color: colors.textMuted }]}>{t.spotsUpdated(fmtElapsed(lastUpdate, t))}</Text>
              ) : null}
              {failedCount > 0 && <Text style={[ss.metaTxt, { color: colors.orange }]}>{t.spotsUnavailable(failedCount)}</Text>}
            </View>

            {/* HERO simplifié */}
            {bestToday ? (
              <TouchableOpacity
                style={[ss.hero, { backgroundColor: colors.card, borderColor: colors.border }]}
                activeOpacity={0.8}
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
                      {scoreEmoji(bestToday.cond.score)} {scoreLabel(bestToday.cond.score, t)}
                    </Text>
                  </View>
                </View>
                <View style={[ss.heroBar, { borderTopColor: colors.border }]}>
                  <MiniStat icon="🌊" value={`${bestToday.cond.swellHeight.toFixed(1)}m`} sub={t.spotsSwell} colors={colors} />
                  <MiniStat icon="⏱" value={`${bestToday.cond.swellPeriod.toFixed(0)}s`} sub={t.spotsPeriod} colors={colors} />
                  <MiniStat icon="💨" value={windLabel(bestToday.cond.windSpeed, bestToday.cond.windDirection, bestToday.beachOrientation)} sub={`${bestToday.cond.windSpeed.toFixed(0)} km/h`} colors={colors} />
                  <MiniStat icon="🌡" value={`${bestToday.cond.seaTemp.toFixed(0)}°`} sub={t.spotsSeaTemp} colors={colors} />
                </View>
              </TouchableOpacity>
            ) : (
              <View style={[ss.emptyHero, { backgroundColor: colors.card }]}>
                <Text style={ss.emptyEmoji}>🏖️</Text>
                <Text style={[ss.emptyTitle, { color: colors.white }]}>{t.spotsNoConditions}</Text>
                <Text style={[ss.emptySubtitle, { color: colors.textMuted }]}>
                  {bestWeek.length > 0 ? t.spotsNextSlot(bestWeek[0].dayLabel, bestWeek[0].spotName) : t.spotsNoSlotWeek}
                </Text>
              </View>
            )}

            {/* Best week */}
            {bestWeek.length > 0 && (
              <View style={ss.weekSection}>
                <Text style={[ss.weekTitle, { color: colors.white }]} accessibilityRole="header">{t.spotsBestWeek}</Text>
                {bestWeek.map((pick, idx) => {
                  const conf = getConfidenceForDate(pick.cond.time);
                  const confCol = confidenceColor(conf, colors);
                  return (
                    <TouchableOpacity
                      key={`${pick.spotId}-${pick.cond.time}`}
                      style={[ss.weekCard, { backgroundColor: colors.card }, idx === 0 && { borderColor: scoreColor(pick.cond.score), borderWidth: 1 }]}
                      activeOpacity={0.7}
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
                              <View style={[ss.confDot, { backgroundColor: confCol }]} accessibilityLabel={`${t.detailDataAccuracy} ${conf}`} />
                            )}
                          </View>
                          <Text style={[ss.weekSpot, { color: colors.textSecondary }]}>{pick.spotName} · {pick.timeRange}</Text>
                          <View style={ss.weekStats}>
                            <Text style={[ss.weekStat, { color: colors.textMuted }]}>🌊 {pick.cond.swellHeight.toFixed(1)}m</Text>
                            <Text style={[ss.weekStat, { color: colors.textMuted }]}>⏱ {pick.cond.swellPeriod.toFixed(0)}s</Text>
                            <Text style={[ss.weekStat, { color: colors.textMuted }]}>💨 {pick.cond.windSpeed.toFixed(0)} km/h</Text>
                          </View>
                        </View>
                      </View>
                      <View style={ss.weekRight}>
                        <ScoreBadge score={pick.cond.score} size="md" />
                        <Text style={[ss.weekLabel, { color: scoreColor(pick.cond.score) }]} numberOfLines={1}>{scoreShort(pick.cond.score, t)}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Explorer par continent (collapsible) */}
            <View style={ss.destSection}>
              <TouchableOpacity
                style={ss.destHeader}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setExploreOpen(o => !o);
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t.spotsExplore}
                accessibilityState={{ expanded: exploreOpen }}
              >
                <View style={ss.destHeaderLeft}>
                  <Text style={[ss.destTitle, { color: colors.white }]} accessibilityRole="header">{t.spotsExplore}</Text>
                  <Text style={[ss.destSub, { color: colors.textMuted }]}>
                    {SPOTS.length} spots · {Array.from(new Set(SPOTS.map(s => s.country))).length} {locale === 'fr' ? 'pays' : 'countries'}
                  </Text>
                </View>
                <Ionicons
                  name={exploreOpen ? 'chevron-up' : 'chevron-down'}
                  size={22}
                  color={colors.textMuted}
                  style={ss.destChevron}
                />
              </TouchableOpacity>

              {exploreOpen && CONTINENTS.map((cont) => {
                const countriesInContinent = DESTINATIONS.filter(d => COUNTRY_TO_CONTINENT[d.country] === cont.key);
                if (countriesInContinent.length === 0) return null;
                return (
                  <View key={cont.key} style={ss.continentBlock}>
                    <Text style={[ss.continentLabel, { color: colors.textSecondary }]}>{cont.emoji} {locale === 'fr' ? cont.labelFr : cont.labelEn}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ss.destRow}>
                      {countriesInContinent.map((d) => (
                        <TouchableOpacity
                          key={d.country}
                          style={[ss.destCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                          activeOpacity={0.7}
                          onPress={() => navigation.navigate('MapTab', { focusCountry: d.country })}
                          accessibilityRole="button"
                          accessibilityLabel={`${d.country}, ${d.spots} spots`}
                        >
                          <Text style={ss.destEmoji}>{d.emoji}</Text>
                          <Text style={[ss.destName, { color: colors.white }]} numberOfLines={1}>{d.country}</Text>
                          <Text style={[ss.destCount, { color: colors.textMuted }]}>{d.spots} spots</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                );
              })}
            </View>

            <View style={{ height: 100 }} />
          </>
        )}
      </ScrollView>
    );
  }

  // ─── All spots mode: SectionList (virtualisé) groupé par région ───
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SectionList
        sections={regionSections}
        keyExtractor={(item) => item.spot.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
        ListHeaderComponent={
          <>
            {renderHeader()}
            <View style={ss.controlsWrap}>
              {renderModeTabs()}
              {renderSearchBar()}
            </View>
            {renderSearchOverlay()}
            {searchQuery.length === 0 && (
              <View style={ss.metaRow}>
                {loadedCount < totalCount && totalCount > 0 ? (
                  <View style={ss.progressRow}>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={[ss.metaTxt, { color: colors.textMuted }]}>{loadedCount}/{totalCount} spots</Text>
                  </View>
                ) : lastUpdate ? (
                  <Text style={[ss.metaTxt, { color: colors.textMuted }]}>{t.spotsUpdated(fmtElapsed(lastUpdate, t))}</Text>
                ) : null}
                {failedCount > 0 && <Text style={[ss.metaTxt, { color: colors.orange }]}>{t.spotsUnavailable(failedCount)}</Text>}
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
        ListFooterComponent={<View style={{ height: 100 }} />}
        renderSectionHeader={searchQuery.length > 0 ? undefined : ({ section }) => (
          <Text style={[ss.secTitle, { color: colors.white, backgroundColor: colors.bg }]} accessibilityRole="header">{section.title}</Text>
        )}
        renderItem={searchQuery.length > 0 ? () => null : ({ item }: ListRenderItemInfo<SpotForecast>) => (
          <SpotCard
            forecast={item}
            isFav={favs.includes(item.spot.id)}
            distance={distanceMap.get(item.spot.id)}
            onPress={() => navigateToSpot(item)}
            onToggleFav={() => handleToggleFav(item.spot.id)}
            colors={colors}
          />
        )}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const SpotCard = memo(function SpotCard({
  forecast: f, isFav, distance, onPress, onToggleFav, colors,
}: {
  forecast: SpotForecast; isFav: boolean; distance?: number; onPress: () => void; onToggleFav: () => void; colors: any;
}) {
  const { t } = useI18n();
  const cc = f.currentCondition;
  const wl = cc ? windLabel(cc.windSpeed, cc.windDirection, f.spot.beachOrientation) : '';
  const isOnshore = wl === 'Onshore' || wl === 'Cross-on';
  const badge = getLevelBadge(f.spot.recommendedLevel, t);
  return (
    <TouchableOpacity
      style={[ss.spot, { backgroundColor: colors.card, borderColor: colors.border }]}
      activeOpacity={0.7}
      onPress={onPress}
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
            {scoreEmoji(f.currentScore)} {scoreLabel(f.currentScore, t)}
          </Text>
          <View style={ss.spotMeta}>
            <View style={[ss.levelBadgeSm, { backgroundColor: badge.bg }]}>
              <Text style={[ss.levelBadgeSmTxt, { color: badge.color }]}>{badge.label}</Text>
            </View>
            {f.spot.webcamUrl && <Text style={ss.webcamIndicator} accessibilityLabel={t.detailWebcam}>📹</Text>}
            {distance != null && (
              <Text style={[ss.spotDistance, { color: colors.accent }]}>📍 {formatDistance(distance)}</Text>
            )}
          </View>
        </View>
        <TouchableOpacity
          onPress={onToggleFav}
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
          <Text style={[ss.spotStat, { color: colors.textSecondary }]}>{weatherIcon(cc.weatherCode)} {cc.temperature.toFixed(0)}°</Text>
          <Text style={[ss.spotDot, { color: colors.border }]}>·</Text>
          <Text style={[ss.spotStat, { color: colors.textSecondary }]}>🌊 {cc.swellHeight.toFixed(1)}m</Text>
          <Text style={[ss.spotDot, { color: colors.border }]}>·</Text>
          <Text style={[ss.spotStat, { color: colors.textSecondary }]}>{cc.swellPeriod.toFixed(0)}s</Text>
          <Text style={[ss.spotDot, { color: colors.border }]}>·</Text>
          <Text style={[ss.spotStat, { color: isOnshore ? colors.red : colors.textSecondary }]}>💨 {wl} {cc.windSpeed.toFixed(0)}</Text>
          {cc.windGusts > 20 && (
            <><Text style={[ss.spotDot, { color: colors.border }]}>·</Text><Text style={[ss.spotStat, { color: colors.orange }]}>💥 {cc.windGusts.toFixed(0)}</Text></>
          )}
          <Text style={[ss.spotDot, { color: colors.border }]}>·</Text>
          <Text style={[ss.spotStat, { color: colors.blue }]}>🌡 {cc.seaTemp.toFixed(0)}°</Text>
        </View>
      )}
      {f.bestTime.score >= RIDABLE_SCORE ? (
        <View style={[ss.spotBest, { backgroundColor: scoreBg(f.bestTime.score) }]}>
          <Text style={[ss.spotBestTxt, { color: scoreColor(f.bestTime.score) }]}>
            ⏰ {f.bestTime.label} — {scoreShort(f.bestTime.score, t)} ({f.bestTime.score.toFixed(1)})
          </Text>
        </View>
      ) : (
        <View style={[ss.spotBest, { backgroundColor: colors.cardLight }]}>
          <Text style={[ss.spotBestTxt, { color: colors.textMuted }]}>
            💤 {t.spotsNoGoodWindow}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
});

function FilterChip({ label, active, onPress, colors }: { label: string; active: boolean; onPress: () => void; colors: any }) {
  return (
    <TouchableOpacity
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
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

function MiniStat({ icon, value, sub, colors }: { icon: string; value: string; sub: string; colors: any }) {
  return (
    <View style={ss.ms} accessibilityLabel={`${sub} ${value}`}>
      <Text style={ss.msIcon}>{icon}</Text>
      <Text style={[ss.msVal, { color: colors.white }]}>{value}</Text>
      <Text style={[ss.msSub, { color: colors.textMuted }]}>{sub}</Text>
    </View>
  );
}

const ss = StyleSheet.create({
  loadWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errTxt: { ...typography.h3, fontSize: 15, textAlign: 'center', paddingHorizontal: spacing.xxxl, fontWeight: '500' },
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
  filterCount: { ...typography.micro, paddingHorizontal: 4 },
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

  recentsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  recentsLabel: { ...typography.tiny },
  recentsClear: { ...typography.micro },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.xs,
    minHeight: touchTarget.min,
  },
  recentTxt: { ...typography.bodyBold, fontWeight: '500' },

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
  emptyTitle: { ...typography.h2, fontSize: 17, textAlign: 'center' },
  emptySubtitle: { ...typography.caption, fontSize: 13, marginTop: spacing.xs, textAlign: 'center' },

  hero: {
    margin: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
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
  msVal: { ...typography.bodyBold, fontWeight: '800' },
  msSub: { ...typography.tiny, fontSize: 10, marginTop: 2 },

  weekSection: { marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  weekTitle: { ...typography.h2, marginBottom: spacing.md },
  weekCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
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
  weekRankTxt: { ...typography.caption, fontWeight: '800' },
  weekInfo: { flex: 1 },
  weekDayRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  weekDay: { ...typography.h3, fontSize: 15 },
  confDot: { width: 7, height: 7, borderRadius: 4 },
  weekSpot: { ...typography.caption, marginTop: 2 },
  weekStats: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  weekStat: { ...typography.micro, fontWeight: '500' },
  weekRight: { alignItems: 'center', justifyContent: 'center', marginLeft: spacing.md, width: 62 },
  weekLabel: { ...typography.tiny, marginTop: spacing.xs, textAlign: 'center' },

  secTitle: {
    ...typography.h2,
    fontSize: 18,
    paddingLeft: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },

  destSection: { marginTop: spacing.md },
  destHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  destHeaderLeft: { flex: 1 },
  destTitle: { ...typography.h2, fontSize: 18 },
  destSub: { ...typography.micro, marginTop: 2 },
  destChevron: { marginLeft: spacing.md },
  continentBlock: { marginTop: spacing.md },
  continentLabel: {
    ...typography.h3,
    fontSize: 13,
    marginLeft: spacing.xl,
    marginBottom: spacing.sm,
  },
  destRow: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.xs },
  destCard: {
    width: 120,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  destEmoji: { fontSize: 28, marginBottom: spacing.xs },
  destName: { ...typography.caption, textAlign: 'center', fontWeight: '700' },
  destCount: { ...typography.tiny, fontSize: 10, marginTop: 2, textTransform: 'none', letterSpacing: 0 },

  spot: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  spotHead: { flexDirection: 'row', alignItems: 'center' },
  spotInfo: { flex: 1, marginLeft: spacing.md },
  spotNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  spotName: { ...typography.h2, fontSize: 17, flexShrink: 1 },
  spotLabel: { ...typography.caption, fontSize: 13, marginTop: 3 },
  spotMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  levelBadgeSm: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.sm },
  levelBadgeSmTxt: { fontSize: 9, fontWeight: '700' },
  spotDistance: { ...typography.micro, fontSize: 11 },
  webcamIndicator: { fontSize: 11 },
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
    gap: 2,
  },
  spotStat: { ...typography.caption, fontWeight: '500' },
  spotDot: { fontSize: 12, marginHorizontal: spacing.xs },
  spotBest: {
    marginTop: spacing.md,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm - 1,
    paddingHorizontal: spacing.md,
  },
  spotBestTxt: { ...typography.caption, fontWeight: '600' },
});
