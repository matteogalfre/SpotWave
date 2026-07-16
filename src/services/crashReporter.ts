import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';
import { setCrashReporter, getRecentErrors, log } from '../utils/logger';

/**
 * Crash / error reporting.
 *
 * Two layers, both always on:
 *   1. Sentry (remote) — enabled automatically as soon as a DSN is provided
 *      (see below). No DSN → Sentry stays a no-op, nothing is sent.
 *   2. A zero-dependency local ring buffer persisted to AsyncStorage, so recent
 *      errors survive a crash + restart even with no backend / while offline
 *      (retrievable via {@link getPersistedCrashLog}).
 *
 * ENABLING SENTRY — nothing else to code, just supply the DSN one of two ways:
 *   • env: set `EXPO_PUBLIC_SENTRY_DSN` (e.g. in an EAS build secret / .env), or
 *   • app config: set `expo.extra.sentryDsn` in app.json.
 * For readable stack traces, the Sentry Expo config plugin (already added to
 * app.json) uploads source maps during EAS builds when `SENTRY_ORG`,
 * `SENTRY_PROJECT` and `SENTRY_AUTH_TOKEN` are present; without them the build
 * still succeeds (upload is simply skipped).
 */

const CRASH_LOG_KEY = '@spotwave_crash_log';
const MAX_ENTRIES = 30;

export interface CrashEntry {
  time: string;
  message: string;
}

function resolveDsn(): string | undefined {
  const fromEnv = process.env.EXPO_PUBLIC_SENTRY_DSN;
  const fromExtra = (Constants.expoConfig?.extra as { sentryDsn?: string } | undefined)?.sentryDsn;
  const dsn = (fromEnv || fromExtra || '').trim();
  return dsn.length > 0 ? dsn : undefined;
}

let sentryEnabled = false;

function initSentry(): void {
  const dsn = resolveDsn();
  if (!dsn) return;
  try {
    Sentry.init({
      dsn,
      // Keep it lean & privacy-friendly: crashes/errors only, no perf tracing,
      // don't attach PII. Bump these once a DSN is in place if you want more.
      tracesSampleRate: 0,
      sendDefaultPii: false,
      enabled: !__DEV__,
    });
    sentryEnabled = true;
  } catch (e) {
    log.warn('Sentry init failed:', e instanceof Error ? e.message : 'unknown');
  }
}

async function persistError(message: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CRASH_LOG_KEY);
    const list: CrashEntry[] = raw ? JSON.parse(raw) : [];
    list.push({ time: new Date().toISOString(), message });
    while (list.length > MAX_ENTRIES) list.shift();
    await AsyncStorage.setItem(CRASH_LOG_KEY, JSON.stringify(list));
  } catch {
    // Persisting a crash log must never itself crash the app.
  }
}

/** Wire the app's error pipeline. Call once, as early as possible. */
export function initCrashReporter(): void {
  initSentry();
  setCrashReporter((message, args) => {
    if (sentryEnabled) {
      try {
        const err = args.find((a) => a instanceof Error) as Error | undefined;
        Sentry.captureException(err ?? new Error(message));
      } catch {
        // Never let reporting throw into the caller (a log.error path).
      }
    }
    persistError(message);
  });
  log.info(`Crash reporter ready (Sentry ${sentryEnabled ? 'active' : 'inactive: no DSN'}, local persistence on)`);
}

/** Persisted (cross-restart) crash log, newest last. Useful for a feedback flow. */
export async function getPersistedCrashLog(): Promise<CrashEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(CRASH_LOG_KEY);
    const persisted: CrashEntry[] = raw ? JSON.parse(raw) : [];
    // Merge with the in-memory ring buffer (this session's errors not yet
    // guaranteed flushed) for a complete picture.
    return [...persisted, ...getRecentErrors()];
  } catch {
    return [];
  }
}

export async function clearPersistedCrashLog(): Promise<void> {
  await AsyncStorage.removeItem(CRASH_LOG_KEY).catch(() => {});
}

/** Re-exported so callers can wrap the root component: `export default sentryWrap(App)`. */
export const sentryWrap = Sentry.wrap;
