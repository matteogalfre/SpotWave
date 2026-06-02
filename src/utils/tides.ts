// Tide extrema detection: finds local minima (low tide) and maxima (high tide)
// from an hourly sea_level_height_msl array, with parabolic interpolation to
// get sub-hourly precision on the timing.

export type TideType = 'high' | 'low';

export interface TideExtremum {
  time: string;        // ISO datetime of the peak (interpolated to ~5min precision)
  level: number;       // height in m (interpolated)
  type: TideType;
  hourIndex: number;   // index of the source hourly array
}

const MIN_AMPLITUDE_M = 0.10; // ignore micro-oscillations below 10cm

function parseIsoLocal(iso: string): Date {
  // Open-Meteo returns local time without timezone suffix, e.g. "2025-03-10T10:00".
  // We treat it as local so that the displayed hours match the spot's local time.
  return new Date(iso);
}

function formatIsoLocal(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Parabolic refinement around a 3-point extremum (in hour units, return offset
// relative to the centre index, between -0.5 and +0.5).
function parabolicOffset(yPrev: number, y: number, yNext: number): number {
  const denom = yPrev - 2 * y + yNext;
  if (Math.abs(denom) < 1e-9) return 0;
  const offset = 0.5 * (yPrev - yNext) / denom;
  // Clamp to [-1, +1] to avoid wild interpolation when curvature is tiny.
  return Math.max(-1, Math.min(1, offset));
}

function parabolicPeakValue(yPrev: number, y: number, yNext: number, offset: number): number {
  // Vertex of the fitted parabola y = y + 0.5 * (yNext - yPrev) * offset
  //                                  + 0.5 * (yNext - 2*y + yPrev) * offset^2
  return y + 0.5 * (yNext - yPrev) * offset + 0.5 * (yNext - 2 * y + yPrev) * offset * offset;
}

export function findTideExtrema(
  seaLevel: (number | null)[],
  times: string[],
): TideExtremum[] {
  const out: TideExtremum[] = [];
  const n = Math.min(seaLevel.length, times.length);
  if (n < 3) return out;

  let lastPeakIdx = -Infinity;
  // Tidal cycle ~6.2h: do not allow two extrema of the same type within 4h.
  const MIN_SAME_TYPE_GAP = 4;

  for (let i = 1; i < n - 1; i++) {
    const yPrev = seaLevel[i - 1];
    const y = seaLevel[i];
    const yNext = seaLevel[i + 1];
    if (yPrev == null || y == null || yNext == null) continue;

    const isMax = y >= yPrev && y > yNext;
    const isMin = y <= yPrev && y < yNext;
    if (!isMax && !isMin) continue;

    if (i - lastPeakIdx < MIN_SAME_TYPE_GAP) continue;

    const offset = parabolicOffset(yPrev, y, yNext);
    const peakLevel = parabolicPeakValue(yPrev, y, yNext, offset);

    // Validate amplitude vs neighbours to avoid noise around plateaus.
    const swing = Math.max(Math.abs(peakLevel - yPrev), Math.abs(peakLevel - yNext));
    if (swing < MIN_AMPLITUDE_M) continue;

    const base = parseIsoLocal(times[i]);
    if (Number.isNaN(base.getTime())) continue;

    const peakDate = new Date(base.getTime() + offset * 60 * 60 * 1000);

    out.push({
      time: formatIsoLocal(peakDate),
      level: Math.round(peakLevel * 100) / 100,
      type: isMax ? 'high' : 'low',
      hourIndex: i,
    });
    lastPeakIdx = i;
  }

  return out;
}

// Returns the next N extrema starting from a given reference date.
export function getNextTideExtrema(
  extrema: TideExtremum[],
  fromDate: Date,
  count: number = 4,
): TideExtremum[] {
  const fromMs = fromDate.getTime();
  return extrema
    .filter(e => parseIsoLocal(e.time).getTime() >= fromMs - 30 * 60 * 1000) // include events within 30min ago
    .slice(0, count);
}

// Convenience formatter — returns "HH:MM" of the extremum local time.
export function formatTideTime(iso: string): string {
  return iso.length >= 16 ? iso.slice(11, 16) : iso;
}
