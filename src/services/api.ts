import AsyncStorage from '@react-native-async-storage/async-storage';
import { MarineData, WeatherData } from '../types';

const MARINE_BASE = 'https://marine-api.open-meteo.com/v1/marine';
const WEATHER_BASE = 'https://api.open-meteo.com/v1/forecast';
const CACHE_TTL_MS = 30 * 60 * 1000;
const API_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 1;

const inflight = new Map<string, Promise<any>>();

const MARINE_PARAMS = [
  'wave_height',
  'wave_direction',
  'wave_period',
  'swell_wave_height',
  'swell_wave_direction',
  'swell_wave_period',
  'swell_wave_peak_period',
  'wind_wave_height',
  'wind_wave_direction',
  'wind_wave_period',
  'sea_surface_temperature',
  'ocean_current_velocity',
  'ocean_current_direction',
].join(',');

const WEATHER_PARAMS = [
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'temperature_2m',
  'weather_code',
].join(',');

async function getCached<T>(key: string, allowExpired = false): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (!allowExpired && Date.now() - ts > CACHE_TTL_MS) {
      return null;
    }
    return data as T;
  } catch {
    return null;
  }
}

async function setCache(key: string, data: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

async function fetchWithTimeout(url: string, timeoutMs = API_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new Error('Unreachable');
}

function dedup<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = factory().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

export function fetchMarineData(
  lat: number,
  lon: number,
  forecastDays = 5,
): Promise<MarineData> {
  const cacheKey = `@sw_marine_${lat}_${lon}`;
  return dedup(cacheKey, async () => {
    const cached = await getCached<MarineData>(cacheKey);
    if (cached) return cached;

    try {
      const url =
        `${MARINE_BASE}?latitude=${lat}&longitude=${lon}` +
        `&hourly=${MARINE_PARAMS}` +
        `&forecast_days=${forecastDays}` +
        `&timezone=Europe/Lisbon`;

      const res = await fetchWithRetry(url);
      const json = await res.json();
      const data = json.hourly as MarineData;
      setCache(cacheKey, data);
      return data;
    } catch (err) {
      const expired = await getCached<MarineData>(cacheKey, true);
      if (expired) return expired;
      throw err;
    }
  });
}

export function fetchWeatherData(
  lat: number,
  lon: number,
  forecastDays = 5,
): Promise<WeatherData> {
  const cacheKey = `@sw_weather_${lat}_${lon}`;
  return dedup(cacheKey, async () => {
    const cached = await getCached<WeatherData>(cacheKey);
    if (cached) return cached;

    try {
      const url =
        `${WEATHER_BASE}?latitude=${lat}&longitude=${lon}` +
        `&hourly=${WEATHER_PARAMS}` +
        `&forecast_days=${forecastDays}` +
        `&timezone=Europe/Lisbon`;

      const res = await fetchWithRetry(url);
      const json = await res.json();
      const data = json.hourly as WeatherData;
      setCache(cacheKey, data);
      return data;
    } catch (err) {
      const expired = await getCached<WeatherData>(cacheKey, true);
      if (expired) return expired;
      throw err;
    }
  });
}

export async function fetchSpotData(lat: number, lon: number) {
  const [marine, weather] = await Promise.all([
    fetchMarineData(lat, lon),
    fetchWeatherData(lat, lon),
  ]);
  return { marine, weather };
}
