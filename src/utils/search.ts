import { SpotConfig } from '../types';
import { countryNames } from './countries';

/** Lowercase without accents, so « malaga » finds « Málaga » and « brasil » finds « Brésil ». */
export const fold = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Spots matching the query, best matches first: a name word starting with the
 * query, then the name containing it, then the region or country (in any of
 * the app languages: « Spain », « España » and « Espagne » all work).
 */
export function searchSpots(spots: SpotConfig[], query: string, limit = 15): SpotConfig[] {
  const q = fold(query);
  if (!q) return [];
  const ranked: { spot: SpotConfig; rank: number }[] = [];
  spots.forEach((spot) => {
    const name = fold(spot.name);
    let rank = -1;
    if (name.split(/[^a-z0-9]+/).some((w) => w.startsWith(q))) rank = 0;
    else if (name.includes(q)) rank = 1;
    else if (fold(spot.region).includes(q)) rank = 2;
    else if (countryNames(spot.country).some((c) => fold(c).includes(q))) rank = 3;
    if (rank >= 0) ranked.push({ spot, rank });
  });
  return ranked.sort((a, b) => a.rank - b.rank).slice(0, limit).map((r) => r.spot);
}
