import { computeHourlyScore, computeSpotForecast } from '../utils/scoring';
import { SpotConfig, MarineData, WeatherData, SurferProfile } from '../types';

const SPOT: SpotConfig = {
  id: 'test-spot',
  name: 'Test Beach',
  latitude: 38.6,
  longitude: -9.2,
  beachOrientation: 270,
  optimalSwellDirMin: 260,
  optimalSwellDirMax: 320,
  optimalSwellHeightMin: 0.8,
  optimalSwellHeightMax: 2.5,
  optimalTide: 'mid',
  bottomType: 'beach',
  recommendedLevel: 'intermediate',
  region: 'Test',
  country: 'Test',
  description: 'Test spot',
  dangers: [],
};

const PROFILE: SurferProfile = {
  level: 'intermediate',
  preferredHeight: ['1-2'],
  breakType: ['beach'],
  windPref: 'offshore',
  sessionDuration: 2,
  availableFrom: 7,
  availableTo: 20,
};

function makeMarineData(overrides: Partial<MarineData> = {}): MarineData {
  const base: MarineData = {
    time: ['2025-03-10T10:00'],
    wave_height: [1.5],
    wave_direction: [280],
    wave_period: [10],
    swell_wave_height: [1.2],
    swell_wave_direction: [290],
    swell_wave_period: [11],
    swell_wave_peak_period: [13],
    wind_wave_height: [0.3],
    wind_wave_direction: [300],
    wind_wave_period: [5],
    sea_surface_temperature: [16],
    ocean_current_velocity: [0.1],
    ocean_current_direction: [180],
    sea_level_height_msl: [0.5],
  };
  return { ...base, ...overrides };
}

function makeWeatherData(overrides: Partial<WeatherData> = {}): WeatherData {
  const base: WeatherData = {
    time: ['2025-03-10T10:00'],
    wind_speed_10m: [8],
    wind_direction_10m: [90],
    wind_gusts_10m: [12],
    temperature_2m: [18],
    weather_code: [0],
  };
  return { ...base, ...overrides };
}

describe('computeHourlyScore', () => {
  it('returns a score between 0 and 10', () => {
    const result = computeHourlyScore(0, makeMarineData(), makeWeatherData(), SPOT, PROFILE);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(10);
  });

  it('gives good scores for offshore wind with clean swell', () => {
    const marine = makeMarineData({ swell_wave_height: [1.5], swell_wave_period: [12], swell_wave_peak_period: [14] });
    const weather = makeWeatherData({ wind_speed_10m: [8], wind_direction_10m: [90] });
    const result = computeHourlyScore(0, marine, weather, SPOT, PROFILE);
    expect(result.score).toBeGreaterThan(5);
  });

  it('penalizes flat conditions', () => {
    const marine = makeMarineData({ wave_height: [0.1], swell_wave_height: [0.1] });
    const result = computeHourlyScore(0, marine, makeWeatherData(), SPOT, PROFILE);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('penalizes strong onshore wind', () => {
    const weather = makeWeatherData({ wind_speed_10m: [30], wind_direction_10m: [270] });
    const result = computeHourlyScore(0, makeMarineData(), weather, SPOT, PROFILE);
    expect(result.score).toBeLessThan(4);
  });

  it('penalizes short period swell', () => {
    const marine = makeMarineData({ swell_wave_period: [4], swell_wave_peak_period: [5] });
    const result = computeHourlyScore(0, marine, makeWeatherData(), SPOT, PROFILE);
    expect(result.score).toBeLessThan(4);
  });

  it('penalizes heavy rain/storm weather', () => {
    const storm = computeHourlyScore(0, makeMarineData(), makeWeatherData({ weather_code: [95] }), SPOT, PROFILE);
    const clear = computeHourlyScore(0, makeMarineData(), makeWeatherData({ weather_code: [0] }), SPOT, PROFILE);
    expect(storm.score).toBeLessThan(clear.score);
  });

  it('caps score for beginners at expert spots with big waves', () => {
    const marine = makeMarineData({ swell_wave_height: [3.0], wave_height: [3.0] });
    const weather = makeWeatherData({ wind_speed_10m: [5], wind_direction_10m: [90] });
    const result = computeHourlyScore(0, marine, weather, { ...SPOT, recommendedLevel: 'expert' }, { ...PROFILE, level: 'beginner' });
    expect(result.score).toBeLessThanOrEqual(2);
  });

  it('returns all expected fields', () => {
    const result = computeHourlyScore(0, makeMarineData(), makeWeatherData(), SPOT, PROFILE);
    expect(result).toHaveProperty('time');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('swellHeight');
    expect(result).toHaveProperty('swellDirection');
    expect(result).toHaveProperty('swellPeriod');
    expect(result).toHaveProperty('windSpeed');
    expect(result).toHaveProperty('windDirection');
    expect(result).toHaveProperty('windGusts');
    expect(result).toHaveProperty('temperature');
    expect(result).toHaveProperty('seaTemp');
    expect(result).toHaveProperty('seaLevel');
    expect(result).toHaveProperty('weatherCode');
  });

  it('rewards glassy conditions (no wind) as best wind score', () => {
    const weather = makeWeatherData({ wind_speed_10m: [1], wind_direction_10m: [0], wind_gusts_10m: [2] });
    const marine = makeMarineData({ swell_wave_height: [1.5], swell_wave_period: [12], swell_wave_peak_period: [14] });
    const result = computeHourlyScore(0, marine, weather, SPOT, PROFILE);
    expect(result.score).toBeGreaterThan(5.5);
  });

  it('penalizes strong offshore wind (>30 km/h)', () => {
    const offshoreDir = (SPOT.beachOrientation + 180) % 360;
    const gentle = computeHourlyScore(0, makeMarineData(), makeWeatherData({ wind_speed_10m: [10], wind_direction_10m: [offshoreDir] }), SPOT, PROFILE);
    const brutal = computeHourlyScore(0, makeMarineData(), makeWeatherData({ wind_speed_10m: [35], wind_direction_10m: [offshoreDir] }), SPOT, PROFILE);
    expect(brutal.score).toBeLessThan(gentle.score);
  });

  it('gives higher score to long-period swell (power synergy)', () => {
    const shortPeriod = computeHourlyScore(0, makeMarineData({ swell_wave_period: [7], swell_wave_peak_period: [8] }), makeWeatherData(), SPOT, PROFILE);
    const longPeriod = computeHourlyScore(0, makeMarineData({ swell_wave_period: [14], swell_wave_peak_period: [16] }), makeWeatherData(), SPOT, PROFILE);
    expect(longPeriod.score).toBeGreaterThan(shortPeriod.score);
  });

  it('penalizes pure wind swell (no ground swell)', () => {
    const windSwellOnly = makeMarineData({ swell_wave_height: [0], wave_height: [1.5], wind_wave_height: [1.5] });
    const groundSwell = makeMarineData({ swell_wave_height: [1.5], wave_height: [1.5], wind_wave_height: [0.2] });
    const windResult = computeHourlyScore(0, windSwellOnly, makeWeatherData(), SPOT, PROFILE);
    const swellResult = computeHourlyScore(0, groundSwell, makeWeatherData(), SPOT, PROFILE);
    expect(windResult.score).toBeLessThan(swellResult.score);
  });

  it('penalizes crossing swells (wind wave from different direction)', () => {
    const aligned = makeMarineData({ swell_wave_direction: [290], wind_wave_direction: [280], wind_wave_height: [0.5] });
    const crossing = makeMarineData({ swell_wave_direction: [290], wind_wave_direction: [100], wind_wave_height: [0.5] });
    const alignedScore = computeHourlyScore(0, aligned, makeWeatherData(), SPOT, PROFILE);
    const crossingScore = computeHourlyScore(0, crossing, makeWeatherData(), SPOT, PROFILE);
    expect(crossingScore.score).toBeLessThan(alignedScore.score);
  });

  it('penalizes strong ocean currents', () => {
    const calm = makeMarineData({ ocean_current_velocity: [0.1] });
    const strong = makeMarineData({ ocean_current_velocity: [1.5] });
    const calmScore = computeHourlyScore(0, calm, makeWeatherData(), SPOT, PROFILE);
    const strongScore = computeHourlyScore(0, strong, makeWeatherData(), SPOT, PROFILE);
    expect(strongScore.score).toBeLessThan(calmScore.score);
  });

  it('rewards a spot whose break type matches the surfer preference', () => {
    const match = computeHourlyScore(0, makeMarineData(), makeWeatherData(), SPOT, { ...PROFILE, breakType: ['beach'] });
    const mismatch = computeHourlyScore(0, makeMarineData(), makeWeatherData(), SPOT, { ...PROFILE, breakType: ['reef'] });
    expect(match.factors!.profileMatch).toBeGreaterThan(mismatch.factors!.profileMatch);
  });

  it('factors wind preference into the profile match', () => {
    // beachOrientation 270 → offshore is 90, so a 270° wind is onshore
    const weather = makeWeatherData({ wind_speed_10m: [15], wind_direction_10m: [270] });
    const picky = computeHourlyScore(0, makeMarineData(), weather, SPOT, { ...PROFILE, windPref: 'offshore' });
    const tolerant = computeHourlyScore(0, makeMarineData(), weather, SPOT, { ...PROFILE, windPref: 'any' });
    expect(picky.factors!.profileMatch).toBeLessThan(tolerant.factors!.profileMatch);
  });

  it('exposes score factors for explainability', () => {
    const result = computeHourlyScore(0, makeMarineData(), makeWeatherData(), SPOT, PROFILE);
    expect(result.factors).toBeDefined();
    expect(result.factors).toHaveProperty('swellQuality');
    expect(result.factors).toHaveProperty('windQuality');
    expect(result.factors).toHaveProperty('tideMatch');
    expect(result.factors).toHaveProperty('cleanFactor');
    expect(result.factors).toHaveProperty('rawScore');
    expect(result.factors).toHaveProperty('cappedScore');
    expect(result.factors).toHaveProperty('caps');
    expect(Array.isArray(result.factors!.caps)).toBe(true);
  });

  it('reports the deal-breaker caps that hit a poor forecast', () => {
    const marine = makeMarineData({ wave_height: [0.1], swell_wave_height: [0.1] });
    const result = computeHourlyScore(0, marine, makeWeatherData(), SPOT, PROFILE);
    expect(result.factors!.caps).toContain('flat');
  });
});

// ── Regression suite for the v2 audit ────────────────────────────────────────
// These guard the specific incoherences users reported: sudden score collapses
// between adjacent hours, and mediocre conditions scoring far too low.

describe('scoring coherence (v2 audit)', () => {
  it('does NOT collapse when swell_wave_period reads 0 but peak period is healthy', () => {
    // Open-Meteo glitch: lone bad swell-period sample next to a good peak period.
    const glitch = makeMarineData({
      swell_wave_height: [1.5], swell_wave_period: [0], swell_wave_peak_period: [13],
    });
    const result = computeHourlyScore(0, glitch, makeWeatherData({ wind_speed_10m: [6] }), SPOT, PROFILE);
    // Before the fix this capped at ~1.5 ("très bon → 1/10"). It must stay decent.
    expect(result.score).toBeGreaterThan(5);
  });

  it('treats a fully missing period as neutral, not catastrophic', () => {
    const noPeriod = makeMarineData({
      swell_wave_height: [1.2], swell_wave_period: [0], swell_wave_peak_period: [0],
    });
    const result = computeHourlyScore(0, noPeriod, makeWeatherData({ wind_speed_10m: [6] }), SPOT, PROFILE);
    expect(result.score).toBeGreaterThan(3.5);
    expect(result.score).toBeLessThanOrEqual(8.5);
  });

  it('gives mediocre (not terrible) scores to average conditions', () => {
    // 1m @ 9s, light cross-shore wind: an ordinary, surfable day. Should land in
    // the mid band, never in the 1-2 "pourri" range.
    const marine = makeMarineData({
      swell_wave_height: [1.0], swell_wave_period: [9], swell_wave_peak_period: [10],
      wind_wave_height: [0.3],
    });
    const weather = makeWeatherData({ wind_speed_10m: [12], wind_direction_10m: [180] });
    const result = computeHourlyScore(0, marine, weather, SPOT, PROFILE);
    expect(result.score).toBeGreaterThanOrEqual(3.5);
    expect(result.score).toBeLessThanOrEqual(7);
  });

  it('produces NO cliffs as wind speed sweeps (adjacent hours stay close)', () => {
    // Realistic gusts (~1.4× steady wind) so we isolate the speed response.
    const wx = (s: number) => makeWeatherData({ wind_speed_10m: [s], wind_direction_10m: [270], wind_gusts_10m: [Math.round(s * 1.4)] });
    let prev = computeHourlyScore(0, makeMarineData(), wx(0), SPOT, PROFILE).score;
    for (let s = 1; s <= 45; s++) {
      const cur = computeHourlyScore(0, makeMarineData(), wx(s), SPOT, PROFILE).score;
      // No single 1 km/h step may move the score by more than ~1.25 points.
      expect(Math.abs(cur - prev)).toBeLessThanOrEqual(1.25);
      prev = cur;
    }
  });

  it('produces NO cliffs as swell period sweeps', () => {
    let prev = computeHourlyScore(0, makeMarineData({ swell_wave_period: [3], swell_wave_peak_period: [3] }), makeWeatherData(), SPOT, PROFILE).score;
    for (let p = 4; p <= 20; p++) {
      const cur = computeHourlyScore(0, makeMarineData({ swell_wave_period: [p], swell_wave_peak_period: [p] }), makeWeatherData(), SPOT, PROFILE).score;
      expect(Math.abs(cur - prev)).toBeLessThanOrEqual(1.5);
      prev = cur;
    }
  });

  it('produces NO cliffs as swell direction sweeps around the window', () => {
    let prev: number | null = null;
    for (let d = 200; d <= 360; d += 2) {
      const cur = computeHourlyScore(0, makeMarineData({ swell_wave_direction: [d] }), makeWeatherData(), SPOT, PROFILE).score;
      if (prev !== null) expect(Math.abs(cur - prev)).toBeLessThanOrEqual(1.0);
      prev = cur;
    }
  });

  it('is monotonic: lighter offshore wind never scores below stronger offshore wind', () => {
    const offshore = (SPOT.beachOrientation + 180) % 360;
    // Proportional gusts so the comparison isolates steady wind speed.
    const calm = computeHourlyScore(0, makeMarineData(), makeWeatherData({ wind_speed_10m: [4], wind_direction_10m: [offshore], wind_gusts_10m: [6] }), SPOT, PROFILE).score;
    const breezy = computeHourlyScore(0, makeMarineData(), makeWeatherData({ wind_speed_10m: [14], wind_direction_10m: [offshore], wind_gusts_10m: [20] }), SPOT, PROFILE).score;
    expect(calm).toBeGreaterThanOrEqual(breezy);
  });

  it('damps an isolated single-hour outlier in a steady series', () => {
    const hours = Array.from({ length: 6 }, (_, i) => `2025-03-10T${String(8 + i).padStart(2, '0')}:00`);
    const fill = <T,>(v: T) => hours.map(() => v);
    // Steady good swell, but hour index 3 has a glitchy 0 swell period.
    const swellPeriods = [12, 12, 12, 0, 12, 12];
    const peakPeriods = [14, 14, 14, 0, 14, 14]; // peak also drops → genuine-looking spike
    const marine: MarineData = {
      time: hours,
      wave_height: fill(1.5), wave_direction: fill(280), wave_period: fill(11),
      swell_wave_height: fill(1.4), swell_wave_direction: fill(290),
      swell_wave_period: swellPeriods, swell_wave_peak_period: peakPeriods,
      wind_wave_height: fill(0.2), wind_wave_direction: fill(290), wind_wave_period: fill(5),
      sea_surface_temperature: fill(16), ocean_current_velocity: fill(0.1),
      ocean_current_direction: fill(180), sea_level_height_msl: fill(0.3),
    };
    const weather: WeatherData = {
      time: hours, wind_speed_10m: fill(6), wind_direction_10m: fill(90),
      wind_gusts_10m: fill(9), temperature_2m: fill(18), weather_code: fill(0),
    };
    const fc = computeSpotForecast(SPOT, marine, weather, PROFILE);
    const s = fc.hourlyConditions.map(h => h.score);
    // The outlier at index 3 must be pulled toward its (equal) neighbours.
    const neighbourAvg = (s[2] + s[4]) / 2;
    expect(Math.abs(s[3] - neighbourAvg)).toBeLessThan(2.5);
  });
});

describe('computeSpotForecast', () => {
  it('returns forecast with bestTime and currentScore', () => {
    const hours = Array.from({ length: 24 }, (_, i) => `2025-03-10T${String(i).padStart(2, '0')}:00`);
    const fill = <T,>(v: T) => hours.map(() => v);
    const marine: MarineData = {
      time: hours,
      wave_height: fill(1.5),
      wave_direction: fill(280),
      wave_period: fill(10),
      swell_wave_height: fill(1.2),
      swell_wave_direction: fill(290),
      swell_wave_period: fill(11),
      swell_wave_peak_period: fill(13),
      wind_wave_height: fill(0.3),
      wind_wave_direction: fill(300),
      wind_wave_period: fill(5),
      sea_surface_temperature: fill(16),
      ocean_current_velocity: fill(0.1),
      ocean_current_direction: fill(180),
      sea_level_height_msl: fill(0.5),
    };
    const weather: WeatherData = {
      time: hours,
      wind_speed_10m: fill(8),
      wind_direction_10m: fill(90),
      wind_gusts_10m: fill(12),
      temperature_2m: fill(18),
      weather_code: fill(0),
    };
    const result = computeSpotForecast(SPOT, marine, weather, PROFILE);
    expect(result.spot.id).toBe('test-spot');
    expect(result.currentScore).toBeGreaterThanOrEqual(0);
    expect(result.currentScore).toBeLessThanOrEqual(10);
    expect(result.bestTime).toBeDefined();
    expect(result.bestTime.label).toBeTruthy();
    expect(result.hourlyConditions.length).toBe(24);
  });
});
