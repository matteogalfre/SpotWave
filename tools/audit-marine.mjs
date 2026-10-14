// Audit: flag spots whose Open-Meteo marine cell returns ALL-NULL wave data
// (usually means the coordinate landed on a land / unsupported grid cell, so
// the app can never load conditions there). Uses curl so the corporate proxy
// (HTTPS_PROXY env) is honored.
//
// Exit code: 0 = every spot checked and returns data, 1 = bad cells found or
// some batches could not be checked (never reported as a clean pass).
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const CURL = process.platform === 'win32' ? 'curl.exe' : 'curl';
const src = readFileSync(new URL('../src/data/spots.ts', import.meta.url), 'utf8');

const re = /id:\s*'([^']+)'[\s\S]*?latitude:\s*(-?[\d.]+)\s*,\s*longitude:\s*(-?[\d.]+)/g;
const spots = [];
let m;
while ((m = re.exec(src)) !== null) {
  spots.push({ id: m[1], lat: parseFloat(m[2]), lon: parseFloat(m[3]) });
}
const idCount = (src.match(/\bid:\s*'/g) || []).length;
console.log(`Parsed ${spots.length} spots.`);
if (spots.length !== idCount) {
  console.error(`Warning: ${idCount} ids in spots.ts but ${spots.length} with coordinates parsed.`);
}

const BATCH = 80;
const bad = [];
const failed = []; // { from, to, reason }
let checked = 0;
for (let i = 0; i < spots.length; i += BATCH) {
  const slice = spots.slice(i, i + BATCH);
  const range = `${i + 1}-${i + slice.length}`;
  const lats = slice.map(s => s.lat).join(',');
  const lons = slice.map(s => s.lon).join(',');
  const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}&hourly=wave_height&forecast_days=1`;
  let json;
  try {
    const out = execFileSync(CURL, ['-sS', '--max-time', '40', url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    json = JSON.parse(out);
  } catch (e) {
    // curl's own stderr line, not the whole command line with its 80 coordinates.
    failed.push({ range, reason: String(e.stderr || e.message).trim().split('\n')[0] });
    continue;
  }
  const arr = Array.isArray(json) ? json : [json];
  // Open-Meteo answers errors (bad coordinate, rate limit) with { error, reason }.
  if (json?.error || arr.length !== slice.length) {
    failed.push({ range, reason: json?.reason ?? `${arr.length} results for ${slice.length} spots` });
    continue;
  }
  arr.forEach((r, k) => {
    const vals = r?.hourly?.wave_height ?? [];
    if (vals.filter(v => v != null).length === 0) bad.push(slice[k]);
  });
  checked += slice.length;
  process.stdout.write(`  checked ${checked}/${spots.length}\r`);
}

console.log('\n--- ALL-NULL marine cells (conditions cannot load) ---');
if (bad.length === 0) console.log(`None among the ${checked} spots checked.`);
else bad.forEach(s => console.log(`${s.id}  (${s.lat}, ${s.lon})`));

if (failed.length) {
  console.log(`\n--- NOT CHECKED: ${spots.length - checked} spot(s) in ${failed.length} failed batch(es) ---`);
  failed.forEach(f => console.log(`spots ${f.range}: ${f.reason}`));
}

process.exit(bad.length || failed.length ? 1 : 0);
