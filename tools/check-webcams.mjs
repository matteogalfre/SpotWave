// Quick HTTP auditor for the webcam links in src/data/spots.ts.
// Extracts every `webcamUrl` (with the spot name + country just above it) and
// reports the final HTTP status after following redirects.
import { readFile } from 'node:fs/promises';

const file = new URL('../src/data/spots.ts', import.meta.url);
const text = await readFile(file, 'utf8');

// Walk the file line by line, remembering the most recent name/country so each
// webcamUrl can be attributed to its spot.
const lines = text.split(/\r?\n/);
let name = '';
let country = '';
const entries = [];
for (const line of lines) {
  const n = line.match(/name:\s*'([^']+)'/);
  if (n) name = n[1];
  const c = line.match(/country:\s*'([^']+)'/);
  if (c) country = c[1];
  const w = line.match(/webcamUrl:\s*'([^']+)'/);
  if (w) entries.push({ name, country, url: w[1] });
}

const onlyFrance = process.argv.includes('--fr');
const targets = onlyFrance ? entries.filter(e => e.country === 'France') : entries;

console.log(`Checking ${targets.length} webcam URLs${onlyFrance ? ' (France only)' : ''}...\n`);

async function check(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    let res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    return { status: res.status, finalUrl: res.url };
  } catch (e) {
    return { status: 0, error: e.name === 'AbortError' ? 'timeout' : (e.cause?.code || e.message) };
  } finally {
    clearTimeout(timer);
  }
}

const dead = [];
for (const e of targets) {
  const r = await check(e.url);
  const ok = r.status >= 200 && r.status < 400;
  const flag = ok ? 'OK ' : 'BAD';
  if (!ok) dead.push(e);
  const extra = r.error ? ` (${r.error})` : r.finalUrl && r.finalUrl !== e.url ? ` -> ${r.finalUrl}` : '';
  console.log(`${flag} ${String(r.status).padEnd(3)} [${e.country}] ${e.name}: ${e.url}${extra}`);
}

console.log(`\n=== ${dead.length} dead / ${targets.length} checked ===`);
for (const e of dead) console.log(`DEAD [${e.country}] ${e.name}: ${e.url}`);
