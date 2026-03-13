import { SpotForecast } from '../types';

let _forecasts: SpotForecast[] = [];

export function setStoredForecasts(f: SpotForecast[]) {
  _forecasts = f;
}

export function getStoredForecasts(): SpotForecast[] {
  return _forecasts;
}
