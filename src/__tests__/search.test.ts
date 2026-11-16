import SPOTS from '../data/spots';
import { searchSpots, fold } from '../utils/search';

describe('searchSpots', () => {
  it('ignores accents and case', () => {
    expect(fold('Málaga')).toBe('malaga');
    expect(searchSpots(SPOTS, 'malaga').some((s) => s.name.includes('Málaga'))).toBe(true);
  });

  it('puts a spot whose name starts with the query first', () => {
    expect(searchSpots(SPOTS, 'laga')[0].id).toBe('espagne-playa-de-laga');
  });

  it('finds a country in any app language', () => {
    for (const q of ['Espagne', 'Spain', 'España']) {
      expect(searchSpots(SPOTS, q).length).toBeGreaterThan(0);
    }
    expect(searchSpots(SPOTS, 'brasil').some((s) => s.country === 'Brésil')).toBe(true);
  });

  it('finds the November 2026 community spots', () => {
    expect(searchSpots(SPOTS, 'brevin')[0].id).toBe('france-saint-brevin-ermitage');
    expect(searchSpots(SPOTS, 'cotovelo')[0].id).toBe('bresil-cotovelo');
    expect(searchSpots(SPOTS, 'tabatinga')[0].id).toBe('bresil-tabatinga');
  });

  it('returns nothing for an empty query', () => {
    expect(searchSpots(SPOTS, '   ')).toEqual([]);
  });
});
