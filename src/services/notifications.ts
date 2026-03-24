import AsyncStorage from '@react-native-async-storage/async-storage';
import { SpotForecast, HourlyCondition } from '../types';
import { windLabel } from '../theme';
import { log } from '../utils/logger';

let Notifications: any = null;
try {
  Notifications = require('expo-notifications');
} catch {}

const ALERTS_KEY = '@spotwave_alerts';
const GOOD_SCORE_THRESHOLD = 6.5;

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
  if (!enabled && Notifications) {
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
  }
}

export async function scheduleGoodConditionAlerts(
  forecasts: SpotForecast[],
  localeFr: boolean,
): Promise<number> {
  if (!Notifications) return 0;
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});

  const enabled = await getAlertsEnabled();
  if (!enabled) return 0;

  const now = new Date();
  const tomorrowStr = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
  let scheduled = 0;

  for (const f of forecasts) {
    const goodHours = f.hourlyConditions.filter(
      (h: HourlyCondition) => h.time.startsWith(tomorrowStr) && h.score >= GOOD_SCORE_THRESHOLD,
    );

    if (goodHours.length === 0) continue;

    const best = goodHours.reduce((a, b) => (a.score > b.score ? a : b));
    const bestHour = new Date(best.time).getHours();
    const wl = windLabel(best.windSpeed, best.windDirection, f.spot.beachOrientation);

    const title = localeFr
      ? `🏄 ${f.spot.name} : belles conditions demain !`
      : `🏄 ${f.spot.name}: great conditions tomorrow!`;
    const body = localeFr
      ? `Score ${best.score.toFixed(1)}/10 vers ${bestHour}h. Houle ${best.swellHeight.toFixed(1)}m, ${wl}.`
      : `Score ${best.score.toFixed(1)}/10 around ${bestHour}h. Swell ${best.swellHeight.toFixed(1)}m, ${wl}.`;

    try {
      const triggerDate = new Date(tomorrowStr + 'T06:00:00');
      if (triggerDate.getTime() <= now.getTime()) continue;

      await Notifications.scheduleNotificationAsync({
        content: { title, body, sound: true },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
      });
      scheduled++;
    } catch (e) {
      log.warn('Failed to schedule notification:', e instanceof Error ? e.message : 'unknown');
    }

    if (scheduled >= 3) break;
  }

  return scheduled;
}
