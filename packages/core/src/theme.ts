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
  scoreShortOk: string;
  scoreShortAverage: string;
  scoreShortMediocre: string;
  scoreShortBad: string;
  scoreShortVeryBad: string;
  scoreShortImpossible: string;
}

export function scoreLabel(score: number, t?: ScoreTranslations) {
  if (t) {
    if (score >= 9.0) return t.scorePerfect;
    if (score >= 8.0) return t.scoreVeryGood;
    if (score >= 7.0) return t.scoreGo;
    if (score >= 5.5) return t.scoreOk;
    if (score >= 4.5) return t.scoreAverage;
    if (score >= 3.5) return t.scoreMediocre;
    if (score >= 2.5) return t.scoreBad;
    if (score >= 1.5) return t.scoreVeryBad;
    return t.scoreImpossible;
  }
  if (score >= 9.0) return 'Conditions parfaites !';
  if (score >= 8.0) return 'Très bonnes conditions !';
  if (score >= 7.0) return 'On fonce !';
  if (score >= 5.5) return 'Correct';
  if (score >= 4.5) return 'Moyen';
  if (score >= 3.5) return 'Médiocre';
  if (score >= 2.5) return 'Mauvais';
  if (score >= 1.5) return 'Très mauvais';
  return 'Impraticable';
}

export function scoreShort(score: number, t?: ScoreTranslations) {
  if (t) {
    if (score >= 9.0) return t.scoreShortPerfect;
    if (score >= 8.0) return t.scoreShortVeryGood;
    if (score >= 6.5) return t.scoreShortOk;
    if (score >= 5.0) return t.scoreShortAverage;
    if (score >= 3.5) return t.scoreShortMediocre;
    if (score >= 2.5) return t.scoreShortBad;
    if (score >= 1.0) return t.scoreShortVeryBad;
    return t.scoreShortImpossible;
  }
  if (score >= 9.0) return 'Parfait';
  if (score >= 8.0) return 'Top';
  if (score >= 6.5) return 'Correct';
  if (score >= 5.0) return 'Moyen';
  if (score >= 3.5) return 'Bof';
  if (score >= 2.5) return 'Mauvais';
  if (score >= 1.0) return 'Nul';
  return 'Impraticable';
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

