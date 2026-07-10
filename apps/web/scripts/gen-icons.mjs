// Generates the web/PWA icons from the app's master icon.
// Run from the repo root: `node apps/web/scripts/gen-icons.mjs`
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const repoRoot = path.resolve(webRoot, '..', '..');
const src = path.join(repoRoot, 'assets', 'icon.png');

const publicDir = path.join(webRoot, 'public');
const appDir = path.join(webRoot, 'app');
fs.mkdirSync(publicDir, { recursive: true });

const targets = [
  { size: 192, file: path.join(publicDir, 'icon-192.png') },
  { size: 512, file: path.join(publicDir, 'icon-512.png') },
  { size: 180, file: path.join(appDir, 'apple-icon.png') },
  { size: 256, file: path.join(appDir, 'icon.png') },
];

await Promise.all(
  targets.map(({ size, file }) => sharp(src).resize(size, size).png().toFile(file)),
);

console.log('web icons generated:', targets.map((t) => path.basename(t.file)).join(', '));
