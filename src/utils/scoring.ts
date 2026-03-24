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
// Used multiplicatively with wind quality.

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
  return h * 0.50 + d * 0.25 + p * 0.25;
}

// ── WIND QUALITY (0-1) ──────────────────────────────────────────────────
// Combines speed, direction (relative to beach), and gusts.

function windQuality(
  speed: number,
  direction: number,
  gusts: number,
  spot: SpotConfig,
): number {
  if (speed < 3) return 0.95;
  if (speed < 5) return 0.90;

  const offshoreDir = (spot.beachOrientation + 180) % 360;
  const diff = angleDiff(direction, offshoreDir);

  let dirMult: number;
  if (diff <= 30) dirMult = 0.95;
  else if (diff <= 60) dirMult = 0.80;
  else if (diff <= 90) dirMult = 0.55;
  else if (diff <= 120) dirMult = 0.30;
  else if (diff <= 150) dirMult = 0.12;
  else dirMult = 0.06;

  let speedPenalty: number;
  if (speed < 8) speedPenalty = 0.95;
  else if (speed < 12) speedPenalty = 0.85;
  else if (speed < 16) speedPenalty = 0.70;
  else if (speed < 22) speedPenalty = 0.55;
  else if (speed < 30) speedPenalty = 0.35;
  else speedPenalty = 0.15;

  let base = dirMult * speedPenalty;

  if (diff > 90) {
    base *= 0.65;
  }

  if (gusts > 0 && speed > 0) {
    const gustRatio = gusts / speed;
    if (gustRatio > 2.0) base *= 0.55;
    else if (gustRatio > 1.5) base *= 0.75;
  }

  if (gusts > 40) base *= 0.45;
  else if (gusts > 30) base *= 0.65;
  else if (gusts > 25) base *= 0.80;

  return clamp01(base);
}

// ── TIDE MATCH ──────────────────────────────────────────────────────────
// Uses real sea level height (m above mean) + trend (rising/falling).
// Rising tide generally improves conditions; falling weakens them.
// Per-spot optimal tide (low/mid/high/all) determines ideal sea level range.
// Returns a multiplier centered around 1.0.

function tideMatch(
  seaLevel: number,
  prevSeaLevel: number,
  spot: SpotConfig,
  profile: SurferProfile,
): number {
  const trend = seaLevel - prevSeaLevel;
  const isRising = trend > 0.03;
  const isFalling = trend < -0.03;

  let trendMult = 1.0;
  if (isRising) trendMult = 1.08;
  else if (isFalling) trendMult = 0.92;

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
// Returns a multiplier centered around 1.0.

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
// Returns a multiplier centered around 1.0.

function profileMatch(
  swellHeight: number,
  waveHeight: number,
  profile: SurferProfile,
): number {
  const h = swellHeight || waveHeight;
  for (const pref of profile.preferredHeight) {
    if (pref === '0.5-1' && h >= 0.4 && h <= 1.1) return 1.1;
    if (pref === '1-2' && h >= 0.9 && h <= 2.1) return 1.1;
    if (pref === '2+' && h >= 1.8) return 1.1;
  }
  return 0.90;
}

function breakTypeMatch(spot: SpotConfig, profile: SurferProfile): number {
  if (!profile.breakType || profile.breakType.length === 0) return 1.0;
  return profile.breakType.includes(spot.bottomType) ? 1.05 : 0.95;
}

// ── CLEAN FACTOR ────────────────────────────────────────────────────────
// Penalizes disorganized / messy swell using wind wave data + spectrum analysis.

function cleanFactor(
  swellHeight: number,
  waveHeight: number,
  swellPeriod: number,
  windWaveHeight: number,
  windWavePeriod: number,
): number {
  let f = 1.0;

  if (swellPeriod < 7) f *= 0.65;
  else if (swellPeriod < 9) f *= 0.80;
  else if (swellPeriod < 10) f *= 0.90;

  if (waveHeight > 0 && swellHeight > 0) {
    const ratio = swellHeight / waveHeight;
    if (ratio < 0.5) f *= 0.70;
    else if (ratio < 0.65) f *= 0.85;
  }

  if (windWaveHeight > 0 && swellHeight > 0) {
    const windDominance = windWaveHeight / (swellHeight + windWaveHeight);
    if (windDominance > 0.7) f *= 0.60;
    else if (windDominance > 0.5) f *= 0.75;
    else if (windDominance > 0.35) f *= 0.90;
  }

  if (windWavePeriod > 0 && windWavePeriod < 5 && windWaveHeight > 0.5) {
    f *= 0.80;
  }

  return Math.max(0.3, f);
}

// ── WEATHER PENALTY ─────────────────────────────────────────────────────
// Rain and storms reduce visibility and comfort. Returns multiplier 0.7-1.0.

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
// Stable swell direction over consecutive hours = cleaner conditions.

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
): number {
  let cap = 10;

  if (swellHeight < 0.15) cap = Math.min(cap, 0.5);
  else if (swellHeight < 0.3) cap = Math.min(cap, 1.5);
  else if (swellHeight < 0.4) cap = Math.min(cap, 2.5);

  if (period < 4) cap = Math.min(cap, 1.5);
  else if (period < 5) cap = Math.min(cap, 3.0);
  else if (period < 7) cap = Math.min(cap, 5.0);

  const offshoreDir = (spot.beachOrientation + 180) % 360;
  const windAngle = angleDiff(windDir, offshoreDir);
  const isOnshore = windAngle > 120;
  const isCrossOn = windAngle > 90 && windAngle <= 120;

  if (isOnshore && windSpeed > 30) cap = Math.min(cap, 2.0);
  else if (isOnshore && windSpeed > 25) cap = Math.min(cap, 3.0);
  else if (isOnshore && windSpeed > 20) cap = Math.min(cap, 3.5);
  else if (isOnshore && windSpeed > 15) cap = Math.min(cap, 5.0);

  if (isCrossOn && windSpeed > 20) cap = Math.min(cap, 5.5);
  else if (isCrossOn && windSpeed > 15) cap = Math.min(cap, 6.5);

  if (gusts > 50) cap = Math.min(cap, 2.5);
  else if (gusts > 40) cap = Math.min(cap, 3.5);
  else if (gusts > 30) cap = Math.min(cap, 6.5);
  else if (gusts > 25) cap = Math.min(cap, 7.5);

  if (waveHeight > 0 && swellHeight > 0) {
    const ratio = swellHeight / waveHeight;
    if (ratio < 0.5) cap = Math.min(cap, 5.5);
  }

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

// ── HIGH-END COMPRESSION ────────────────────────────────────────────────
// Makes 8-10 scores reserved for truly exceptional conditions.

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
  const swellHeight = marine.swell_wave_height[index] ?? 0;
  const swellDir = marine.swell_wave_direction[index] ?? 0;
  const swellPeriod = marine.swell_wave_period[index] ?? 0;
  const peakPeriod = marine.swell_wave_peak_period[index] ?? 0;
  const windWaveHeight = marine.wind_wave_height[index] ?? 0;
  const windWavePeriod = marine.wind_wave_period[index] ?? 0;
  const windSpeed = weather.wind_speed_10m[index] ?? 0;
  const windDir = weather.wind_direction_10m[index] ?? 0;
  const windGusts = weather.wind_gusts_10m[index] ?? 0;
  const temp = weather.temperature_2m[index] ?? 0;
  const seaTemp = marine.sea_surface_temperature[index] ?? 0;
  const seaLevel = marine.sea_level_height_msl?.[index] ?? 0;
  const prevSeaLevel = marine.sea_level_height_msl?.[Math.max(0, index - 1)] ?? seaLevel;
  const tideVelocity = marine.ocean_current_velocity[index] ?? 0;
  const weatherCode = weather.weather_code[index] ?? 0;

  const effectiveHeight = swellHeight || waveHeight;

  const swell = swellQuality(effectiveHeight, swellDir, swellPeriod, peakPeriod, spot, profile);
  const wind = windQuality(windSpeed, windDir, windGusts, spot);

  const base = swell * wind;

  const tide = tideMatch(seaLevel, prevSeaLevel, spot, profile);
  const level = levelFit(spot, profile);
  const pMatch = profileMatch(swellHeight, waveHeight, profile);
  const clean = cleanFactor(swellHeight, waveHeight, swellPeriod, windWaveHeight, windWavePeriod);
  const weather_ = weatherPenalty(weatherCode);
  const consistency = consistencyFactor(index, marine);

  const breakPref = breakTypeMatch(spot, profile);
  const adjusted = base * tide * level * pMatch * clean * weather_ * consistency * breakPref;
  const rawScore = adjusted * 10;

  const capped = applyDealBreakers(
    rawScore, effectiveHeight, waveHeight, swellPeriod,
    windSpeed, windDir, windGusts,
    spot, profile,
  );

  const finalScore = compressHighEnd(capped);

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
    tideHeight: tideVelocity,
    seaLevel,
    weatherCode,
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
