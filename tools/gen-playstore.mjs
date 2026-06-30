// Generates ALL Play Store graphic assets, "Deep Ocean" style, from the raw app
// captures in marketing/playstore/screens/<lang>/<lang>_<screen>.jpg
//
// Per language, outputs into marketing/playstore/out/<lang>/ :
//   - phone screenshots   1080x1920  (<n>_<screen>.png)
//   - tablet screenshots  1600x2844  (tablet/<n>_<screen>.png)  -> 7" & 10" slots
//   - feature graphic     1024x500   (feature.png, no alpha)    -> "Image de présentation"
//
// Run:  node tools/gen-playstore.mjs
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('marketing/playstore');
const SRC = path.join(ROOT, 'screens');
const OUT = path.join(ROOT, 'out');

// Base design space (all inner SVG coords). Outputs are rendered at target sizes
// via the root viewBox, keeping the ratio crisp.
const W = 1080, H = 1920;          // portrait master (9:16)
const LW = 1920, LH = 1080;        // landscape master (16:9)
const FEAT = { w: 1024, h: 500 };

// Portrait form factors (share one render, different output pixel size).
const PORTRAIT_OUTS = [
  { dir: 'phone',    w: 1080, h: 1920 },
  { dir: 'tablet7',  w: 1240, h: 2204 },
  { dir: 'tablet10', w: 1600, h: 2844 },
];
// Landscape form factors (16:9). Chromebook requires each side 1080–7680px,
// so it is rendered larger than XR (which allows 720–7680px).
const LANDSCAPE_OUTS = [
  { dir: 'chromebook', w: 2560, h: 1440 },
  { dir: 'xr',         w: 1920, h: 1080 },
];
const LAND_TILTS = [-5, 4, -6, 3, -3];

// Display order (strongest first — first visuals show in search results).
const ORDER = ['accueil', 'spot', 'carte', 'houle_vent', 'profil'];

// Shared "Deep Ocean" background (matches mockup-styles.html style B).
const BG = ['#0E3F3C', '#072A33'];
const TURQ = '#23C7C2', BLUE = '#1488B5', INK = '#0F3D3A';

const LAYOUTS = {
  accueil:    { tilt: -4, pw: 678, dx: 38,  phoneTop: 486, cap: 'top',    glow: [690, 820] },
  spot:       { tilt: 4,  pw: 672, dx: 0,   phoneTop: 492, cap: 'top',    glow: [520, 880] },
  carte:      { tilt: -6, pw: 684, dx: -22, phoneTop: 480, cap: 'top',    glow: [400, 900] },
  houle_vent: { tilt: 3,  pw: 662, dx: 18,  phoneTop: 92,  cap: 'bottom', glow: [600, 360] },
  profil:     { tilt: -2, pw: 668, dx: 0,   phoneTop: 492, cap: 'top',    glow: [540, 880], free: true },
};

const CAPTIONS = {
  fr: {
    accueil:    { h: ['Où surfer', "aujourd'hui ?"], s: 'La réponse en un coup d’œil' },
    spot:       { h: ['Un score clair,', 'sans prise de tête'], s: 'Tout compris en une note sur 10' },
    carte:      { h: ['375 spots', 'dans le monde'], s: 'Notés en temps réel' },
    houle_vent: { h: ['Houle, vent, marées', 'au même endroit'], s: 'Heure par heure' },
    profil:     { h: ['Tes recos,', 'à ton niveau'], s: 'Réglé en 10 secondes' },
    free: '100% gratuit',
    feat: { claim: 'Trouve où surfer aujourd’hui', tag: '375 spots · noté sur 10 · 100% gratuit' },
  },
  en: {
    accueil:    { h: ['Where to surf', 'today?'], s: 'The answer at a glance' },
    spot:       { h: ['A clear score,', 'no guesswork'], s: 'Everything in one 0–10 rating' },
    carte:      { h: ['375 spots', 'worldwide'], s: 'Rated in real time' },
    houle_vent: { h: ['Swell, wind, tides', 'in one place'], s: 'Hour by hour' },
    profil:     { h: ['Tuned to', 'your level'], s: 'Set up in 10 seconds' },
    free: '100% free',
    feat: { claim: 'Find where to surf today', tag: '375 spots · rated out of 10 · 100% free' },
  },
  es: {
    accueil:    { h: ['¿Dónde surfear', 'hoy?'], s: 'La respuesta de un vistazo' },
    spot:       { h: ['Una nota clara,', 'sin complicarte'], s: 'Todo en una nota de 0 a 10' },
    carte:      { h: ['375 spots', 'en el mundo'], s: 'Valorados en tiempo real' },
    houle_vent: { h: ['Olas, viento, mareas', 'en un solo lugar'], s: 'Hora a hora' },
    profil:     { h: ['A tu', 'nivel'], s: 'Listo en 10 segundos' },
    free: '100% gratis',
    feat: { claim: 'Descubre dónde surfear hoy', tag: '375 spots · nota sobre 10 · 100% gratis' },
  },
  pt: {
    accueil:    { h: ['Onde surfar', 'hoje?'], s: 'A resposta num relance' },
    spot:       { h: ['Uma nota clara,', 'sem complicação'], s: 'Tudo numa nota de 0 a 10' },
    carte:      { h: ['375 spots', 'no mundo'], s: 'Avaliados em tempo real' },
    houle_vent: { h: ['Ondulação, vento, marés', 'num só lugar'], s: 'Hora a hora' },
    profil:     { h: ['Ao teu', 'nível'], s: 'Pronto em 10 segundos' },
    free: '100% grátis',
    feat: { claim: 'Descobre onde surfar hoje', tag: '375 spots · nota de 0 a 10 · 100% grátis' },
  },
  de: {
    accueil:    { h: ['Wo heute', 'surfen?'], s: 'Die Antwort auf einen Blick' },
    spot:       { h: ['Eine klare Note,', 'ganz ohne Rätsel'], s: 'Alles in einer Bewertung von 0–10' },
    carte:      { h: ['375 Spots', 'weltweit'], s: 'In Echtzeit bewertet' },
    houle_vent: { h: ['Swell, Wind, Gezeiten', 'an einem Ort'], s: 'Stunde für Stunde' },
    profil:     { h: ['Auf dein', 'Level abgestimmt'], s: 'In 10 Sekunden eingerichtet' },
    free: '100% gratis',
    feat: { claim: 'Finde, wo du heute surfst', tag: '375 Spots · Bewertung von 0–10 · 100% gratis' },
  },
  it: {
    accueil:    { h: ['Dove surfare', 'oggi?'], s: 'La risposta in un colpo d’occhio' },
    spot:       { h: ['Una nota chiara,', 'senza pensieri'], s: 'Tutto in un voto da 0 a 10' },
    carte:      { h: ['375 spot', 'nel mondo'], s: 'Valutati in tempo reale' },
    houle_vent: { h: ['Swell, vento, maree', 'in un solo posto'], s: 'Ora per ora' },
    profil:     { h: ['Al tuo', 'livello'], s: 'Pronto in 10 secondi' },
    free: '100% gratis',
    feat: { claim: 'Scopri dove surfare oggi', tag: '375 spot · voto da 0 a 10 · 100% gratis' },
  },
  ja: {
    accueil:    { h: ['今日はどこで', 'サーフィン？'], s: 'ひと目でわかる答え' },
    spot:       { h: ['明確なスコアで', '迷わない'], s: 'すべてを0〜10の評価で' },
    carte:      { h: ['世界中の', '375スポット'], s: 'リアルタイムで評価' },
    houle_vent: { h: ['スウェル・風・潮汐', 'をまとめて'], s: '1時間ごと' },
    profil:     { h: ['あなたの', 'レベルに最適化'], s: '10秒で設定' },
    free: '100%無料',
    feat: { claim: '今日のサーフポイントを見つけよう', tag: '375スポット · 10点満点で評価 · 100%無料' },
  },
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Font stack with CJK fallbacks so Japanese caption/feature text renders (not tofu boxes).
const FONT = "Arial, 'Segoe UI', 'Yu Gothic UI', 'Yu Gothic', 'Meiryo', 'MS Gothic', sans-serif";

// Resize a screenshot to displayW and round its corners. Renders at a higher
// internal resolution so it stays crisp when the SVG is scaled up (tablets).
async function roundedShot(file, displayW) {
  const meta = await sharp(file).metadata();
  const ratio = meta.height / meta.width;
  const renderW = Math.min(meta.width, Math.round(displayW * 1.6));
  const renderH = Math.round(renderW * ratio);
  const rx = Math.round(48 * renderW / displayW);
  const resized = await sharp(file).resize(renderW, renderH).toBuffer();
  const mask = Buffer.from(
    `<svg width="${renderW}" height="${renderH}"><rect width="${renderW}" height="${renderH}" rx="${rx}" ry="${rx}" fill="#fff"/></svg>`
  );
  const png = await sharp(resized).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  return { b64: png.toString('base64'), w: displayW, h: Math.round(displayW * ratio) };
}

function waveMark(x, y, size) {
  const s = size / 48;
  return `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke-width="4" stroke-linecap="round">
    <path d="M7 22c5 0 5-5 10-5s5 5 10 5 5-5 10-5" stroke="${TURQ}"/>
    <path d="M7 30c5 0 5-5 10-5s5 5 10 5 5-5 10-5" stroke="${BLUE}"/>
  </g>`;
}

function defs() {
  return `<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.27" y2="1">
      <stop offset="0" stop-color="${BG[0]}"/><stop offset="1" stop-color="${BG[1]}"/>
    </linearGradient>
    <radialGradient id="top" cx="50%" cy="0%" r="80%">
      <stop offset="0" stop-color="#1C6A62" stop-opacity="0.30"/>
      <stop offset="0.6" stop-color="#155450" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${TURQ}" stop-opacity="0.30"/>
      <stop offset="0.6" stop-color="${TURQ}" stop-opacity="0.07"/>
      <stop offset="1" stop-color="${TURQ}" stop-opacity="0"/>
    </radialGradient>
    <filter id="sh" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="30"/></filter>
  </defs>`;
}

function caption(cap, anchor, startY) {
  const x = 88, lines = cap.h, lh = 92, hSize = 80;
  const blockH = lines.length * lh + 52;
  let y = anchor === 'bottom' ? (H - 64 - blockH) : (startY || 235);
  let s = '';
  lines.forEach((ln, i) => {
    s += `<text x="${x}" y="${y}" font-family="${FONT}" font-weight="800" font-size="${hSize}" letter-spacing="-1.5" fill="${i === 0 ? '#FFFFFF' : '#2FE0D4'}">${esc(ln)}</text>`;
    y += lh;
  });
  s += `<text x="${x + 2}" y="${y - lh + 60}" font-family="${FONT}" font-weight="500" font-size="37" fill="#A9E6E0">${esc(cap.s)}</text>`;
  return s;
}

function ratingBadge(text) {
  const h = 60, fs = 28, padX = 28;
  const tw = padX * 2 + Math.round(text.length * 15.5);
  const x = W - 88 - tw, y = 132;
  return `<rect x="${x}" y="${y}" width="${tw}" height="${h}" rx="${h / 2}" fill="#FFFFFF" opacity="0.97"/>
    <text x="${x + tw / 2}" y="${y + h / 2 + 10}" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="${fs}" fill="${INK}">${esc(text)}</text>`;
}

function phoneGroup(shot, L) {
  const cx = 540 + L.dx, x = Math.round(cx - shot.w / 2), y = L.phoneTop, PW = shot.w, PH = shot.h;
  return `<g transform="rotate(${L.tilt} ${cx} ${y + PH / 2})">
    <rect x="${x + 6}" y="${y + 30}" width="${PW}" height="${PH}" rx="48" fill="#000000" opacity="0.5" filter="url(#sh)"/>
    <image x="${x}" y="${y}" width="${PW}" height="${PH}" xlink:href="data:image/png;base64,${shot.b64}"/>
    <rect x="${x}" y="${y}" width="${PW}" height="${PH}" rx="48" fill="none" stroke="#FFFFFF" stroke-opacity="0.18" stroke-width="2"/>
  </g>`;
}

// Screenshot canvas (9:16). TW/TH set the output pixel size; inner coords use W/H.
function buildScreenshot(cap, badgeText, shot, L, TW, TH) {
  return Buffer.from(`<svg width="${TW}" height="${TH}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  ${defs()}
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#top)"/>
  <ellipse cx="${L.glow[0]}" cy="${L.glow[1]}" rx="760" ry="560" fill="url(#glow)"/>
  ${caption(cap, L.cap, 235)}
  ${badgeText ? ratingBadge(badgeText) : ''}
  ${phoneGroup(shot, L)}
</svg>`);
}

// Landscape screenshot (16:9) for Chromebook / Android XR: caption left, phone right.
// TW/TH set output pixel size; inner coords use the LW/LH design space.
function buildLandscape(cap, badgeText, shot, tilt, TW, TH) {
  const px = 1170, py = Math.round((LH - shot.h) / 2), cxp = px + shot.w / 2;
  const x = 132, lines = cap.h, lh = 100, hSize = 86;
  const blockH = lines.length * lh + 70;
  let y = Math.round((LH - blockH) / 2) + 74;
  let capSvg = '';
  lines.forEach((ln, i) => {
    capSvg += `<text x="${x}" y="${y}" font-family="${FONT}" font-weight="800" font-size="${hSize}" letter-spacing="-1.5" fill="${i === 0 ? '#FFFFFF' : '#2FE0D4'}">${esc(ln)}</text>`;
    y += lh;
  });
  capSvg += `<text x="${x + 2}" y="${y - lh + 64}" font-family="${FONT}" font-weight="500" font-size="40" fill="#A9E6E0">${esc(cap.s)}</text>`;
  let badge = '';
  if (badgeText) {
    // Left-aligned with the caption: the phone sits on the right and is drawn
    // after this, so a right-side badge would be hidden behind the screen.
    const bh = 64, fs = 30, padX = 30, tw = padX * 2 + Math.round(badgeText.length * 16.5), bx = x, by = 96;
    badge = `<rect x="${bx}" y="${by}" width="${tw}" height="${bh}" rx="${bh / 2}" fill="#FFFFFF" opacity="0.97"/>
      <text x="${bx + tw / 2}" y="${by + bh / 2 + 11}" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="${fs}" fill="${INK}">${esc(badgeText)}</text>`;
  }
  return Buffer.from(`<svg width="${TW}" height="${TH}" viewBox="0 0 ${LW} ${LH}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  ${defs()}
  <rect width="${LW}" height="${LH}" fill="url(#bg)"/>
  <ellipse cx="${cxp}" cy="540" rx="900" ry="760" fill="url(#glow)"/>
  ${capSvg}
  ${badge}
  <g transform="rotate(${tilt} ${cxp} ${py + shot.h / 2})">
    <rect x="${px + 6}" y="${py + 28}" width="${shot.w}" height="${shot.h}" rx="46" fill="#000000" opacity="0.5" filter="url(#sh)"/>
    <image x="${px}" y="${py}" width="${shot.w}" height="${shot.h}" xlink:href="data:image/png;base64,${shot.b64}"/>
    <rect x="${px}" y="${py}" width="${shot.w}" height="${shot.h}" rx="46" fill="none" stroke="#FFFFFF" stroke-opacity="0.18" stroke-width="2"/>
  </g>
</svg>`);
}

// Feature graphic 1024x500: brand mark + wordmark + claim on the left, phone right.
function buildFeature(cfg, shot) {
  const FW = FEAT.w, FH = FEAT.h;
  const px = 712, py = Math.round((FH - shot.h) / 2);
  const cxp = px + shot.w / 2;
  return Buffer.from(`<svg width="${FW}" height="${FH}" viewBox="0 0 ${FW} ${FH}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="${BG[0]}"/><stop offset="1" stop-color="${BG[1]}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${TURQ}" stop-opacity="0.34"/>
      <stop offset="0.65" stop-color="${TURQ}" stop-opacity="0.05"/>
      <stop offset="1" stop-color="${TURQ}" stop-opacity="0"/>
    </radialGradient>
    <filter id="sh" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="22"/></filter>
  </defs>
  <rect width="${FW}" height="${FH}" fill="url(#bg)"/>
  <ellipse cx="${cxp}" cy="250" rx="430" ry="360" fill="url(#glow)"/>
  <rect x="68" y="86" width="118" height="118" rx="26" fill="#000000" opacity="0.28" filter="url(#sh)"/>
  <rect x="64" y="80" width="118" height="118" rx="26" fill="#FBF2DF"/>
  ${waveMark(83, 99, 80)}
  <text x="210" y="160" font-family="${FONT}" font-weight="800" font-size="64" letter-spacing="-1" fill="#FFFFFF">SpotWave</text>
  <text x="72" y="280" font-family="${FONT}" font-weight="800" font-size="44" letter-spacing="-0.5" fill="#2FE0D4">${esc(cfg.feat.claim)}</text>
  <text x="74" y="340" font-family="${FONT}" font-weight="500" font-size="27" fill="#BfeAe5">${esc(cfg.feat.tag)}</text>
  <g transform="rotate(-6 ${cxp} ${py + shot.h / 2})">
    <rect x="${px + 5}" y="${py + 22}" width="${shot.w}" height="${shot.h}" rx="40" fill="#000000" opacity="0.5" filter="url(#sh)"/>
    <image x="${px}" y="${py}" width="${shot.w}" height="${shot.h}" xlink:href="data:image/png;base64,${shot.b64}"/>
    <rect x="${px}" y="${py}" width="${shot.w}" height="${shot.h}" rx="40" fill="none" stroke="#FFFFFF" stroke-opacity="0.18" stroke-width="2"/>
  </g>
</svg>`);
}

function writeGallery(langs) {
  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>SpotWave — Visuels Play Store</title>
<style>
  body{margin:0;background:#0B0F17;color:#E8EDF6;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:30px;}
  h1{font-size:22px;margin:0 0 4px;} p{color:#93A0B6;margin:0 0 24px;font-size:14px;}
  h2{font-size:16px;margin:34px 0 6px;text-transform:uppercase;letter-spacing:1px;color:#9FE0DA;}
  h3{font-size:12px;margin:16px 0 8px;color:#6f7d92;text-transform:uppercase;letter-spacing:1px;}
  .row{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;}
  .row img.s{height:340px;border-radius:14px;box-shadow:0 10px 28px rgba(0,0,0,.45);}
  .row img.l{width:420px;border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.45);}
  .row img.f{width:512px;border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.45);}
  .row img.ic{width:150px;border-radius:30px;box-shadow:0 10px 28px rgba(0,0,0,.45);}
</style></head><body>
<h1>SpotWave — Galerie Play Store (Deep Ocean)</h1>
<p>Par langue : image de présentation (1024×500) + captures Phone / 7" / 10" (portrait) + Chromebook / XR (paysage). Dossiers : out/&lt;langue&gt;/{phone,tablet7,tablet10,chromebook,xr}/</p>
<h2>Icône (512×512)</h2>
<div class="row"><img class="ic" src="icon.png" alt="icon"/></div>
<div id="root"></div>
<script>
const langs=${JSON.stringify(langs)};
const order=['1_accueil','2_spot','3_carte','4_houle_vent','5_profil'];
const root=document.getElementById('root');
function row(cls,base,sub){const r=document.createElement('div');r.className='row';for(const f of order){const im=document.createElement('img');im.className=cls;im.src=base+'/'+sub+'/'+f+'.png';im.loading='lazy';r.appendChild(im);}return r;}
for(const [l,name] of Object.entries(langs)){
  const h=document.createElement('h2');h.textContent=name;root.appendChild(h);
  let t=document.createElement('h3');t.textContent='Image de présentation (1024×500)';root.appendChild(t);
  const r0=document.createElement('div');r0.className='row';const fi=document.createElement('img');fi.className='f';fi.src=l+'/feature.png';fi.loading='lazy';r0.appendChild(fi);root.appendChild(r0);
  t=document.createElement('h3');t.textContent='Téléphone / Tablettes 7"·10" (portrait)';root.appendChild(t);root.appendChild(row('s',l,'phone'));
  t=document.createElement('h3');t.textContent='Chromebook / Android XR (paysage)';root.appendChild(t);root.appendChild(row('l',l,'chromebook'));
}
</script></body></html>`;
  fs.writeFileSync(path.join(OUT, 'gallery.html'), html);
}

async function main() {
  // Clean slate: remove any previous output (old flat files, stale folders).
  fs.rmSync(OUT, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 });

  let n = 0;
  for (const lang of Object.keys(CAPTIONS)) {
    const cfg = CAPTIONS[lang];
    for (const o of [...PORTRAIT_OUTS, ...LANDSCAPE_OUTS]) {
      fs.mkdirSync(path.join(OUT, lang, o.dir), { recursive: true });
    }

    for (let i = 0; i < ORDER.length; i++) {
      const screen = ORDER[i];
      const src = path.join(SRC, lang, `${lang}_${screen}.jpg`);
      if (!fs.existsSync(src)) { console.warn('MISSING', src); continue; }
      const L = LAYOUTS[screen];
      const badge = L.free ? cfg.free : null;
      const file = `${i + 1}_${screen}.png`;

      // Portrait: one render, written at each portrait form factor's pixel size.
      const shotP = await roundedShot(src, L.pw);
      for (const o of PORTRAIT_OUTS) {
        await sharp(buildScreenshot(cfg[screen], badge, shotP, L, o.w, o.h))
          .png().toFile(path.join(OUT, lang, o.dir, file));
        n++;
      }

      // Landscape: rendered natively at each form factor's pixel size.
      const shotL = await roundedShot(src, 560);
      for (const o of LANDSCAPE_OUTS) {
        await sharp(buildLandscape(cfg[screen], badge, shotL, LAND_TILTS[i], o.w, o.h))
          .png().toFile(path.join(OUT, lang, o.dir, file));
        n++;
      }
      console.log('OK', lang, file, '(phone, tablet7, tablet10, chromebook, xr)');
    }

    // Feature graphic (1024x500, flattened: no alpha as required by Google Play).
    const heroSrc = path.join(SRC, lang, `${lang}_accueil.jpg`);
    if (fs.existsSync(heroSrc)) {
      const heroShot = await roundedShot(heroSrc, 300);
      await sharp(buildFeature(cfg, heroShot)).flatten({ background: BG[1] }).png()
        .toFile(path.join(OUT, lang, 'feature.png'));
      n++;
      console.log('OK', lang, 'feature.png');
    }
  }

  // Store icon (512x512) — single, language-independent listing asset.
  const iconSrc = path.resolve('assets/icon.png');
  if (fs.existsSync(iconSrc)) {
    await sharp(iconSrc).resize(512, 512).png().toFile(path.join(OUT, 'icon.png'));
    n++;
    console.log('OK icon.png (512x512)');
  }

  const langNames = { fr: 'Français', en: 'English', es: 'Español', pt: 'Português', de: 'Deutsch', it: 'Italiano', ja: '日本語' };
  writeGallery(langNames);
  console.log(`\nDone: ${n} assets → ${path.relative(process.cwd(), OUT)} (gallery.html updated)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
