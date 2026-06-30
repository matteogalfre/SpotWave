import { computeSpotForecast } from '../utils/scoring';
import { MarineData, WeatherData, SpotConfig, SurferProfile } from '../types';
import ALL_SPOTS from '../data/spots';

/**
 * Opt-in calibration harness against Surfline LOTUS ratings.
 *   RUN_LIVE_SCORING=1 npx jest scoring.validate
 *
 * Prints SpotWave's current-hour score + full factor breakdown for a set of
 * spots we have a known Surfline reading for, so we can eyeball calibration.
 */

const MARINE_PARAMS = [
  'wave_height', 'wave_direction', 'wave_period',
  'swell_wave_height', 'swell_wave_direction', 'swell_wave_period', 'swell_wave_peak_period',
  'wind_wave_height', 'wind_wave_direction', 'wind_wave_period',
  'sea_surface_temperature', 'ocean_current_velocity', 'ocean_current_direction', 'sea_level_height_msl',
].join(',');
const WEATHER_PARAMS = ['wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'temperature_2m', 'weather_code'].join(',');

const PROFILE: SurferProfile = {
  level: 'intermediate', preferredHeight: ['1-2', '2+'], breakType: ['beach', 'reef', 'point'],
  windPref: 'any', sessionDuration: 2, availableFrom: 6, availableTo: 21,
};

// Spots with a Surfline reference captured 15 Jun 2026 ~14h WEST / 15h CEST.
const REFS: { id: string; surfline: string }[] = [
  { id: 'caparica-centro', surfline: 'POOR (2/5) — 0.3-0.6m, 10kt cross-shore' },
  { id: 'mimizan', surfline: 'POOR (2/5) — 0.3-0.6m, 9kt onshore' },
];

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const maybe = process.env.RUN_LIVE_SCORING ? describe : describe.skip;

maybe('LIVE calibration vs Surfline', () => {
  jest.setTimeout(60_000);

  it('prints score + breakdown for referenced spots', async () => {
    for (const ref of REFS) {
      const spot = ALL_SPOTS.find((s: SpotConfig) => s.id === ref.id);
      if (!spot) { console.warn(`  spot ${ref.id} not found`); continue; }
      try {
        const [m, w] = await Promise.all([
          fetchJson(`https://marine-api.open-meteo.com/v1/marine?latitude=${spot.latitude}&longitude=${spot.longitude}&hourly=${MARINE_PARAMS}&forecast_days=2&timezone=auto`),
          fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${spot.latitude}&longitude=${spot.longitude}&hourly=${WEATHER_PARAMS}&forecast_days=2&timezone=auto`),
        ]);
        const marine: MarineData = { ...m.hourly, utc_offset_seconds: m.utc_offset_seconds };
        const weather: WeatherData = { ...w.hourly, utc_offset_seconds: w.utc_offset_seconds };
        const fc = computeSpotForecast(spot, marine, weather, PROFILE);
        const c = fc.currentCondition;
        const f = c?.factors;
        /* eslint-disable no-console */
        console.log(`\n  === ${spot.name} (${spot.country}) ===`);
        console.log(`  Surfline:  ${ref.surfline}`);
        console.log(`  SpotWave:  now=${fc.currentScore.toFixed(1)}/10   best=${fc.bestTime.score.toFixed(1)} (${fc.bestTime.label})${fc.isNightNow ? '  [NIGHT]' : ''}`);
        if (c) console.log(`  realtime:  H=${c.swellHeight.toFixed(2)}m  T=${c.swellPeriod.toFixed(0)}s  dir=${c.swellDirection.toFixed(0)}°  wind=${c.windSpeed.toFixed(0)}km/h gust=${c.windGusts.toFixed(0)}`);
        if (f) {
          console.log(`  factors:   swellQ=${f.swellQuality.toFixed(2)} windQ=${f.windQuality.toFixed(2)} clean=${f.cleanFactor.toFixed(2)} tide=${f.tideMatch.toFixed(2)} level=${f.levelFit.toFixed(2)}`);
          console.log(`  score:     raw=${f.rawScore.toFixed(1)} capped=${f.cappedScore.toFixed(1)} caps=[${f.caps.join(', ')}] windSwellOnly=${f.windSwellOnly}`);
        }
        /* eslint-enable no-console */
        expect(fc.currentScore).toBeGreaterThanOrEqual(0);
        expect(fc.currentScore).toBeLessThanOrEqual(10);
      } catch (e) {
        console.warn(`  ${spot.name}: live fetch failed (${(e as Error).message})`);
      }
    }
  });
});
