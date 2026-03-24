import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Animated,
} from 'react-native';
import { useProfile } from '../context/ProfileContext';
import { useTheme } from '../context/ThemeContext';
import { useLocation } from '../context/LocationContext';
import { fetchSpotData } from '../services/api';
import { computeSpotForecast } from '../utils/scoring';
import { getFavorites, toggleFavorite } from '../services/favorites';
import { getNearbySpotsWithFallback, getGlobalShowcase, haversineDistance, formatDistance } from '../services/location';
import { setStoredForecasts } from '../context/ForecastStore';
import SPOTS from '../data/spots';
import ScoreBadge from '../components/ScoreBadge';
import SkeletonCard from '../components/SkeletonCard';
import Logo from '../components/Logo';
import { SpotConfig, SpotForecast, HourlyCondition } from '../types';
import { Ionicons } from '@expo/vector-icons';
import { scoreColor, scoreBg, scoreLabel, scoreEmoji, scoreShort, dirLabel, windLabel, isDaytime, weatherIcon } from '../theme';
import { SurferProfile } from '../types';
import { SpotsScreenProps } from '../navigation/types';
import { CONTINENTS, COUNTRY_TO_CONTINENT, ContinentKey } from '../data/continents';
import * as Haptics from 'expo-haptics';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import { scheduleGoodConditionAlerts, getAlertsEnabled } from '../services/notifications';
import { LEVEL_BADGE, fmtDayLabel, fmtRange, fmtElapsed } from '../utils/constants';

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
        spotName: f.spot.name, spotId: f.spot.id, forecast: f, cond: c,
        beachOrientation: f.spot.beachOrientation,
        dayLabel: fmtDayLabel(c.time, now),
        timeRange: fmtRange(c.time, sessionDuration, availableTo),
      };
      if (isToday && (!bestToday || c.score > bestToday.cond.score)) bestToday = pick;
      if (!dayBest[dateKey] || c.score > dayBest[dateKey].cond.score) dayBest[dateKey] = pick;
    }
  }

  return { bestToday, bestWeek: Object.values(dayBest).sort((a, b) => a.cond.time.localeCompare(b.cond.time)).slice(0, 5) };
}

export default function SpotsScreen({ navigation }: SpotsScreenProps) {
  const { profile, version } = useProfile();
  const { colors } = useTheme();
  const { location, loading: locLoading } = useLocation();
  const { show: showToast } = useToast();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();

  const [forecasts, setForecasts] = useState<SpotForecast[]>([]);
  const [favs, setFavs] = useState<string[]>([]);
  const [countryFilter, setCountryFilter] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingSearchSpot, setLoadingSearchSpot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const initialLoad = useRef(true);
  const prevVersion = useRef(version);
  const prevLocationKey = useRef('');
  const prevZone = useRef(profile.preferredZone);

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
    return getGlobalShowcase(SPOTS, 30);
  }, [location, profile.preferredZone]);

  const favSpotsOutsideZone = useMemo(() => {
    return SPOTS.filter(s => favs.includes(s.id) && !activeSpots.find(a => a.id === s.id));
  }, [favs, activeSpots]);

  const allSpotsToLoad = useMemo(() => {
    const ids = new Set(activeSpots.map(s => s.id));
    const extra = favSpotsOutsideZone.filter(s => !ids.has(s.id));
    return [...activeSpots, ...extra];
  }, [activeSpots, favSpotsOutsideZone]);

  const countries = useMemo(() => {
    const loaded = new Set(forecasts.map(f => f.spot.country));
    return Array.from(loaded);
  }, [forecasts]);

  const regions = useMemo(() => {
    const filtered = countryFilter ? forecasts.filter(f => f.spot.country === countryFilter) : forecasts;
    return Array.from(new Set(filtered.map(f => f.spot.region)));
  }, [forecasts, countryFilter]);

  useEffect(() => { getFavorites().then(setFavs); }, []);

  const handleToggleFav = useCallback(async (spotId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const next = await toggleFavorite(spotId);
    setFavs(next);
    showToast(next.includes(spotId) ? t.spotsAddedFav : t.spotsRemovedFav, 'success');
  }, [showToast]);

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

      const BATCH_SIZE = 4;
      for (let i = 0; i < spotsToLoad.length; i += BATCH_SIZE) {
        const batch = spotsToLoad.slice(i, i + BATCH_SIZE).filter(
          sp => force || !results.find(r => r.spot.id === sp.id)
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
  }, [profile, allSpotsToLoad, locale]);

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

  const filteredForBest = useMemo(() => {
    let list = forecasts;
    if (countryFilter) list = list.filter(f => f.spot.country === countryFilter);
    if (regionFilter) list = list.filter(f => f.spot.region === regionFilter);
    return list;
  }, [forecasts, countryFilter, regionFilter]);

  const { bestToday, bestWeek } = useMemo(() => findBestPicks(filteredForBest, profile), [filteredForBest, profile]);
  const levelTxt = profile.level === 'beginner' ? t.levelBeginner : profile.level === 'intermediate' ? t.levelIntermediate : t.levelExpert;

  const locationLabel = useMemo(() => {
    if (locLoading) return t.spotsLocating;
    if (location && activeSpots.length > 0) {
      const nearCountries = Array.from(new Set(activeSpots.slice(0, 10).map(s => s.country)));
      return nearCountries.length <= 2 ? nearCountries.join(' · ') : t.spotsNearby(activeSpots.length);
    }
    return t.spotsGlobal;
  }, [locLoading, location, activeSpots, t]);

  const sortedForecasts = useMemo(() => {
    let list = forecasts;
    if (countryFilter) list = list.filter(f => f.spot.country === countryFilter);
    if (regionFilter) list = list.filter(f => f.spot.region === regionFilter);
    const fav = list.filter(f => favs.includes(f.spot.id));
    const rest = list.filter(f => !favs.includes(f.spot.id));
    return [...fav, ...rest];
  }, [forecasts, favs, countryFilter, regionFilter]);

  const regionGroups = useMemo(() => {
    const map: Record<string, SpotForecast[]> = {};
    for (const f of sortedForecasts) {
      const r = f.spot.region || 'Autre';
      if (!map[r]) map[r] = [];
      map[r].push(f);
    }
    return Object.entries(map);
  }, [sortedForecasts]);

  useEffect(() => {
    if (sortedForecasts.length > 0) setStoredForecasts(sortedForecasts);
    else if (forecasts.length > 0) setStoredForecasts(forecasts);
  }, [sortedForecasts, forecasts]);

  const navigateToSpot = useCallback((forecast: SpotForecast) => {
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
      setSearchOpen(false);
      setSearchQuery('');
    } catch {
      setLoadingSearchSpot(null);
      showToast(t.spotsSearchError, 'error');
    }
  }, [profile, navigation, showToast]);

  const isLoading = (loadedCount === 0 && forecasts.length === 0 && !error) || locLoading;
  const hasEnoughData = totalCount > 0 && (forecasts.length >= Math.min(8, totalCount) || loadedCount >= totalCount);

  if (isLoading || !hasEnoughData) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} showsVerticalScrollIndicator={false}>
        <View style={[ss.header, { paddingTop: insets.top + 12 }]}>
          <View style={ss.headerLeft}>
            <View style={ss.logoRow}>
              <Logo size={26} color={colors.accent} />
              <Text style={[ss.logo, { color: colors.white }]}>SpotWave</Text>
            </View>
            <Text style={[ss.subtitle, { color: colors.white40 }]}>
              {locLoading ? t.spotsLocating : t.spotsLoading}
            </Text>
          </View>
        </View>
        <View style={{ marginTop: 20 }}>
          {[0, 1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
        </View>
      </ScrollView>
    );
  }

  if (error && forecasts.length === 0) {
    return (
      <View style={[ss.loadWrap, { backgroundColor: colors.bg, paddingTop: insets.top + 40 }]}>
        <Text style={[ss.errTxt, { color: colors.red }]}>{error}</Text>
        <TouchableOpacity onPress={onRefresh} style={[ss.retryBtn, { backgroundColor: colors.cardLight }]}           accessibilityLabel={t.retry} accessibilityRole="button">
          <Text style={[ss.retryTxt, { color: colors.accent }]}>{t.retry}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const filterChips: { key: string; label: string; active: boolean; onPress: () => void }[] = [];
  filterChips.push({ key: 'all', label: t.spotsAll, active: !countryFilter && !regionFilter, onPress: () => { setCountryFilter(null); setRegionFilter(null); } });

  if (countries.length > 1) {
    for (const c of countries) {
      filterChips.push({
        key: `c-${c}`, label: c, active: countryFilter === c && !regionFilter,
        onPress: () => { setCountryFilter(prev => prev === c ? null : c); setRegionFilter(null); },
      });
    }
  }

  if (countryFilter && regions.length > 1) {
    for (const r of regions) {
      filterChips.push({ key: `r-${r}`, label: r, active: regionFilter === r, onPress: () => setRegionFilter(prev => prev === r ? null : r) });
    }
  }

  if (!countryFilter && countries.length <= 1 && regions.length > 1) {
    for (const r of regions) {
      filterChips.push({ key: `r-${r}`, label: r, active: regionFilter === r, onPress: () => setRegionFilter(prev => prev === r ? null : r) });
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
    >
      {/* Header */}
      <View style={[ss.header, { paddingTop: insets.top + 12 }]}>
        <View style={ss.headerLeft}>
          <View style={ss.logoRow}>
            <Logo size={26} color={colors.accent} />
            <Text style={[ss.logo, { color: colors.white }]}>SpotWave</Text>
          </View>
          <Text style={[ss.subtitle, { color: colors.white40 }]}>
            {location ? '📍 ' : ''}{locationLabel} · {levelTxt}
          </Text>
        </View>
        <View style={ss.headerRight}>
          {refreshing && (
            <View style={[ss.loadingPill, { backgroundColor: colors.cardLight }]}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={[ss.loadingTxt, { color: colors.white40 }]}>{loadedCount}/{totalCount}</Text>
            </View>
          )}
          <TouchableOpacity style={[ss.headerBtn, { backgroundColor: searchOpen ? colors.accentDim : colors.cardLight }]} onPress={() => { setSearchOpen(!searchOpen); if (searchOpen) setSearchQuery(''); }} activeOpacity={0.7} accessibilityLabel={t.spotsSearch} accessibilityRole="button">
            <Ionicons name={searchOpen ? 'close' : 'search'} size={20} color={searchOpen ? colors.accent : colors.white70} />
          </TouchableOpacity>
          <TouchableOpacity style={[ss.headerBtn, { backgroundColor: colors.cardLight }]} onPress={() => navigation.navigate('Guide')} activeOpacity={0.7} accessibilityLabel={t.profileGuide} accessibilityRole="button">
            <Ionicons name="help-circle-outline" size={20} color={colors.white70} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search bar */}
      {searchOpen && (
        <View style={[ss.searchWrap, { backgroundColor: colors.card }]}>
          <Ionicons name="search" size={18} color={colors.white40} />
          <TextInput
            style={[ss.searchInput, { color: colors.white }]}
            placeholder="Rechercher un spot, pays, région..."
            placeholderTextColor={colors.white40}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
            accessibilityLabel="Rechercher un spot"
            accessibilityRole="search"
            returnKeyType="search"
          />
          {searchQuery.length > 0 && searchOpen && (
            <TouchableOpacity onPress={() => setSearchQuery('')} accessibilityLabel="Effacer la recherche" accessibilityRole="button">
              <Ionicons name="close-circle" size={18} color={colors.white40} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Search results */}
      {searchOpen && searchQuery.length > 0 && (
        <View style={ss.searchResults}>
          {searchResults.length === 0 ? (
            <Text style={[ss.searchEmpty, { color: colors.white40 }]}>{t.spotsSearchEmpty(searchQuery)}</Text>
          ) : (
            searchResults.map((spot) => {
              const forecast = forecasts.find(f => f.spot.id === spot.id);
              const dist = distanceMap.get(spot.id);
              const badge = LEVEL_BADGE[spot.recommendedLevel];
              const isLoadingThis = loadingSearchSpot === spot.id;
              return (
                <TouchableOpacity
                  key={spot.id}
                  style={[ss.searchItem, { backgroundColor: colors.card }, isLoadingThis && { opacity: 0.6 }]}
                  activeOpacity={0.7}
                  disabled={isLoadingThis}
                  onPress={() => {
                    if (forecast) {
                      navigateToSpot(forecast);
                      setSearchOpen(false);
                      setSearchQuery('');
                    } else {
                      loadAndNavigateToSpot(spot);
                    }
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[ss.searchName, { color: colors.white }]}>{spot.name}</Text>
                    <Text style={[ss.searchMeta, { color: colors.white40 }]}>
                      {spot.region} · {spot.country}
                      {dist != null ? `  ·  📍 ${formatDistance(dist)}` : ''}
                    </Text>
                    {isLoadingThis && (
                      <Text style={[ss.searchLoading, { color: colors.accent }]}>{t.spotsSearchLoading}</Text>
                    )}
                  </View>
                  <View style={[ss.levelBadge, { backgroundColor: badge.bg }]}>
                    <Text style={[ss.levelBadgeTxt, { color: badge.color }]}>{badge.label}</Text>
                  </View>
                  {forecast && <ScoreBadge score={forecast.currentScore} size="sm" />}
                  {isLoadingThis && <ActivityIndicator size="small" color={colors.accent} />}
                </TouchableOpacity>
              );
            })
          )}
        </View>
      )}

      {/* Filters */}
      {!searchOpen && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={ss.filterRow} contentContainerStyle={ss.filterContent}>
            {filterChips.map(chip => (
              <TouchableOpacity
                key={chip.key}
                style={[ss.filterChip, { backgroundColor: chip.active ? colors.accentDim : colors.cardLight, borderColor: chip.active ? colors.accent : 'transparent' }]}
                onPress={chip.onPress}
                activeOpacity={0.7}
                accessibilityLabel={chip.label}
                accessibilityRole="button"
              >
                <Text style={[ss.filterTxt, { color: chip.active ? colors.accent : colors.white40 }]}>{chip.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Meta */}
          <View style={ss.metaRow}>
            {lastUpdate && <Text style={[ss.metaTxt, { color: colors.white40 }]}>{t.spotsUpdated(fmtElapsed(lastUpdate))}</Text>}
            {failedCount > 0 && <Text style={[ss.metaTxt, { color: colors.orange }]}>{t.spotsUnavailable(failedCount)}</Text>}
          </View>

          {/* HERO */}
          {bestToday ? (
            <TouchableOpacity style={[ss.hero, { backgroundColor: colors.card, borderColor: `${colors.accent}25` }]} activeOpacity={0.8} onPress={() => navigateToPick(bestToday)}>
              <Text style={[ss.heroQ, { color: colors.white }]}>{t.spotsWhereToSurf}</Text>
              <View style={ss.heroMain}>
                <View style={ss.heroLeft}>
                  <Text style={ss.heroEmoji}>{scoreEmoji(bestToday.cond.score)}</Text>
                  <ScoreBadge score={bestToday.cond.score} size="hero" animated />
                </View>
                <View style={ss.heroRight}>
                  <Text style={[ss.heroSpot, { color: colors.white }]}>{bestToday.spotName}</Text>
                  <Text style={[ss.heroRange, { color: colors.white70 }]}>{bestToday.timeRange}</Text>
                  <Text style={[ss.heroLabel, { color: scoreColor(bestToday.cond.score) }]}>{scoreLabel(bestToday.cond.score)}</Text>
                  {location && distanceMap.has(bestToday.spotId) && (
                    <Text style={[ss.heroDistance, { color: colors.white40 }]}>📍 {formatDistance(distanceMap.get(bestToday.spotId)!)}</Text>
                  )}
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
              <Text style={[ss.emptyTitle, { color: colors.white }]}>{t.spotsNoConditions}</Text>
              <Text style={[ss.emptySubtitle, { color: colors.white40 }]}>
                {bestWeek.length > 0 ? t.spotsNextSlot(bestWeek[0].dayLabel, bestWeek[0].spotName) : t.spotsNoSlotWeek}
              </Text>
            </View>
          )}

          {/* Best week */}
          {bestWeek.length > 0 && (
            <View style={ss.weekSection}>
              <Text style={[ss.weekTitle, { color: colors.white }]}>{t.spotsBestWeek}</Text>
              {bestWeek.map((pick, idx) => (
                <SlideFromRight key={`${pick.spotId}-${pick.cond.time}`} index={idx}>
                  <TouchableOpacity
                    style={[ss.weekCard, { backgroundColor: colors.card }, idx === 0 && { borderColor: scoreColor(pick.cond.score), borderWidth: 1 }]}
                    activeOpacity={0.7} onPress={() => navigateToPick(pick)}
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
                </SlideFromRight>
              ))}
            </View>
          )}

          {/* Spots by region */}
          {regionGroups.map(([region, regionForecasts]) => {
            let cardIdx = 0;
            return (
              <View key={region}>
                <Text style={[ss.secTitle, { color: colors.white }]}>{region}</Text>
                {regionForecasts.map((f) => (
                  <StaggerIn key={f.spot.id} index={cardIdx++}>
                    <SpotCard
                      forecast={f} isFav={favs.includes(f.spot.id)}
                      distance={distanceMap.get(f.spot.id)}
                      onPress={() => navigateToSpot(f)}
                      onToggleFav={() => handleToggleFav(f.spot.id)}
                      colors={colors}
                    />
                  </StaggerIn>
                ))}
              </View>
            );
          })}

          {/* Explorer par continent */}
          <View style={ss.destSection}>
            <Text style={[ss.secTitle, { color: colors.white }]}>{t.spotsExplore}</Text>
            <Text style={[ss.destSub, { color: colors.white40 }]}>
              {t.spotsExploreDesc(SPOTS.length, Array.from(new Set(SPOTS.map(s => s.country))).length)}
            </Text>
            {CONTINENTS.map((cont) => {
              const countriesInContinent = DESTINATIONS.filter(d => COUNTRY_TO_CONTINENT[d.country] === cont.key);
              if (countriesInContinent.length === 0) return null;
              return (
                <View key={cont.key} style={ss.continentBlock}>
                  <Text style={[ss.continentLabel, { color: colors.white70 }]}>{cont.emoji} {locale === 'fr' ? cont.labelFr : cont.labelEn}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ss.destRow}>
                    {countriesInContinent.map((d) => (
                      <TouchableOpacity
                        key={d.country}
                        style={[ss.destCard, { backgroundColor: colors.card }]}
                        activeOpacity={0.7}
                        onPress={() => navigation.navigate('MapTab', { focusCountry: d.country })}
                      >
                        <Text style={ss.destEmoji}>{d.emoji}</Text>
                        <Text style={[ss.destName, { color: colors.white }]} numberOfLines={1}>{d.country}</Text>
                        <Text style={[ss.destCount, { color: colors.white40 }]}>{d.spots} spots</Text>
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

function SlideFromRight({ index, children }: { index: number; children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;
  const slideX = useRef(new Animated.Value(80)).current;
  useEffect(() => {
    const delay = 150 + index * 100;
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(anim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(slideX, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
      ]).start();
    }, delay);
    return () => clearTimeout(timer);
  }, [anim, slideX, index]);
  return <Animated.View style={{ opacity: anim, transform: [{ translateX: slideX }] }}>{children}</Animated.View>;
}

function StaggerIn({ index, children }: { index: number; children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(20)).current;
  useEffect(() => {
    const delay = Math.min(index * 60, 400);
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(anim, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(slide, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]).start();
    }, delay);
    return () => clearTimeout(timer);
  }, [anim, slide, index]);
  return <Animated.View style={{ opacity: anim, transform: [{ translateY: slide }] }}>{children}</Animated.View>;
}

const SpotCard = memo(function SpotCard({
  forecast: f, isFav, distance, onPress, onToggleFav, colors,
}: {
  forecast: SpotForecast; isFav: boolean; distance?: number; onPress: () => void; onToggleFav: () => void; colors: any;
}) {
  const cc = f.currentCondition;
  const wl = cc ? windLabel(cc.windSpeed, cc.windDirection, f.spot.beachOrientation) : '';
  const isOnshore = wl === 'Onshore' || wl === 'Cross-on';
  const badge = LEVEL_BADGE[f.spot.recommendedLevel];
  return (
    <TouchableOpacity
      style={[ss.spot, { backgroundColor: colors.card }]} activeOpacity={0.7} onPress={onPress}
      accessibilityLabel={`${f.spot.name}, score ${f.currentScore.toFixed(1)}`} accessibilityRole="button"
    >
      <View style={ss.spotHead}>
        <ScoreBadge score={f.currentScore} size="lg" animated />
        <View style={ss.spotInfo}>
          <View style={ss.spotNameRow}>
            <Text style={[ss.spotName, { color: colors.white }]} numberOfLines={1}>{f.spot.name}</Text>
            {isFav && <Text style={ss.favStar}>★</Text>}
          </View>
          <Text style={[ss.spotLabel, { color: scoreColor(f.currentScore) }]}>
            {scoreEmoji(f.currentScore)} {scoreLabel(f.currentScore)}
          </Text>
          <View style={ss.spotMeta}>
            <View style={[ss.levelBadgeSm, { backgroundColor: badge.bg }]}>
              <Text style={[ss.levelBadgeSmTxt, { color: badge.color }]}>{badge.label}</Text>
            </View>
            {distance != null && (
              <Text style={[ss.spotDistance, { color: colors.accent }]}>📍 {formatDistance(distance)}</Text>
            )}
          </View>
        </View>
        <TouchableOpacity onPress={onToggleFav} style={ss.favBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'} accessibilityRole="button">
          <Ionicons name={isFav ? 'star' : 'star-outline'} size={22} color={isFav ? colors.yellow : colors.white40} />
        </TouchableOpacity>
      </View>
      {cc && (
        <View style={ss.spotBar}>
          <Text style={[ss.spotStat, { color: colors.white70 }]}>{weatherIcon(cc.weatherCode)}</Text>
          <Text style={[ss.spotDot, { color: colors.white15 }]}>·</Text>
          <Text style={[ss.spotStat, { color: colors.white70 }]}>🌊 {cc.swellHeight.toFixed(1)}m</Text>
          <Text style={[ss.spotDot, { color: colors.white15 }]}>·</Text>
          <Text style={[ss.spotStat, { color: colors.white70 }]}>{cc.swellPeriod.toFixed(0)}s</Text>
          <Text style={[ss.spotDot, { color: colors.white15 }]}>·</Text>
          <Text style={[ss.spotStat, { color: isOnshore ? colors.red : colors.white70 }]}>💨 {wl} {cc.windSpeed.toFixed(0)}</Text>
          {cc.windGusts > 20 && (
            <><Text style={[ss.spotDot, { color: colors.white15 }]}>·</Text><Text style={[ss.spotStat, { color: colors.orange }]}>💥 {cc.windGusts.toFixed(0)}</Text></>
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
});

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
  errTxt: { fontSize: 15, textAlign: 'center', paddingHorizontal: 30 },
  retryBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  retryTxt: { fontWeight: '700', fontSize: 14 },

  header: { paddingTop: 12, paddingHorizontal: 20, paddingBottom: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  headerLeft: { flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerBtn: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { fontSize: 30, fontWeight: '900', letterSpacing: -1 },
  subtitle: { fontSize: 12, marginTop: 3 },
  loadingPill: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, gap: 6 },
  loadingTxt: { fontSize: 11, fontWeight: '600' },

  searchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 10, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, gap: 10 },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '500', padding: 0 },
  searchResults: { marginHorizontal: 16, marginTop: 6 },
  searchEmpty: { fontSize: 13, fontWeight: '500', textAlign: 'center', paddingVertical: 20 },
  searchItem: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 6, gap: 10 },
  searchName: { fontSize: 15, fontWeight: '700' },
  searchMeta: { fontSize: 11, fontWeight: '500', marginTop: 2 },
  searchLoading: { fontSize: 11, fontWeight: '600', marginTop: 3 },
  levelBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  levelBadgeTxt: { fontSize: 10, fontWeight: '700' },

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
  heroDistance: { fontSize: 12, fontWeight: '500', marginTop: 4 },
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

  destSection: { marginTop: 10 },
  destSub: { fontSize: 12, fontWeight: '500', marginLeft: 20, marginBottom: 12 },
  continentBlock: { marginTop: 10 },
  continentLabel: { fontSize: 13, fontWeight: '800', marginLeft: 20, marginBottom: 8 },
  destRow: { paddingHorizontal: 16, gap: 10, paddingBottom: 4 },
  destCard: { width: 110, borderRadius: 14, padding: 14, alignItems: 'center' },
  destEmoji: { fontSize: 28, marginBottom: 6 },
  destName: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  destCount: { fontSize: 10, fontWeight: '500', marginTop: 2 },

  spot: { marginHorizontal: 16, marginBottom: 10, borderRadius: 16, padding: 16 },
  spotHead: { flexDirection: 'row', alignItems: 'center' },
  spotInfo: { flex: 1, marginLeft: 14 },
  spotNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  spotName: { fontSize: 17, fontWeight: '800', flexShrink: 1 },
  favStar: { color: '#FFD060', fontSize: 14 },
  spotLabel: { fontSize: 13, fontWeight: '600', marginTop: 3 },
  spotMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  levelBadgeSm: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  levelBadgeSmTxt: { fontSize: 9, fontWeight: '700' },
  spotDistance: { fontSize: 11, fontWeight: '600' },
  favBtn: { padding: 4 },
  spotBar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 12, paddingLeft: 4, gap: 2 },
  spotStat: { fontSize: 12, fontWeight: '500' },
  spotDot: { fontSize: 12, marginHorizontal: 4 },
  spotBest: { marginTop: 10, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12 },
  spotBestTxt: { fontSize: 12, fontWeight: '600' },
});
