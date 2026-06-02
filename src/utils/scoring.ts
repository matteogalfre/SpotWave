import {
  SpotConfig,
  MarineData,
  WeatherData,
  HourlyCondition,
  SurferProfile,
  SpotForecast,
  ScoreCap,
} from '../types';
import { isDaytime } from '../theme';

/**
 * Minimum score for a slot to be worth showing as a "good window".
 * Below this the conditions are mediocre/unsurfable, so the UI shows a neutral
 * "no good window" message instead of an enthusiastic time label.
 */
export const RIDABLE_SCORE = 3.5;

// ── helpers ──────────────────────────────────────────────────────────────

function angleDiff(a: number, b: number): number {
  let diff = Math.abs(a - b) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}

function isAngleInRange(angle: number, min: number, max: number): boolean {
  const n = ((angle % 360) + 360) % 360;
  const nMin = ((min % 360) + 360) % 360;
  const nMax = ((max % 360) + 360) % 360;
  if (nMin <= nMax) return n >= nMin && n <= nMax;
  return n >= nMin || n <= nMax;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function gaussian(x: number, center: number, sigma: number): number {
  return Math.exp(-0.5 * ((x - center) / sigma) ** 2);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

// ── level-dependent ideal ranges ─────────────────────────────────────────

function levelHeightRange(profile: SurferProfile): { ideal: [number, number]; max: number } {
  switch (profile.level) {
    case 'beginner':
      return { ideal: [0.4, 1.0], max: 1.5 };
    case 'intermediate':
      return { ideal: [0.7, 1.8], max: 2.5 };
    case 'expert':
      return { ideal: [1.2, 3.5], max: 6.0 };
  }
}

// ── SWELL QUALITY (0-1) ─────────────────────────────────────────────────
// Combines height, direction, period, and height×period synergy.
// Period is weighted 35% because it's what separates real surf from chop.

function heightFactor(height: number, spot: SpotConfig, profile: SurferProfile): number {
  if (height < 0.15) return 0;

  const lvl = levelHeightRange(profile);
  const idealMin = Math.max(spot.optimalSwellHeightMin, lvl.ideal[0]);
  const idealMax = Math.min(spot.optimalSwellHeightMax, lvl.ideal[1]);
  const min = Math.min(idealMin, idealMax);
  const max = Math.max(idealMin, idealMax);
  const center = (min + max) / 2;
  const sigma = Math.max((max - min) / 2, 0.3);

  if (height >= min && height <= max) {
    return 0.70 + 0.15 * gaussian(height, center, sigma);
  }

  if (height < min) {
    if (height < 0.3) return clamp01(height / 0.3 * 0.1);
    return clamp01(0.10 + 0.55 * ((height - 0.3) / Math.max(min - 0.3, 0.1)));
  }

  if (height > lvl.max) {
    if (profile.level === 'beginner') return 0;
    return clamp01(0.15 - (height - lvl.max) * 0.1);
  }

  const overRatio = (height - max) / Math.max(lvl.max - max, 0.5);
  return clamp01(0.65 - overRatio * 0.45);
}

function directionFactor(direction: number, spot: SpotConfig): number {
  const center = ((spot.optimalSwellDirMin + spot.optimalSwellDirMax) / 2) % 360;

  if (isAngleInRange(direction, spot.optimalSwellDirMin, spot.optimalSwellDirMax)) {
    const diff = angleDiff(direction, center);
    const halfRange = angleDiff(spot.optimalSwellDirMin, center);
    const ratio = halfRange > 0 ? diff / halfRange : 0;
    return 0.90 - ratio * 0.20;
  }

  const diffToMin = angleDiff(direction, spot.optimalSwellDirMin);
  const diffToMax = angleDiff(direction, spot.optimalSwellDirMax);
  const minDiff = Math.min(diffToMin, diffToMax);

  if (minDiff < 15) return 0.55;
  if (minDiff < 30) return 0.35;
  if (minDiff < 60) return 0.15;
  return 0.05;
}

function periodFactor(period: number, peakPeriod: number, profile: SurferProfile): number {
  const effectivePeriod = peakPeriod > 0 ? Math.max(period, peakPeriod) : period;
  if (effectivePeriod < 4) return 0.05;
  if (effectivePeriod < 6) return 0.12;
  if (effectivePeriod < 8) return 0.30;
  if (effectivePeriod < 10) return 0.50;
  if (effectivePeriod < 12) return 0.70;
  if (effectivePeriod < 14) return 0.85;
  if (effectivePeriod < 18) return 0.95;
  return profile.level === 'expert' ? 0.95 : 0.80;
}

// Height × period synergy: 1.5m @ 14s is far better than 2m @ 7s.
// A long-period swell packs more energy per metre of face.
// Returns 0.6-1.15 multiplier on the height component.
function powerSynergy(height: number, period: number, peakPeriod: number): number {
  if (height < 0.2) return 1.0;
  const effP = peakPeriod > 0 ? Math.max(period, peakPeriod) : period;
  const energy = height * Math.pow(effP / 10, 1.3);
  if (energy > 2.5) return 1.15;
  if (energy > 1.5) return lerp(1.05, 1.15, (energy - 1.5) / 1.0);
  if (energy > 0.8) return lerp(1.0, 1.05, (energy - 0.8) / 0.7);
  if (energy > 0.3) return lerp(0.75, 1.0, (energy - 0.3) / 0.5);
  return 0.6;
}

function swellQuality(
  height: number,
  direction: number,
  period: number,
  peakPeriod: number,
  spot: SpotConfig,
  profile: SurferProfile,
): number {
  const h = heightFactor(height, spot, profile);
  const d = directionFactor(direction, spot);
  const p = periodFactor(period, peakPeriod, profile);
  const syn = powerSynergy(height, period, peakPeriod);

  // Period at 35%, direction at 25%, height at 40% (boosted by synergy)
  return (h * syn) * 0.40 + d * 0.25 + p * 0.35;
}

// ── WIND QUALITY (0-1) ──────────────────────────────────────────────────
// Glassy = 1.0 (best possible). Light offshore = 0.98. Strong offshore = penalised.
// Onshore is devastating. Wind impact scales with swell height.

function windQuality(
  speed: number,
  direction: number,
  gusts: number,
  spot: SpotConfig,
  swellHeight: number,
): number {
  // Glassy conditions: absolutely perfect surface
  if (speed < 3) return 1.0;
  if (speed < 5) return 0.97;

  const offshoreDir = (spot.beachOrientation + 180) % 360;
  const diff = angleDiff(direction, offshoreDir);

  // Direction quality: offshore is great, onshore is terrible
  let dirMult: number;
  if (diff <= 30) dirMult = 1.0;       // offshore
  else if (diff <= 60) dirMult = 0.82;  // cross-off
  else if (diff <= 90) dirMult = 0.55;  // cross-shore
  else if (diff <= 120) dirMult = 0.28; // cross-on
  else if (diff <= 150) dirMult = 0.10; // onshore-ish
  else dirMult = 0.05;                  // direct onshore

  // Speed impact depends on direction:
  // - Offshore: sweet spot 5-15 km/h, then degrades (spray, hard take-offs)
  // - Onshore: any speed is bad, more = worse
  let speedMult: number;
  const isOffshore = diff <= 60;

  if (isOffshore) {
    // Offshore: light is perfect, strong is problematic
    if (speed < 8) speedMult = 0.98;
    else if (speed < 12) speedMult = 0.95;
    else if (speed < 18) speedMult = 0.88;
    else if (speed < 25) speedMult = 0.72;  // lip spray, hard take-offs
    else if (speed < 35) speedMult = 0.55;  // brutal offshore, can't paddle into waves
    else speedMult = 0.35;                   // storm offshore, unsurfable for most
  } else {
    if (speed < 8) speedMult = 0.92;
    else if (speed < 12) speedMult = 0.80;
    else if (speed < 16) speedMult = 0.65;
    else if (speed < 22) speedMult = 0.45;
    else if (speed < 30) speedMult = 0.25;
    else speedMult = 0.10;
  }

  let base = dirMult * speedMult;

  // Onshore double penalty for cross-on and worse
  if (diff > 90) {
    base *= 0.70;
  }

  // Gust instability: irregular wind = inconsistent surface
  if (gusts > 0 && speed > 0) {
    const gustRatio = gusts / speed;
    if (gustRatio > 2.0) base *= 0.50;
    else if (gustRatio > 1.5) base *= 0.70;
    else if (gustRatio > 1.3) base *= 0.85;
  }

  // Absolute gust caps
  if (gusts > 40) base *= 0.40;
  else if (gusts > 30) base *= 0.60;
  else if (gusts > 25) base *= 0.78;

  // Wind × swell height interaction: same wind is worse on bigger waves
  // because the face is larger and more exposed to chop.
  // On tiny waves (<0.5m), wind matters less (you're barely riding).
  if (swellHeight > 0.5 && diff > 60) {
    const heightPenalty = clamp01((swellHeight - 0.5) / 2.0) * 0.15;
    base *= (1.0 - heightPenalty);
  }

  return clamp01(base);
}

// ── WIND TREND ──────────────────────────────────────────────────────────
// Detects improving/degrading wind windows.
// Dropping onshore wind = surface still clean for ~1-2h after.
// Rising wind = conditions degrading faster than the number shows.

function windTrendFactor(
  index: number,
  weather: WeatherData,
  spot: SpotConfig,
): number {
  if (index < 2 || index >= weather.wind_speed_10m.length - 1) return 1.0;

  const prev2 = weather.wind_speed_10m[index - 2] ?? 0;
  const prev1 = weather.wind_speed_10m[index - 1] ?? 0;
  const curr = weather.wind_speed_10m[index] ?? 0;
  const next1 = weather.wind_speed_10m[Math.min(index + 1, weather.wind_speed_10m.length - 1)] ?? 0;

  const offshoreDir = (spot.beachOrientation + 180) % 360;
  const windDir = weather.wind_direction_10m[index] ?? 0;
  const diff = angleDiff(windDir, offshoreDir);
  const isOnshoreIsh = diff > 90;

  const recentTrend = curr - ((prev2 + prev1) / 2);
  const futureTrend = next1 - curr;

  // Wind dropping = improving. Bonus if onshore is decreasing.
  if (recentTrend < -4 && isOnshoreIsh) return 1.08;
  if (recentTrend < -2) return 1.04;

  // Wind rising = degrading. Penalty if getting worse.
  if (futureTrend > 5 && isOnshoreIsh) return 0.90;
  if (futureTrend > 3) return 0.95;

  return 1.0;
}

// ── TIDE MATCH ──────────────────────────────────────────────────────────
// Trend bonus/malus depends on bottom type (not universal).
// Beach breaks: falling tide often reveals better banks.
// Point breaks: rising tide usually improves the wave shape.
// Reef breaks: depends on depth; very low = dangerous.

function tideMatch(
  seaLevel: number,
  prevSeaLevel: number,
  spot: SpotConfig,
  profile: SurferProfile,
): number {
  const trend = seaLevel - prevSeaLevel;
  const isRising = trend > 0.03;
  const isFalling = trend < -0.03;

  // Trend multiplier now depends on bottom type
  let trendMult = 1.0;
  switch (spot.bottomType) {
    case 'beach':
      // Beach breaks: falling tide exposes better sandbars
      if (isFalling) trendMult = 1.06;
      else if (isRising) trendMult = 0.97;
      break;
    case 'point':
      // Point breaks: rising tide shapes the wave along the point
      if (isRising) trendMult = 1.08;
      else if (isFalling) trendMult = 0.94;
      break;
    case 'reef':
      // Reef breaks: rising tide = safer + cleaner; falling = shallower risk
      if (isRising) trendMult = 1.06;
      else if (isFalling) trendMult = 0.92;
      break;
  }

  let levelMult = 1.0;
  switch (spot.optimalTide) {
    case 'low':
      if (seaLevel < -1.0) levelMult = 1.1;
      else if (seaLevel < -0.3) levelMult = 1.05;
      else if (seaLevel < 0.3) levelMult = 0.95;
      else levelMult = 0.80;
      break;
    case 'mid':
      if (seaLevel >= -0.5 && seaLevel <= 0.5) levelMult = 1.1;
      else if (seaLevel >= -1.0 && seaLevel <= 1.0) levelMult = 0.95;
      else levelMult = 0.80;
      break;
    case 'high':
      if (seaLevel > 0.5) levelMult = 1.1;
      else if (seaLevel > 0.0) levelMult = 1.0;
      else if (seaLevel > -0.5) levelMult = 0.90;
      else levelMult = 0.75;
      break;
    case 'all':
    default:
      if (Math.abs(seaLevel) > 1.8) levelMult = 0.90;
      break;
  }

  if (spot.bottomType === 'beach') {
    if (seaLevel > 1.0) levelMult *= 0.90;
    if (seaLevel < -1.5) levelMult *= 0.85;
  }
  if (spot.bottomType === 'reef' && seaLevel < -1.2) {
    levelMult *= profile.level === 'beginner' ? 0.50 : 0.75;
  }

  const raw = levelMult * trendMult;
  return Math.max(0.6, Math.min(1.15, raw));
}

// ── LEVEL FIT ───────────────────────────────────────────────────────────

function levelFit(spot: SpotConfig, profile: SurferProfile): number {
  if (spot.recommendedLevel === profile.level) return 1.05;

  if (profile.level === 'intermediate') {
    return spot.recommendedLevel === 'beginner' ? 0.95 : 0.80;
  }
  if (profile.level === 'expert') {
    return spot.recommendedLevel === 'intermediate' ? 0.95 : 0.85;
  }
  if (spot.recommendedLevel === 'intermediate') return 0.70;
  return 0.40;
}

// ── PROFILE MATCH ───────────────────────────────────────────────────────
// Combines the surfer's stated preferences: wave height, break type and wind.
// windQuality already scores wind objectively; here we only add a gentle nudge
// so that, e.g., a picky "offshore-only" surfer rates onshore days a bit lower
// and a spot whose bottom type matches the preferred break gets a small bonus.

function profileMatch(
  swellHeight: number,
  waveHeight: number,
  spot: SpotConfig,
  profile: SurferProfile,
  windDir: number,
  windSpeed: number,
): number {
  const h = swellHeight || waveHeight;

  let heightM = 0.90;
  for (const pref of profile.preferredHeight) {
    if (pref === '0.5-1' && h >= 0.4 && h <= 1.1) { heightM = 1.1; break; }
    if (pref === '1-2' && h >= 0.9 && h <= 2.1) { heightM = 1.1; break; }
    if (pref === '2+' && h >= 1.8) { heightM = 1.1; break; }
  }

  // Break type preference: bonus when the spot matches one of the preferred
  // bottom types, slight malus otherwise.
  let breakM = 1.0;
  if (profile.breakType && profile.breakType.length > 0) {
    breakM = profile.breakType.includes(spot.bottomType) ? 1.05 : 0.92;
  }

  // Wind preference: gentle modifier, only when there's actual wind.
  let windM = 1.0;
  if (profile.windPref && profile.windPref !== 'any' && windSpeed >= 8) {
    const offshoreDir = (spot.beachOrientation + 180) % 360;
    const diff = angleDiff(windDir, offshoreDir);
    if (profile.windPref === 'offshore') {
      if (diff <= 45) windM = 1.0;
      else if (diff <= 90) windM = 0.96;
      else windM = 0.93;
    } else {
      // 'side-shore': tolerant of cross winds, only dislikes pure onshore
      windM = diff <= 120 ? 1.0 : 0.96;
    }
  }

  return heightM * breakM * windM;
}

// ── CLEAN FACTOR ────────────────────────────────────────────────────────
// Penalizes messy swell. No longer penalizes short period here
// (that's already handled by periodFactor — avoids double penalty).
// Now also detects crossing swells via wind wave direction.

function cleanFactor(
  swellHeight: number,
  waveHeight: number,
  swellDir: number,
  windWaveHeight: number,
  windWavePeriod: number,
  windWaveDir: number,
): number {
  let f = 1.0;

  // Ground swell vs total wave ratio
  if (waveHeight > 0 && swellHeight > 0) {
    const ratio = swellHeight / waveHeight;
    if (ratio < 0.5) f *= 0.70;
    else if (ratio < 0.65) f *= 0.85;
  }

  // Wind swell dominance
  if (windWaveHeight > 0 && swellHeight > 0) {
    const windDominance = windWaveHeight / (swellHeight + windWaveHeight);
    if (windDominance > 0.7) f *= 0.55;
    else if (windDominance > 0.5) f *= 0.72;
    else if (windDominance > 0.35) f *= 0.88;
  }

  // Short-period wind chop on top of swell
  if (windWavePeriod > 0 && windWavePeriod < 5 && windWaveHeight > 0.5) {
    f *= 0.80;
  }

  // Crossing swells: wind wave from a very different direction than ground swell
  // creates a chaotic, bumpy surface even in light wind.
  if (windWaveHeight > 0.3 && swellHeight > 0.3) {
    const crossAngle = angleDiff(swellDir, windWaveDir);
    if (crossAngle > 90) f *= 0.70;
    else if (crossAngle > 60) f *= 0.82;
    else if (crossAngle > 40) f *= 0.92;
  }

  return Math.max(0.25, f);
}

// ── CURRENT PENALTY ─────────────────────────────────────────────────────
// Strong ocean currents degrade conditions: harder paddle, drift, rips.

function currentPenalty(velocity: number): number {
  if (velocity < 0.3) return 1.0;
  if (velocity < 0.5) return 0.97;
  if (velocity < 0.8) return 0.93;
  if (velocity < 1.2) return 0.85;
  return 0.75;
}

// ── WEATHER PENALTY ─────────────────────────────────────────────────────

function weatherPenalty(weatherCode: number): number {
  if (weatherCode <= 3) return 1.0;
  if (weatherCode <= 49) return 0.97;
  if (weatherCode <= 55) return 0.93;
  if (weatherCode <= 65) return 0.88;
  if (weatherCode <= 79) return 0.85;
  if (weatherCode <= 82) return 0.85;
  if (weatherCode <= 86) return 0.80;
  return 0.70;
}

// ── CONSISTENCY BONUS ───────────────────────────────────────────────────

function consistencyFactor(
  index: number,
  marine: MarineData,
): number {
  if (index < 2) return 1.0;
  const dirs: number[] = [];
  for (let i = Math.max(0, index - 2); i <= index; i++) {
    const d = marine.swell_wave_direction[i];
    if (d != null) dirs.push(d);
  }
  if (dirs.length < 2) return 1.0;

  let maxDiff = 0;
  for (let i = 1; i < dirs.length; i++) {
    let diff = Math.abs(dirs[i] - dirs[i - 1]) % 360;
    if (diff > 180) diff = 360 - diff;
    maxDiff = Math.max(maxDiff, diff);
  }

  if (maxDiff < 10) return 1.05;
  if (maxDiff < 25) return 1.0;
  if (maxDiff < 45) return 0.92;
  return 0.85;
}

// ── EFFECTIVE HEIGHT ────────────────────────────────────────────────────
// If swell_wave_height is 0 but wave_height exists, it's pure wind swell.
// We still use the height but flag it for a penalty via the clean factor.

function effectiveSwellHeight(swellHeight: number, waveHeight: number): { height: number; isWindSwellOnly: boolean } {
  if (swellHeight > 0.15) return { height: swellHeight, isWindSwellOnly: false };
  if (waveHeight > 0.15) return { height: waveHeight, isWindSwellOnly: true };
  return { height: 0, isWindSwellOnly: false };
}

// ── DEAL-BREAKERS ────────────────────────────────────────────────────────

function applyDealBreakers(
  rawScore: number,
  swellHeight: number,
  waveHeight: number,
  period: number,
  windSpeed: number,
  windDir: number,
  gusts: number,
  spot: SpotConfig,
  profile: SurferProfile,
): { capped: number; caps: ScoreCap[] } {
  let cap = 10;
  const caps: ScoreCap[] = [];
  const addCap = (newCap: number, label: ScoreCap) => {
    if (newCap < cap) {
      cap = newCap;
      if (!caps.includes(label)) caps.push(label);
    } else if (newCap === cap && rawScore > newCap && !caps.includes(label)) {
      caps.push(label);
    }
  };

  if (swellHeight < 0.15) addCap(0.5, 'flat');
  else if (swellHeight < 0.3) addCap(1.5, 'flat');
  else if (swellHeight < 0.4) addCap(2.5, 'flat');

  if (period < 4) addCap(1.5, 'period');
  else if (period < 5) addCap(3.0, 'period');
  else if (period < 7) addCap(5.0, 'period');

  const offshoreDir = (spot.beachOrientation + 180) % 360;
  const windAngle = angleDiff(windDir, offshoreDir);
  const isOnshore = windAngle > 120;
  const isCrossOn = windAngle > 90 && windAngle <= 120;

  if (isOnshore && windSpeed > 30) addCap(2.0, 'onshore');
  else if (isOnshore && windSpeed > 25) addCap(3.0, 'onshore');
  else if (isOnshore && windSpeed > 20) addCap(3.5, 'onshore');
  else if (isOnshore && windSpeed > 15) addCap(5.0, 'onshore');

  if (isCrossOn && windSpeed > 20) addCap(5.5, 'onshore');
  else if (isCrossOn && windSpeed > 15) addCap(6.5, 'onshore');

  const isOffshore = windAngle <= 45;
  if (isOffshore && windSpeed > 40) addCap(4.0, 'offshoreStorm');
  else if (isOffshore && windSpeed > 30) addCap(5.5, 'offshoreStorm');

  if (gusts > 50) addCap(2.5, 'gusts');
  else if (gusts > 40) addCap(3.5, 'gusts');
  else if (gusts > 30) addCap(6.5, 'gusts');
  else if (gusts > 25) addCap(7.5, 'gusts');

  if (waveHeight > 0 && swellHeight > 0) {
    const ratio = swellHeight / waveHeight;
    if (ratio < 0.5) addCap(5.5, 'windSwell');
  }

  if (
    profile.level === 'beginner' &&
    spot.recommendedLevel === 'expert' &&
    swellHeight > 2.0
  ) {
    addCap(1.5, 'beginnerExpert');
  }

  if (profile.level === 'beginner' && swellHeight > levelHeightRange(profile).max) {
    addCap(2.0, 'beginnerBigWaves');
  }

  return { capped: Math.min(rawScore, cap), caps };
}

// ── HIGH-END COMPRESSION ────────────────────────────────────────────────

function compressHighEnd(score: number): number {
  if (score <= 7.0) return score;
  return 7.0 + (score - 7.0) * 0.6;
}

// ── MAIN SCORING ────────────────────────────────────────────────────────

export function computeHourlyScore(
  index: number,
  marine: MarineData,
  weather: WeatherData,
  spot: SpotConfig,
  profile: SurferProfile,
): HourlyCondition {
  const waveHeight = marine.wave_height[index] ?? 0;
  const rawSwellHeight = marine.swell_wave_height[index] ?? 0;
  const swellDir = marine.swell_wave_direction[index] ?? 0;
  const swellPeriod = marine.swell_wave_period[index] ?? 0;
  const peakPeriod = marine.swell_wave_peak_period[index] ?? 0;
  const windWaveHeight = marine.wind_wave_height[index] ?? 0;
  const windWavePeriod = marine.wind_wave_period[index] ?? 0;
  const windWaveDir = marine.wind_wave_direction[index] ?? 0;
  const windSpeed = weather.wind_speed_10m[index] ?? 0;
  const windDir = weather.wind_direction_10m[index] ?? 0;
  const windGusts = weather.wind_gusts_10m[index] ?? 0;
  const temp = weather.temperature_2m[index] ?? 0;
  const seaTemp = marine.sea_surface_temperature[index] ?? 0;
  const seaLevel = marine.sea_level_height_msl?.[index] ?? 0;
  const prevSeaLevel = marine.sea_level_height_msl?.[Math.max(0, index - 1)] ?? seaLevel;
  const tideVelocity = marine.ocean_current_velocity[index] ?? 0;
  const weatherCode = weather.weather_code[index] ?? 0;

  // Effective height: if no ground swell, fallback to wave_height with penalty
  const { height: effectiveHeight, isWindSwellOnly } = effectiveSwellHeight(rawSwellHeight, waveHeight);

  const swell = swellQuality(effectiveHeight, swellDir, swellPeriod, peakPeriod, spot, profile);

  // Wind quality now receives swell height for interaction
  const wind = windQuality(windSpeed, windDir, windGusts, spot, effectiveHeight);

  // Base: multiplicative — if either is zero, score is zero.
  // But glassy (wind=1.0) + good swell = full marks, not penalised.
  const base = swell * wind;

  const tide = tideMatch(seaLevel, prevSeaLevel, spot, profile);
  const level = levelFit(spot, profile);
  const pMatch = profileMatch(rawSwellHeight, waveHeight, spot, profile, windDir, windSpeed);
  const clean = cleanFactor(rawSwellHeight, waveHeight, swellDir, windWaveHeight, windWavePeriod, windWaveDir);
  const weather_ = weatherPenalty(weatherCode);
  const consistency = consistencyFactor(index, marine);
  const windTrend = windTrendFactor(index, weather, spot);
  const current = currentPenalty(tideVelocity);

  // Pure wind swell penalty: no ground swell at all means messy conditions
  const windSwellPenalty = isWindSwellOnly ? 0.65 : 1.0;

  const adjusted = base * tide * level * pMatch * clean * weather_
    * consistency * windTrend * current * windSwellPenalty;
  const rawScore = adjusted * 10;

  const { capped, caps } = applyDealBreakers(
    rawScore, effectiveHeight, waveHeight, swellPeriod,
    windSpeed, windDir, windGusts,
    spot, profile,
  );

  const finalScore = compressHighEnd(capped);

  return {
    time: marine.time[index] ?? weather.time[index] ?? '',
    score: Math.round(finalScore * 10) / 10,
    waveHeight,
    swellHeight: rawSwellHeight,
    swellDirection: swellDir,
    swellPeriod,
    windSpeed,
    windDirection: windDir,
    windGusts,
    temperature: temp,
    seaTemp,
    seaLevel,
    weatherCode,
    factors: {
      swellQuality: swell,
      windQuality: wind,
      tideMatch: tide,
      levelFit: level,
      profileMatch: pMatch,
      cleanFactor: clean,
      weatherPenalty: weather_,
      consistency,
      windTrend,
      currentPenalty: current,
      windSwellOnly: isWindSwellOnly,
      rawScore: Math.round(rawScore * 10) / 10,
      cappedScore: Math.round(capped * 10) / 10,
      caps,
    },
  };
}

// ── BEST TIME LABEL ─────────────────────────────────────────────────────

function formatBestTimeLabel(bestTime: string, now: Date, locale: string = 'fr'): string {
  const best = new Date(bestTime);
  const diffMs = best.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const hour = best.getHours().toString().padStart(2, '0');
  const isFr = locale === 'fr';

  if (diffHours <= 0) return isFr ? 'Maintenant !' : 'Now!';
  if (diffHours <= 6) return isFr ? `Dans ${diffHours}h` : `In ${diffHours}h`;

  const isToday = best.getDate() === now.getDate();
  if (isToday) return isFr ? `Aujourd'hui ${hour}h` : `Today ${hour}h`;

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (best.getDate() === tomorrow.getDate()) return isFr ? `Demain ${hour}h` : `Tomorrow ${hour}h`;

  const dayNames = isFr
    ? ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${dayNames[best.getDay()]} ${hour}h`;
}

// ── SPOT FORECAST ───────────────────────────────────────────────────────

export function computeSpotForecast(
  spot: SpotConfig,
  marine: MarineData,
  weather: WeatherData,
  profile: SurferProfile,
  locale: string = 'fr',
): SpotForecast {
  const len = Math.min(marine.time.length, weather.time.length);
  const hourlyConditions: HourlyCondition[] = [];

  for (let i = 0; i < len; i++) {
    hourlyConditions.push(computeHourlyScore(i, marine, weather, spot, profile));
  }

  const now = new Date();
  const nowStr = now.toISOString().slice(0, 13);

  let currentIdx = 0;
  for (let i = 0; i < hourlyConditions.length; i++) {
    if (hourlyConditions[i].time.slice(0, 13) >= nowStr) {
      currentIdx = i;
      break;
    }
  }

  const hFrom = profile.availableFrom ?? 7;
  const hTo = profile.availableTo ?? 20;

  let bestIdx = currentIdx;
  for (let i = currentIdx; i < hourlyConditions.length; i++) {
    if (!isDaytime(hourlyConditions[i].time, hFrom, hTo)) continue;
    if (hourlyConditions[i].score > (hourlyConditions[bestIdx]?.score ?? 0)) {
      bestIdx = i;
    }
  }

  if (!isDaytime(hourlyConditions[bestIdx]?.time ?? '', hFrom, hTo)) {
    for (let i = currentIdx; i < hourlyConditions.length; i++) {
      if (isDaytime(hourlyConditions[i].time, hFrom, hTo)) { bestIdx = i; break; }
    }
  }

  const bestCondition = hourlyConditions[bestIdx];
  const bestTimeLabel = bestCondition ? formatBestTimeLabel(bestCondition.time, now, locale) : '';

  return {
    spot,
    hourlyConditions,
    currentScore: hourlyConditions[currentIdx]?.score ?? 0,
    currentCondition: hourlyConditions[currentIdx] ?? null,
    bestTime: {
      time: bestCondition?.time ?? '',
      score: bestCondition?.score ?? 0,
      label: bestTimeLabel,
    },
  };
}
