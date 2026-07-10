import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SpotWave — Prévisions de surf',
    short_name: 'SpotWave',
    description: 'Prévisions de surf notées sur 10 : houle, vent, marée et le meilleur créneau du jour.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#082830',
    theme_color: '#0e3a45',
    lang: 'fr',
    categories: ['sports', 'weather', 'travel'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
