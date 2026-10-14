import { findTideExtrema, getNextTideExtrema, formatTideTime } from '../utils/tides';

describe('findTideExtrema', () => {
  it('detects a single sine-like tidal cycle', () => {
    // 24h sine wave from 0h to 23h, amplitude 1.5m, period 12.4h
    const times = Array.from({ length: 25 }, (_, i) =>
      `2025-03-10T${i.toString().padStart(2, '0')}:00`,
    );
    const seaLevel = times.map((_, i) => 1.5 * Math.sin((2 * Math.PI * i) / 12.4));

    const extrema = findTideExtrema(seaLevel, times);
    expect(extrema.length).toBeGreaterThanOrEqual(2);

    const highs = extrema.filter(e => e.type === 'high');
    const lows = extrema.filter(e => e.type === 'low');
    expect(highs.length).toBeGreaterThanOrEqual(1);
    expect(lows.length).toBeGreaterThanOrEqual(1);
    expect(Math.abs(highs[0].level)).toBeCloseTo(1.5, 0);
  });

  it('returns empty for arrays with fewer than 3 points', () => {
    expect(findTideExtrema([1, 2], ['2025-03-10T10:00', '2025-03-10T11:00'])).toEqual([]);
    expect(findTideExtrema([], [])).toEqual([]);
  });

  it('skips noise below the minimum amplitude threshold', () => {
    // tiny oscillation around 0.5m
    const times = Array.from({ length: 12 }, (_, i) =>
      `2025-03-10T${i.toString().padStart(2, '0')}:00`,
    );
    const seaLevel = times.map((_, i) => 0.5 + 0.02 * Math.sin(i));

    expect(findTideExtrema(seaLevel, times).length).toBe(0);
  });

  it('alternates high and low on a mixed tide (shallow "higher low")', () => {
    // Semi-diurnal + diurnal mix, as on the US west coast: the two lows of a
    // day differ a lot and one of them is shallow. The water barely moves in
    // the hours around that shallow low, and the old per-hour check dropped
    // it, listing two high tides back to back.
    const times = Array.from({ length: 48 }, (_, i) =>
      `2025-03-${(10 + Math.floor(i / 24)).toString().padStart(2, '0')}T${(i % 24).toString().padStart(2, '0')}:00`,
    );
    const seaLevel = times.map((_, i) =>
      0.5 * Math.cos((2 * Math.PI * i) / 12.42) + 0.45 * Math.cos((2 * Math.PI * (i - 3)) / 24.84),
    );
    const extrema = findTideExtrema(seaLevel, times);
    expect(extrema.length).toBeGreaterThanOrEqual(6);
    for (let k = 1; k < extrema.length; k++) {
      expect(extrema[k].type).not.toBe(extrema[k - 1].type);
    }
  });

  it('handles null values gracefully', () => {
    const times = Array.from({ length: 13 }, (_, i) =>
      `2025-03-10T${i.toString().padStart(2, '0')}:00`,
    );
    const seaLevel: (number | null)[] = [0, 0.5, 1, 1.5, 1.2, null, 0.5, 0, -0.5, -1, -0.5, 0, 0.5];

    // Should not throw and should return at least one extremum
    expect(() => findTideExtrema(seaLevel, times)).not.toThrow();
  });
});

describe('getNextTideExtrema', () => {
  it('filters to future extrema only', () => {
    const all = [
      { time: '2025-03-10T05:00', level: 1.2, type: 'high' as const, hourIndex: 5 },
      { time: '2025-03-10T11:00', level: -0.8, type: 'low' as const, hourIndex: 11 },
      { time: '2025-03-10T17:30', level: 1.4, type: 'high' as const, hourIndex: 17 },
    ];
    const from = new Date('2025-03-10T12:00');
    const next = getNextTideExtrema(all, from, 5);
    expect(next.map(e => e.time)).toEqual(['2025-03-10T17:30']);
  });
});

describe('formatTideTime', () => {
  it('extracts HH:MM from ISO', () => {
    expect(formatTideTime('2025-03-10T05:30')).toBe('05:30');
  });
});
