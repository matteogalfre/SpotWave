// One-off generator: translates FR spot descriptions + dangers into EN/ES/PT.
// Reads src/data/spots.ts (source of truth, FR) and writes
// src/data/spotDescriptions.ts. Re-run only when descriptions change.
//
// Usage (with corporate proxy):
//   $env:HTTPS_PROXY='...'; node tools/translate-descriptions.mjs
//   Optional: $env:LIMIT='3' to test on the first N spots.

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { HttpsProxyAgent } from 'https-proxy-agent';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src', 'data', 'spots.ts');
const OUT = path.join(ROOT, 'src', 'data', 'spotDescriptions.ts');

const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;

const unescapeSrc = (s) => s.replace(/\\(['"\\])/g, '$1');

function parseSpots(text) {
  // Each spot object lists `id` before `description` before `dangers`.
  const idRe = /\bid:\s*'([^']+)'/g;
  const descRe = /\bdescription:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
  const dangRe = /\bdangers:\s*\[([^\]]*)\]/g;

  const ids = [...text.matchAll(idRe)].map((m) => m[1]);
  const descs = [...text.matchAll(descRe)].map((m) => unescapeSrc(m[1] ?? m[2] ?? ''));
  const dangs = [...text.matchAll(dangRe)].map((m) => {
    const inner = m[1];
    const items = [...inner.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)].map(
      (x) => unescapeSrc(x[1] ?? x[2] ?? '')
    );
    return items;
  });

  if (ids.length !== descs.length) {
    throw new Error(`Mismatch: ${ids.length} ids vs ${descs.length} descriptions`);
  }
  return ids.map((id, i) => ({ id, description: descs[i], dangers: dangs[i] ?? [] }));
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { agent, timeout: 20000 }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
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
  throw lastErr;
}

async function translate(text, tl) {
  const key = `${tl}::${text}`;
  if (cache.has(key)) return cache.get(key);
  const raw = await rawTranslate(protectJargon(normalizeFr(text)), tl);
  const result = fixCaps(restoreJargon(raw, tl).trim());
  cache.set(key, result);
  return result;
}

async function main() {
  const text = fs.readFileSync(SRC, 'utf8');
  let spots = parseSpots(text);
  console.log(`Parsed ${spots.length} spots.`);
  if (LIMIT !== Infinity) spots = spots.slice(0, LIMIT);

  const langs = ['en', 'es', 'pt'];
  const descOut = {};
  const dangOut = {};
  let done = 0;

  for (const spot of spots) {
    const d = { en: '', es: '', pt: '' };
    await Promise.all(langs.map(async (tl) => { d[tl] = await translate(spot.description, tl); }));
    descOut[spot.id] = d;

    if (spot.dangers.length) {
      const dd = { en: [], es: [], pt: [] };
      await Promise.all(
        langs.map(async (tl) => {
          const arr = [];
          for (const item of spot.dangers) arr.push(await translate(item, tl));
          dd[tl] = arr;
        })
      );
      dangOut[spot.id] = dd;
    }

    done++;
    if (done % 20 === 0) console.log(`  ${done}/${spots.length}…`);
    await sleep(20);
  }

  const header =
    '// AUTO-GENERATED by tools/translate-descriptions.mjs — do not edit by hand.\n' +
    '// Source of truth: src/data/spots.ts (French). Machine-assisted translation.\n\n';
  const body =
    'export const SPOT_DESCRIPTIONS: Record<string, { en: string; es: string; pt: string }> = ' +
    JSON.stringify(descOut, null, 2) +
    ';\n\n' +
    'export const SPOT_DANGERS: Record<string, { en: string[]; es: string[]; pt: string[] }> = ' +
    JSON.stringify(dangOut, null, 2) +
    ';\n';

  fs.writeFileSync(OUT, header + body, 'utf8');
  console.log(`Wrote ${OUT} (${Object.keys(descOut).length} descriptions, ${Object.keys(dangOut).length} danger sets).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
