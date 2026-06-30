const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

/**
 * Pluggable crash/error reporter. A real backend (Sentry, Crashlytics…) can be
 * attached at app startup via `setCrashReporter` without touching any call site.
 * Until then, production errors are still surfaced to the platform log (visible
 * in `adb logcat` and, for fatal cases, the Play Console "Crashes & ANRs"),
 * instead of being silently swallowed like before.
 */
type CrashReporter = (message: string, args: unknown[]) => void;

let crashReporter: CrashReporter | null = null;

export function setCrashReporter(reporter: CrashReporter | null): void {
  crashReporter = reporter;
}

// Small ring buffer of the most recent errors. Useful for attaching context to a
// bug report / "send feedback" flow and for debugging without a live console.
const RECENT_ERROR_LIMIT = 50;
const recentErrors: { time: string; message: string }[] = [];

export function getRecentErrors(): { time: string; message: string }[] {
  return [...recentErrors];
}

function recordError(message: string, args: unknown[]): void {
  recentErrors.push({ time: new Date().toISOString(), message });
  if (recentErrors.length > RECENT_ERROR_LIMIT) recentErrors.shift();
  if (crashReporter) {
    try {
      crashReporter(message, args);
    } catch {
      // a failing reporter must never crash the app
    }
  }
}

export const log = {
  warn: (message: string, ...args: unknown[]) => {
    if (isDev) console.warn(`[SpotWave] ${message}`, ...args);
  },
  error: (message: string, ...args: unknown[]) => {
    // Always emit errors (dev AND prod) so they show up in device logs and can
    // be forwarded to a crash reporter. Warnings/info stay dev-only to keep
    // production logs clean.
    console.error(`[SpotWave] ${message}`, ...args);
    recordError(message, args);
  },
  info: (message: string, ...args: unknown[]) => {
    if (isDev) console.info(`[SpotWave] ${message}`, ...args);
  },
};
