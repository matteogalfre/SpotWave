import {
  SpotConfig,
  MarineData,
  WeatherData,
  HourlyCondition,
  SurferProfile,
  SpotForecast,
} from '../types';
import { isDaytime } from '../theme';

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
// Combines height match, direction match, and period quality.
// Weight: 40% of total score.

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
    return 0.8 + 0.2 * gaussian(height, center, sigma);
  }

  if (height < min) {
    if (height < 0.3) return clamp01(height / 0.3 * 0.15);
    return clamp01(0.15 + 0.65 * ((height - 0.3) / Math.max(min - 0.3, 0.1)));
  }

  if (height > lvl.max) {
    if (profile.level === 'beginner') return 0;
    return clamp01(0.2 - (height - lvl.max) * 0.1);
  }

  const overRatio = (height - max) / Math.max(lvl.max - max, 0.5);
  return clamp01(0.8 - overRatio * 0.5);
}

function directionFactor(direction: number, spot: SpotConfig): number {
  const center = ((spot.optimalSwellDirMin + spot.optimalSwellDirMax) / 2) % 360;

  if (isAngleInRange(direction, spot.optimalSwellDirMin, spot.optimalSwellDirMax)) {
    const diff = angleDiff(direction, center);
    const halfRange = angleDiff(spot.optimalSwellDirMin, center);
    const ratio = halfRange > 0 ? diff / halfRange : 0;
    return 1.0 - ratio * 0.2;
  }

  const diffToMin = angleDiff(direction, spot.optimalSwellDirMin);
  const diffToMax = angleDiff(direction, spot.optimalSwellDirMax);
  const minDiff = Math.min(diffToMin, diffToMax);

  if (minDiff < 15) return 0.65;
  if (minDiff < 30) return 0.4;
  if (minDiff < 60) return 0.2;
  return 0.05;
}

function periodFactor(period: number, profile: SurferProfile): number {
  if (period < 4) return 0.05;
  if (period < 6) return 0.15;
  if (period < 8) return 0.4;
  if (period < 10) return 0.65;
  if (period < 12) return 0.8;
  if (period < 14) return 0.9;
  if (period < 18) return 1.0;
  return profile.level === 'expert' ? 1.0 : 0.85;
}

function swellQuality(
  height: number,
  direction: number,
  period: number,
  spot: SpotConfig,
  profile: SurferProfile,
): number {
  const h = heightFactor(height, spot, profile);
  const d = directionFactor(direction, spot);
  const p = periodFactor(period, profile);
  return h * 0.5 + d * 0.3 + p * 0.2;
}

// ── WIND QUALITY (0-1) ──────────────────────────────────────────────────
// Combines speed, direction (relative to beach), and gusts.
// Weight: 30% of total score.

function windQuality(
  speed: number,
  direction: number,
  gusts: number,
  spot: SpotConfig,
): number {
  if (speed < 5) return 1.0;

  const offshoreDir = (spot.beachOrientation + 180) % 360;
  const diff = angleDiff(direction, offshoreDir);

  let dirMult: number;
  if (diff <= 30) dirMult = 1.0;
  else if (diff <= 60) dirMult = 0.85;
  else if (diff <= 90) dirMult = 0.6;
  else if (diff <= 120) dirMult = 0.35;
  else if (diff <= 150) dirMult = 0.15;
  else dirMult = 0.08;

  let speedPenalty: number;
  if (speed < 10) speedPenalty = 1.0;
  else if (speed < 15) speedPenalty = 0.85;
  else if (speed < 20) speedPenalty = 0.65;
  else if (speed < 25) speedPenalty = 0.45;
  else if (speed < 35) speedPenalty = 0.25;
  else speedPenalty = 0.1;

  let base = dirMult * speedPenalty;

  if (diff > 90) {
    base *= 0.7;
  }

  if (gusts > 0 && speed > 0) {
    const gustRatio = gusts / speed;
    if (gustRatio > 2.0) base *= 0.6;
    else if (gustRatio > 1.5) base *= 0.8;
  }

  if (gusts > 40) base *= 0.5;
  else if (gusts > 30) base *= 0.75;

  return clamp01(base);
}

// ── TIDE MATCH (0-1) ────────────────────────────────────────────────────
// Weight: 10% of total score.
// ocean_current_velocity is flow speed in m/s, NOT tide height.
// High velocity = active tidal flow (changing tide, generally better conditions).
// Low velocity = slack water (tide peak or trough, less water movement).

function tideMatch(currentVelocity: number, spot: SpotConfig, profile: SurferProfile): number {
  const v = Math.abs(currentVelocity);

  if (profile.level === 'beginner' && v > 0.5) return 0.15;

  const isFlowing = v >= 0.05;
  const isStrong = v > 0.35;

  switch (spot.optimalTide) {
    case 'low':
      // Low tide spots work best at slack low or light flow
      if (v < 0.05) return 0.85;
      if (v < 0.15) return 0.7;
      if (v < 0.25) return 0.5;
      return 0.3;
    case 'mid':
      // Mid-tide spots prefer moderate flow (tide actively moving)
      if (v >= 0.08 && v <= 0.3) return 0.9;
      if (v >= 0.05 && v <= 0.4) return 0.7;
      if (v < 0.05) return 0.4;
      return 0.3;
    case 'high':
      // High tide spots prefer slack high or gentle flow
      if (v < 0.08) return 0.85;
      if (v < 0.15) return 0.65;
      if (v < 0.25) return 0.45;
      return 0.25;
    case 'all':
    default:
      // Works at any tide; penalize only very strong currents
      if (isStrong) return 0.4;
      if (isFlowing) return 0.75;
      return 0.7;
  }
}

// ── LEVEL FIT (0-1) ─────────────────────────────────────────────────────
// Weight: 10% of total score.

function levelFit(spot: SpotConfig, profile: SurferProfile): number {
  if (spot.recommendedLevel === profile.level) return 0.9;

  if (profile.level === 'intermediate') {
    return spot.recommendedLevel === 'beginner' ? 0.7 : 0.5;
  }
  if (profile.level === 'expert') {
    return spot.recommendedLevel === 'intermediate' ? 0.75 : 0.6;
  }
  // beginner
  if (spot.recommendedLevel === 'intermediate') return 0.3;
  return 0.1; // beginner at expert spot
}

// ── PROFILE MATCH (0-1) ─────────────────────────────────────────────────
// Weight: 10% of total score.

function profileMatch(
  swellHeight: number,
  waveHeight: number,
  spot: SpotConfig,
  profile: SurferProfile,
): number {
  let score = 0.3;
  const h = swellHeight || waveHeight;

  for (const pref of profile.preferredHeight) {
    if (pref === '0.5-1' && h >= 0.4 && h <= 1.1) { score += 0.2; break; }
    if (pref === '1-2' && h >= 0.9 && h <= 2.1) { score += 0.2; break; }
    if (pref === '2+' && h >= 1.8) { score += 0.2; break; }
  }

  if (profile.breakType.includes(spot.bottomType)) score += 0.15;

  if (profile.windPref === 'offshore') score += 0.05;

  return clamp01(score);
}

// ── DEAL-BREAKERS ────────────────────────────────────────────────────────
// These cap the maximum possible score regardless of other factors.

function applyDealBreakers(
  rawScore: number,
  swellHeight: number,
  period: number,
  windSpeed: number,
  windDir: number,
  gusts: number,
  spot: SpotConfig,
  profile: SurferProfile,
): number {
  let cap = 10;

  if (swellHeight < 0.15) cap = Math.min(cap, 0.5);
  else if (swellHeight < 0.3) cap = Math.min(cap, 1.5);
  else if (swellHeight < 0.4) cap = Math.min(cap, 3.0);

  if (period < 4) cap = Math.min(cap, 2.0);
  else if (period < 5) cap = Math.min(cap, 3.5);

  const offshoreDir = (spot.beachOrientation + 180) % 360;
  const windAngle = angleDiff(windDir, offshoreDir);
  const isOnshore = windAngle > 120;

  if (isOnshore && windSpeed > 30) cap = Math.min(cap, 2.0);
  else if (isOnshore && windSpeed > 25) cap = Math.min(cap, 3.0);
  else if (isOnshore && windSpeed > 20) cap = Math.min(cap, 4.0);

  if (gusts > 50) cap = Math.min(cap, 3.0);
  else if (gusts > 40) cap = Math.min(cap, 4.0);

  if (
    profile.level === 'beginner' &&
    spot.recommendedLevel === 'expert' &&
    swellHeight > 2.0
  ) {
    cap = Math.min(cap, 1.5);
  }

  if (profile.level === 'beginner' && swellHeight > levelHeightRange(profile).max) {
    cap = Math.min(cap, 2.0);
  }

  return Math.min(rawScore, cap);
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
  const swellHeight = marine.swell_wave_height[index] ?? 0;
  const swellDir = marine.swell_wave_direction[index] ?? 0;
  const swellPeriod = marine.swell_wave_period[index] ?? 0;
  const windSpeed = weather.wind_speed_10m[index] ?? 0;
  const windDir = weather.wind_direction_10m[index] ?? 0;
  const windGusts = weather.wind_gusts_10m[index] ?? 0;
  const temp = weather.temperature_2m[index] ?? 0;
  const seaTemp = marine.sea_surface_temperature[index] ?? 0;
  const tideHeight = marine.ocean_current_velocity[index] ?? 0;

  const effectiveHeight = swellHeight || waveHeight;

  const swell = swellQuality(effectiveHeight, swellDir, swellPeriod, spot, profile);
  const wind = windQuality(windSpeed, windDir, windGusts, spot);
  const tide = tideMatch(tideHeight, spot, profile);
  const level = levelFit(spot, profile);
  const pMatch = profileMatch(swellHeight, waveHeight, spot, profile);

  const base = swell * 0.40 + wind * 0.30 + tide * 0.10 + level * 0.10 + pMatch * 0.10;
  const rawScore = base * 10;

  const finalScore = applyDealBreakers(
    rawScore, effectiveHeight, swellPeriod,
    windSpeed, windDir, windGusts,
    spot, profile,
  );

  return {
    time: marine.time[index] ?? weather.time[index] ?? '',
    score: Math.round(finalScore * 10) / 10,
    waveHeight,
    swellHeight,
    swellDirection: swellDir,
    swellPeriod,
    windSpeed,
    windDirection: windDir,
    windGusts,
    temperature: temp,
    seaTemp,
    tideHeight,
  };
}

// ── BEST TIME LABEL ─────────────────────────────────────────────────────

function formatBestTimeLabel(bestTime: string, now: Date): string {
  const best = new Date(bestTime);
  const diffMs = best.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const hour = best.getHours().toString().padStart(2, '0');

  if (diffHours <= 0) return 'Maintenant !';
  if (diffHours <= 6) return `Dans ${diffHours}h`;

  const isToday = best.getDate() === now.getDate();
  if (isToday) return `Aujourd'hui ${hour}h`;

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (best.getDate() === tomorrow.getDate()) return `Demain ${hour}h`;

  const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  return `${dayNames[best.getDay()]} ${hour}h`;
}

// ── SPOT FORECAST ───────────────────────────────────────────────────────

export function computeSpotForecast(
  spot: SpotConfig,
  marine: MarineData,
  weather: WeatherData,
  profile: SurferProfile,
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
  const bestTimeLabel = bestCondition ? formatBestTimeLabel(bestCondition.time, now) : '';

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
