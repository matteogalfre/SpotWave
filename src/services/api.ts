import AsyncStorage from '@react-native-async-storage/async-storage';
import { MarineData, WeatherData } from '../types';
import { log } from '../utils/logger';

const MARINE_BASE = 'https://marine-api.open-meteo.com/v1/marine';
const WEATHER_BASE = 'https://api.open-meteo.com/v1/forecast';
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_PURGE_AGE_MS = 24 * 60 * 60 * 1000;
const API_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 1;
const MIN_REQUEST_INTERVAL_MS = 100;

const inflight = new Map<string, Promise<unknown>>();
let lastRequestTime = 0;

async function throttle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise(r => setTimeout(r, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

const MARINE_PARAMS = [
  'wave_height', 'wave_direction', 'wave_period',
  'swell_wave_height', 'swell_wave_direction', 'swell_wave_period', 'swell_wave_peak_period',
  'wind_wave_height', 'wind_wave_direction', 'wind_wave_period',
  'sea_surface_temperature', 'ocean_current_velocity', 'ocean_current_direction', 'sea_level_height_msl',
].join(',');

const WEATHER_PARAMS = [
  'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'temperature_2m', 'weather_code',
].join(',');

/**
 * Open-Meteo returns the spot-local UTC offset at the top level of the response
 * (because we request `timezone=auto`). We fold it into the hourly object so it
 * survives caching and reaches the scoring layer for timezone-correct "now"/night.
 */
function withOffset<T extends object>(hourly: T, utcOffsetSeconds: unknown): T {
  if (!hourly || typeof hourly !== 'object') return hourly;
  if (typeof utcOffsetSeconds === 'number') {
    return { ...hourly, utc_offset_seconds: utcOffsetSeconds };
  }
  return hourly;
}

function validateMarineData(data: unknown): data is MarineData {
  if (!data || typeof data !== 'object') return false;
  const d = data as any;
  return Array.isArray(d.time) && d.time.length > 0
    && Array.isArray(d.wave_height)
    && Array.isArray(d.swell_wave_height);
}

function validateWeatherData(data: unknown): data is WeatherData {
  if (!data || typeof data !== 'object') return false;
  const d = data as any;
  return Array.isArray(d.time) && d.time.length > 0
    && Array.isArray(d.wind_speed_10m)
    && Array.isArray(d.temperature_2m);
}

function validateDailyData(data: unknown): data is DailyData {
  if (!data || typeof data !== 'object') return false;
  const d = data as any;
  return Array.isArray(d.time) && Array.isArray(d.sunrise) && Array.isArray(d.sunset);
}

async function getCached<T>(key: string, allowExpired = false): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (!allowExpired && Date.now() - ts > CACHE_TTL_MS) return null;
    return data as T;
  } catch (e) {
    log.warn('Cache read error:', key, e);
    return null;
  }
}

async function setCache(key: string, data: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch (e) {
    log.warn('Cache write error:', key, e);
  }
}

async function fetchWithTimeout(url: string, timeoutMs = API_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await throttle();
      const res = await fetchWithTimeout(url);
      if (res.status === 429) {
        const wait = Math.min(5000, 2000 * (attempt + 1));
        log.warn(`Rate limited (429), waiting ${wait}ms...`);
        await new Promise(r => setTimeout(r, wait));
        if (attempt >= retries) throw new Error('Trop de requêtes (429) — réessaie plus tard');
        continue;
      }
      if (!res.ok) {
        const msg = res.status >= 500
          ? 'Serveur temporairement indisponible'
          : res.status === 404
            ? 'Données non disponibles pour cette zone'
            : `Erreur API (${res.status})`;
        throw new Error(msg);
      }
      return res;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        if (attempt === retries) throw new Error('Connexion trop lente — vérifie ton réseau');
        continue;
      }
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new Error('Impossible de contacter le serveur');
}

function dedup<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = factory().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

function revalidateMarineInBackground(cacheKey: string, lat: number, lon: number, forecastDays: number): void {
  const url = `${MARINE_BASE}?latitude=${lat}&longitude=${lon}&hourly=${MARINE_PARAMS}&forecast_days=${forecastDays}&timezone=auto`;
  fetchWithRetry(url)
    .then(res => res.json())
    .then(json => {
      const data = withOffset(json.hourly, json.utc_offset_seconds);
      if (validateMarineData(data)) setCache(cacheKey, data);
    })
    .catch(() => {});
}

function revalidateWeatherInBackground(cacheKey: string, lat: number, lon: number, forecastDays: number): void {
  const url = `${WEATHER_BASE}?latitude=${lat}&longitude=${lon}&hourly=${WEATHER_PARAMS}&forecast_days=${forecastDays}&timezone=auto`;
  fetchWithRetry(url)
    .then(res => res.json())
    .then(json => {
      const data = withOffset(json.hourly, json.utc_offset_seconds);
      if (validateWeatherData(data)) setCache(cacheKey, data);
    })
    .catch(() => {});
}

export const DEFAULT_FORECAST_DAYS = 10;

export function fetchMarineData(lat: number, lon: number, forecastDays = DEFAULT_FORECAST_DAYS): Promise<MarineData> {
  const rlat = Math.round(lat * 100) / 100;
  const rlon = Math.round(lon * 100) / 100;
  const cacheKey = `@sw_marine_${rlat}_${rlon}`;
  return dedup(cacheKey, async () => {
    const cached = await getCached<MarineData>(cacheKey);
    if (cached && cached.sea_level_height_msl) return cached;

    try {
      const url = `${MARINE_BASE}?latitude=${lat}&longitude=${lon}&hourly=${MARINE_PARAMS}&forecast_days=${forecastDays}&timezone=auto`;
      const res = await fetchWithRetry(url);
      const json = await res.json();
      const data = withOffset(json.hourly, json.utc_offset_seconds);
      if (!validateMarineData(data)) throw new Error('Format de données marines invalide');
      setCache(cacheKey, data);
      return data;
    } catch (err) {
      // Offline fallback: accept any valid expired cache, even one saved before
      // tide data was added — swell/wind are enough to show a spot. The tide UI
      // already guards against a missing sea_level_height_msl array.
      const expired = await getCached<MarineData>(cacheKey, true);
      if (expired) {
        log.warn('Using expired marine cache for', lat, lon);
        revalidateMarineInBackground(cacheKey, lat, lon, forecastDays);
        return expired;
      }
      throw err;
    }
  });
}

export function fetchWeatherData(lat: number, lon: number, forecastDays = DEFAULT_FORECAST_DAYS): Promise<WeatherData> {
  const rlat = Math.round(lat * 100) / 100;
  const rlon = Math.round(lon * 100) / 100;
  const cacheKey = `@sw_weather_${rlat}_${rlon}`;
  return dedup(cacheKey, async () => {
    const cached = await getCached<WeatherData>(cacheKey);
    if (cached) return cached;

    try {
      const url = `${WEATHER_BASE}?latitude=${lat}&longitude=${lon}&hourly=${WEATHER_PARAMS}&forecast_days=${forecastDays}&timezone=auto`;
      const res = await fetchWithRetry(url);
      const json = await res.json();
      const data = withOffset(json.hourly, json.utc_offset_seconds);
      if (!validateWeatherData(data)) throw new Error('Format de données météo invalide');
      setCache(cacheKey, data);
      return data;
    } catch (err) {
      const expired = await getCached<WeatherData>(cacheKey, true);
      if (expired) {
        log.warn('Using expired weather cache for', lat, lon);
        revalidateWeatherInBackground(cacheKey, lat, lon, forecastDays);
        return expired;
      }
      throw err;
    }
  });
}

export interface DailyData {
  time: string[];
  sunrise: string[];
  sunset: string[];
}

export async function fetchDailyData(lat: number, lon: number, forecastDays = DEFAULT_FORECAST_DAYS): Promise<DailyData> {
  const rlat = Math.round(lat * 100) / 100;
  const rlon = Math.round(lon * 100) / 100;
  const cacheKey = `@sw_daily_${rlat}_${rlon}`;
  return dedup(cacheKey, async () => {
    const cached = await getCached<DailyData>(cacheKey);
    if (cached) return cached;

    try {
      const url = `${WEATHER_BASE}?latitude=${lat}&longitude=${lon}&daily=sunrise,sunset&forecast_days=${forecastDays}&timezone=auto`;
      const res = await fetchWithRetry(url);
      const json = await res.json();
      const data = json.daily;
      if (!validateDailyData(data)) throw new Error('Format de données journalières invalide');
      setCache(cacheKey, data);
      return data;
    } catch (err) {
      const expired = await getCached<DailyData>(cacheKey, true);
      if (expired) {
        log.warn('Using expired daily cache for', lat, lon);
        return expired;
      }
      throw err;
    }
  });
}

export async function purgeOldCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(k => k.startsWith('@sw_marine_') || k.startsWith('@sw_weather_') || k.startsWith('@sw_daily_'));
    const now = Date.now();
    let purged = 0;
    for (const key of cacheKeys) {
      try {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) continue;
        const { ts } = JSON.parse(raw);
        if (now - ts > CACHE_PURGE_AGE_MS) {
          await AsyncStorage.removeItem(key);
          purged++;
        }
      } catch {
        await AsyncStorage.removeItem(key);
        purged++;
      }
    }
    // Only surface a log when we actually removed something — avoids the noisy
    // "checked 0 keys" line on every cold start.
    if (purged > 0) log.info(`Cache purge: removed ${purged}/${cacheKeys.length} entries`);
  } catch (e) {
    log.warn('Cache purge error:', e);
  }
}

export async function getMarineCacheTimestamp(lat: number, lon: number): Promise<number | null> {
  const rlat = Math.round(lat * 100) / 100;
  const rlon = Math.round(lon * 100) / 100;
  try {
    const raw = await AsyncStorage.getItem(`@sw_marine_${rlat}_${rlon}`);
    if (!raw) return null;
    const { ts } = JSON.parse(raw);
    return typeof ts === 'number' ? ts : null;
  } catch {
    return null;
  }
}

export async function fetchSpotData(lat: number, lon: number) {
  const [marine, weather, daily] = await Promise.all([
    fetchMarineData(lat, lon),
    fetchWeatherData(lat, lon),
    fetchDailyData(lat, lon).catch((e) => {
      log.warn('Daily data fetch failed:', e?.message);
      return null;
    }),
  ]);
  const cacheTs = await getMarineCacheTimestamp(lat, lon);
  return { marine, weather, daily, cacheTs };
}
