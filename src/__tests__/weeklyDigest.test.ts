import { nextDigestDate, pickWeeklyBest, buildDigestContent, spotHourToMs, DIGEST_HOUR } from '../utils/weeklyDigest';
import { SpotForecast } from '../types';

const cond = (time: string, score: number) => ({ time, score, swellHeight: 1.2 } as any);
const fc = (id: string, name: string, hours: any[], offset = 0): SpotForecast =>
  ({ spot: { id, name } as any, hourlyConditions: hours, utcOffsetSeconds: offset } as any);

describe('nextDigestDate', () => {
  it('lands on the next Sunday evening', () => {
    const d = nextDigestDate(new Date(2026, 10, 16, 9, 0)); // Monday 16 Nov 2026
    expect(d.getDay()).toBe(0);
    expect(d.getHours()).toBe(DIGEST_HOUR);
    expect(d.getDate()).toBe(22);
  });
  it('skips to next week when Sunday evening has passed', () => {
    const d = nextDigestDate(new Date(2026, 10, 22, 19, 0)); // Sunday 19h
    expect(d.getDate()).toBe(29);
  });
});

describe('pickWeeklyBest', () => {
  const from = spotHourToMs('2026-11-22T18:00', 0);
  const to = from + 7 * 24 * 3600 * 1000;
  const a = fc('a', 'Spot A', [cond('2026-11-24T10:00', 7.5), cond('2026-11-24T23:00', 9)]);
  const b = fc('b', 'Spot B', [cond('2026-11-25T09:00', 8)]);

  it('prefers favorites and ignores night hours', () => {
    const best = pickWeeklyBest([a, b], ['a'], from, to);
    expect(best?.forecast.spot.id).toBe('a');
    expect(best?.cond.score).toBe(7.5);
  });
  it('uses every spot when no favorite is loaded', () => {
    expect(pickWeeklyBest([a, b], [], from, to)?.forecast.spot.id).toBe('b');
  });
  it('returns null when nothing is worth it', () => {
    expect(pickWeeklyBest([fc('c', 'C', [cond('2026-11-24T10:00', 3)])], [], from, to)).toBeNull();
  });
  it('builds a localized message with the weekday', () => {
    const best = pickWeeklyBest([a], ['a'], from, to)!;
    expect(buildDigestContent(best, 'fr').body).toContain('mardi vers 10h');
    expect(buildDigestContent(best, 'en').body).toContain('Tuesday around 10h');
  });
});
