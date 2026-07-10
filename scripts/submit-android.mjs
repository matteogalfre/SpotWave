/**
 * Automated Google Play submission (binary + localized release notes) to the
 * PRODUCTION track, status "completed" (auto-published, no manual validation).
 *
 * Why this exists: `eas submit` uploads the AAB but does NOT set the "What's new"
 * release notes. This script talks straight to the Google Play Developer API to
 * do both in one shot, reusing the same service-account key EAS already uses.
 *
 * Usage:
 *   npm run release:android -- --aab <path-or-https-url>
 *   npm run release:android -- --aab <url> --track internal   (override track)
 *   npm run release:android -- --aab <url> --status draft      (override status)
 *
 * If --aab is omitted it tries to grab the latest finished Android build from
 * `eas build:list`. Release notes are read from store/whatsnew/<locale>.txt
 * (filename = Play Store language code, e.g. fr-FR.txt, en-US.txt).
 *
 * Requires:
 *   - ./credentials/play-service-account.json (gitignored) with Play access
 *   - devDependency: googleapis
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { google } from 'googleapis';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY_PATH = path.join(ROOT, 'credentials', 'play-service-account.json');
const WHATSNEW_DIR = path.join(ROOT, 'store', 'whatsnew');
const PLAY_MAX_NOTE = 500;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { args[key] = next; i++; }
      else args[key] = true;
    }
  }
  return args;
}

function readAppConfig() {
  const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  const pkg = appJson?.expo?.android?.package;
  const versionName = appJson?.expo?.version;
  if (!pkg) throw new Error('Could not read expo.android.package from app.json');
  return { packageName: pkg, versionName };
}

function readReleaseNotes() {
  if (!fs.existsSync(WHATSNEW_DIR)) return [];
  const notes = [];
  for (const file of fs.readdirSync(WHATSNEW_DIR)) {
    if (!file.endsWith('.txt')) continue;
    const language = file.replace(/\.txt$/, '');
    let text = fs.readFileSync(path.join(WHATSNEW_DIR, file), 'utf8').trim();
    if (text.length > PLAY_MAX_NOTE) {
      console.warn(`⚠ ${file} is ${text.length} chars, truncating to ${PLAY_MAX_NOTE} (Play limit).`);
      text = text.slice(0, PLAY_MAX_NOTE);
    }
    if (text) notes.push({ language, text });
  }
  return notes;
}

async function resolveAabPath(arg) {
  let source = arg;

  // Fall back to the latest finished EAS Android build if no --aab was given.
  if (!source) {
    console.log('No --aab given, querying the latest finished EAS Android build...');
    try {
      const out = execSync(
        'npx eas build:list --platform android --status finished --limit 1 --json --non-interactive',
        { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
      );
      const builds = JSON.parse(out);
      source = builds?.[0]?.artifacts?.applicationArchiveUrl || builds?.[0]?.artifacts?.buildUrl;
      if (!source) throw new Error('No artifact URL found on the latest build.');
      console.log(`Using latest build artifact: ${source}`);
    } catch (e) {
      throw new Error(
        `Could not resolve an AAB automatically (${e.message}). Pass one explicitly: ` +
        `npm run release:android -- --aab <path-or-url>`,
      );
    }
  }

  // Local file → use as-is.
  if (!/^https?:\/\//i.test(source)) {
    if (!fs.existsSync(source)) throw new Error(`AAB file not found: ${source}`);
    return source;
  }

  // Remote URL → download to a temp file.
  console.log(`Downloading AAB from ${source} ...`);
  const res = await fetch(source);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const tmp = path.join(os.tmpdir(), `spotwave-${Date.now()}.aab`);
  fs.writeFileSync(tmp, buf);
  console.log(`Downloaded ${(buf.length / 1e6).toFixed(1)} MB → ${tmp}`);
  return tmp;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const track = args.track || 'production';
  const status = args.status || 'completed';

  if (!fs.existsSync(KEY_PATH)) {
    throw new Error(`Service account key not found at ${KEY_PATH}`);
  }

  const { packageName, versionName } = readAppConfig();
  const releaseNotes = readReleaseNotes();
  const aabPath = await resolveAabPath(args.aab);

  console.log('\n── Google Play submission ──');
  console.log(`  package : ${packageName}`);
  console.log(`  track   : ${track}`);
  console.log(`  status  : ${status}`);
  console.log(`  notes   : ${releaseNotes.map((n) => n.language).join(', ') || '(none)'}`);
  console.log('────────────────────────────\n');

  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_PATH,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  const play = google.androidpublisher({ version: 'v3', auth });

  const { data: edit } = await play.edits.insert({ packageName });
  const editId = edit.id;
  console.log(`Created edit ${editId}`);

  console.log('Uploading AAB...');
  const { data: bundle } = await play.edits.bundles.upload({
    packageName,
    editId,
    media: { mimeType: 'application/octet-stream', body: fs.createReadStream(aabPath) },
  });
  const versionCode = bundle.versionCode;
  console.log(`Uploaded versionCode ${versionCode}`);

  console.log(`Assigning to "${track}" (${status})...`);
  await play.edits.tracks.update({
    packageName,
    editId,
    track,
    requestBody: {
      track,
      releases: [
        {
          name: versionName ? `${versionName} (${versionCode})` : String(versionCode),
          status,
          versionCodes: [String(versionCode)],
          releaseNotes,
        },
      ],
    },
  });

  console.log('Committing edit...');
  await play.edits.commit({ packageName, editId });

  console.log(`\n✔ Done. versionCode ${versionCode} published to "${track}" (${status}).`);
}

main().catch((err) => {
  console.error('\n✖ Submission failed:', err?.errors ? JSON.stringify(err.errors, null, 2) : err?.message || err);
  process.exit(1);
});
