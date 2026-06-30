import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Per-spot custom alerts.
 *
 * Independent from the global "good conditions" toggle (`@spotwave_alerts`):
 * here the user picks a specific spot and a minimum score, and gets notified
 * the morning of the next day that spot is forecast to reach it.
 *
 * Stored as a small map { [spotId]: { minScore } } in AsyncStorage so it stays
 * 100% on-device (no backend), consistent with the rest of the app.
 */

const SPOT_ALERTS_KEY = '@spotwave_spot_alerts';

export interface SpotAlert {
  /** Notify when an upcoming hour at this spot reaches this score (0–10). */
  minScore: number;
}

export type SpotAlertMap = Record<string, SpotAlert>;

/** Default threshold proposed when a user first opens the alert sheet. */
export const DEFAULT_ALERT_SCORE = 6.5;

export async function getSpotAlerts(): Promise<SpotAlertMap> {
  try {
    const raw = await AsyncStorage.getItem(SPOT_ALERTS_KEY);
    return raw ? (JSON.parse(raw) as SpotAlertMap) : {};
  } catch {
    return {};
  }
}

export async function getSpotAlert(spotId: string): Promise<SpotAlert | null> {
  const all = await getSpotAlerts();
  return all[spotId] ?? null;
}

export async function setSpotAlert(spotId: string, alert: SpotAlert): Promise<void> {
  const all = await getSpotAlerts();
  all[spotId] = alert;
  await AsyncStorage.setItem(SPOT_ALERTS_KEY, JSON.stringify(all)).catch(() => {});
}

export async function removeSpotAlert(spotId: string): Promise<void> {
  const all = await getSpotAlerts();
  if (!(spotId in all)) return;
  delete all[spotId];
  await AsyncStorage.setItem(SPOT_ALERTS_KEY, JSON.stringify(all)).catch(() => {});
}

