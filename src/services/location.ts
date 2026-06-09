import * as Location from 'expo-location';
import { SpotConfig } from '../types';

export interface UserLocation {
  latitude: number;
  longitude: number;
}

const LOCATION_TIMEOUT_MS = 8000;

export async function requestLocation(): Promise<UserLocation | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    // Fast path: a cached OS fix returns instantly when available.
    try {
      const last = await Location.getLastKnownPositionAsync();
      if (last) return { latitude: last.coords.latitude, longitude: last.coords.longitude };
    } catch {
      // ignore and fall through to a fresh fix
    }

    // Fresh fix, but never block the app forever: getCurrentPositionAsync can
    // hang indefinitely on a real device (slow/first GPS fix, indoors...). Cap
    // it so the UI can fall back to the global showcase and still load data.
    const loc = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>(resolve => setTimeout(() => resolve(null), LOCATION_TIMEOUT_MS)),
    ]);

    if (!loc) return null;
    return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
  } catch {
    return null;
  }
}

export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export function getSpotsInRadius(
  spots: SpotConfig[],
  userLat: number,
  userLon: number,
  radiusKm: number,
): (SpotConfig & { distance: number })[] {
  return spots
    .map((spot) => ({
      ...spot,
      distance: haversineDistance(userLat, userLon, spot.latitude, spot.longitude),
    }))
    .filter((s) => s.distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance);
}

export function getNearbySpotsWithFallback(
  spots: SpotConfig[],
  userLat: number,
  userLon: number,
  radiusKm = 200,
  minSpots = 5,
  maxRadius = 1000,
  maxSpots = 20,
): (SpotConfig & { distance: number })[] {
  let radius = radiusKm;
  let nearby = getSpotsInRadius(spots, userLat, userLon, radius);

  while (nearby.length < minSpots && radius < maxRadius) {
    radius = Math.min(radius * 1.5, maxRadius);
    nearby = getSpotsInRadius(spots, userLat, userLon, radius);
  }

  return nearby.slice(0, maxSpots);
}

export function getGlobalShowcase(spots: SpotConfig[], limit = 30): SpotConfig[] {
  const byCountry: Record<string, SpotConfig[]> = {};
  spots.forEach(s => {
    if (!byCountry[s.country]) byCountry[s.country] = [];
    byCountry[s.country].push(s);
  });
  const countries = Object.keys(byCountry).sort(
    (a, b) => byCountry[b].length - byCountry[a].length,
  );
  const result: SpotConfig[] = [];
  const used = new Set<string>();
  let round = 0;
  while (result.length < limit && round < 10) {
    for (const country of countries) {
      const pool = byCountry[country];
      if (round < pool.length && !used.has(pool[round].id)) {
        result.push(pool[round]);
        used.add(pool[round].id);
        if (result.length >= limit) break;
      }
    }
    round++;
  }
  return result;
}
