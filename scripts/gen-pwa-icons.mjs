// Generates the PWA icon set into public/icons/ from the app icon.
// The source (assets/icon.png) is a centered wave mark on cream with wide
// margins, so it doubles safely as a maskable icon (content sits well inside
// the maskable safe zone). Run: node scripts/gen-pwa-icons.mjs
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const SRC = path.resolve('assets/icon.png');
const OUT = path.resolve('public/icons');
fs.mkdirSync(OUT, { recursive: true });

async function square(size, name) {
  await sharp(SRC).resize(size, size, { fit: 'cover' }).png().toFile(path.join(OUT, name));
  console.log('OK', name);
}

await square(192, 'icon-192.png');
await square(512, 'icon-512.png');
await square(180, 'apple-touch-icon.png');
console.log('PWA icons generated in public/icons/');
