import type { MetadataRoute } from 'next';
import { getAllSpots } from '../lib/data';

const BASE = 'https://spotwave.fr';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const spots = getAllSpots().map((s) => ({
    url: `${BASE}/spots/${s.id}`,
    lastModified: now,
    changeFrequency: 'daily' as const,
    priority: 0.7,
  }));
  return [
    { url: BASE, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${BASE}/spots`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    ...spots,
  ];
}
