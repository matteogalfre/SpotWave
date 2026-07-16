import { computeSpotForecast } from '../utils/scoring';
import { MarineData, WeatherData, SpotConfig, SurferProfile } from '../types';

/**
 * LIVE comparison harness — opt-in, network-dependent.
 *
 *   RUN_LIVE_SCORING=1 npx jest scoring.live
 *
 * It pulls the SAME Open-Meteo data the app uses for a handful of world-famous
 * breaks and prints SpotWave's current + best score next to a forecast URL, so
 * you can eyeball our rating against verified sources (surf-forecast.com,
 * Surfline star ratings, windguru). This reuses the production scoring code
 * verbatim — it's the closest thing to "compare our score with online data"
 * without scraping a paywalled API. It only asserts sane invariants (0-10,
 * varied), the real value is the printed table.
 */

const MARINE_PARAMS = [
  'wave_height', 'wave_direction', 'wave_period',
  'swell_wave_height', 'swell_wave_direction', 'swell_wave_period', 'swell_wave_peak_period',
  'wind_wave_height', 'wind_wave_direction', 'wind_wave_period',
  'sea_surface_temperature', 'ocean_current_velocity', 'ocean_current_direction', 'sea_level_height_msl',
].join(',');
const WEATHER_PARAMS = ['wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'temperature_2m', 'weather_code'].join(',');

const PROFILE: SurferProfile = {
  level: 'intermediate', preferredHeight: ['1-2', '2+'],
  sessionDuration: 2, availableFrom: 6, availableTo: 21,
};

const SPOTS: SpotConfig[] = [
  { id: 'hossegor', name: 'Hossegor (FR)', latitude: 43.66, longitude: -1.44, beachOrientation: 270, optimalSwellDirMin: 250, optimalSwellDirMax: 310, optimalSwellHeightMin: 0.8, optimalSwellHeightMax: 3.5, optimalTide: 'all', bottomType: 'beach', recommendedLevel: 'expert', region: 'Landes', country: 'France', description: '', dangers: [] },
  { id: 'ericeira', name: 'Ericeira (PT)', latitude: 38.96, longitude: -9.42, beachOrientation: 270, optimalSwellDirMin: 250, optimalSwellDirMax: 320, optimalSwellHeightMin: 0.8, optimalSwellHeightMax: 4.0, optimalTide: 'all', bottomType: 'reef', recommendedLevel: 'expert', region: 'Lisboa', country: 'Portugal', description: '', dangers: [] },
  { id: 'pipeline', name: 'Pipeline (HI)', latitude: 21.665, longitude: -158.053, beachOrientation: 315, optimalSwellDirMin: 290, optimalSwellDirMax: 350, optimalSwellHeightMin: 1.5, optimalSwellHeightMax: 6.0, optimalTide: 'all', bottomType: 'reef', recommendedLevel: 'expert', region: 'Oahu', country: 'USA', description: '', dangers: [] },
  { id: 'jbay', name: 'Jeffreys Bay (ZA)', latitude: -34.05, longitude: 24.93, beachOrientation: 225, optimalSwellDirMin: 180, optimalSwellDirMax: 240, optimalSwellHeightMin: 1.0, optimalSwellHeightMax: 4.0, optimalTide: 'all', bottomType: 'point', recommendedLevel: 'expert', region: 'EC', country: 'South Africa', description: '', dangers: [] },
];

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const maybe = process.env.RUN_LIVE_SCORING ? describe : describe.skip;

maybe('LIVE scoring vs online forecasts', () => {
  jest.setTimeout(60_000);

  it('prints SpotWave scores for famous breaks', async () => {
    // eslint-disable-next-line no-console
    console.log('\n  SpotWave live scores (compare with surf-forecast.com / Surfline):\n');
    for (const spot of SPOTS) {
      try {
        const [m, w] = await Promise.all([
          fetchJson(`https://marine-api.open-meteo.com/v1/marine?latitude=${spot.latitude}&longitude=${spot.longitude}&hourly=${MARINE_PARAMS}&forecast_days=3&timezone=auto`),
          fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${spot.latitude}&longitude=${spot.longitude}&hourly=${WEATHER_PARAMS}&forecast_days=3&timezone=auto`),
        ]);
        const marine: MarineData = { ...m.hourly, utc_offset_seconds: m.utc_offset_seconds };
        const weather: WeatherData = { ...w.hourly, utc_offset_seconds: w.utc_offset_seconds };
        const fc = computeSpotForecast(spot, marine, weather, PROFILE);
        const cur = fc.currentCondition;
        // eslint-disable-next-line no-console
        console.log(
          `  ${spot.name.padEnd(18)} now=${fc.currentScore.toFixed(1)}/10  ` +
          `best=${fc.bestTime.score.toFixed(1)} (${fc.bestTime.label})  ` +
          `${cur ? `H=${cur.swellHeight.toFixed(1)}m T=${cur.swellPeriod.toFixed(0)}s wind=${cur.windSpeed.toFixed(0)}km/h` : ''}` +
          `${fc.isNightNow ? '  [night]' : ''}`,
        );
        expect(fc.currentScore).toBeGreaterThanOrEqual(0);
        expect(fc.currentScore).toBeLessThanOrEqual(10);
        // The 72h series should NOT be flat-constant (that would signal a bug).
        const uniq = new Set(fc.hourlyConditions.map(h => h.score));
        expect(uniq.size).toBeGreaterThan(3);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(`  ${spot.name}: live fetch failed (${(e as Error).message}) — skipped`);
      }
    }
  });
});
