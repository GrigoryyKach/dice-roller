// Number atlases drawn into a canvas (no image assets). One atlas per die kind, label style and number colour.

import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import type { PolyKind } from './geometry';

export type LabelStyle = 'numbers' | 'pips' | 'tens' | 'units';

const CELL = 192;
const FONT = '"Segoe UI", "Segoe UI Variable Display", Arial, sans-serif';

export interface Atlas {
  texture: CanvasTexture;
  cols: number;
  rows: number;
}

/** Text printed for face value `v` (1-based) of a die kind and style. */
export function labelFor(style: LabelStyle, v: number): string {
  if (style === 'tens') return String((v % 10) * 10).padStart(2, '0');
  if (style === 'units') return String(v % 10);
  return String(v);
}

const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.28, 0.28], [0.72, 0.72]],
  3: [[0.28, 0.28], [0.5, 0.5], [0.72, 0.72]],
  4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  5: [[0.28, 0.28], [0.72, 0.28], [0.5, 0.5], [0.28, 0.72], [0.72, 0.72]],
  6: [[0.28, 0.25], [0.72, 0.25], [0.28, 0.5], [0.72, 0.5], [0.28, 0.75], [0.72, 0.75]],
};

const cache = new Map<string, Atlas>();

export function atlasFor(kind: PolyKind, count: number, style: LabelStyle, color: string): Atlas {
  const key = `${kind}|${count}|${style}|${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * CELL;
  canvas.height = rows * CELL;
  const g = canvas.getContext('2d')!;
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = color;
  g.strokeStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let v = 1; v <= count; v++) {
    const cx = ((v - 1) % cols) * CELL;
    const cy = Math.floor((v - 1) / cols) * CELL;
    if (style === 'pips') {
      const r = CELL * 0.095;
      for (const [px, py] of PIPS[v] ?? []) {
        g.beginPath();
        g.arc(cx + px * CELL, cy + py * CELL, r, 0, Math.PI * 2);
        g.fill();
      }
      continue;
    }
    const text = labelFor(style, v);
    const size = text.length >= 2 ? CELL * 0.6 : CELL * 0.74;
    g.font = `700 ${size}px ${FONT}`;
    const x = cx + CELL / 2;
    const y = cy + CELL / 2 + CELL * 0.03;
    g.fillText(text, x, y);
    // 6 and 9 would be ambiguous upside down: underline them like real dice.
    if (style !== 'tens' && (text === '6' || text === '9' || text === '66' || text === '99')) {
      const w = g.measureText(text).width;
      g.fillRect(x - w * 0.4, y + size * 0.42, w * 0.8, CELL * 0.045);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  const atlas = { texture, cols, rows };
  cache.set(key, atlas);
  return atlas;
}

export function clearAtlasCache(): void {
  for (const a of cache.values()) a.texture.dispose();
  cache.clear();
}
