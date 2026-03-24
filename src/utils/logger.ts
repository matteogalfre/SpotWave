const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

export const log = {
  warn: (message: string, ...args: unknown[]) => {
    if (isDev) console.warn(`[SpotWave] ${message}`, ...args);
  },
  error: (message: string, ...args: unknown[]) => {
    if (isDev) console.error(`[SpotWave] ${message}`, ...args);
    // TODO: integrate crash reporting service (e.g. Sentry) for production
  },
  info: (message: string, ...args: unknown[]) => {
    if (isDev) console.info(`[SpotWave] ${message}`, ...args);
  },
};
