import { computeHourlyScore } from '../utils/scoring';
import { SpotConfig, MarineData, WeatherData, SurferProfile } from '../types';

/**
 * Reference / validation suite.
 *
 * The goal (per the product owner: "compare our score with verified online
 * data") is to pin SpotWave's output to qualitative ratings that match how
 * established surf forecasters (Surfline star ratings, surf-forecast.com, Magic
 * Seaweed legacy "stars") would describe the SAME conditions. We can't assert an
 * exact equality (each service uses its own scale and secret sauce), but we CAN
 * assert that a given, well-understood sea state lands in the right BAND:
 *
 *   0-2   flat / unsurfable
 *   2-4   poor (blown out, too short-period, junk)
 *   4-6.5 fair / fun-but-flawed
 *   6.5-8.5 good / clean
 *   8.5-10  excellent / epic (rare)
 *
 * Each scenario below documents the real-world archetype it represents and the
 * band a human forecaster would put it in. If a future tweak pushes a scenario
 * out of its band, this suite flags the regression.
 */

// A generic, well-exposed west-facing beach break (think Hossegor / Supertubos /
// Ericeira beachies). Offshore wind blows from the east (90°).
const BEACH_W: SpotConfig = {
  id: 'ref-beach-w', name: 'Ref West Beach', latitude: 43.6, longitude: -1.4,
  beachOrientation: 270, optimalSwellDirMin: 250, optimalSwellDirMax: 300,
  optimalSwellHeightMin: 0.8, optimalSwellHeightMax: 3.0, optimalTide: 'all',
  bottomType: 'beach', recommendedLevel: 'intermediate', region: 'Ref', country: 'Ref',
  description: '', dangers: [],
};

const INTER: SurferProfile = {
  level: 'intermediate', preferredHeight: ['1-2'], breakType: ['beach'],
  windPref: 'any', sessionDuration: 2, availableFrom: 7, availableTo: 20,
};

const OFFSHORE = (BEACH_W.beachOrientation + 180) % 360; // 90
const ONSHORE = BEACH_W.beachOrientation;                // 270

interface Scenario {
  name: string;
  band: [number, number];
  marine: Partial<MarineData>;
  weather: Partial<WeatherData>;
  spot?: SpotConfig;
  profile?: SurferProfile;
}

function marineOf(o: Partial<MarineData>): MarineData {
  return {
    time: ['2025-06-01T10:00'],
    wave_height: [1.0], wave_direction: [270], wave_period: [10],
    swell_wave_height: [1.0], swell_wave_direction: [275], swell_wave_period: [10], swell_wave_peak_period: [11],
    wind_wave_height: [0.2], wind_wave_direction: [275], wind_wave_period: [5],
    sea_surface_temperature: [18], ocean_current_velocity: [0.1], ocean_current_direction: [180], sea_level_height_msl: [0.0],
    ...o,
  };
}
function weatherOf(o: Partial<WeatherData>): WeatherData {
  return {
    time: ['2025-06-01T10:00'],
    wind_speed_10m: [8], wind_direction_10m: [OFFSHORE], wind_gusts_10m: [11], temperature_2m: [20], weather_code: [0],
    ...o,
  };
}

const SCENARIOS: Scenario[] = [
  {
    // Pumping clean groundswell, light offshore — a "4-5 star" day.
    name: 'Epic clean groundswell 2.0m @ 14s, light offshore',
    band: [8.0, 10],
    marine: { wave_height: [2.0], swell_wave_height: [2.0], swell_wave_period: [14], swell_wave_peak_period: [15], swell_wave_direction: [270], wind_wave_height: [0.2] },
    weather: { wind_speed_10m: [7], wind_direction_10m: [OFFSHORE], wind_gusts_10m: [10] },
  },
  {
    // Clean, fun, average size — a solid "3 star" session.
    name: 'Clean fun 1.2m @ 11s, light offshore',
    band: [6.0, 9.0],
    marine: { wave_height: [1.2], swell_wave_height: [1.2], swell_wave_period: [11], swell_wave_peak_period: [12], swell_wave_direction: [275], wind_wave_height: [0.2] },
    weather: { wind_speed_10m: [6], wind_direction_10m: [OFFSHORE], wind_gusts_10m: [9] },
  },
  {
    // Decent swell wrecked by strong onshore wind — "1 star" blowout.
    name: 'Blown out: 1.5m @ 10s, 28 km/h onshore',
    band: [0.0, 4.0],
    marine: { wave_height: [1.5], swell_wave_height: [1.5], swell_wave_period: [10], swell_wave_peak_period: [11], wind_wave_height: [0.8] },
    weather: { wind_speed_10m: [28], wind_direction_10m: [ONSHORE], wind_gusts_10m: [38] },
  },
  {
    // Flat. Nothing to ride.
    name: 'Flat 0.2m',
    band: [0.0, 2.0],
    marine: { wave_height: [0.2], swell_wave_height: [0.15], swell_wave_period: [6], swell_wave_peak_period: [6] },
    weather: { wind_speed_10m: [5], wind_direction_10m: [OFFSHORE] },
  },
  {
    // Pure short-period wind swell, choppy cross-shore — junk, "poor".
    name: 'Wind-swell junk: no groundswell, 1.3m windwave @ 6s, 22 km/h cross',
    band: [1.0, 4.5],
    marine: { wave_height: [1.3], swell_wave_height: [0.0], swell_wave_period: [0], swell_wave_peak_period: [0], wind_wave_height: [1.3], wind_wave_period: [6], wind_wave_direction: [200] },
    weather: { wind_speed_10m: [22], wind_direction_10m: [200], wind_gusts_10m: [30] },
  },
  {
    // Marginal Mediterranean short-period day, light wind — surfable but mediocre.
    name: 'Marginal Med: 0.8m @ 7s, light wind',
    band: [3.5, 6.5],
    marine: { wave_height: [0.8], swell_wave_height: [0.7], swell_wave_period: [7], swell_wave_peak_period: [8], swell_wave_direction: [275], wind_wave_height: [0.3] },
    weather: { wind_speed_10m: [7], wind_direction_10m: [OFFSHORE], wind_gusts_10m: [10] },
  },
  {
    // Solid swell but a stiff offshore holding it up — still good, a touch sketchy.
    name: 'Strong offshore 32 km/h on 2m @ 13s',
    band: [2.5, 7.0],
    marine: { wave_height: [2.0], swell_wave_height: [2.0], swell_wave_period: [13], swell_wave_peak_period: [14], swell_wave_direction: [270], wind_wave_height: [0.2] },
    weather: { wind_speed_10m: [32], wind_direction_10m: [OFFSHORE], wind_gusts_10m: [42] },
  },
  {
    // Small but clean & glassy — the "Carcavelos webcam" case. Pretty little
    // waves on a sunny glassy morning should read FAIR/FUN, never near-zero.
    name: 'Small clean glassy 0.6m @ 9s, glassy',
    band: [4.5, 8.5],
    marine: { wave_height: [0.6], swell_wave_height: [0.6], swell_wave_period: [9], swell_wave_peak_period: [10], swell_wave_direction: [275], wind_wave_height: [0.12] },
    weather: { wind_speed_10m: [3], wind_direction_10m: [OFFSHORE], wind_gusts_10m: [5] },
    profile: { level: 'beginner', preferredHeight: ['0.5-1'], breakType: ['beach'], windPref: 'any', sessionDuration: 2, availableFrom: 7, availableTo: 20 },
  },
  {
    // Cross-shore moderate wind on a fair swell — "fair", workable.
    name: 'Cross-shore 16 km/h on 1.3m @ 11s',
    band: [3.5, 7.0],
    marine: { wave_height: [1.3], swell_wave_height: [1.3], swell_wave_period: [11], swell_wave_peak_period: [12], swell_wave_direction: [275], wind_wave_height: [0.3] },
    weather: { wind_speed_10m: [16], wind_direction_10m: [(BEACH_W.beachOrientation + 90) % 360], wind_gusts_10m: [22] },
  },
  {
    // Size on the buoy but ultra-short period = gutless wind-chop. Even clean &
    // offshore this is "poor", NOT a fun day. (Locks the short-period precision.)
    name: 'Short-period junk with size: 1.6m @ 6s, light offshore',
    band: [1.0, 4.5],
    marine: { wave_height: [1.6], swell_wave_height: [1.6], swell_wave_period: [6], swell_wave_peak_period: [6], swell_wave_direction: [275], wind_wave_height: [0.3] },
    weather: { wind_speed_10m: [8], wind_direction_10m: [OFFSHORE], wind_gusts_10m: [11] },
  },
  {
    // Small, sub-chest, short-period day, clean & light wind — fun but flawed for
    // an intermediate. Must read "fair", never "good" (was over-rated ~7+ before).
    name: 'Small short-period: 0.9m @ 7s, light offshore (intermediate)',
    band: [3.0, 6.5],
    marine: { wave_height: [0.9], swell_wave_height: [0.9], swell_wave_period: [7], swell_wave_peak_period: [8], swell_wave_direction: [275], wind_wave_height: [0.25] },
    weather: { wind_speed_10m: [7], wind_direction_10m: [OFFSHORE], wind_gusts_10m: [10] },
  },
];

describe('scoring vs verified-style reference bands', () => {
  for (const sc of SCENARIOS) {
    it(`${sc.name} → band ${sc.band[0]}-${sc.band[1]}`, () => {
      const r = computeHourlyScore(
        0,
        marineOf(sc.marine),
        weatherOf(sc.weather),
        sc.spot ?? BEACH_W,
        sc.profile ?? INTER,
      );
      expect(r.score).toBeGreaterThanOrEqual(sc.band[0]);
      expect(r.score).toBeLessThanOrEqual(sc.band[1]);
    });
  }

  it('orders the scenarios sensibly (epic > clean > marginal > blown out)', () => {
    const score = (sc: Scenario) =>
      computeHourlyScore(0, marineOf(sc.marine), weatherOf(sc.weather), BEACH_W, INTER).score;
    const epic = score(SCENARIOS[0]);
    const clean = score(SCENARIOS[1]);
    const marginal = score(SCENARIOS[5]);
    const blown = score(SCENARIOS[2]);
    expect(epic).toBeGreaterThan(clean);
    expect(clean).toBeGreaterThan(marginal);
    expect(marginal).toBeGreaterThan(blown);
  });
});
