/**
 * Public Google Form used by the community to suggest new spots. Responses
 * land directly in a Google Sheet (exportable to Excel) — no direct contact
 * with the app owner, so it can't be used for harassment.
 * Replace with your own form link (File ▸ Share ▸ "Get link" on a Google Form).
 */
export const SUGGEST_SPOT_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSfF2fWMtbvFG-0eyNxVUwTW-N34BCVAjxu9KblHahtlqeJTWA/viewform?usp=header';

export const LEVEL_BADGE_COLORS: Record<string, { color: string; bg: string }> = {
  beginner: { color: '#4A90FF', bg: 'rgba(74,144,255,0.15)' },
  intermediate: { color: '#FFB84D', bg: 'rgba(255,184,77,0.15)' },
  expert: { color: '#FF5A5A', bg: 'rgba(255,90,90,0.15)' },
};

interface Translations {
  levelBeginner: string;
  levelIntermediate: string;
  levelExpert: string;
  breakBeach: string;
  breakReef: string;
  breakPoint: string;
  tideLow: string;
  tideMid: string;
  tideHigh: string;
  tideAll: string;
  timeToday: string;
  timeTomorrow: string;
  timeNow: string;
  timeMinAgo: (n: number) => string;
  timeHourAgo: (n: number) => string;
}

export function getLevelBadge(level: string, t: Translations): { label: string; color: string; bg: string } {
  const labels: Record<string, string> = {
    beginner: t.levelBeginner,
    intermediate: t.levelIntermediate,
    expert: t.levelExpert,
  };
  const colors = LEVEL_BADGE_COLORS[level] || LEVEL_BADGE_COLORS.beginner;
  return { label: labels[level] || labels.beginner, ...colors };
}

export function getLevelLabel(level: string, t: Translations): string {
  const map: Record<string, string> = {
    beginner: t.levelBeginner,
    intermediate: t.levelIntermediate,
    expert: t.levelExpert,
  };
  return map[level] || map.beginner;
}

export function getBreakLabel(type: string, t: Translations): string {
  const map: Record<string, string> = {
    beach: t.breakBeach,
    reef: t.breakReef,
    point: t.breakPoint,
  };
  return map[type] || type;
}

export function getTideLabel(tide: string, t: Translations): string {
  const map: Record<string, string> = {
    low: t.tideLow,
    mid: t.tideMid,
    high: t.tideHigh,
    all: t.tideAll,
  };
  return map[tide] || tide;
}

const DAY_NAMES_FULL: Record<string, string[]> = {
  fr: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  es: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
  pt: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
};
const DAY_NAMES_SHORT: Record<string, string[]> = {
  fr: ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  es: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
  pt: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
};
const TODAY_LABEL: Record<string, string> = { fr: "Aujourd'hui", en: 'Today', es: 'Hoy', pt: 'Hoje' };
const TOMORROW_LABEL: Record<string, string> = { fr: 'Demain', en: 'Tomorrow', es: 'Mañana', pt: 'Amanhã' };

export function fmtDayLabel(iso: string, now?: Date, t?: Translations, locale: string = 'fr'): string {
  const d = new Date(iso);
  const ref = now ?? new Date();
  const todayStr = ref.toISOString().slice(0, 10);
  const tomorrow = new Date(ref);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  const dateStr = d.toISOString().slice(0, 10);
  const todayLabel = t?.timeToday ?? TODAY_LABEL[locale] ?? TODAY_LABEL.en;
  const tomorrowLabel = t?.timeTomorrow ?? TOMORROW_LABEL[locale] ?? TOMORROW_LABEL.en;
  if (dateStr === todayStr) return todayLabel;
  if (dateStr === tomorrowStr) return tomorrowLabel;
  const names = DAY_NAMES_FULL[locale] ?? DAY_NAMES_FULL.en;
  return `${names[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

export function fmtDayLabelShort(iso: string, t?: Translations, locale: string = 'fr'): string {
  const d = new Date(iso);
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = d.toISOString().slice(0, 10);
  const todayLabel = t?.timeToday ?? TODAY_LABEL[locale] ?? TODAY_LABEL.en;
  const tomorrowLabel = t?.timeTomorrow ?? TOMORROW_LABEL[locale] ?? TOMORROW_LABEL.en;
  if (dateStr === todayStr) return todayLabel;
  if (dateStr === tomorrow.toISOString().slice(0, 10)) return tomorrowLabel;
  const names = DAY_NAMES_SHORT[locale] ?? DAY_NAMES_SHORT.en;
  return `${names[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

export function fmtRange(iso: string, duration: number, maxH: number): string {
  const h = parseInt(iso.slice(11, 13), 10);
  const end = Math.min(h + duration, maxH);
  return `${h}h–${end}h`;
}

export function fmtH(iso: string): string {
  return iso.slice(11, 16);
}

export function fmtElapsed(d: Date, t?: Translations): string {
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return t?.timeNow ?? "à l'instant";
  if (mins < 60) return t?.timeMinAgo?.(mins) ?? `il y a ${mins} min`;
  return t?.timeHourAgo?.(Math.floor(mins / 60)) ?? `il y a ${Math.floor(mins / 60)}h`;
}
