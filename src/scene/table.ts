// The table: a felt surface and wooden rails, both textured from canvases drawn in code.

import { BoxGeometry, CanvasTexture, Group, Mesh, MeshStandardMaterial, PlaneGeometry, RepeatWrapping, SRGBColorSpace } from 'three';
import { TABLE } from '../sim/physics';

export const RAIL = 1.5;
export const RAIL_H = 1.5;

function noise(g: CanvasRenderingContext2D, w: number, h: number, count: number, alpha: number, light: boolean): void {
  for (let i = 0; i < count; i++) {
    const v = light ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 1.6, 1 + Math.random() * 1.6);
  }
}

function feltTexture(): CanvasTexture {
  const w = 1024;
  const h = Math.round((w * TABLE.d) / TABLE.w);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(w / 2, h / 2, h * 0.1, w / 2, h / 2, w * 0.62);
  grad.addColorStop(0, '#2c8a5b');
  grad.addColorStop(1, '#14513a');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  noise(g, w, h, 90000, 0.16, false);
  noise(g, w, h, 90000, 0.1, true);
  // Faint weave.
  g.globalAlpha = 0.05;
  g.strokeStyle = '#000';
  for (let x = 0; x < w; x += 3) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, h);
    g.stroke();
  }
  g.globalAlpha = 1;
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function woodTexture(): CanvasTexture {
  const w = 1024;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#6e4122');
  grad.addColorStop(0.5, '#7d4a28');
  grad.addColorStop(1, '#5d3419');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 160; i++) {
    const y = Math.random() * h;
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? '30,15,5' : '150,95,55'},${0.05 + Math.random() * 0.12})`;
    g.lineWidth = 0.5 + Math.random() * 1.8;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= w; x += 64) g.lineTo(x, y + Math.sin(x * 0.01 + i) * 2.5);
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export function buildTable(): Group {
  const group = new Group();
  const felt = new Mesh(
    new PlaneGeometry(TABLE.w + 0.2, TABLE.d + 0.2),
    new MeshStandardMaterial({ map: feltTexture(), roughness: 0.96, metalness: 0 }),
  );
  felt.rotation.x = -Math.PI / 2;
  felt.receiveShadow = true;
  group.add(felt);

  const wood = new MeshStandardMaterial({ map: woodTexture(), roughness: 0.55, metalness: 0.02 });
  const rail = (w: number, d: number, x: number, z: number) => {
    const m = new Mesh(new BoxGeometry(w, RAIL_H, d), wood);
    m.position.set(x, RAIL_H / 2 - 0.02, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  };
  const W = TABLE.w;
  const D = TABLE.d;
  rail(W + RAIL * 2, RAIL, 0, D / 2 + RAIL / 2);
  rail(W + RAIL * 2, RAIL, 0, -D / 2 - RAIL / 2);
  rail(RAIL, D, W / 2 + RAIL / 2, 0);
  rail(RAIL, D, -W / 2 - RAIL / 2, 0);
  return group;
}
