/**
 * Public Google Form used by the community to suggest new spots, submitted
 * silently in-app (no browser). Responses land in a Google Sheet (exportable to
 * Excel) — no direct contact with the app owner, so it can't be used for
 * harassment. Field ids were extracted from the form's public load data.
 */
export const SUGGEST_SPOT_FORM_ACTION =
  'https://docs.google.com/forms/d/e/1FAIpQLSfF2fWMtbvFG-0eyNxVUwTW-N34BCVAjxu9KblHahtlqeJTWA/formResponse';
export const SUGGEST_SPOT_ENTRIES = {
  name: 'entry.752894442',
  country: 'entry.811746173',
  level: 'entry.759447211',     // values: Beginner | Intermediate | Expert
  webcam: 'entry.1240398840',
};

/**
 * Anonymous in-app surf ratings → Google Form (ground-truth to calibrate the
 * scoring algorithm). Users tap "Noter", give a /10, and we silently POST their
 * score + the model inputs at that instant. No browser, no account, no device id
 * or GPS — just the rating and the forecast data.
 *
 * SETUP (2 min): create a Google Form with ONE single "Paragraph" question, then
 *  - RATING_FORM_ACTION = the form's POST endpoint. Take the form's edit/share
 *    URL `.../forms/d/e/<FORM_ID>/viewform` and use `.../forms/d/e/<FORM_ID>/formResponse`.
 *  - RATING_FORM_ENTRY  = the field id (e.g. 'entry.123456789'). Get it via the
 *    form's "Get pre-filled link": fill the field, copy link, read the entry.xxx.
 * Leave both empty to keep ratings ON-DEVICE only (nothing leaves the phone).
 */
/** Play Store listing — used by the manual "Rate the app" button. */
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.spotwave.app';
export const PLAY_STORE_MARKET = 'market://details?id=com.spotwave.app';

/**
 * Voluntary donation page (Buy Me a Coffee). Opened in the browser — a genuine
 * tip with no in-app reward, so it stays outside Google Play Billing and within
 * Play policy.
 */
export const SUPPORT_URL = 'https://buymeacoffee.com/vibelabs';

export const RATING_FORM_ACTION =
  'https://docs.google.com/forms/d/e/1FAIpQLSfEAf3QxLh07naIIU8fIAoK9RYxuIziIXCiD4NAv3g7sCPkLw/formResponse';
export const RATING_FORM_ENTRY = 'entry.1001869821';

// Aligned to the theme palette: blue (water/beginner), gold (intermediate),
// red (expert). Static because badges render outside the theme context.
export const LEVEL_BADGE_COLORS: Record<string, { color: string; bg: string }> = {
  beginner: { color: '#1488B5', bg: 'rgba(20,136,181,0.15)' },
  intermediate: { color: '#E0982C', bg: 'rgba(224,152,44,0.15)' },
  expert: { color: '#E0524C', bg: 'rgba(224,82,76,0.15)' },
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
  de: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
  it: ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'],
  ja: ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'],
};
const DAY_NAMES_SHORT: Record<string, string[]> = {
  fr: ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  es: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
  pt: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
  de: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
  it: ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'],
  ja: ['日', '月', '火', '水', '木', '金', '土'],
};
const TODAY_LABEL: Record<string, string> = { fr: "Aujourd'hui", en: 'Today', es: 'Hoy', pt: 'Hoje', de: 'Heute', it: 'Oggi', ja: '今日' };
const TOMORROW_LABEL: Record<string, string> = { fr: 'Demain', en: 'Tomorrow', es: 'Mañana', pt: 'Amanhã', de: 'Morgen', it: 'Domani', ja: '明日' };

// Open-Meteo hourly timestamps are spot-local wall-clock strings ("YYYY-MM-DDTHH")
// with no timezone suffix. To label them "today/tomorrow" consistently with the
// rest of the app (which anchors "now" to the SPOT's timezone), we compare on the
// calendar-date PART of the string and take the spot-local "today" (todayStr,
// e.g. from spotLocalNowKey) rather than the device clock. All date math is done
// on the Y-M-D fields via UTC so it is timezone-independent (no device drift).

/** Day of week (0=Sun) for a "YYYY-MM-DD" date, timezone-independent. */
function dowOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay();
}

/** "YYYY-MM-DD" one calendar day after `dateStr`, timezone-independent. */
function nextDayStr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const n = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + 1));
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}-${String(n.getUTCDate()).padStart(2, '0')}`;
}

function fmtDayLabelWith(
  iso: string,
  todayStr: string | undefined,
  names: string[],
  todayLabel: string,
  tomorrowLabel: string,
): string {
  const dateStr = iso.slice(0, 10);
  // Fallback to a UTC "today" only when no spot-local day is provided.
  const today = todayStr ?? new Date().toISOString().slice(0, 10);
  if (dateStr === today) return todayLabel;
  if (dateStr === nextDayStr(today)) return tomorrowLabel;
  const [, m, d] = dateStr.split('-').map(Number);
  return `${names[dowOf(dateStr)]} ${d}/${m}`;
}

export function fmtDayLabel(iso: string, todayStr?: string, t?: Translations, locale: string = 'fr'): string {
  return fmtDayLabelWith(
    iso, todayStr,
    DAY_NAMES_FULL[locale] ?? DAY_NAMES_FULL.en,
    t?.timeToday ?? TODAY_LABEL[locale] ?? TODAY_LABEL.en,
    t?.timeTomorrow ?? TOMORROW_LABEL[locale] ?? TOMORROW_LABEL.en,
  );
}

export function fmtDayLabelShort(iso: string, todayStr?: string, t?: Translations, locale: string = 'fr'): string {
  return fmtDayLabelWith(
    iso, todayStr,
    DAY_NAMES_SHORT[locale] ?? DAY_NAMES_SHORT.en,
    t?.timeToday ?? TODAY_LABEL[locale] ?? TODAY_LABEL.en,
    t?.timeTomorrow ?? TOMORROW_LABEL[locale] ?? TOMORROW_LABEL.en,
  );
}

export function fmtRange(iso: string, duration: number, maxH: number): string {
  const h = parseInt(iso.slice(11, 13), 10);
  const end = Math.min(h + duration, maxH);
  return `${h}h–${end}h`;
}

export function fmtH(iso: string): string {
  return iso.slice(11, 16);
}

