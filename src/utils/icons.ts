import type { ComponentProps } from 'react';
import type { MaterialCommunityIcons } from '@expo/vector-icons';

export type MCIName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * Central mapping of the app's semantic concepts to MaterialCommunityIcons glyphs.
 * Using a single source of truth keeps icon usage consistent (and emoji-free)
 * across every screen. Icons from @expo/vector-icons render as <Text> glyphs, so
 * they can be used both standalone and inline inside a <Text> run.
 */
export const ICONS = {
  swell: 'waves',
  period: 'timer-sand',
  wind: 'weather-windy',
  gust: 'flash',
  seaTemp: 'thermometer',
  location: 'map-marker',
  webcam: 'video-outline',
  anchor: 'anchor',
  swellDir: 'compass-outline',
  swellArrow: 'arrow-up-bold',
  tideUp: 'arrow-up-bold',
  tideDown: 'arrow-down-bold',
  bell: 'bell',
  bellOutline: 'bell-outline',
  bellRing: 'bell-ring',
  bottom: 'image-filter-hdr',
  target: 'target',
  bestTime: 'clock-outline',
  flat: 'sleep',
  danger: 'alert',
  offline: 'wifi-off',
  sunrise: 'weather-sunset-up',
  sunset: 'weather-sunset-down',
  surf: 'surfing',
  bolt: 'lightning-bolt',
  surface: 'sine-wave',
  wetsuit: 'tshirt-crew-outline',
  uv: 'weather-sunny',
  rain: 'weather-pouring',
  cloud: 'weather-cloudy',
} as const;

export function scoreIcon(score: number): MCIName {
  if (score >= 8.0) return 'fire';
  if (score >= 6.5) return 'thumb-up';
  if (score >= 5.0) return 'thumb-up-outline';
  if (score >= 3.5) return 'emoticon-neutral-outline';
  if (score >= 2.0) return 'thumb-down-outline';
  return 'sleep';
}

export function weatherMCIcon(code: number): MCIName {
  if (code === 0) return 'weather-sunny';
  if (code <= 3) return 'weather-partly-cloudy';
  if (code <= 49) return 'weather-fog';
  if (code <= 59) return 'weather-partly-rainy';
  if (code <= 69) return 'weather-rainy';
  if (code <= 79) return 'weather-snowy';
  if (code <= 82) return 'weather-pouring';
  if (code <= 86) return 'weather-snowy-heavy';
  if (code <= 99) return 'weather-lightning-rainy';
  return 'weather-cloudy';
}
