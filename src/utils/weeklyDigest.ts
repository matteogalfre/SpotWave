import { SpotForecast, HourlyCondition } from '../types';

/**
 * Weekly « best slot of the week » notification: pure helpers (no scheduling),
 * so the choice of slot and the wording can be unit-tested.
 */

/** Device-local hour at which the weekly digest fires (Sunday evening, to plan the week). */
export const DIGEST_HOUR = 18;
/** Below this score a « best slot » isn't worth a notification. */
export const DIGEST_MIN_SCORE = 5;
/** Only daylight hours (spot-local) count as a slot. */
const FIRST_HOUR = 6;
const LAST_HOUR = 20;

/** Next Sunday DIGEST_HOUR:00 (device-local) strictly after `now`. */
export function nextDigestDate(now: Date): Date {
  const d = new Date(now);
  d.setHours(DIGEST_HOUR, 0, 0, 0);
  const daysToSunday = (7 - d.getDay()) % 7;
  d.setDate(d.getDate() + daysToSunday);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 7);
  return d;
}

/** Absolute instant of a spot-local « YYYY-MM-DDTHH:mm » hour. */
export function spotHourToMs(time: string, utcOffsetSeconds: number | undefined): number {
  if (typeof utcOffsetSeconds !== 'number') return new Date(time).getTime();
  const [date, hm] = time.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const h = parseInt((hm ?? '0').slice(0, 2), 10) || 0;
  return Date.UTC(y, m - 1, d, h, 0, 0) - utcOffsetSeconds * 1000;
}

export interface WeeklyBest { forecast: SpotForecast; cond: HourlyCondition }

/**
 * Best daylight slot between `fromMs` and `toMs` among the favorite spots (all
 * loaded spots when the user has no favorite loaded). null when nothing reaches
 * DIGEST_MIN_SCORE.
 */
export function pickWeeklyBest(
  forecasts: SpotForecast[],
  favIds: string[],
  fromMs: number,
  toMs: number,
): WeeklyBest | null {
  const favs = forecasts.filter((f) => favIds.includes(f.spot.id));
  const pool = favs.length > 0 ? favs : forecasts;
  let best: WeeklyBest | null = null;
  for (const forecast of pool) {
    for (const cond of forecast.hourlyConditions) {
      const hour = parseInt(cond.time.slice(11, 13), 10);
      if (hour < FIRST_HOUR || hour > LAST_HOUR) continue;
      const at = spotHourToMs(cond.time, forecast.utcOffsetSeconds);
      if (at < fromMs || at > toMs) continue;
      if (cond.score < DIGEST_MIN_SCORE) continue;
      if (!best || cond.score > best.cond.score) best = { forecast, cond };
    }
  }
  return best;
}

const WEEKDAYS: Record<string, string[]> = {
  fr: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
  pt: ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'],
  de: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
  it: ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'],
  ja: ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'],
};

/** Notification title and body for the weekly best slot. */
export function buildDigestContent(best: WeeklyBest, locale: string): { title: string; body: string } {
  const { forecast, cond } = best;
  const [y, m, d] = cond.time.slice(0, 10).split('-').map(Number);
  const day = (WEEKDAYS[locale] ?? WEEKDAYS.en)[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const h = parseInt(cond.time.slice(11, 13), 10);
  const sc = cond.score.toFixed(1);
  const sw = cond.swellHeight.toFixed(1);
  const name = forecast.spot.name;
  switch (locale) {
    case 'fr': return { title: 'Ta semaine de surf', body: `Meilleur créneau : ${name}, ${day} vers ${h}h. Note ${sc}/10, houle ${sw} m.` };
    case 'es': return { title: 'Tu semana de surf', body: `Mejor momento: ${name}, el ${day} hacia las ${h}h. Nota ${sc}/10, oleaje ${sw} m.` };
    case 'pt': return { title: 'A tua semana de surf', body: `Melhor janela: ${name}, ${day} por volta das ${h}h. Nota ${sc}/10, ondulação ${sw} m.` };
    case 'de': return { title: 'Deine Surfwoche', body: `Bestes Zeitfenster: ${name}, ${day} gegen ${h} Uhr. Bewertung ${sc}/10, Swell ${sw} m.` };
    case 'it': return { title: 'La tua settimana di surf', body: `Momento migliore: ${name}, ${day} verso le ${h}. Punteggio ${sc}/10, swell ${sw} m.` };
    case 'ja': return { title: '今週のサーフ', body: `ベストタイム：${name}、${day} ${h}時頃。スコア ${sc}/10、スウェル ${sw}m。` };
    default: return { title: 'Your surf week', body: `Best slot: ${name}, ${day} around ${h}h. Score ${sc}/10, swell ${sw} m.` };
  }
}
