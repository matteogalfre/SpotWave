function lerpColor(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number, t: number): string {
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${b})`;
}

export function scoreColor(score: number) {
  const s = Math.max(0, Math.min(10, score));
  if (s <= 2.5) return lerpColor(255, 90, 90, 255, 138, 80, s / 2.5);
  if (s <= 5.0) return lerpColor(255, 138, 80, 255, 210, 80, (s - 2.5) / 2.5);
  if (s <= 7.5) return lerpColor(255, 210, 80, 0, 212, 170, (s - 5.0) / 2.5);
  return lerpColor(0, 212, 170, 0, 230, 140, (s - 7.5) / 2.5);
}

export function scoreBg(score: number) {
  const s = Math.max(0, Math.min(10, score));
  if (s <= 2.5) return `rgba(255,90,90,${0.08 + (s / 2.5) * 0.04})`;
  if (s <= 5.0) return `rgba(255,180,80,${0.08 + ((s - 2.5) / 2.5) * 0.06})`;
  if (s <= 7.5) return `rgba(0,212,170,${0.08 + ((s - 5.0) / 2.5) * 0.07})`;
  return `rgba(0,230,140,${0.15})`;
}

export function scoreEmoji(score: number) {
  if (score >= 8.0) return '🔥';
  if (score >= 6.5) return '🤙';
  if (score >= 5.0) return '👍';
  if (score >= 3.5) return '😐';
  if (score >= 2.0) return '👎';
  return '💤';
}

export function scoreLabel(score: number) {
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

export function scoreShort(score: number) {
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

export function dirLabel(deg: number): string {
  const d = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
  return d[Math.round(deg / 22.5) % 16];
}

export function isDaytime(isoTime: string, from = 7, to = 20): boolean {
  const h = parseInt(isoTime.slice(11, 13), 10);
  return h >= from && h < to;
}

export function weatherIcon(code: number): string {
  if (code === 0) return '☀️';
  if (code <= 3) return '⛅';
  if (code <= 49) return '🌫️';
  if (code <= 59) return '🌦️';
  if (code <= 69) return '🌧️';
  if (code <= 79) return '🌨️';
  if (code <= 82) return '🌧️';
  if (code <= 86) return '🌨️';
  if (code <= 99) return '⛈️';
  return '🌤️';
}

export function weatherLabel(code: number): string {
  if (code === 0) return 'Dégagé';
  if (code <= 2) return 'Peu nuageux';
  if (code === 3) return 'Couvert';
  if (code <= 49) return 'Brouillard';
  if (code <= 59) return 'Bruine';
  if (code <= 69) return 'Pluie';
  if (code <= 79) return 'Neige';
  if (code <= 82) return 'Averses';
  if (code <= 86) return 'Neige';
  if (code <= 99) return 'Orage';
  return 'Variable';
}
