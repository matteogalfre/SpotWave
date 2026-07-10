// Patches the Expo web export (dist/index.html) with PWA metadata and a service
// worker registration. Expo's Metro web output uses a fixed HTML template with
// no head hook (this app doesn't use expo-router), so we inject after export.
// Run: node scripts/postbuild-web.mjs  (chained after `expo export -p web`).
import fs from 'fs';
import path from 'path';

const INDEX = path.resolve('dist/index.html');
if (!fs.existsSync(INDEX)) {
  console.error('postbuild-web: dist/index.html not found — run `expo export -p web` first.');
  process.exit(1);
}

let html = fs.readFileSync(INDEX, 'utf8');

if (html.includes('data-pwa-injected')) {
  console.log('postbuild-web: already injected, skipping.');
  process.exit(0);
}

// ── SEO ──────────────────────────────────────────────────────────────────
// The web export is a client-rendered SPA, so the biggest ranking levers are
// solid <head> metadata (title/description/canonical), rich social cards
// (Open Graph + Twitter) and JSON-LD structured data. The domain is .fr and
// the primary audience is French, so the static copy is French with locale
// alternates advertised for the other in-app languages.
const SITE_URL = 'https://spotwave.fr';
const OG_IMAGE = `${SITE_URL}/og-image.png`;
const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.spotwave.app';
const SITE_TITLE = 'SpotWave — Prévisions de surf : houle, vent & marées';
const SITE_DESC =
  'Prévisions de surf gratuites et sans pub : houle, vent et marées réunis dans un score de spot de 0 à 10. Plus de 350 spots dans le monde, carte interactive et alertes de bonnes conditions.';

const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      name: 'SpotWave',
      url: `${SITE_URL}/`,
      inLanguage: ['fr', 'en', 'es', 'pt', 'de', 'it', 'ja'],
    },
    {
      '@type': 'MobileApplication',
      name: 'SpotWave',
      operatingSystem: 'ANDROID, iOS, WEB',
      applicationCategory: 'SportsApplication',
      url: `${SITE_URL}/`,
      image: OG_IMAGE,
      description: SITE_DESC,
      downloadUrl: PLAY_URL,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    },
  ],
};

const HEAD_TAGS = `
    <meta data-pwa-injected="1" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="theme-color" content="#0E3F3C" />
    <meta name="description" content="${SITE_DESC}" />
    <meta name="keywords" content="prévisions surf, surf forecast, houle, swell, vent, marées, spots de surf, score de spot, surf report, conditions de surf" />
    <meta name="author" content="SpotWave" />
    <meta name="application-name" content="SpotWave" />
    <link rel="canonical" href="${SITE_URL}/" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="SpotWave" />
    <meta property="og:title" content="${SITE_TITLE}" />
    <meta property="og:description" content="${SITE_DESC}" />
    <meta property="og:url" content="${SITE_URL}/" />
    <meta property="og:image" content="${OG_IMAGE}" />
    <meta property="og:image:width" content="1024" />
    <meta property="og:image:height" content="500" />
    <meta property="og:locale" content="fr_FR" />
    <meta property="og:locale:alternate" content="en_US" />
    <meta property="og:locale:alternate" content="es_ES" />
    <meta property="og:locale:alternate" content="pt_PT" />
    <meta property="og:locale:alternate" content="de_DE" />
    <meta property="og:locale:alternate" content="it_IT" />
    <meta property="og:locale:alternate" content="ja_JP" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${SITE_TITLE}" />
    <meta name="twitter:description" content="${SITE_DESC}" />
    <meta name="twitter:image" content="${OG_IMAGE}" />
    <script type="application/ld+json">${JSON.stringify(JSON_LD)}</script>
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="SpotWave" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
    <style id="spotwave-viewport-fix">
      /* Expo's reset sizes html/body/#root with height:100%. On iOS Safari that
         resolves to a viewport that ignores the dynamic toolbars, so the app is
         too short and never fills the screen. Dynamic viewport units (dvh) track
         the actually-visible height and collapse/expand with the toolbars. */
      @supports (height: 100dvh) {
        html, body, #root { height: 100dvh; min-height: 100dvh; }
      }
      /* Match the app background so there's no white flash before React mounts
         and no white band revealed by iOS rubber-band overscroll. */
      html, body { background-color: #FBF8F2; }
      @media (prefers-color-scheme: dark) {
        html, body { background-color: #0B0F1A; }
      }
      html, body {
        overscroll-behavior: none;              /* kill iOS rubber-band bounce */
        -webkit-tap-highlight-color: transparent;/* no grey flash on tap */
        -webkit-text-size-adjust: 100%;          /* don't auto-inflate text in landscape */
        text-size-adjust: 100%;
      }
      /* Native-feeling touch: kill the 300ms delay and text callouts on chrome. */
      #root { -webkit-touch-callout: none; touch-action: manipulation; }
    </style>
`;

const SW_SCRIPT = `
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
          navigator.serviceWorker.register('/sw.js').catch(function () {});
        });
      }
    </script>
`;

// Add viewport-fit=cover so the app draws under notches / home indicator when
// installed to the home screen.
html = html.replace(
  /<meta name="viewport"[^>]*>/,
  '<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />',
);

// SEO: keyword-rich <title> and a language hint aligned with the .fr domain.
html = html.replace(/<title>[^<]*<\/title>/, `<title>${SITE_TITLE}</title>`);
if (/<html[^>]*\slang="[^"]*"/.test(html)) {
  html = html.replace(/(<html[^>]*\slang=)"[^"]*"/, '$1"fr"');
} else {
  html = html.replace(/<html/, '<html lang="fr"');
}

// Give non-JS crawlers real, indexable copy (the SPA renders nothing without JS).
const NOSCRIPT = `<noscript><h1>SpotWave — Prévisions de surf</h1><p>${SITE_DESC}</p><p><a href="${PLAY_URL}">Télécharger l'application Android sur Google Play</a></p></noscript>`;
if (/<noscript>[\s\S]*?<\/noscript>/.test(html)) {
  html = html.replace(/<noscript>[\s\S]*?<\/noscript>/, NOSCRIPT);
} else {
  html = html.replace(/<body([^>]*)>/, `<body$1>\n    ${NOSCRIPT}`);
}

html = html.replace('</head>', `${HEAD_TAGS}  </head>`);
html = html.replace('</body>', `${SW_SCRIPT}  </body>`);

fs.writeFileSync(INDEX, html);
console.log(
  'postbuild-web: injected PWA manifest, meta tags and service worker registration.',
);

// Emit _redirects and _headers so the SPA fallback + SW cache rules apply on
// ANY deploy path (Netlify Drop, direct API zip upload…), not only when
// Netlify reads netlify.toml at build time.
const DIST = path.resolve('dist');
fs.writeFileSync(
  path.join(DIST, '_redirects'),
  '/*    /index.html   200\n',
);
fs.writeFileSync(
  path.join(DIST, '_headers'),
  [
    '/sw.js',
    '  Cache-Control: public, max-age=0, must-revalidate',
    '/manifest.webmanifest',
    '  Content-Type: application/manifest+json',
    '',
  ].join('\n'),
);
console.log('postbuild-web: wrote dist/_redirects and dist/_headers.');

// robots.txt + sitemap.xml so search engines can crawl and index the site.
fs.writeFileSync(
  path.join(DIST, 'robots.txt'),
  ['User-agent: *', 'Allow: /', '', `Sitemap: ${SITE_URL}/sitemap.xml`, ''].join('\n'),
);
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(
  path.join(DIST, 'sitemap.xml'),
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <url>',
    `    <loc>${SITE_URL}/</loc>`,
    `    <lastmod>${today}</lastmod>`,
    '    <changefreq>daily</changefreq>',
    '    <priority>1.0</priority>',
    '  </url>',
    '</urlset>',
    '',
  ].join('\n'),
);
console.log('postbuild-web: wrote dist/robots.txt and dist/sitemap.xml.');
