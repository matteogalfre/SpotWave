import { SpotConfig } from '../types';
import { Locale } from '../i18n';
import { SPOT_DESCRIPTIONS, SPOT_DANGERS } from '../data/spotDescriptions';

/**
 * Spot descriptions/dangers are authored in French in `spots.ts`. Translations
 * for the other languages are machine-assisted and stored in
 * `spotDescriptions.ts`. We fall back to the French source if a translation is
 * missing for any reason.
 */
export function spotDescription(spot: SpotConfig, locale: Locale): string {
  if (locale === 'fr') return spot.description;
  return SPOT_DESCRIPTIONS[spot.id]?.[locale] ?? spot.description;
}

export function spotDangers(spot: SpotConfig, locale: Locale): string[] {
  if (locale === 'fr') return spot.dangers;
  return SPOT_DANGERS[spot.id]?.[locale] ?? spot.dangers;
}
