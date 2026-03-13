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
