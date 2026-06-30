import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { log } from '../utils/logger';

const OPEN_COUNT_KEY = '@sw_open_count';
const REVIEW_ASKED_KEY = '@sw_review_asked';

/** Ask for an in-app review on the 3rd app launch, once. */
const TRIGGER_AT = 3;

/**
 * Increments the app-open counter and, on the 3rd launch (once ever), asks the
 * OS to show the native in-app review prompt. Fully best-effort: it never throws
 * and silently does nothing when the prompt isn't available (e.g. dev builds,
 * OS throttling). Gated by a stored flag so the user is never nagged twice.
 */
export async function maybeRequestReview(): Promise<void> {
  try {
    const asked = (await AsyncStorage.getItem(REVIEW_ASKED_KEY)) === '1';
    const count = (parseInt((await AsyncStorage.getItem(OPEN_COUNT_KEY)) ?? '0', 10) || 0) + 1;
    await AsyncStorage.setItem(OPEN_COUNT_KEY, String(count));

    if (asked || count < TRIGGER_AT) return;

    const available = await StoreReview.isAvailableAsync().catch(() => false);
    if (!available) return;

    await StoreReview.requestReview();
    // Mark as asked even if the OS chose not to display it — we only try once.
    await AsyncStorage.setItem(REVIEW_ASKED_KEY, '1');
  } catch (e) {
    log.warn('In-app review skipped:', (e as Error)?.message);
  }
}
