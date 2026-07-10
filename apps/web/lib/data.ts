import { SPOTS, SPOT_DESCRIPTIONS } from '@spotwave/core';
import type { SpotConfig, SurferLevel, BreakType } from '@spotwave/core';

export type { SpotConfig };

export function getAllSpots(): SpotConfig[] {
  return SPOTS;
}

export function getSpotBySlug(slug: string): SpotConfig | null {
  return SPOTS.find((s) => s.id === slug) ?? null;
}

export const LEVEL_LABEL: Record<SurferLevel, string> = {
  beginner: 'Débutant',
  intermediate: 'Intermédiaire',
  expert: 'Expert',
};

export const BREAK_LABEL: Record<BreakType, string> = {
  beach: 'Beach break',
  reef: 'Reef break',
  point: 'Point break',
};

export const TIDE_LABEL: Record<SpotConfig['optimalTide'], string> = {
  low: 'Marée basse',
  mid: 'Mi-marée',
  high: 'Marée haute',
  all: 'Toutes marées',
};

/** English description (falls back to the French source embedded on the spot). */
export function spotDescription(spot: SpotConfig): string {
  return spot.description || SPOT_DESCRIPTIONS[spot.id]?.en || '';
}

/** Spots grouped by country, countries sorted alphabetically. */
export function groupByCountry(spots: SpotConfig[]): { country: string; spots: SpotConfig[] }[] {
  const map = new Map<string, SpotConfig[]>();
  for (const s of spots) {
    const arr = map.get(s.country) ?? [];
    arr.push(s);
    map.set(s.country, arr);
  }
  return [...map.entries()]
    .map(([country, list]) => ({ country, spots: list.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.country.localeCompare(b.country));
}

/** A curated set of well-known spots for the homepage showcase. */
const FEATURED_IDS = [
  'nazare-praia-norte',
  'hossegor-la-graviere',
  'biarritz-cote-des-basques',
  'mundaka',
  'ericeira-ribeira-dilhas',
  'anglet-vvf',
  'lacanau-ocean',
  'peniche-supertubos',
  'la-torche',
  'taghazout-anchor-point',
  'raglan-manu-bay',
  'jeffreys-bay',
];

export function featuredSpots(limit = 12): SpotConfig[] {
  const byId = new Map(SPOTS.map((s) => [s.id, s] as const));
  const picked = FEATURED_IDS.map((id) => byId.get(id)).filter((s): s is SpotConfig => !!s);
  if (picked.length >= limit) return picked.slice(0, limit);
  // Top up with other spots that have a description so cards look full.
  const extra = SPOTS.filter((s) => !FEATURED_IDS.includes(s.id) && s.description).slice(0, limit - picked.length);
  return [...picked, ...extra].slice(0, limit);
}
