import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { SpotForecast, HourlyCondition } from '../types';
import { windLabel } from '../theme';
import { log } from '../utils/logger';
import { getSpotAlerts } from './alerts';
import { spotLocalNowKey } from '../utils/scoring';

let Notifications: any = null;
try {
  Notifications = require('expo-notifications');
} catch {}

const ALERTS_KEY = '@spotwave_alerts';
const GOOD_SCORE_THRESHOLD = 6.5;
// Per-spot alerts can look a few days ahead (the global alert only looks at
// tomorrow). We still cap the number of scheduled notifications to stay polite.
const PER_SPOT_DAYS_AHEAD = 4;
const MAX_NOTIFICATIONS = 10;

/**
 * Whether the device currently has a usable internet connection.
 * `isInternetReachable` can be null (unknown) right after boot — in that case
 * we don't want to block, so only an explicit `false` counts as offline.
 */
async function isOnline(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    if (state.isConnected === false) return false;
    if (state.isInternetReachable === false) return false;
    return true;
  } catch {
    return true;
  }
}

if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function requestNotifPermission(): Promise<boolean> {
  if (!Notifications) return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function getAlertsEnabled(): Promise<boolean> {
  const val = await AsyncStorage.getItem(ALERTS_KEY).catch(() => null);
  return val === 'true';
}

export async function setAlertsEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(ALERTS_KEY, enabled ? 'true' : 'false').catch(() => {});
  if (!enabled) {
    // Only drop the global "good conditions" alerts — per-spot custom alerts are
    // independent and must survive toggling the global switch off.
    await cancelGenericAlerts();
  }
}

/**
 * Cancels ONLY the global "good conditions" notifications (identifier prefix
 * `good-cond:`), leaving every per-spot custom alert (`spot-alert:`) intact.
 */
async function cancelGenericAlerts(): Promise<void> {
  if (!Notifications) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n: any) => typeof n?.identifier === 'string' && n.identifier.startsWith('good-cond:'))
        .map((n: any) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})),
    );
  } catch {
    // getAllScheduledNotificationsAsync can throw on some platforms — fail soft.
  }
}

function dayWord(offset: number, locale: string): string {
  if (offset <= 0) {
    return locale === 'es' ? 'hoy' : locale === 'pt' ? 'hoje' : locale === 'fr' ? "aujourd'hui" : locale === 'de' ? 'heute' : locale === 'it' ? 'oggi' : locale === 'ja' ? '今日' : 'today';
  }
  if (offset === 1) {
    return locale === 'es' ? 'mañana' : locale === 'pt' ? 'amanhã' : locale === 'fr' ? 'demain' : locale === 'de' ? 'morgen' : locale === 'it' ? 'domani' : locale === 'ja' ? '明日' : 'tomorrow';
  }
  // 2+ days out: just say "in N days" — keeps it locale-light and unambiguous.
  return locale === 'es' ? `en ${offset} días`
    : locale === 'pt' ? `em ${offset} dias`
    : locale === 'fr' ? `dans ${offset} jours`
    : locale === 'de' ? `in ${offset} Tagen`
    : locale === 'it' ? `tra ${offset} giorni`
    : locale === 'ja' ? `${offset}日後`
    : `in ${offset} days`;
}

function buildAlertContent(
  f: SpotForecast,
  best: HourlyCondition,
  dayOffset: number,
  locale: string,
): { title: string; body: string } {
  // best.time is the spot-LOCAL wall-clock string ("YYYY-MM-DDTHH:mm") without a
  // Z suffix. Parsing it via `new Date()` would reinterpret it in the device
  // timezone, so we read the hour straight from the string instead.
  const bestHour = parseInt(best.time.slice(11, 13), 10) || 0;
  const wl = windLabel(best.windSpeed, best.windDirection, f.spot.beachOrientation);
  const sc = best.score.toFixed(1);
  const sw = best.swellHeight.toFixed(1);
  const when = dayWord(dayOffset, locale);

  const title =
    locale === 'es' ? `${f.spot.name}: ¡buenas condiciones ${when}!`
    : locale === 'pt' ? `${f.spot.name}: ótimas condições ${when}!`
    : locale === 'fr' ? `${f.spot.name} : belles conditions ${when} !`
    : locale === 'de' ? `${f.spot.name}: gute Bedingungen ${when}!`
    : locale === 'it' ? `${f.spot.name}: buone condizioni ${when}!`
    : locale === 'ja' ? `${f.spot.name}：${when}は良いコンディション！`
    : `${f.spot.name}: great conditions ${when}!`;
  const body =
    locale === 'es' ? `Puntuación ${sc}/10 hacia las ${bestHour}h. Oleaje ${sw}m, ${wl}.`
    : locale === 'pt' ? `Pontuação ${sc}/10 por volta das ${bestHour}h. Ondulação ${sw}m, ${wl}.`
    : locale === 'fr' ? `Score ${sc}/10 vers ${bestHour}h. Houle ${sw}m, ${wl}.`
    : locale === 'de' ? `Bewertung ${sc}/10 gegen ${bestHour} Uhr. Swell ${sw}m, ${wl}.`
    : locale === 'it' ? `Punteggio ${sc}/10 verso le ${bestHour}. Swell ${sw}m, ${wl}.`
    : locale === 'ja' ? `スコア ${sc}/10、${bestHour}時頃。スウェル ${sw}m、${wl}。`
    : `Score ${sc}/10 around ${bestHour}h. Swell ${sw}m, ${wl}.`;

  return { title, body };
}

/**
 * Spot-local date ("YYYY-MM-DD") `offset` days from the spot's current local day.
 * Open-Meteo hourly times are spot-local, so matching/alert days must be computed
 * in the SPOT's timezone, not the device's — otherwise a spot in another timezone
 * would match the wrong day.
 */
function spotDayStr(utcOffsetSeconds: number | undefined, offset: number): string {
  const todayStr = spotLocalNowKey(utcOffsetSeconds).slice(0, 10);
  if (offset <= 0) return todayStr;
  const d = new Date(`${todayStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Absolute instant for `hour:00` SPOT-local time on `dayStr`. Spot-local wall
 * time T corresponds to UTC = T - offset, so we build the UTC instant and shift
 * by the spot offset. Falls back to device-local time when the offset is unknown.
 */
function spotTriggerDate(dayStr: string, hour: number, utcOffsetSeconds: number | undefined): Date {
  const [y, m, d] = dayStr.split('-').map(Number);
  if (typeof utcOffsetSeconds === 'number') {
    return new Date(Date.UTC(y, m - 1, d, hour, 0, 0) - utcOffsetSeconds * 1000);
  }
  return new Date(`${dayStr}T${String(hour).padStart(2, '0')}:00:00`);
}

/** Hour of day (spot-local) at which condition alerts fire. */
const ALERT_HOUR = 6;

/**
 * (Re)schedules all condition notifications: the global "good conditions
 * tomorrow" alert (when the master toggle is on) AND any per-spot custom-score
 * alerts. A spot that has its own alert is never double-notified by the global
 * one. Returns the number of notifications scheduled.
 */
export async function scheduleGoodConditionAlerts(
  forecasts: SpotForecast[],
  locale: string,
): Promise<number> {
  if (!Notifications) return 0;

  const [globalEnabled, spotAlerts] = await Promise.all([getAlertsEnabled(), getSpotAlerts()]);
  const hasSpotAlerts = Object.keys(spotAlerts).length > 0;

  if (!globalEnabled && !hasSpotAlerts) {
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
    return 0;
  }

  // When offline, forecasts come from a possibly-stale cache. Don't reschedule
  // from outdated data — keep whatever was scheduled during the last online run.
  if (!(await isOnline())) {
    log.info('Offline — skipping notification (re)scheduling');
    return 0;
  }

  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});

  const now = new Date();
  let scheduled = 0;

  const schedule = async (identifier: string, content: { title: string; body: string }, triggerDate: Date) => {
    if (triggerDate.getTime() <= now.getTime()) return false;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: { ...content, sound: true },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
      });
      scheduled++;
      return true;
    } catch (e) {
      log.warn('Failed to schedule notification:', e instanceof Error ? e.message : 'unknown');
      return false;
    }
  };

  // 1) Per-spot custom alerts — look a few days ahead, notify the morning of the
  //    first day the spot reaches the user's chosen score.
  for (const f of forecasts) {
    if (scheduled >= MAX_NOTIFICATIONS) break;
    const cfg = spotAlerts[f.spot.id];
    if (!cfg) continue;

    for (let offset = 0; offset <= PER_SPOT_DAYS_AHEAD; offset++) {
      const dayStr = spotDayStr(f.utcOffsetSeconds, offset);
      const dayHours = f.hourlyConditions.filter(
        (h: HourlyCondition) => h.time.startsWith(dayStr) && h.score >= cfg.minScore,
      );
      if (dayHours.length === 0) continue;
      const best = dayHours.reduce((a, b) => (a.score > b.score ? a : b));
      const triggerDate = spotTriggerDate(dayStr, ALERT_HOUR, f.utcOffsetSeconds);
      const ok = await schedule(spotAlertId(f.spot.id), buildAlertContent(f, best, offset, locale), triggerDate);
      if (ok) break; // one notification per spot, soonest qualifying day
    }
  }

  // 2) Global "good conditions tomorrow" — only for spots WITHOUT a custom alert,
  //    capped at 3 like before so a busy region doesn't spam.
  if (globalEnabled) {
    let generic = 0;
    for (const f of forecasts) {
      if (scheduled >= MAX_NOTIFICATIONS || generic >= 3) break;
      if (spotAlerts[f.spot.id]) continue;
      // "Tomorrow" in the spot's local calendar (not the device's).
      const tomorrowStr = spotDayStr(f.utcOffsetSeconds, 1);
      const goodHours = f.hourlyConditions.filter(
        (h: HourlyCondition) => h.time.startsWith(tomorrowStr) && h.score >= GOOD_SCORE_THRESHOLD,
      );
      if (goodHours.length === 0) continue;
      const best = goodHours.reduce((a, b) => (a.score > b.score ? a : b));
      const triggerDate = spotTriggerDate(tomorrowStr, ALERT_HOUR, f.utcOffsetSeconds);
      if (await schedule(genericAlertId(f.spot.id), buildAlertContent(f, best, 1, locale), triggerDate)) generic++;
    }
  }

  return scheduled;
}

const spotAlertId = (spotId: string) => `spot-alert:${spotId}`;
const genericAlertId = (spotId: string) => `good-cond:${spotId}`;

/**
 * Additively (re)schedules ONLY one spot's custom alert, without touching the
 * others. Used right after the user toggles an alert on the detail screen so the
 * change takes effect immediately (the full reschedule on the Spots tab uses the
 * same stable identifiers, so there is never a duplicate).
 */
export async function rescheduleSpotAlert(forecast: SpotForecast, locale: string): Promise<void> {
  if (!Notifications) return;
  const id = spotAlertId(forecast.spot.id);
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});

  const cfg = (await getSpotAlerts())[forecast.spot.id];
  if (!cfg) return; // alert was disabled — cancellation above is enough
  if (!(await isOnline())) return;

  const granted = await requestNotifPermission();
  if (!granted) return;

  const now = new Date();
  for (let offset = 0; offset <= PER_SPOT_DAYS_AHEAD; offset++) {
    const dayStr = spotDayStr(forecast.utcOffsetSeconds, offset);
    const dayHours = forecast.hourlyConditions.filter(
      (h: HourlyCondition) => h.time.startsWith(dayStr) && h.score >= cfg.minScore,
    );
    if (dayHours.length === 0) continue;
    const best = dayHours.reduce((a, b) => (a.score > b.score ? a : b));
    const triggerDate = spotTriggerDate(dayStr, ALERT_HOUR, forecast.utcOffsetSeconds);
    if (triggerDate.getTime() <= now.getTime()) continue;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: id,
        content: { ...buildAlertContent(forecast, best, offset, locale), sound: true },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
      });
    } catch (e) {
      log.warn('Failed to schedule spot alert:', e instanceof Error ? e.message : 'unknown');
    }
    break;
  }
}
