import type { MCIName } from './utils/icons';

function lerpColor(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number, t: number): string {
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${b})`;
}

// Continuous traffic-light ramp across the WHOLE 0–10 range:
// red → orange → amber → true green → brand turquoise (#23C7C2).
// Every score gets its own shade (no flat band): a real green anchors "good"
// at 7.5, and the top quarter visibly gradients green → turquoise so a 7.6 and
// a 9.9 read differently, the best scores glowing in the logo colour.
export function scoreColor(score: number) {
  const s = Math.max(0, Math.min(10, score));
  if (s <= 2.5) return lerpColor(228, 82, 76, 255, 138, 80, s / 2.5);          // red → orange
  if (s <= 5.0) return lerpColor(255, 138, 80, 255, 200, 70, (s - 2.5) / 2.5); // orange → amber
  if (s <= 7.5) return lerpColor(255, 200, 70, 52, 184, 96, (s - 5.0) / 2.5);  // amber → green
  return lerpColor(52, 184, 96, 35, 199, 194, (s - 7.5) / 2.5);                // green → brand turquoise
}

function relLuminance(rgb: string): number {
  const [r, g, b] = (rgb.match(/\d+/g) ?? ['0', '0', '0']).map(Number).map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const inkCache = new Map<number, string>();

/**
 * Score colour to use for TEXT (numbers, labels, inline icons). The bright ramp
 * reads well on the dark theme but only reaches ~2.3:1 on the light cards, so
 * on light it is darkened just enough for 4.5:1 against the most tinted badge
 * background (scoreBg over white). Rings, fills and the dark theme keep
 * scoreColor.
 */
export function scoreInk(score: number, isDark: boolean): string {
  if (isDark) return scoreColor(score);
  const key = Math.round(score * 10);
  const hit = inkCache.get(key);
  if (hit) return hit;
  const [r, g, b] = (scoreColor(score).match(/\d+/g) ?? ['0', '0', '0']).map(Number);
  const TINTED_BG_LUMINANCE = 0.86;
  let ink = scoreColor(score);
  for (let f = 1; f >= 0.3; f -= 0.02) {
    ink = `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`;
    if ((TINTED_BG_LUMINANCE + 0.05) / (relLuminance(ink) + 0.05) >= 4.5) break;
  }
  inkCache.set(key, ink);
  return ink;
}

export function scoreBg(score: number) {
  const s = Math.max(0, Math.min(10, score));
  if (s <= 2.5) return `rgba(228,82,76,${0.07 + (s / 2.5) * 0.03})`;
  if (s <= 5.0) return `rgba(255,150,70,${0.08 + ((s - 2.5) / 2.5) * 0.05})`;
  if (s <= 7.5) return `rgba(52,184,96,${0.08 + ((s - 5.0) / 2.5) * 0.06})`;    // green
  return `rgba(35,199,194,${0.14 + ((s - 7.5) / 2.5) * 0.04})`;                 // turquoise (best)
}

interface ScoreTranslations {
  scorePerfect: string;
  scoreVeryGood: string;
  scoreGo: string;
  scoreOk: string;
  scoreAverage: string;
  scoreMediocre: string;
  scoreBad: string;
  scoreVeryBad: string;
  scoreImpossible: string;
  scoreShortPerfect: string;
  scoreShortVeryGood: string;
  scoreShortGo: string;
  scoreShortOk: string;
  scoreShortAverage: string;
  scoreShortMediocre: string;
  scoreShortBad: string;
  scoreShortVeryBad: string;
  scoreShortImpossible: string;
}

type LongKey = 'scorePerfect' | 'scoreVeryGood' | 'scoreGo' | 'scoreOk' | 'scoreAverage'
  | 'scoreMediocre' | 'scoreBad' | 'scoreVeryBad' | 'scoreImpossible';
type ShortKey = 'scoreShortPerfect' | 'scoreShortVeryGood' | 'scoreShortGo' | 'scoreShortOk'
  | 'scoreShortAverage' | 'scoreShortMediocre' | 'scoreShortBad' | 'scoreShortVeryBad'
  | 'scoreShortImpossible';

export interface ScoreBand {
  min: number;
  long: LongKey;
  short: ShortKey;
  icon: MCIName;
  /** French fallback when no translations are passed. */
  fr: [string, string];
}

/**
 * The ONE verdict scale. Long label, short tag and icon all come from the same
 * band, so a score can never read "On fonce !" in one place and "Correct" next
 * to it (the old long/short/icon/guide scales each had their own thresholds).
 */
export const SCORE_BANDS: ScoreBand[] = [
  { min: 9.0, long: 'scorePerfect', short: 'scoreShortPerfect', icon: 'fire', fr: ['Conditions parfaites\u00a0!', 'Parfait'] },
  { min: 8.0, long: 'scoreVeryGood', short: 'scoreShortVeryGood', icon: 'fire', fr: ['Très bonnes conditions\u00a0!', 'Top'] },
  { min: 7.0, long: 'scoreGo', short: 'scoreShortGo', icon: 'thumb-up', fr: ['On fonce\u00a0!', 'Bon'] },
  { min: 5.5, long: 'scoreOk', short: 'scoreShortOk', icon: 'thumb-up-outline', fr: ['Correct', 'Correct'] },
  { min: 4.5, long: 'scoreAverage', short: 'scoreShortAverage', icon: 'emoticon-neutral-outline', fr: ['Moyen', 'Moyen'] },
  { min: 3.5, long: 'scoreMediocre', short: 'scoreShortMediocre', icon: 'emoticon-neutral-outline', fr: ['Médiocre', 'Bof'] },
  { min: 2.5, long: 'scoreBad', short: 'scoreShortBad', icon: 'thumb-down-outline', fr: ['Mauvais', 'Mauvais'] },
  { min: 1.5, long: 'scoreVeryBad', short: 'scoreShortVeryBad', icon: 'thumb-down-outline', fr: ['Très mauvais', 'Nul'] },
  { min: -Infinity, long: 'scoreImpossible', short: 'scoreShortImpossible', icon: 'sleep', fr: ['Impraticable', 'Flat'] },
];

/** Band of a score, judged on the value as displayed (one decimal), so a 6.96 shown as "7.0" reads "On fonce !". */
export function scoreBand(score: number): ScoreBand {
  const shown = Math.round(score * 10) / 10;
  return SCORE_BANDS.find(b => shown >= b.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1];
}

export function scoreLabel(score: number, t?: ScoreTranslations) {
  const b = scoreBand(score);
  return t ? t[b.long] : b.fr[0];
}

export function scoreShort(score: number, t?: ScoreTranslations) {
  const b = scoreBand(score);
  return t ? t[b.short] : b.fr[1];
}

export function windLabel(speed: number, dir: number, beachOrientation: number) {
  const offshoreDir = (beachOrientation + 180) % 360;
  let diff = Math.abs(dir - offshoreDir) % 360;
  if (diff > 180) diff = 360 - diff;

  let type: string;
  if (diff <= 45) type = 'Offshore';
  else if (diff <= 90) type = 'Cross-off';
  else if (diff <= 135) type = 'Cross-on';
  else type = 'Onshore';

  if (speed < 5) return 'Glassy';
  return type;
}

export type WindConditionKey = 'glassy' | 'clean' | 'choppy';

/**
 * Plain-language surface read derived from wind speed + how offshore it blows.
 * This is what casual surfers actually want ("is it clean or messy?"), as
 * opposed to the raw direction label. Continuous-ish thresholds, no jargon.
 *  - glassy: barely any wind, mirror surface
 *  - clean : offshore/cross-off grooming the waves (or very light onshore)
 *  - choppy: onshore chop, strong cross, or just plain windy/blown out
 */
export function windConditionKey(speed: number, dir: number, beachOrientation: number): WindConditionKey {
  if (speed < 5) return 'glassy';
  const offshoreDir = (beachOrientation + 180) % 360;
  let diff = Math.abs(dir - offshoreDir) % 360;
  if (diff > 180) diff = 360 - diff;
  // Strong wind blows everything out regardless of direction.
  if (speed >= 30) return 'choppy';
  if (diff <= 70) return speed <= 22 ? 'clean' : 'choppy';   // offshore / cross-off
  if (diff <= 110) return speed <= 12 ? 'clean' : 'choppy';  // cross-shore
  return speed <= 8 ? 'clean' : 'choppy';                     // onshore
}

export function dirLabel(deg: number): string {
  const d = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
  return d[Math.round(deg / 22.5) % 16];
}

export function isDaytime(isoTime: string, from = 7, to = 20): boolean {
  const h = parseInt(isoTime.slice(11, 13), 10);
  return h >= from && h < to;
}

