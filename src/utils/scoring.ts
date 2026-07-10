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
 * SpotWave scoring — v2 (audited rewrite).
 *
 * Design goals after the v1 audit:
 *  1. NO discontinuities. v1 was riddled with step functions (period, direction,
 *     wind, tide) and hard caps. Crossing a threshold between two consecutive
 *     hours produced large jumps ("très bon → 1/10 en 1h"). Every sub-factor and
 *     every cap is now a continuous (piecewise-linear / smooth) function, so the
 *     final score moves smoothly when the inputs move smoothly.
 *  2. ROBUST period. v1 fed `swell_wave_period` (which Open-Meteo sometimes
 *     reports as 0/low for an hour) straight into the deal-breakers, while the
 *     quality used `max(period, peakPeriod)`. A single bad period reading then
 *     capped an otherwise great swell at 1.5. We now derive ONE robust effective
 *     period and use it everywhere, and treat genuinely-missing period as
 *     "unknown" (neutral) instead of "terrible".
 *  3. NO double penalties. Wind-swell, crossing swell and short period used to be
 *     penalised in two or three places at once, cratering mediocre conditions.
 *     Each phenomenon is now penalised once, with sane floors.
 *  4. ANTI-SPIKE. A final pass damps isolated single-hour outliers that survive
 *     from noisy source data, without flattening genuine trends.
 */

/**
 * Minimum score for a slot to be worth showing as a "good window".
 * Below this the conditions are mediocre/unsurfable, so the UI shows a neutral
 * "no good window" message instead of an enthusiastic time label.
 */
export const RIDABLE_SCORE = 3.5;

// ── generic helpers ────────────────────────────────────────────────────────

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

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function gaussian(x: number, center: number, sigma: number): number {
  return Math.exp(-0.5 * ((x - center) / sigma) ** 2);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

/**
 * Continuous piecewise-linear interpolation across a set of (x, y) anchor
 * points sorted by x. This is the workhorse that replaces every v1 step
 * function: the output is C0-continuous, so neighbouring hours can never jump.
 */
function piecewise(x: number, points: [number, number][]): number {
  if (x <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return y0 + (y1 - y0) * t;
    }
  }
  return last[1];
}

// ── effective period (robust) ──────────────────────────────────────────────
// Open-Meteo occasionally returns swell_wave_period = 0 for an isolated hour
// even when there is a real long-period swell (peak period stays sane). Using
// the larger of the two avoids those single-hour collapses. If BOTH are absent
// we return null = "unknown" so callers stay neutral instead of punishing.

function effectivePeriod(swellPeriod: number, peakPeriod: number): number | null {
  const sp = swellPeriod || 0;
  const pp = peakPeriod || 0;
  if (sp <= 0.5 && pp <= 0.5) return null;
  // Isolated bad swell-period reading (Open-Meteo drops it to ~0 for an hour)
  // even though there's a real long-period swell → trust the peak period.
  if (sp <= 0.5) return pp;
  if (pp <= sp) return sp;
  // Both readings healthy and the peak is LONGER than the mean swell period.
  // A raw max() let a long peak fully mask a genuinely short mean period, which
  // over-scored small short-period summer surf (buoy shows a 6-7s mean but a
  // long peak, and surfers consistently rate those days weak). Let the peak lift
  // the (more representative) mean period only partway — and LESS when the mean
  // is genuinely short (short mean + long peak = mostly short-period energy).
  // Real user ratings (userScore < appScore on small summer days) showed a flat
  // midpoint lift still over-scored them. The lift ramps continuously in `sp`
  // (0.28 for a short 5 s mean → 0.5 for a real 12 s+ mean) so neighbouring hours
  // never jump. Groundswell (peak ≈ swell) is unaffected.
  const lift = piecewise(sp, [[5, 0.28], [8, 0.38], [12, 0.5]]);
  return sp + (pp - sp) * lift;
}

// ── level-dependent ideal ranges ────────────────────────────────────────────

function levelHeightRange(profile: SurferProfile): { ideal: [number, number]; max: number } {
  switch (profile.level) {
    case 'beginner':
      return { ideal: [0.4, 1.1], max: 1.7 };
    case 'intermediate':
      // Intermediates ideally want chest-to-overhead. Below ~1m it's small/weak
      // for them (fun but not "good"), so the ideal band starts at 1.0m — sub-chest
      // days then fall on the below-ideal ramp instead of getting full credit.
      return { ideal: [1.0, 2.0], max: 2.8 };
    case 'expert':
      return { ideal: [1.2, 3.5], max: 6.0 };
  }
}

// ── SWELL QUALITY (0-1) ──────────────────────────────────────────────────────
// Continuous combination of height, direction, period and height×period power.

function heightFactor(height: number, spot: SpotConfig, profile: SurferProfile): number {
  if (height < 0.15) return 0;

  const lvl = levelHeightRange(profile);
  const idealMin = Math.max(spot.optimalSwellHeightMin, lvl.ideal[0]);
  const idealMax = Math.min(spot.optimalSwellHeightMax, lvl.ideal[1]);
  const min = Math.min(idealMin, idealMax);
  const max = Math.max(idealMin, idealMax);
  const center = (min + max) / 2;
  const sigma = Math.max((max - min) / 2, 0.3);

  // Plateau across the ideal band: 0.82 at the edges, up to ~0.95 at the centre.
  if (height >= min && height <= max) {
    return 0.82 + 0.13 * gaussian(height, center, sigma);
  }

  // Below the ideal band: smooth ramp from ~0 (knee-high) up to 0.82 at `min`.
  // Continuous at `min` (reaches 0.82) — no cliff.
  if (height < min) {
    return clamp01(piecewise(height, [
      [0.15, 0.0],
      [0.3, 0.12],
      [Math.max(0.31, min * 0.6), 0.5],
      [min, 0.82],
    ]));
  }

  // Above the ideal band: smooth decay. Beginners can't handle overhead+, so the
  // curve drops faster for them; experts keep more credit on big days.
  const over = height - max;
  const room = Math.max(lvl.max - max, 0.5);
  const ratio = over / room; // 0 at `max`, 1 at the level's hard ceiling
  let v: number;
  if (profile.level === 'beginner') {
    v = piecewise(ratio, [[0, 0.82], [0.4, 0.62], [1, 0.18], [2, 0.02]]);
  } else if (profile.level === 'intermediate') {
    v = piecewise(ratio, [[0, 0.82], [0.5, 0.68], [1, 0.4], [2, 0.08]]);
  } else {
    v = piecewise(ratio, [[0, 0.82], [0.6, 0.72], [1, 0.5], [2.5, 0.12]]);
  }
  return clamp01(v);
}

function directionFactor(direction: number, spot: SpotConfig): number {
  const center = ((spot.optimalSwellDirMin + spot.optimalSwellDirMax) / 2) % 360;
  const halfRange = Math.max(angleDiff(spot.optimalSwellDirMin, center), 1);

  if (isAngleInRange(direction, spot.optimalSwellDirMin, spot.optimalSwellDirMax)) {
    // Inside the window: 0.92 at centre → 0.66 at the edge.
    const ratio = clamp01(angleDiff(direction, center) / halfRange);
    return 0.92 - 0.26 * ratio;
  }

  // Outside the window: continuous decay starting from 0.66 at the edge, so the
  // function is continuous across the boundary (no jump). Beach breaks accept a
  // wider swell window than reefs/points (sand refracts/reshapes more), so they
  // decay slower and keep a higher floor.
  const beyond = Math.min(
    angleDiff(direction, spot.optimalSwellDirMin),
    angleDiff(direction, spot.optimalSwellDirMax),
  );
  const isBeach = spot.bottomType === 'beach';
  const decay = isBeach ? 45 : 32;
  const floor = isBeach ? 0.12 : 0.04;
  return clamp(0.66 * Math.exp(-beyond / decay), floor, 0.66);
}

function periodFactor(period: number | null, profile: SurferProfile): number {
  // Unknown period → neutral (don't reward, don't punish).
  if (period == null) return 0.55;
  // Short period is weak, gutless surf even when the buoy shows size, so the
  // low end is deliberately firm; the long end (real groundswell) is rewarded.
  // Intermediates/experts need real groundswell: short, gutless period is
  // heavily discounted and long period rewarded.
  const base = piecewise(period, [
    [3, 0.05],
    [5, 0.14],
    [7, 0.26],
    [9, 0.44],
    [11, 0.66],
    [13, 0.80],
    [15, 0.90],
    [18, 0.96],
    [22, 0.98],
  ]);
  // Beginners ride reforms and whitewater, so short-period, weak waves bother
  // them far less than intermediates/experts. Real user ratings confirmed this:
  // the app was OVER-rating small short-period days for intermediates but
  // UNDER-rating the very same days for beginners. Give the low end a higher
  // floor for beginners; the reward naturally plateaus (long period is wasted on
  // them since the waves break harder/faster).
  if (profile.level === 'beginner') {
    return piecewise(period, [
      [3, 0.14],
      [5, 0.34],
      [7, 0.50],
      [9, 0.62],
      [11, 0.72],
      [14, 0.82],
    ]);
  }
  return base;
}

// Height × period synergy: 1.5m @ 14s carries far more punch than 2m @ 7s.
// Continuous multiplier on the height component, 0.7 .. 1.15.
function powerSynergy(height: number, period: number | null): number {
  if (height < 0.2 || period == null) return 1.0;
  const energy = height * Math.pow(period / 10, 1.3);
  return piecewise(energy, [
    [0.3, 0.72],
    [0.8, 1.0],
    [1.5, 1.08],
    [2.5, 1.15],
  ]);
}

function swellQuality(
  height: number,
  direction: number,
  period: number | null,
  spot: SpotConfig,
  profile: SurferProfile,
): number {
  const h = heightFactor(height, spot, profile);
  const d = directionFactor(direction, spot);
  const p = periodFactor(period, profile);
  const syn = powerSynergy(height, period);

  // height 40% (boosted by synergy), period 35%, direction 25%.
  return clamp01(h * syn) * 0.40 + d * 0.25 + p * 0.35;
}

// ── WIND QUALITY (0-1) ───────────────────────────────────────────────────────
// Continuous in both direction and speed. Glassy = best. Offshore tolerated up
// to moderate speeds; onshore degrades fast. The offshore/onshore speed curves
// are *blended* by the direction so there is no branch-edge cliff.

function windQuality(
  speed: number,
  direction: number,
  gusts: number,
  spot: SpotConfig,
  swellHeight: number,
): number {
  const offshoreDir = (spot.beachOrientation + 180) % 360;
  const diff = angleDiff(direction, offshoreDir);

  // Direction multiplier: continuous falloff from offshore (0°) to onshore (180°).
  const dirMult = piecewise(diff, [
    [0, 1.0],
    [30, 0.96],
    [60, 0.80],
    [90, 0.55],
    [120, 0.30],
    [150, 0.13],
    [180, 0.06],
  ]);

  // Two continuous speed curves, blended by how onshore the wind is.
  const offshoreSpeed = piecewise(speed, [
    [0, 1.0],
    [5, 0.99],
    [12, 0.95],
    [18, 0.88],
    [25, 0.73],
    [35, 0.55],
    [50, 0.35],
  ]);
  const onshoreSpeed = piecewise(speed, [
    [0, 1.0],
    [5, 0.95],
    [10, 0.85],
    [16, 0.66],
    [22, 0.46],
    [30, 0.26],
    [45, 0.10],
  ]);
  // onshoreMix: 0 when clearly offshore (<=30°), 1 when clearly onshore (>=120°).
  const onshoreMix = clamp01((diff - 30) / 90);
  const speedMult = lerp(offshoreSpeed, onshoreSpeed, onshoreMix);

  // Wind direction only matters once there's actual wind: at 0 km/h the surface
  // is glassy regardless of nominal direction, and the directional penalty fades
  // in smoothly. A light 8-12 km/h (≈5-7 kt) breeze — even cross/onshore — barely
  // textures small surf, so the penalty must NOT be at full strength by 8 km/h
  // (that used to drag a knee-high, light-wind day Surfline rates POOR down to
  // ~1/10). It ramps from ~4 km/h and reaches full weight around 18 km/h (~10 kt),
  // the speed at which wind direction genuinely starts to make or break a session.
  const windStrength = clamp01((speed - 4) / 14);
  const effDir = lerp(1.0, dirMult, windStrength);
  let base = effDir * speedMult;

  // Gusts ruin the surface, but the gust *ratio* (irregularity) and the *absolute*
  // gust strength describe the SAME gusty wind. Stacking both (multiplying them)
  // double-counted it and dragged otherwise-surfable windy days near zero, so we
  // keep only whichever is the stronger penalty.
  let gustMult = 1.0;
  // 1) Gust ratio: a big ratio over a ~4 km/h breeze barely textures the surface,
  //    so it fades out at light wind and only bites once there's real steady wind.
  if (gusts > speed && speed > 0.5) {
    const ratio = gusts / speed;
    const ratioPen = piecewise(ratio, [[1.3, 1.0], [1.6, 0.93], [2.2, 0.82], [3.5, 0.7]]);
    const lightFade = clamp01((speed - 4) / 10); // ≈0 at/below 4 km/h, full by ~14
    gustMult = Math.min(gustMult, lerp(1.0, ratioPen, lightFade));
  }
  // 2) Absolute gust ceiling (continuous): strong gusts are bad regardless. Kicks
  //    in a bit later/softer so a single gust reading doesn't flatten the score.
  gustMult = Math.min(gustMult, piecewise(gusts, [[28, 1.0], [36, 0.82], [46, 0.6], [60, 0.42]]));
  base *= gustMult;

  // Wind × wave-size interaction: the same onshore wind is worse on a bigger,
  // more exposed face. Negligible on knee-high days.
  if (swellHeight > 0.5 && diff > 60) {
    const penalty = clamp01((swellHeight - 0.5) / 2.0) * 0.15;
    base *= 1.0 - penalty;
  }

  return clamp01(base);
}

// ── WIND TREND ───────────────────────────────────────────────────────────────
// Detects improving/degrading wind windows (continuous bonus/malus).

function windTrendFactor(index: number, weather: WeatherData, spot: SpotConfig): number {
  const n = weather.wind_speed_10m.length;
  if (index < 2 || index >= n - 1) return 1.0;

  const prev2 = weather.wind_speed_10m[index - 2] ?? 0;
  const prev1 = weather.wind_speed_10m[index - 1] ?? 0;
  const curr = weather.wind_speed_10m[index] ?? 0;
  const next1 = weather.wind_speed_10m[Math.min(index + 1, n - 1)] ?? 0;

  const offshoreDir = (spot.beachOrientation + 180) % 360;
  const windDir = weather.wind_direction_10m[index] ?? 0;
  const isOnshoreIsh = angleDiff(windDir, offshoreDir) > 90;

  const recentTrend = curr - (prev2 + prev1) / 2; // <0 = dropping
  const futureTrend = next1 - curr;               // >0 = rising

  // Continuous: dropping onshore wind = cleaning up (bonus), rising = degrading.
  const dropBonus = piecewise(-recentTrend, [[2, 1.0], [4, 1.04], [8, isOnshoreIsh ? 1.08 : 1.05]]);
  const riseMalus = piecewise(futureTrend, [[3, 1.0], [5, isOnshoreIsh ? 0.93 : 0.96], [9, isOnshoreIsh ? 0.88 : 0.93]]);
  return clamp(dropBonus * riseMalus, 0.85, 1.08);
}

// ── TIDE MATCH ─────────────────────────────────────────────────────────────--
// Continuous, bottom-type aware. Bounded to a gentle 0.78..1.12 band so tide
// alone can never crater an otherwise good forecast.

function tideMatch(
  seaLevel: number,
  prevSeaLevel: number,
  spot: SpotConfig,
  profile: SurferProfile,
): number {
  const trend = seaLevel - prevSeaLevel;
  // Smooth trend signal in [-1, 1] (saturates around ±8cm/h).
  const t = clamp(trend / 0.08, -1, 1);

  let trendMult = 1.0;
  switch (spot.bottomType) {
    case 'beach':
      // Falling tide tends to expose better sandbars.
      trendMult = 1.0 - t * 0.05;
      break;
    case 'point':
      // Rising tide shapes the point.
      trendMult = 1.0 + t * 0.06;
      break;
    case 'reef':
      // Rising tide = safer + cleaner over the reef.
      trendMult = 1.0 + t * 0.05;
      break;
  }

  let levelMult: number;
  switch (spot.optimalTide) {
    case 'low':
      levelMult = piecewise(seaLevel, [[-1.5, 1.1], [-0.3, 1.05], [0.3, 0.95], [1.0, 0.82], [1.8, 0.78]]);
      break;
    case 'mid':
      levelMult = 1.1 - 0.3 * clamp01(Math.abs(seaLevel) / 1.2);
      break;
    case 'high':
      levelMult = piecewise(seaLevel, [[-1.0, 0.78], [-0.5, 0.88], [0.0, 1.0], [0.6, 1.1], [1.8, 1.1]]);
      break;
    case 'all':
    default:
      levelMult = 1.0 - 0.12 * clamp01((Math.abs(seaLevel) - 1.4) / 0.8);
      break;
  }

  // Safety: very shallow reef on a low tide is hazardous, esp. for beginners.
  if (spot.bottomType === 'reef' && seaLevel < -1.2) {
    levelMult *= profile.level === 'beginner' ? 0.7 : 0.85;
  }

  return clamp(levelMult * trendMult, 0.78, 1.12);
}

// ── LEVEL FIT ─────────────────────────────────────────────────────────────--

function levelFit(spot: SpotConfig, profile: SurferProfile): number {
  if (spot.recommendedLevel === profile.level) return 1.04;
  if (profile.level === 'intermediate') {
    return spot.recommendedLevel === 'beginner' ? 0.97 : 0.88;
  }
  if (profile.level === 'expert') {
    return spot.recommendedLevel === 'intermediate' ? 0.97 : 0.92;
  }
  // beginner at harder spots — gentle nudge only; real safety handled by caps.
  if (spot.recommendedLevel === 'intermediate') return 0.85;
  return 0.7;
}

// ── PROFILE MATCH ────────────────────────────────────────────────────────────
// Gentle nudge from the surfer's stated preferences. Only the preferred wave
// height band is taken into account — break type and wind preference are NOT
// scored (they don't reflect objective quality and confused users), so taste
// never dominates the real conditions.

function profileMatch(
  swellHeight: number,
  waveHeight: number,
  profile: SurferProfile,
): number {
  const h = swellHeight || waveHeight;

  let heightM = 0.95;
  for (const pref of profile.preferredHeight) {
    if (pref === '0.5-1' && h >= 0.4 && h <= 1.1) { heightM = 1.06; break; }
    if (pref === '1-2' && h >= 0.9 && h <= 2.1) { heightM = 1.06; break; }
    if (pref === '2+' && h >= 1.8) { heightM = 1.06; break; }
  }

  return heightM;
}

// ── CLEAN FACTOR ─────────────────────────────────────────────────────────────
// Penalises messy / wind-dominated / crossing seas. Continuous, single source
// of truth for "chop" (the old code also penalised this via separate caps and a
// windSwell multiplier → triple penalty; now consolidated here + one soft cap).

function cleanFactor(
  swellHeight: number,
  waveHeight: number,
  swellDir: number,
  windWaveHeight: number,
  windWavePeriod: number,
  windWaveDir: number,
): number {
  let f = 1.0;

  // Wind-swell dominance (the dominant cleanliness signal).
  if (windWaveHeight > 0 && swellHeight > 0) {
    const windDominance = windWaveHeight / (swellHeight + windWaveHeight);
    f *= piecewise(windDominance, [[0.3, 1.0], [0.5, 0.85], [0.7, 0.7], [0.9, 0.55]]);
  } else if (waveHeight > 0 && swellHeight > 0) {
    // Fallback when wind_wave is unavailable: ground-swell vs total ratio.
    const ratio = swellHeight / waveHeight;
    f *= piecewise(ratio, [[0.4, 0.7], [0.65, 0.88], [0.85, 1.0]]);
  }

  // Short-period chop riding on top of the swell.
  if (windWavePeriod > 0 && windWaveHeight > 0.5) {
    f *= piecewise(windWavePeriod, [[3, 0.8], [5, 0.92], [7, 1.0]]);
  }

  // Crossing seas: wind wave from a very different bearing = bumpy even in light
  // wind. Continuous in the crossing angle.
  if (windWaveHeight > 0.3 && swellHeight > 0.3) {
    const cross = angleDiff(swellDir, windWaveDir);
    f *= piecewise(cross, [[40, 1.0], [60, 0.92], [90, 0.82], [135, 0.72]]);
  }

  return clamp(f, 0.4, 1.0);
}

// ── CURRENT / WEATHER / CONSISTENCY ──────────────────────────────────────────

function currentPenalty(velocity: number): number {
  return piecewise(velocity, [[0.3, 1.0], [0.5, 0.97], [0.8, 0.93], [1.2, 0.85], [2.0, 0.78]]);
}

function weatherPenalty(weatherCode: number): number {
  if (weatherCode <= 3) return 1.0;
  if (weatherCode <= 49) return 0.98;
  if (weatherCode <= 55) return 0.95;
  if (weatherCode <= 65) return 0.9;
  if (weatherCode <= 79) return 0.88;
  if (weatherCode <= 82) return 0.88;
  if (weatherCode <= 86) return 0.83;
  return 0.74;
}

function consistencyFactor(index: number, marine: MarineData): number {
  if (index < 2) return 1.0;
  const dirs: number[] = [];
  for (let i = Math.max(0, index - 2); i <= index; i++) {
    const d = marine.swell_wave_direction[i];
    if (d != null) dirs.push(d);
  }
  if (dirs.length < 2) return 1.0;
  let maxDiff = 0;
  for (let i = 1; i < dirs.length; i++) {
    maxDiff = Math.max(maxDiff, angleDiff(dirs[i], dirs[i - 1]));
  }
  return piecewise(maxDiff, [[10, 1.04], [25, 1.0], [45, 0.94], [70, 0.9]]);
}

// ── EFFECTIVE HEIGHT ─────────────────────────────────────────────────────────

function effectiveSwellHeight(swellHeight: number, waveHeight: number): { height: number; isWindSwellOnly: boolean } {
  if (swellHeight > 0.15) {
    // For modest groundswell, the total significant height (which bundles the
    // short-period / refracted waves you actually ride at the beach) is a better
    // proxy than deep-water swell alone — Open-Meteo routinely under-reads tiny
    // coastal swell, which used to crater the score on small-but-clean days.
    // Blend the two below 0.8 m so a clean little day reads "fair", not "flat".
    // Genuine swell (>= 0.8 m) is left exactly as-is.
    const total = Math.max(waveHeight, swellHeight);
    const height = swellHeight >= 0.8 ? swellHeight : Math.max(swellHeight, swellHeight * 0.5 + total * 0.5);
    return { height, isWindSwellOnly: false };
  }
  if (waveHeight > 0.15) return { height: waveHeight, isWindSwellOnly: true };
  return { height: 0, isWindSwellOnly: false };
}

// ── SMALL / SHORT-PERIOD SURF DAMP (level-aware) ─────────────────────────────
// Real user ratings (logged userScore vs appScore) showed the model still
// slightly over-scores small, short-period summer surf, and by level: beginners
// happily ride knee-high reforms while intermediates/experts get little out of
// gutless waves. This applies ONE gentle, continuous, level-aware trim. It fades
// to 1.0 (no effect) as soon as there is real size (~1.1 m) OR real groundswell
// period (~11 s), so genuine surf is untouched and there are no cliffs.
function smallSurfDamp(height: number, period: number | null, profile: SurferProfile): number {
  if (period == null) return 1.0;
  const smallness = clamp01((1.1 - height) / 0.7); // 0 at ≥1.1 m, 1 at ≤0.4 m
  const shortness = clamp01((11 - period) / 6);     // 0 at ≥11 s, 1 at ≤5 s
  const severity = smallness * shortness;
  const maxTrim =
    profile.level === 'beginner' ? 0.06 : profile.level === 'intermediate' ? 0.13 : 0.20;
  return 1 - maxTrim * severity;
}

// ── DEAL-BREAKERS (continuous ceilings) ──────────────────────────────────────
// Each deal-breaker is now a CONTINUOUS ceiling (max achievable score) instead
// of a hard step. The final cap is the lowest ceiling. Because every ceiling is
// piecewise-linear in its driving variable, the cap moves smoothly hour to hour.

function applyDealBreakers(
  rawScore: number,
  swellHeight: number,
  waveHeight: number,
  period: number | null,
  windSpeed: number,
  windDir: number,
  gusts: number,
  spot: SpotConfig,
  profile: SurferProfile,
): { capped: number; caps: ScoreCap[] } {
  let cap = 10;
  const caps: ScoreCap[] = [];
  // Record a cap label only when it is actually binding (clearly below rawScore).
  const consider = (ceiling: number, label: ScoreCap) => {
    if (ceiling < cap) cap = ceiling;
    if (ceiling < rawScore - 0.2 && !caps.includes(label)) caps.push(label);
  };

  // Flat / tiny surf — continuous ramp. Use the total rideable height (swell OR
  // total sea), not deep-water swell alone, so a small clean shorebreak isn't
  // declared "flat" just because the groundswell channel reads near-zero.
  const offshoreDirFlat = (spot.beachOrientation + 180) % 360;
  const windAngleFlat = angleDiff(windDir, offshoreDirFlat);
  const rideable = Math.max(swellHeight, waveHeight);
  if (rideable < 0.6) {
    const baseCeil = piecewise(rideable, [[0.1, 0.5], [0.3, 2.0], [0.4, 3.5], [0.6, 7.5]]);
    // Glassy/clean small surf is still fun — lift the ceiling when the wind is
    // light and roughly offshore. cleanLift: 1 = glassy & offshore, 0 = windy/onshore.
    const lightWind = piecewise(windSpeed, [[6, 1], [12, 0.6], [18, 0.15], [24, 0]]);
    const offshoreish = piecewise(windAngleFlat, [[60, 1], [100, 0.45], [140, 0]]);
    const cleanLift = lightWind * offshoreish;
    // Starts at the harsh base ceiling for near-flat seas (no rescue for 0.1 m),
    // then lifts as soon as there's something real to ride.
    const cleanCeil = piecewise(rideable, [[0.2, 0.5], [0.32, 3.0], [0.46, 4.7], [0.6, 7.5]]);
    consider(lerp(baseCeil, Math.max(baseCeil, cleanCeil), cleanLift), 'flat');
  }

  // Short period — gentle continuous ceiling. Missing period (null) = no cap.
  // Note: `period` is the ROBUST max(swell, peak), so a lone bad swell-period
  // reading next to a healthy peak period will NOT trigger this.
  if (period != null && period < 10) {
    consider(piecewise(period, [[3.5, 1.8], [5, 3.0], [7, 4.8], [9, 7.5], [10, 9.0]]), 'period');
  }

  // Wind direction/speed ceilings, blended by onshore-ness (continuous).
  const offshoreDir = (spot.beachOrientation + 180) % 360;
  const windAngle = angleDiff(windDir, offshoreDir);
  const onshoreMix = clamp01((windAngle - 60) / 60); // 0 at 60°, 1 at 120°+
  if (onshoreMix > 0 && windSpeed > 12) {
    const onshoreCeil = piecewise(windSpeed, [[12, 9.0], [18, 6.0], [25, 4.0], [35, 2.5]]);
    // Blend toward "no cap" (10) when only cross-shore.
    consider(lerp(10, onshoreCeil, onshoreMix), 'onshore');
  }

  // Storm offshore (continuous) — spray, impossible take-offs.
  if (windAngle <= 45 && windSpeed > 28) {
    consider(piecewise(windSpeed, [[28, 8.0], [35, 5.5], [50, 4.0]]), 'offshoreStorm');
  }

  // Gust ceiling (continuous).
  if (gusts > 28) {
    consider(piecewise(gusts, [[28, 8.5], [35, 6.5], [45, 4.5], [60, 2.5]]), 'gusts');
  }

  // Wind-swell domination (already softened in cleanFactor → light ceiling only).
  if (waveHeight > 0 && swellHeight > 0) {
    const ratio = swellHeight / waveHeight;
    if (ratio < 0.5) consider(piecewise(ratio, [[0.2, 5.0], [0.5, 7.5]]), 'windSwell');
  }

  // Safety caps for beginners on dangerous days.
  const lvlMax = levelHeightRange(profile).max;
  if (profile.level === 'beginner' && spot.recommendedLevel === 'expert' && swellHeight > 1.8) {
    consider(piecewise(swellHeight, [[1.8, 4.0], [2.5, 2.0], [3.5, 1.5]]), 'beginnerExpert');
  }
  if (profile.level === 'beginner' && swellHeight > lvlMax) {
    consider(piecewise(swellHeight, [[lvlMax, 4.5], [lvlMax + 1, 2.5], [lvlMax + 2, 2.0]]), 'beginnerBigWaves');
  }

  return { capped: Math.min(rawScore, cap), caps };
}

// ── HIGH-END COMPRESSION ─────────────────────────────────────────────────────
// Perfect 10s should be rare; compress the top so "epic" stands out.

function compressHighEnd(score: number): number {
  if (score <= 7.5) return score;
  return 7.5 + (score - 7.5) * 0.6;
}

// ── MAIN HOURLY SCORING ──────────────────────────────────────────────────────

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
  const swellPeriodRaw = marine.swell_wave_period[index] ?? 0;
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
  // Display-only comfort extras (do NOT influence the score).
  const uvIndex = weather.uv_index?.[index];
  const precipProb = weather.precipitation_probability?.[index];
  const cloudCover = weather.cloud_cover?.[index];

  // ONE robust effective period, used by quality AND deal-breakers (the v1 bug
  // was using a different period in each place).
  const period = effectivePeriod(swellPeriodRaw, peakPeriod);

  const { height: effectiveHeight, isWindSwellOnly } = effectiveSwellHeight(rawSwellHeight, waveHeight);

  const swell = swellQuality(effectiveHeight, swellDir, period, spot, profile);
  const wind = windQuality(windSpeed, windDir, windGusts, spot, effectiveHeight);

  // Base is multiplicative: zero swell or pure onshore storm → near-zero.
  const base = swell * wind;

  const tide = tideMatch(seaLevel, prevSeaLevel, spot, profile);
  const level = levelFit(spot, profile);
  const pMatch = profileMatch(rawSwellHeight, waveHeight, profile);
  const clean = cleanFactor(rawSwellHeight, waveHeight, swellDir, windWaveHeight, windWavePeriod, windWaveDir);
  const weather_ = weatherPenalty(weatherCode);
  const consistency = consistencyFactor(index, marine);
  const windTrend = windTrendFactor(index, weather, spot);
  const current = currentPenalty(tideVelocity);

  // Pure wind-swell (no ground swell at all): single, modest penalty. cleanFactor
  // can't see it (swellHeight≈0) so we apply it here once, not three times.
  const windSwellPenalty = isWindSwellOnly ? 0.78 : 1.0;

  // Gentle, level-aware trim for small short-period surf (user-rating calibration).
  const smallDamp = smallSurfDamp(effectiveHeight, period, profile);

  const adjusted = base * tide * level * pMatch * clean * weather_
    * consistency * windTrend * current * windSwellPenalty * smallDamp;
  const rawScore = adjusted * 10;

  const { capped, caps } = applyDealBreakers(
    rawScore, effectiveHeight, waveHeight, period,
    windSpeed, windDir, windGusts, spot, profile,
  );

  const finalScore = compressHighEnd(capped);

  return {
    time: marine.time[index] ?? weather.time[index] ?? '',
    score: Math.round(finalScore * 10) / 10,
    waveHeight,
    swellHeight: rawSwellHeight,
    swellDirection: swellDir,
    swellPeriod: swellPeriodRaw,
    windSpeed,
    windDirection: windDir,
    windGusts,
    temperature: temp,
    seaTemp,
    seaLevel,
    weatherCode,
    uvIndex: uvIndex ?? undefined,
    precipProb: precipProb ?? undefined,
    cloudCover: cloudCover ?? undefined,
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

// ── ANTI-SPIKE SMOOTHING ─────────────────────────────────────────────────────
// Even with continuous factors, raw source data can contain isolated single-hour
// glitches (e.g. a lone bad period/height sample). This pass pulls a hard outlier
// toward its neighbours ONLY when both neighbours agree and the middle hour
// disagrees sharply — so genuine ramps and fronts are preserved.

function dampOutliers(scores: number[]): number[] {
  if (scores.length < 3) return scores;
  const out = scores.slice();
  for (let i = 1; i < scores.length - 1; i++) {
    const a = scores[i - 1];
    const s = scores[i];
    const b = scores[i + 1];
    const neighbourAvg = (a + b) / 2;
    const neighboursAgree = Math.abs(a - b) < 2.0;
    const middleDisagrees = Math.abs(s - neighbourAvg) > 2.5;
    if (neighboursAgree && middleDisagrees) {
      // Pull halfway toward the neighbour consensus.
      out[i] = Math.round(((s + neighbourAvg) / 2) * 10) / 10;
    }
  }
  return out;
}

// ── TIMEZONE HELPERS ─────────────────────────────────────────────────────────
// Open-Meteo (timezone=auto) returns hourly timestamps in the SPOT's local time
// and the offset separately. We use the offset to know "what time/day is it AT
// the spot right now", which is what the user actually cares about.

/** Spot-local "now" as a Date whose UTC fields equal the spot wall-clock time. */
function spotLocalNow(utcOffsetSeconds?: number): Date {
  if (typeof utcOffsetSeconds === 'number') {
    return new Date(Date.now() + utcOffsetSeconds * 1000);
  }
  return new Date();
}

/** "YYYY-MM-DDTHH" key for the spot's current local hour. */
export function spotLocalNowKey(utcOffsetSeconds?: number): string {
  const d = spotLocalNow(utcOffsetSeconds);
  if (typeof utcOffsetSeconds === 'number') {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const h = String(d.getUTCHours()).padStart(2, '0');
    return `${y}-${m}-${day}T${h}`;
  }
  // Fallback (offset unknown): build a local-time key.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}`;
}

/** Spot-local current hour (0-23). */
export function spotLocalHour(utcOffsetSeconds?: number): number {
  const d = spotLocalNow(utcOffsetSeconds);
  return typeof utcOffsetSeconds === 'number' ? d.getUTCHours() : d.getHours();
}

/** Rough civil-night test at the spot: before dawn or after dusk. */
export function isNightAtSpot(utcOffsetSeconds?: number): boolean {
  const h = spotLocalHour(utcOffsetSeconds);
  return h < 6 || h >= 21;
}

// ── BEST TIME LABEL ──────────────────────────────────────────────────────────

const BEST_TIME_I18N: Record<string, {
  now: string;
  inH: (h: number) => string;
  today: (h: string) => string;
  tomorrow: (h: string) => string;
  days: string[];
}> = {
  fr: {
    now: 'Maintenant !',
    inH: (h) => `Dans ${h}h`,
    today: (h) => `Aujourd'hui ${h}h`,
    tomorrow: (h) => `Demain ${h}h`,
    days: ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'],
  },
  en: {
    now: 'Now!',
    inH: (h) => `In ${h}h`,
    today: (h) => `Today ${h}h`,
    tomorrow: (h) => `Tomorrow ${h}h`,
    days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  },
  es: {
    now: '¡Ahora!',
    inH: (h) => `En ${h}h`,
    today: (h) => `Hoy ${h}h`,
    tomorrow: (h) => `Mañana ${h}h`,
    days: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
  },
  pt: {
    now: 'Agora !',
    inH: (h) => `Em ${h}h`,
    today: (h) => `Hoje ${h}h`,
    tomorrow: (h) => `Amanhã ${h}h`,
    days: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
  },
  de: {
    now: 'Jetzt!',
    inH: (h) => `In ${h} Std`,
    today: (h) => `Heute ${h} Uhr`,
    tomorrow: (h) => `Morgen ${h} Uhr`,
    days: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
  },
  it: {
    now: 'Adesso!',
    inH: (h) => `Tra ${h}h`,
    today: (h) => `Oggi ${h}h`,
    tomorrow: (h) => `Domani ${h}h`,
    days: ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'],
  },
  ja: {
    now: '今すぐ！',
    inH: (h) => `${h}時間後`,
    today: (h) => `今日 ${h}時`,
    tomorrow: (h) => `明日 ${h}時`,
    days: ['日', '月', '火', '水', '木', '金', '土'],
  },
};

function formatBestTimeLabel(
  bestTime: string,
  nowKey: string,
  locale: string = 'fr',
): string {
  const L = BEST_TIME_I18N[locale] ?? BEST_TIME_I18N.en;
  // Compare on the spot-local hour keys (strings sort chronologically).
  const bestKey = bestTime.slice(0, 13);
  const bestDate = bestTime.slice(0, 10);
  const bestHour = bestTime.slice(11, 13);
  const nowDate = nowKey.slice(0, 10);
  const nowHour = parseInt(nowKey.slice(11, 13), 10);
  const bestHourNum = parseInt(bestHour, 10);

  if (bestKey <= nowKey) return L.now;

  // Hours difference within the same/next day.
  if (bestDate === nowDate) {
    const diff = bestHourNum - nowHour;
    if (diff <= 6) return L.inH(diff);
    return L.today(bestHour);
  }

  // Day-of-week label in the spot's local calendar.
  const tomorrow = new Date(`${nowDate}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowStr = `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth() + 1).padStart(2, '0')}-${String(tomorrow.getUTCDate()).padStart(2, '0')}`;
  if (bestDate === tomorrowStr) {
    return L.tomorrow(bestHour);
  }

  const dayDate = new Date(`${bestDate}T00:00:00Z`);
  const dayIdx = dayDate.getUTCDay();
  return `${L.days[dayIdx]} ${bestHour}h`;
}

// ── SPOT FORECAST ────────────────────────────────────────────────────────────

/**
 * Re-derive the "best window" label for the CURRENT locale at render time.
 * `forecast.bestTime.label` is baked at fetch time, so it would otherwise stay
 * in the language that was active when the data was loaded.
 */
export function bestTimeLabel(
  forecast: { bestTime: { time: string }; utcOffsetSeconds?: number },
  locale: string = 'fr',
): string {
  const time = forecast.bestTime?.time;
  if (!time) return '';
  return formatBestTimeLabel(time, spotLocalNowKey(forecast.utcOffsetSeconds), locale);
}

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

  // Anti-spike pass on the final scores.
  const damped = dampOutliers(hourlyConditions.map(h => h.score));
  for (let i = 0; i < hourlyConditions.length; i++) {
    if (damped[i] !== hourlyConditions[i].score) hourlyConditions[i].score = damped[i];
  }

  // Timezone: prefer the marine offset, fall back to weather offset.
  const utcOffsetSeconds = marine.utc_offset_seconds ?? weather.utc_offset_seconds;
  const nowKey = spotLocalNowKey(utcOffsetSeconds);

  let currentIdx = 0;
  let found = false;
  for (let i = 0; i < hourlyConditions.length; i++) {
    if (hourlyConditions[i].time.slice(0, 13) >= nowKey) {
      currentIdx = i;
      found = true;
      break;
    }
  }
  // If "now" is past the end of the series, clamp to the last hour.
  if (!found && hourlyConditions.length > 0) currentIdx = hourlyConditions.length - 1;

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
  const bestTimeLabel = bestCondition
    ? formatBestTimeLabel(bestCondition.time, nowKey, locale)
    : '';

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
    utcOffsetSeconds,
    isNightNow: isNightAtSpot(utcOffsetSeconds),
  };
}
