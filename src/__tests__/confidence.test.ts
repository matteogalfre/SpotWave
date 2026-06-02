import { getConfidenceForDate } from '../utils/confidence';

describe('getConfidenceForDate', () => {
  const NOW = new Date('2025-03-10T12:00:00');

  it('returns high for the same day', () => {
    expect(getConfidenceForDate('2025-03-10T14:00', NOW)).toBe('high');
  });

  it('returns high for J+1', () => {
    expect(getConfidenceForDate('2025-03-11T12:00', NOW)).toBe('high');
  });

  it('returns medium for J+3', () => {
    expect(getConfidenceForDate('2025-03-13T12:00', NOW)).toBe('medium');
  });

  it('returns medium for J+5', () => {
    expect(getConfidenceForDate('2025-03-15T08:00', NOW)).toBe('medium');
  });

  it('returns low for J+7', () => {
    expect(getConfidenceForDate('2025-03-17T12:00', NOW)).toBe('low');
  });

  it('returns low for J+10', () => {
    expect(getConfidenceForDate('2025-03-20T12:00', NOW)).toBe('low');
  });

  it('returns high for invalid dates (defensive)', () => {
    expect(getConfidenceForDate('not-a-date', NOW)).toBe('high');
  });
});
