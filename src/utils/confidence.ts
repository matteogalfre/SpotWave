// Forecast confidence helpers
// Based on Open-Meteo GFS/ICON-EU degradation curve.
// J+0..J+2 = high, J+3..J+5 = medium, J+6+ = low.

export type ForecastConfidence = 'high' | 'medium' | 'low';

export function getConfidenceForDate(iso: string, now: Date = new Date()): ForecastConfidence {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return 'high';
  const diffMs = target.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 2.5) return 'high';
  if (diffDays < 5.5) return 'medium';
  return 'low';
}

export function confidenceLabel(c: ForecastConfidence, t: any): string {
  switch (c) {
    case 'high':
      return t.detailConfidenceHigh;
    case 'medium':
      return t.detailConfidenceMedium;
    case 'low':
      return t.detailConfidenceLow;
  }
}

export function confidenceColor(c: ForecastConfidence, colors: any): string {
  switch (c) {
    case 'high':
      return colors.accent;
    case 'medium':
      return colors.orange;
    case 'low':
      return colors.red;
  }
}
