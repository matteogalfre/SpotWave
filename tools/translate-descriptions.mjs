// Generator: translates FR spot descriptions + dangers into EN/ES/PT.
// Reads src/data/spots.ts (source of truth, FR) and updates
// src/data/spotDescriptions.ts.
//
// By default only spots missing from spotDescriptions.ts are translated, and
// every existing entry is kept byte for byte (hand fixes included).
//
// Usage:
//   node tools/translate-descriptions.mjs              missing spots only
//   ONLY='id-a,id-b' node tools/translate-descriptions.mjs
//                                                      retranslate these spots (after a FR edit)
//   FORCE=1 node tools/translate-descriptions.mjs      retranslate every spot
//   LIMIT=3 ...                                        stop after N spots (test run)
//   DRY=1 ...                                          print what would be translated, write nothing
//   PRUNE=1 ...                                        also drop entries whose spot left spots.ts
//
// HTTP goes through the curl binary, which honours HTTPS_PROXY. Node's own
// https client gets HTTP 429 from the Google endpoint whatever the headers.

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src', 'data', 'spots.ts');
const OUT = path.join(ROOT, 'src', 'data', 'spotDescriptions.ts');

const CURL = process.platform === 'win32' ? 'curl.exe' : 'curl';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;
const FORCE = process.env.FORCE === '1';
const DRY = process.env.DRY === '1';
const PRUNE = process.env.PRUNE === '1';
const ONLY = new Set((process.env.ONLY || '').split(',').map((s) => s.trim()).filter(Boolean));
const LANGS = ['en', 'es', 'pt'];

const unescapeSrc = (s) => s.replace(/\\(['"\\])/g, '$1');
const STR = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/;

function parseSpots(text) {
  // Cut the file at each `id:` so a spot without `dangers` can never shift the
  // dangers of the following spots onto the wrong id.
  const starts = [...text.matchAll(/\bid:\s*'([^']+)'/g)];
  return starts.map((m, i) => {
    const block = text.slice(m.index, starts[i + 1]?.index ?? text.length);
    const desc = block.match(new RegExp(`\\bdescription:\\s*(?:${STR.source})`));
    if (!desc) throw new Error(`No description for spot ${m[1]}`);
    const dang = block.match(/\bdangers:\s*\[([^\]]*)\]/);
    const dangers = dang
      ? [...dang[1].matchAll(new RegExp(STR.source, 'g'))].map((x) => unescapeSrc(x[1] ?? x[2] ?? ''))
      : [];
    return { id: m[1], description: unescapeSrc(desc[1] ?? desc[2] ?? ''), dangers };
  });
}

// ── existing output, kept as raw text per entry ─────────────────────────────

function readSection(text, name) {
  const m = text.match(new RegExp(`(export const ${name}[^=]*= )(\\{[\\s\\S]*?\\n\\});`));
  if (!m) throw new Error(`Section ${name} not found in ${OUT}`);
  const data = JSON.parse(m[2]);
  const raw = new Map();
  for (const e of m[2].matchAll(/\n {2}("(?:[^"\\]|\\.)*"): \{[\s\S]*?\n {2}\}/g)) {
    raw.set(JSON.parse(e[1]), e[0].slice(1));
  }
  if (raw.size !== Object.keys(data).length) {
    throw new Error(`${name}: ${raw.size} raw entries vs ${Object.keys(data).length} parsed, file layout changed`);
  }
  return { prefix: m[1], raw };
}

function formatEntry(id, value) {
  // Same layout as JSON.stringify(obj, null, 2), the format of the bulk of the file.
  return JSON.stringify({ [id]: value }, null, 2).split('\n').slice(1, -1).join('\n');
}

function buildSection(prefix, entries) {
  return prefix + '{\n' + entries.join(',\n') + '\n};';
}

// ── translation ─────────────────────────────────────────────────────────────

async function httpGet(url) {
  const { stdout } = await execFileAsync(
    CURL,
    ['-sS', '--max-time', '20', '-w', '\n%{http_code}', url],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  );
  const i = stdout.lastIndexOf('\n');
  return { status: parseInt(stdout.slice(i + 1), 10), body: stdout.slice(0, i) };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cache = new Map();

// Surf jargon protection. Each term is swapped for a no-space sentinel before
// MT (so the engine leaves it alone) then restored. `restore` may be a single
// string (English loanword used as-is in all langs) or a per-language map.
const PROTECT = [
  { term: 'beach break', token: 'ZZJARGONAAZZ', word: false, restore: 'beach break' },
  { term: 'shore break', token: 'ZZJARGONBBZZ', word: false, restore: 'shore break' },
  { term: 'point break', token: 'ZZJARGONCCZZ', word: false, restore: 'point break' },
  { term: 'reef break', token: 'ZZJARGONDDZZ', word: false, restore: 'reef break' },
  { term: 'big wave', token: 'ZZJARGONEEZZ', word: false, restore: 'big wave' },
  { term: 'offshore', token: 'ZZJARGONFFZZ', word: false, restore: 'offshore' },
  { term: 'onshore', token: 'ZZJARGONGGZZ', word: false, restore: 'onshore' },
  // Mediterranean wind names, otherwise rendered "rising" / "setting".
  { term: 'levante', token: 'ZZJARGONJJZZ', word: true, restore: 'levante' },
  { term: 'poniente', token: 'ZZJARGONKKZZ', word: true, restore: 'poniente' },
  // "pic(s)" = surf peak in FR, often mistranslated as "photo".
  { term: 'pics', token: 'ZZJARGONHHZZ', word: true, restore: { en: 'peaks', es: 'picos', pt: 'picos' } },
  { term: 'pic', token: 'ZZJARGONIIZZ', word: true, restore: { en: 'peak', es: 'pico', pt: 'pico' } },
];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Plain-FR rewrites of idioms the MT engine gets wrong, applied before MT.
const FR_NORMALIZE = [
  [/quand ça rentre/gi, 'quand la houle rentre'],
  [/quand ça marche/gi, 'quand les conditions sont bonnes'],
  [/quand ça envoie/gi, 'quand la houle est puissante'],
];

function normalizeFr(text) {
  let t = text;
  for (const [re, rep] of FR_NORMALIZE) t = t.replace(re, rep);
  return t;
}
function protectJargon(text) {
  let t = text;
  for (const { term, token, word } of PROTECT) {
    const pat = word ? `\\b${esc(term)}\\b` : esc(term);
    t = t.replace(new RegExp(pat, 'gi'), token);
  }
  return t;
}
function restoreJargon(text, tl) {
  let t = text;
  for (const { token, restore } of PROTECT) {
    const value = typeof restore === 'string' ? restore : restore[tl];
    t = t.replace(new RegExp(token, 'gi'), value);
  }
  return t;
}
// Capitalize the first letter and any letter after sentence punctuation.
function fixCaps(s) {
  if (!s) return s;
  let t = s.charAt(0).toUpperCase() + s.slice(1);
  t = t.replace(/([.!?]\s+)(\p{Ll})/gu, (_, p, c) => p + c.toUpperCase());
  return t;
}

async function rawTranslate(text, tl) {
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=fr&tl=' +
    tl +
    '&dt=t&q=' +
    encodeURIComponent(text);
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const { status, body } = await httpGet(url);
      if (status === 429 || status >= 500) {
        // Keep the reason, otherwise five 429 in a row end with `throw undefined`.
        lastErr = new Error(`HTTP ${status} after ${attempt + 1} attempt(s)`);
        await sleep(800 * (attempt + 1));
        continue;
      }
      if (status !== 200) throw new Error(`HTTP ${status}: ${body.slice(0, 120)}`);
      const json = JSON.parse(body);
      const out = (json[0] || []).map((seg) => seg[0]).join('');
      return out || text;
    } catch (e) {
      lastErr = e;
      await sleep(500 * (attempt + 1));
    }
  }
  throw new Error(`Translation to ${tl} failed for "${text.slice(0, 60)}": ${lastErr?.message ?? lastErr}`);
}

async function translate(text, tl) {
  const key = `${tl}::${text}`;
  if (cache.has(key)) return cache.get(key);
  const raw = await rawTranslate(protectJargon(normalizeFr(text)), tl);
  const result = fixCaps(restoreJargon(raw, tl).trim());
  cache.set(key, result);
  return result;
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  const spots = parseSpots(fs.readFileSync(SRC, 'utf8'));
  console.log(`Parsed ${spots.length} spots.`);

  const outText = fs.readFileSync(OUT, 'utf8');
  const desc = readSection(outText, 'SPOT_DESCRIPTIONS');
  const dang = readSection(outText, 'SPOT_DANGERS');

  const wanted = (s) =>
    FORCE || ONLY.has(s.id) || !desc.raw.has(s.id) || (s.dangers.length > 0 && !dang.raw.has(s.id));
  let todo = spots.filter(wanted);
  if (LIMIT !== Infinity) todo = todo.slice(0, LIMIT);

  const unknown = [...ONLY].filter((id) => !spots.some((s) => s.id === id));
  if (unknown.length) console.warn(`ONLY: unknown id(s) ignored: ${unknown.join(', ')}`);
  const known = new Set(spots.map((s) => s.id));
  const orphans = [...new Set([...desc.raw.keys(), ...dang.raw.keys()])].filter((id) => !known.has(id));
  if (orphans.length && !PRUNE) {
    console.warn(`Kept ${orphans.length} entr(y/ies) with no spot in spots.ts (PRUNE=1 drops them): ${orphans.join(', ')}`);
  }
  const pruning = PRUNE && orphans.length > 0;

  if (todo.length === 0 && !pruning) {
    console.log('Nothing to translate, spotDescriptions.ts is up to date.');
    return;
  }
  if (todo.length) console.log(`${todo.length} spot(s) to translate: ${todo.map((s) => s.id).join(', ')}`);
  if (pruning) console.log(`${orphans.length} orphan entr(y/ies) to drop: ${orphans.join(', ')}`);
  if (DRY) return;
  if (pruning) for (const id of orphans) { desc.raw.delete(id); dang.raw.delete(id); }

  let done = 0;
  for (const spot of todo) {
    // Pre-filled so the key order stays en/es/pt whatever request answers first.
    const d = Object.fromEntries(LANGS.map((l) => [l, '']));
    await Promise.all(LANGS.map(async (tl) => { d[tl] = await translate(spot.description, tl); }));
    desc.raw.set(spot.id, formatEntry(spot.id, d));

    if (spot.dangers.length) {
      const dd = Object.fromEntries(LANGS.map((l) => [l, []]));
      await Promise.all(
        LANGS.map(async (tl) => {
          const arr = [];
          for (const item of spot.dangers) arr.push(await translate(item, tl));
          dd[tl] = arr;
        }),
      );
      dang.raw.set(spot.id, formatEntry(spot.id, dd));
    } else {
      dang.raw.delete(spot.id);
    }

    done++;
    if (done % 20 === 0) console.log(`  ${done}/${todo.length}…`);
    await sleep(20);
  }

  // Map insertion order = existing entries in place, new spots appended.
  const header = outText.slice(0, outText.indexOf('export const SPOT_DESCRIPTIONS'));
  const body =
    buildSection(desc.prefix, [...desc.raw.values()]) +
    '\n\n' +
    buildSection(dang.prefix, [...dang.raw.values()]) +
    '\n';
  fs.writeFileSync(OUT, header + body, 'utf8');
  console.log(`Wrote ${OUT} (${desc.raw.size} descriptions, ${dang.raw.size} danger sets, ${done} spot(s) translated).`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
