// Removes confirmed duplicate spot objects from src/data/spots.ts by id.
// Each removed id is a redundant entry (same wave/name at ~same coords as a spot
// we keep — mostly bulk country-prefixed entries). Robust brace/string matching.
// Run: node tools/remove-dup-spots.mjs
import fs from 'fs';
import path from 'path';

const SRC = path.resolve('src/data/spots.ts');
let text = fs.readFileSync(SRC, 'utf8');

const REMOVE = [
  'usa-california-santa-cruz',
  'mexico-puerto-escondido',
  'mexico-puerto-escondido-zicatela',
  'fiji-restaurants',
  'fiji-tavarua',
  'nouvelle-zelande-raglan',
  'ireland-mullaghmore',
  'uk-thurso-east',
  'cloud-nine',
  'philippines-cloud-nine',
  'panama-santa-catalina',
  'australie-byron-the-pass',
  'australie-crescent-head',
  'usa-california-swamis',
  'irlande-lahinch',
  'equateur-montanita',
  'costa-rica-nosara',
  'bresil-praia-do-rosa',
  'argentine-mar-del-plata',
  'nouvelle-zelande-gisborne-makorori',
  'thailande-phuket-kata',
  'chine-hainan-riyue',
  'trestles-lowers',
  'huntington-pier',
  'malibu-first-point',
  'afrique-sud-cape-town-muizenberg',
  'afrique-sud-durban',
  'australie-western-australia-margarets',
  'sri-lanka-arugam-bay',
  'senegal-ngor-right',
  'capbreton-hossegor',
  'lacanau-ocean',
  'france-bretagne-la-torche',
  'espagne-galice-pantin',
  'canary-lanzarote-famara',
  'peru-punta-hermosa',
  'taiwan-jinzun',
];

function findObjectSpan(src, id) {
  const idIdx = src.indexOf(`id: '${id}'`);
  if (idIdx === -1) return null;
  // opening brace = nearest '{' before the id key (spot objects have no nested {})
  let open = src.lastIndexOf('{', idIdx);
  if (open === -1) return null;
  // forward brace match, string-aware
  let depth = 0, i = open, quote = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  let end = i; // just after closing }
  if (src[end] === ',') end++;
  // extend to whole line: back to line start, forward past newline
  const lineStart = src.lastIndexOf('\n', open) + 1;
  let lineEnd = src.indexOf('\n', end);
  if (lineEnd === -1) lineEnd = src.length; else lineEnd++;
  // only swallow the leading whitespace line if nothing but the object is there
  const before = src.slice(lineStart, open);
  const start = /^\s*$/.test(before) ? lineStart : open;
  return { start, end: lineEnd };
}

let removed = 0;
const missing = [];
for (const id of REMOVE) {
  const span = findObjectSpan(text, id);
  if (!span) { missing.push(id); continue; }
  text = text.slice(0, span.start) + text.slice(span.end);
  removed++;
}

fs.writeFileSync(SRC, text, 'utf8');
console.log(`Removed ${removed}/${REMOVE.length} duplicate spots.`);
if (missing.length) console.log('NOT FOUND:', missing.join(', '));
