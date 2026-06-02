import { SpotForecast } from '../types';

/**
 * Lightweight in-memory forecast store shared across screens.
 *
 * Forecasts are derived data (recomputed cheaply from the API cache), so they
 * live in a module-level singleton rather than React state: screens read the
 * latest snapshot synchronously (e.g. SpotDetail prev/next swipe) without
 * re-render coupling, and writes from any screen are immediately visible.
 */
let _forecasts: ReadonlyArray<SpotForecast> = [];

export function setStoredForecasts(f: SpotForecast[]) {
  _forecasts = Object.freeze([...f]);
}

export function getStoredForecasts(): SpotForecast[] {
  return [..._forecasts];
}
