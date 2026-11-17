// Draws the Dice Roller icon (a stylised D20 on a glossy navy plate, in the NIMVORO suite style) and writes:
//   assets/icon.png (512), assets/icon.ico (16..256), src-tauri/icons/*, and a preview sheet in .icon-preview/.
// Run with: npm run icon
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ───────────── geometry of the D20 (front view: hexagon outline + inner triangle) ─────────────
const C = { x: 256, y: 262 };
const R = 176;
const pt = (deg, r) => [C.x + r * Math.cos((deg * Math.PI) / 180), C.y + r * Math.sin((deg * Math.PI) / 180)];
const f = (p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
const outer = [-90, -30, 30, 90, 150, 210].map((a) => pt(a, R)); // top, upper-right, lower-right, bottom, lower-left, upper-left
const inner = [-90, 30, 150].map((a) => pt(a, R * 0.5)); // top, lower-right, lower-left

// Ten visible faces: the inner triangle, three triangles beside it and six along the outline.
const faces = [
  { pts: [inner[0], inner[1], inner[2]], fill: 'url(#fCenter)' },
  { pts: [inner[0], outer[1], inner[1]], fill: 'url(#fA)' },
  { pts: [inner[1], outer[3], inner[2]], fill: 'url(#fB)' },
  { pts: [inner[2], outer[5], inner[0]], fill: 'url(#fC)' },
  { pts: [inner[0], outer[0], outer[1]], fill: 'url(#fTop)' },
  { pts: [inner[0], outer[5], outer[0]], fill: 'url(#fTop2)' },
  { pts: [inner[1], outer[1], outer[2]], fill: 'url(#fA2)' },
  { pts: [inner[1], outer[2], outer[3]], fill: 'url(#fB2)' },
  { pts: [inner[2], outer[3], outer[4]], fill: 'url(#fB3)' },
  { pts: [inner[2], outer[4], outer[5]], fill: 'url(#fC2)' },
];

const centroid = [
  (inner[0][0] + inner[1][0] + inner[2][0]) / 3,
  (inner[0][1] + inner[1][1] + inner[2][1]) / 3,
];

const stops = (a, b) => `<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="plate" cx="0.5" cy="0.32" r="0.85">
      <stop offset="0" stop-color="#26397f"/><stop offset="0.55" stop-color="#121c4d"/><stop offset="1" stop-color="#090e2c"/>
    </radialGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5f86ff"/><stop offset="0.5" stop-color="#4f6bff"/><stop offset="1" stop-color="#8a5bff"/></linearGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.2"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="fCenter" x1="0" y1="0" x2="0" y2="1">${stops('#9fb2ff', '#5a6ff0')}</linearGradient>
    <linearGradient id="fA" x1="0" y1="0" x2="1" y2="1">${stops('#6d7ff5', '#4b45d0')}</linearGradient>
    <linearGradient id="fB" x1="0" y1="0" x2="0" y2="1">${stops('#5a5fe2', '#3a2fae')}</linearGradient>
    <linearGradient id="fC" x1="1" y1="0" x2="0" y2="1">${stops('#7f6bf6', '#5a43cf')}</linearGradient>
    <linearGradient id="fTop" x1="0" y1="0" x2="1" y2="1">${stops('#b7a4ff', '#7a63ee')}</linearGradient>
    <linearGradient id="fTop2" x1="1" y1="0" x2="0" y2="1">${stops('#8f9dff', '#5d6df0')}</linearGradient>
    <linearGradient id="fA2" x1="0" y1="0" x2="0" y2="1">${stops('#5b6ff0', '#3a3fc3')}</linearGradient>
    <linearGradient id="fB2" x1="0" y1="0" x2="1" y2="1">${stops('#4a4fd6', '#2c2699')}</linearGradient>
    <linearGradient id="fB3" x1="1" y1="0" x2="0" y2="1">${stops('#503fcf', '#2a2290')}</linearGradient>
    <linearGradient id="fC2" x1="1" y1="0" x2="0" y2="1">${stops('#6a5af0', '#3c31b4')}</linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9"/></filter>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.5"/></filter>
  </defs>

  <!-- plate with a glowing rim -->
  <rect x="14" y="14" width="484" height="484" rx="112" fill="url(#plate)"/>
  <rect x="14" y="14" width="484" height="484" rx="112" fill="none" stroke="url(#rim)" stroke-width="10" opacity="0.95"/>
  <rect x="26" y="26" width="460" height="460" rx="100" fill="none" stroke="#7e9bff" stroke-width="2" opacity="0.35"/>
  <path d="M40 150 C 40 84 84 40 150 40 L 362 40 C 428 40 472 84 472 150 C 400 118 112 118 40 150 Z" fill="url(#gloss)"/>

  <!-- die -->
  <ellipse cx="256" cy="458" rx="120" ry="14" fill="#04061a" opacity="0.55" filter="url(#soft)"/>
  <polygon points="${outer.map(f).join(' ')}" fill="#6f7dff" opacity="0.55" filter="url(#glow)"/>
  ${faces.map((fc) => `<polygon points="${fc.pts.map(f).join(' ')}" fill="${fc.fill}" stroke="#dfe6ff" stroke-width="5" stroke-linejoin="round"/>`).join('\n  ')}
  <polygon points="${outer.map(f).join(' ')}" fill="none" stroke="#f1f4ff" stroke-width="9" stroke-linejoin="round"/>

  <!-- numeral 20 drawn as strokes (no fonts needed) -->
  <g transform="translate(${centroid[0].toFixed(1)} ${(centroid[1] + 10).toFixed(1)}) scale(1.18)" fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M-30 -14 C-30 -30 -8 -30 -6 -14 C-5 -3 -28 6 -31 20 L-4 20"/>
    <ellipse cx="17" cy="-1" rx="11" ry="20"/>
  </g>

  <!-- sparkles -->
  <g stroke="#ffc83d" stroke-width="9" stroke-linecap="round">
    <path d="M404 92 l24 -20"/><path d="M430 128 l30 -8"/><path d="M84 112 l-22 -16"/>
  </g>
</svg>`;

// ───────────── output ─────────────
const render = (size) => new Resvg(svg, { fitTo: { mode: 'width', value: size }, font: { loadSystemFonts: false } }).render().asPng();

function ico(sizes) {
  const images = sizes.map((s) => ({ s, png: render(s) }));
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const dir = images.map(({ s, png }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(s >= 256 ? 0 : s, 0);
    e.writeUInt8(s >= 256 ? 0 : s, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
  });
  return Buffer.concat([head, ...dir, ...images.map((i) => i.png)]);
}

const put = (rel, data) => {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, data);
  console.log('wrote', rel);
};

put('assets/icon.png', render(512));
put('assets/icon.ico', ico([16, 24, 32, 48, 64, 128, 256]));
put('src-tauri/icons/icon.png', render(512));
put('src-tauri/icons/icon.ico', ico([16, 24, 32, 48, 64, 128, 256]));
put('src-tauri/icons/32x32.png', render(32));
put('src-tauri/icons/128x128.png', render(128));
put('src-tauri/icons/128x128@2x.png', render(256));

// Preview sheet: 256, 64, 32 and 16 px on light and dark backgrounds.
const sheet = (bg, y0) => {
  let x = 24;
  let out = `<rect x="0" y="${y0}" width="560" height="300" fill="${bg}"/>`;
  for (const s of [256, 64, 32, 16]) {
    const b64 = render(s).toString('base64');
    out += `<image x="${x}" y="${y0 + 24 + (256 - s) / 2}" width="${s}" height="${s}" href="data:image/png;base64,${b64}"/>`;
    x += s + 24;
  }
  return out;
};
const previewSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="600">${sheet('#f3f4f8', 0)}${sheet('#16181d', 300)}</svg>`;
put('.icon-preview/preview.png', new Resvg(previewSvg).render().asPng());
