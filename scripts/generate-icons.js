const sharp = require('sharp');
const path = require('path');

const ACCENT = '#00D4AA';
const BG = '#0B0F1A';
const ASSETS = path.join(__dirname, '..', 'assets');

function waveSvg(size, bg, waveW, echoW, rx) {
  const cx = size / 2;
  const wave = `M${size * 0.08} ${cx} C${size * 0.24} ${size * 0.32}, ${size * 0.42} ${size * 0.32}, ${cx} ${cx} C${size * 0.58} ${size * 0.68}, ${size * 0.76} ${size * 0.68}, ${size * 0.92} ${cx}`;
  const echo = `M${size * 0.18} ${size * 0.64} C${size * 0.30} ${size * 0.52}, ${size * 0.42} ${size * 0.52}, ${cx} ${size * 0.64} C${size * 0.58} ${size * 0.76}, ${size * 0.70} ${size * 0.76}, ${size * 0.82} ${size * 0.64}`;
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  ${bg ? `<rect width="${size}" height="${size}" rx="${rx || 0}" fill="${BG}"/>` : ''}
  <path d="${wave}" stroke="${ACCENT}" stroke-width="${waveW}" stroke-linecap="round" fill="none"/>
  <path d="${echo}" stroke="${ACCENT}" stroke-width="${echoW}" stroke-linecap="round" fill="none" opacity="0.35"/>
</svg>`;
}

async function generate() {
  // icon.png — 1024x1024 with bg + rounded corners
  await sharp(Buffer.from(waveSvg(1024, true, 65, 28, 220)))
    .png().toFile(path.join(ASSETS, 'icon.png'));

  // adaptive-icon.png — 1024x1024, no bg, wave centered in safe zone
  await sharp(Buffer.from(waveSvg(1024, false, 60, 24, 0)))
    .png().toFile(path.join(ASSETS, 'adaptive-icon.png'));

  // splash-icon.png — 200x200
  await sharp(Buffer.from(waveSvg(200, false, 14, 6, 0)))
    .png().toFile(path.join(ASSETS, 'splash-icon.png'));

  // favicon.png — 48x48
  await sharp(Buffer.from(waveSvg(48, true, 5, 2, 10)))
    .png().toFile(path.join(ASSETS, 'favicon.png'));

  console.log('Icons generated in /assets');
}

generate().catch(console.error);
