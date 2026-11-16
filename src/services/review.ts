import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { log } from '../utils/logger';

// Native in-app review only. Lazy-required so the web bundle never pulls the
// native module.
let StoreReview: typeof import('expo-store-review') | null = null;
if (Platform.OS !== 'web') {
  try {
    StoreReview = require('expo-store-review');
  } catch {}
}

const OPEN_COUNT_KEY = '@sw_open_count';
const ATTEMPT_COUNT_KEY = '@sw_review_attempts';

/**
 * Launch milestones at which we (re)try to surface the native review prompt.
 * Google throttles `requestReview()` behind an opaque quota and very often
 * shows nothing, so a single attempt is usually wasted. The OS itself enforces
 * a hard cap (~1 prompt / user / year), which means re-requesting is safe and
 * simply increases the odds the prompt is actually displayed once Google stops
 * throttling. We advance one milestone per attempt.
 */
const MILESTONES = [3, 6, 12, 25];
const MAX_ATTEMPTS = MILESTONES.length;

/** Don't prompt a user who's barely opened the app on a "positive moment". */
const MIN_OPENS_FOR_POSITIVE_MOMENT = 2;

// Guards against prompting more than once within the same app session.
let promptedThisSession = false;

async function getInt(key: string): Promise<number> {
  return Number.parseInt((await AsyncStorage.getItem(key)) ?? '0', 10) || 0;
}

/**
 * Shared best-effort trigger. Returns true only when we actually asked the OS.
 * Never throws. Consumes one unit of the shared attempt budget on success.
 */
async function tryRequestReview(): Promise<boolean> {
  if (!StoreReview || promptedThisSession) return false;

  const attempts = await getInt(ATTEMPT_COUNT_KEY);
  if (attempts >= MAX_ATTEMPTS) return false;

  const available = await StoreReview.isAvailableAsync().catch(() => false);
  if (!available) return false;

  promptedThisSession = true;
  await StoreReview.requestReview();
  await AsyncStorage.setItem(ATTEMPT_COUNT_KEY, String(attempts + 1));
  return true;
}

/**
 * Increments the app-open counter and, when a launch milestone is reached,
 * asks the OS to show the native in-app review prompt. Retries across several
 * milestones (see MILESTONES) so a throttled early attempt isn't wasted.
 * Fully best-effort: it never throws and silently does nothing when the prompt
 * isn't available (dev builds, OS throttling, budget exhausted).
 */
export async function maybeRequestReview(): Promise<void> {
  if (!StoreReview) return;
  try {
    const count = (await getInt(OPEN_COUNT_KEY)) + 1;
    await AsyncStorage.setItem(OPEN_COUNT_KEY, String(count));

    const attempts = await getInt(ATTEMPT_COUNT_KEY);
    if (attempts >= MAX_ATTEMPTS) return;

    // The next attempt only fires once we reach its matching milestone.
    if (count < MILESTONES[attempts]) return;

    await tryRequestReview();
  } catch (e) {
    log.warn('In-app review skipped:', (e as Error)?.message);
  }
}

/**
 * Asks for a review right after a positive in-app moment (e.g. the user just
 * saw a great score for a spot). Higher intent than a raw launch count, and it
 * shares the same attempt budget so the user is never over-prompted. Requires a
 * minimum familiarity so brand-new users aren't interrupted.
 */
export async function requestReviewOnPositiveMoment(): Promise<void> {
  if (!StoreReview) return;
  try {
    const opens = await getInt(OPEN_COUNT_KEY);
    if (opens < MIN_OPENS_FOR_POSITIVE_MOMENT) return;
    await tryRequestReview();
  } catch (e) {
    log.warn('In-app review skipped:', (e as Error)?.message);
  }
}

/**
 * Same as requestReviewOnPositiveMoment, but after a short pause so the prompt
 * never covers the toast that confirms the user's action (favorite added,
 * session rated).
 */
export function requestReviewAfterAction(delayMs = 1500): void {
  setTimeout(() => { requestReviewOnPositiveMoment(); }, delayMs);
}
