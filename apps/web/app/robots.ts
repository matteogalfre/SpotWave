import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: 'https://spotwave.fr/sitemap.xml',
    host: 'https://spotwave.fr',
  };
}
