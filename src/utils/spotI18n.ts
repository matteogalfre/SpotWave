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
  const tr = SPOT_DESCRIPTIONS[spot.id];
  if (!tr) return spot.description;
  // Only es/pt are translated; other locales (en/de/it/ja) use English.
  if (locale === 'es' || locale === 'pt') return tr[locale] ?? tr.en ?? spot.description;
  return tr.en ?? spot.description;
}

export function spotDangers(spot: SpotConfig, locale: Locale): string[] {
  if (locale === 'fr') return spot.dangers;
  const tr = SPOT_DANGERS[spot.id];
  if (!tr) return spot.dangers;
  if (locale === 'es' || locale === 'pt') return tr[locale] ?? tr.en ?? spot.dangers;
  return tr.en ?? spot.dangers;
}
