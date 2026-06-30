// One-off: regenerate app icon assets from the SpotWave "D1" brand mark
// (two stacked waves — turquoise on top, blue below) on a cream tile.
// Run: node tools/gen-icons.mjs
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(__dirname, '..', 'assets');

const CREAM = '#FBF2DF';
const TURQUOISE = '#23C7C2';
const BLUE = '#1488B5';

// The two wave paths from the D1 proposal (native 48x48 design space).
const WAVE_TOP = 'M7 22c5 0 5-5 10-5s5 5 10 5 5-5 10-5';
const WAVE_BOTTOM = 'M7 30c5 0 5-5 10-5s5 5 10 5 5-5 10-5';

// Build a square SVG that centers the mark at a given scale on an optional bg.
function markSvg({ size, scale, bg, stroke = 4 }) {
  // Native visual bbox (incl. stroke): x[5,39] w=34, y[14.5,32.5] h=18 → center (22, 23.5)
  const cx = 22;
  const cy = 23.5;
  const tx = size / 2 - cx * scale;
  const ty = size / 2 - cy * scale;
  const bgRect = bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : '';
  const sw = stroke;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${bgRect}
  <g transform="translate(${tx.toFixed(2)},${ty.toFixed(2)}) scale(${scale.toFixed(4)})">
    <path d="${WAVE_TOP}" stroke="${TURQUOISE}" stroke-width="${sw}" fill="none" stroke-linecap="round"/>
    <path d="${WAVE_BOTTOM}" stroke="${BLUE}" stroke-width="${sw}" fill="none" stroke-linecap="round"/>
  </g>
</svg>`;
}

async function render(svg, size, out) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(out);
  console.log('  ✓', out);
}

async function main() {
  // App icon: cream tile, mark fills ~62% width.
  const iconSize = 1024;
  const iconScale = (iconSize * 0.62) / 34; // 34 = native mark width
  await render(markSvg({ size: iconSize, scale: iconScale, bg: CREAM }), iconSize, join(ASSETS, 'icon.png'));

  // Android adaptive foreground: transparent, mark kept inside the ~66% safe zone.
  const adScale = (iconSize * 0.46) / 34;
  await render(markSvg({ size: iconSize, scale: adScale, bg: null }), iconSize, join(ASSETS, 'adaptive-icon.png'));

  // Splash: transparent mark (background color set in app.json), generous padding.
  const splashScale = (iconSize * 0.42) / 34;
  await render(markSvg({ size: iconSize, scale: splashScale, bg: null }), iconSize, join(ASSETS, 'splash-icon.png'));

  // Favicon: small cream tile.
  const favSize = 64;
  const favScale = (favSize * 0.68) / 34;
  await render(markSvg({ size: favSize, scale: favScale, bg: CREAM }), favSize, join(ASSETS, 'favicon.png'));

  console.log('Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
