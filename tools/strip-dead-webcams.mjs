// Removes the `webcamUrl: '...'` lines from src/data/spots.ts for every URL the
// audit reported as a hard 404. Only 404s are stripped (transient errors,
// timeouts and 403 bot-blocks are kept, since those links usually work for real
// users). Run check-webcams.mjs first to (re)generate webcam-audit.log.
import { readFile, writeFile } from 'node:fs/promises';

const auditPath = new URL('../webcam-audit.log', import.meta.url);
const spotsPath = new URL('../src/data/spots.ts', import.meta.url);

const auditBuf = await readFile(auditPath);
// PowerShell's `>` redirect writes UTF-16LE; fall back to it when we see NUL bytes.
const audit = auditBuf.includes(0x00) ? auditBuf.toString('utf16le') : auditBuf.toString('utf8');
const deadUrls = new Set();
for (const line of audit.split(/\r?\n/)) {
  // Detailed lines look like: "BAD 404 [Country] Name: https://..."
  const m = line.match(/^BAD\s+404\s+.*?:\s+(https?:\/\/\S+)\s*$/);
  if (m) deadUrls.add(m[1]);
}

console.log(`Found ${deadUrls.size} unique dead (404) URLs to strip.`);

let spots = await readFile(spotsPath, 'utf8');
let removed = 0;

for (const url of deadUrls) {
  const esc = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Two layouts exist in spots.ts:
  //  1) own line:  `    webcamUrl: '<url>',`  (+ trailing newline)
  //  2) inline:    `..., webcamUrl: '<url>' },`  (preceded by a comma)
  const ownLine = new RegExp(`^[ \\t]*webcamUrl:\\s*'${esc}',?[ \\t]*\\r?\\n`, 'gm');
  const inline = new RegExp(`,[ \\t]*webcamUrl:\\s*'${esc}'`, 'g');

  let before = spots;
  spots = spots.replace(ownLine, '');
  if (spots !== before) { removed += (before.match(ownLine) || []).length; continue; }

  before = spots;
  spots = spots.replace(inline, '');
  if (spots !== before) { removed += (before.match(inline) || []).length; }
}

await writeFile(spotsPath, spots, 'utf8');
console.log(`Removed ${removed} webcamUrl line(s) from spots.ts.`);

// Sanity: report any remaining 404 URLs still present (should be none).
const stillThere = [...deadUrls].filter(u => spots.includes(`'${u}'`));
if (stillThere.length) {
  console.log('WARNING: still present:', stillThere);
}
