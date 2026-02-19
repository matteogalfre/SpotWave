export function scoreColor(score: number) {
  if (score >= 7.0) return '#00D4AA';
  if (score >= 4.5) return '#FF8A50';
  return '#FF5A5A';
}

export function scoreBg(score: number) {
  if (score >= 7.0) return 'rgba(0,212,170,0.15)';
  if (score >= 4.5) return 'rgba(255,138,80,0.15)';
  return 'rgba(255,90,90,0.12)';
}

export function scoreEmoji(score: number) {
  if (score >= 8.5) return '🔥';
  if (score >= 7.0) return '🤙';
  if (score >= 5.5) return '👍';
  if (score >= 4.0) return '😐';
  if (score >= 2.0) return '👎';
  return '🚫';
}

export function scoreLabel(score: number) {
  if (score >= 8.5) return 'Conditions parfaites';
  if (score >= 7.5) return 'On fonce !';
  if (score >= 6.5) return 'Ca envoie';
  if (score >= 5.5) return 'Correct';
  if (score >= 4.5) return 'Moyen';
  if (score >= 3.5) return 'Médiocre';
  if (score >= 2.0) return 'Mauvais';
  if (score >= 1.0) return 'Très mauvais';
  return 'Flat';
}

export function scoreShort(score: number) {
  if (score >= 8.5) return 'Parfait';
  if (score >= 7.0) return 'Top';
  if (score >= 5.5) return 'Correct';
  if (score >= 4.5) return 'Moyen';
  if (score >= 3.0) return 'Bof';
  if (score >= 1.5) return 'Nul';
  return 'Flat';
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
