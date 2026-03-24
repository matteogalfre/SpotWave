import { SpotForecast } from '../types';

let _forecasts: ReadonlyArray<SpotForecast> = [];

export function setStoredForecasts(f: SpotForecast[]) {
  _forecasts = Object.freeze([...f]);
}

export function getStoredForecasts(): SpotForecast[] {
  return [..._forecasts];
}
