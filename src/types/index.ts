export type SurferLevel = 'beginner' | 'intermediate' | 'expert';
export type WaveHeightPref = '0.5-1' | '1-2' | '2+';
export type BreakType = 'beach' | 'reef' | 'point';
export type WindPref = 'offshore' | 'side-shore' | 'any';

export interface SurferProfile {
  level: SurferLevel;
  preferredHeight: WaveHeightPref[];
  breakType: BreakType[];
  windPref: WindPref;
  sessionDuration: number;
  availableFrom: number;
  availableTo: number;
  preferredZone?: string;
}

export interface SpotConfig {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  beachOrientation: number;
  optimalSwellDirMin: number;
  optimalSwellDirMax: number;
  optimalSwellHeightMin: number;
  optimalSwellHeightMax: number;
  optimalTide: 'low' | 'mid' | 'high' | 'all';
  bottomType: BreakType;
  recommendedLevel: SurferLevel;
  region: string;
  country: string;
  description: string;
  dangers: string[];
  webcamUrl?: string;
}

export interface MarineData {
  time: string[];
  /** Spot-local UTC offset in seconds (from Open-Meteo `timezone=auto`). */
  utc_offset_seconds?: number;
  wave_height: (number | null)[];
  wave_direction: (number | null)[];
  wave_period: (number | null)[];
  swell_wave_height: (number | null)[];
  swell_wave_direction: (number | null)[];
  swell_wave_period: (number | null)[];
  swell_wave_peak_period: (number | null)[];
  wind_wave_height: (number | null)[];
  wind_wave_direction: (number | null)[];
  wind_wave_period: (number | null)[];
  sea_surface_temperature: (number | null)[];
  ocean_current_velocity: (number | null)[];
  ocean_current_direction: (number | null)[];
  sea_level_height_msl: (number | null)[];
}

export interface WeatherData {
  time: string[];
  /** Spot-local UTC offset in seconds (from Open-Meteo `timezone=auto`). */
  utc_offset_seconds?: number;
  wind_speed_10m: (number | null)[];
  wind_direction_10m: (number | null)[];
  wind_gusts_10m: (number | null)[];
  temperature_2m: (number | null)[];
  weather_code: (number | null)[];
}

export type ScoreCap =
  | 'flat'
  | 'period'
  | 'onshore'
  | 'offshoreStorm'
  | 'gusts'
  | 'windSwell'
  | 'beginnerExpert'
  | 'beginnerBigWaves';

export interface ScoreFactors {
  swellQuality: number;     // 0..1
  windQuality: number;       // 0..1
  tideMatch: number;         // ~0.6..1.15
  levelFit: number;          // ~0.4..1.05
  profileMatch: number;      // ~0.78..1.16 (height + break type + wind prefs)
  cleanFactor: number;       // ~0.25..1.0
  weatherPenalty: number;    // ~0.7..1.0
  consistency: number;       // ~0.85..1.05
  windTrend: number;         // ~0.9..1.08
  currentPenalty: number;    // ~0.75..1.0
  windSwellOnly: boolean;
  rawScore: number;          // before deal-breaker cap (0..10)
  cappedScore: number;       // after deal-breaker cap (0..10)
  caps: ScoreCap[];          // list of deal-breakers that capped this hour
}

export interface HourlyCondition {
  time: string;
  score: number;
  waveHeight: number;
  swellHeight: number;
  swellDirection: number;
  swellPeriod: number;
  windSpeed: number;
  windDirection: number;
  windGusts: number;
  temperature: number;
  seaTemp: number;
  seaLevel: number;
  weatherCode: number;
  factors?: ScoreFactors;
}

export interface SpotForecast {
  spot: SpotConfig;
  hourlyConditions: HourlyCondition[];
  currentScore: number;
  currentCondition: HourlyCondition | null;
  bestTime: { time: string; score: number; label: string };
  /** Spot-local UTC offset in seconds (for timezone-correct "today"/night logic). */
  utcOffsetSeconds?: number;
  /** True when it is currently night at the spot (local time). */
  isNightNow: boolean;
}

export const DEFAULT_PROFILE: SurferProfile = {
  level: 'intermediate',
  preferredHeight: ['0.5-1', '1-2'],
  breakType: ['beach'],
  windPref: 'offshore',
  sessionDuration: 2,
  availableFrom: 8,
  availableTo: 19,
  preferredZone: undefined,
};
