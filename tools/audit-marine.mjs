// Audit: flag spots whose Open-Meteo marine cell returns ALL-NULL wave data
// (usually means the coordinate landed on a land / unsupported grid cell, so
// the app can never load conditions there). Uses curl so the corporate proxy
// (HTTPS_PROXY env) is honored.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const src = readFileSync(new URL('../src/data/spots.ts', import.meta.url), 'utf8');

const re = /id:\s*'([^']+)'[\s\S]*?latitude:\s*(-?[\d.]+)\s*,\s*longitude:\s*(-?[\d.]+)/g;
const spots = [];
let m;
while ((m = re.exec(src)) !== null) {
  spots.push({ id: m[1], lat: parseFloat(m[2]), lon: parseFloat(m[3]) });
}
console.log(`Parsed ${spots.length} spots.`);

const BATCH = 80;
const bad = [];
for (let i = 0; i < spots.length; i += BATCH) {
  const slice = spots.slice(i, i + BATCH);
  const lats = slice.map(s => s.lat).join(',');
  const lons = slice.map(s => s.lon).join(',');
  const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}&hourly=wave_height&forecast_days=1`;
  let out;
  try {
    out = execFileSync('curl.exe', ['-s', '--max-time', '40', url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    console.error(`Batch ${i} request failed: ${e.message}`);
    continue;
  }
  let json;
  try { json = JSON.parse(out); } catch { console.error(`Batch ${i} parse failed`); continue; }
  const arr = Array.isArray(json) ? json : [json];
  arr.forEach((r, k) => {
    const spot = slice[k];
    const vals = r?.hourly?.wave_height ?? [];
    const nonNull = vals.filter(v => v != null).length;
    if (nonNull === 0) bad.push(spot);
  });
  process.stdout.write(`  checked ${Math.min(i + BATCH, spots.length)}/${spots.length}\r`);
}

console.log('\n--- ALL-NULL marine cells (conditions cannot load) ---');
if (bad.length === 0) console.log('None. All spots return marine data.');
else bad.forEach(s => console.log(`${s.id}  (${s.lat}, ${s.lon})`));
