// Detects likely duplicate spots in src/data/spots.ts by GPS proximity and/or
// normalized name. Read-only: prints groups so we can decide what to remove.
// Run: node tools/find-dup-spots.mjs
import fs from 'fs';
import path from 'path';

const SRC = path.resolve('src/data/spots.ts');
const text = fs.readFileSync(SRC, 'utf8');

// Split into per-spot windows: each spot object starts at an `id:` key. We take
// the text from one `id:` to the next to extract that object's fields.
const idRe = /id:\s*'([^']+)'/g;
const marks = [];
let m;
while ((m = idRe.exec(text)) !== null) marks.push({ id: m[1], start: m.index });

const spots = [];
for (let i = 0; i < marks.length; i++) {
  const start = marks[i].start;
  const end = i + 1 < marks.length ? marks[i + 1].start : text.length;
  const win = text.slice(start, end);
  const name = win.match(/name:\s*'([^']*)'/)?.[1] ?? '';
  const lat = parseFloat(win.match(/latitude:\s*(-?\d+(?:\.\d+)?)/)?.[1] ?? 'NaN');
  const lon = parseFloat(win.match(/longitude:\s*(-?\d+(?:\.\d+)?)/)?.[1] ?? 'NaN');
  const country = win.match(/country:\s*'([^']*)'/)?.[1] ?? '';
  const line = text.slice(0, start).split('\n').length;
  spots.push({ id: marks[i].id, name, lat, lon, country, line });
}

console.log(`Parsed ${spots.length} spots.\n`);

function haversine(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

const norm = (s) => s.toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\([^)]*\)/g, '')
  .replace(/[^a-z0-9]/g, '');

// Build duplicate groups: union spots that are within 4 km OR share a normalized
// name / one name contains the other.
const parent = spots.map((_, i) => i);
const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
const union = (a, b) => { parent[find(a)] = find(b); };

for (let i = 0; i < spots.length; i++) {
  for (let j = i + 1; j < spots.length; j++) {
    const a = spots[i], b = spots[j];
    let dup = false;
    if (Number.isFinite(a.lat) && Number.isFinite(b.lat)) {
      if (haversine(a, b) < 4) dup = true;
    }
    const na = norm(a.name), nb = norm(b.name);
    if (na && nb && (na === nb || (na.length > 4 && nb.length > 4 && (na.includes(nb) || nb.includes(na))))) {
      // Only treat name-match as dup if also reasonably close (< 60 km) to avoid
      // e.g. two different "Playa Grande" on opposite coasts.
      if (Number.isFinite(a.lat) && Number.isFinite(b.lat) && haversine(a, b) < 60) dup = true;
    }
    if (dup) union(i, j);
  }
}

const groups = new Map();
for (let i = 0; i < spots.length; i++) {
  const r = find(i);
  if (!groups.has(r)) groups.set(r, []);
  groups.get(r).push(spots[i]);
}

let n = 0;
for (const g of groups.values()) {
  if (g.length < 2) continue;
  n++;
  g.sort((a, b) => a.line - b.line);
  const d = haversine(g[0], g[g.length - 1]).toFixed(2);
  console.log(`── Group ${n} (max ${d} km apart)`);
  for (const s of g) {
    console.log(`   L${String(s.line).padStart(4)}  ${s.id.padEnd(38)} ${s.name}  [${s.country}]  (${s.lat}, ${s.lon})`);
  }
  console.log('');
}
console.log(`${n} duplicate group(s).`);
