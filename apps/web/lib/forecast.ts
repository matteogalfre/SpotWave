import { computeSpotForecast, DEFAULT_PROFILE } from '@spotwave/core';
import type { SpotConfig, SpotForecast, MarineData, WeatherData } from '@spotwave/core';

const MARINE_BASE = 'https://marine-api.open-meteo.com/v1/marine';
const WEATHER_BASE = 'https://api.open-meteo.com/v1/forecast';

const MARINE_PARAMS = [
  'wave_height', 'wave_direction', 'wave_period',
  'swell_wave_height', 'swell_wave_direction', 'swell_wave_period', 'swell_wave_peak_period',
  'wind_wave_height', 'wind_wave_direction', 'wind_wave_period',
  'sea_surface_temperature', 'ocean_current_velocity', 'ocean_current_direction', 'sea_level_height_msl',
].join(',');

const WEATHER_PARAMS = [
  'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'temperature_2m', 'weather_code',
  'uv_index', 'precipitation_probability', 'cloud_cover',
].join(',');

/**
 * Server-side forecast: fetch Open-Meteo (marine + weather) for a spot and run
 * the SHARED scoring engine from @spotwave/core. Rendered on the server so the
 * page HTML already contains the score (great for SEO + fast first paint).
 * Revalidated every 30 min. Returns null on any failure (page degrades to the
 * static spot info).
 */
export async function getSpotForecast(spot: SpotConfig, locale = 'fr'): Promise<SpotForecast | null> {
  try {
    const q = `latitude=${spot.latitude}&longitude=${spot.longitude}&timezone=auto&forecast_days=3`;
    // Never let a slow/blocked network hang the page render.
    const signal = AbortSignal.timeout(6000);
    const [marineRes, weatherRes] = await Promise.all([
      fetch(`${MARINE_BASE}?${q}&hourly=${MARINE_PARAMS}`, { next: { revalidate: 1800 }, signal }),
      fetch(`${WEATHER_BASE}?${q}&hourly=${WEATHER_PARAMS}`, { next: { revalidate: 1800 }, signal }),
    ]);
    if (!marineRes.ok || !weatherRes.ok) return null;

    const marineJson = await marineRes.json();
    const weatherJson = await weatherRes.json();
    if (!marineJson?.hourly || !weatherJson?.hourly) return null;

    const marine = {
      ...marineJson.hourly,
      utc_offset_seconds: marineJson.utc_offset_seconds,
    } as MarineData;
    const weather = {
      ...weatherJson.hourly,
      utc_offset_seconds: weatherJson.utc_offset_seconds,
    } as WeatherData;

    return computeSpotForecast(spot, marine, weather, DEFAULT_PROFILE, locale);
  } catch {
    return null;
  }
}
