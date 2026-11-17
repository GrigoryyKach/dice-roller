// Checks the rendered geometry itself: for every die kind and every value, the numbers the player can read on the
// top of the die (decal quads of that value, transformed with three.js maths) really are the ones on top.
import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { buildPoly, FACE_COUNT, orientationFor, type PolyKind } from './geometry';
import { bodyGeometry, decalGeometry } from './mesh';

const KINDS: PolyKind[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];

function cellsFor(count: number): { cols: number; rows: number } {
  const cols = Math.ceil(Math.sqrt(count));
  return { cols, rows: Math.ceil(count / cols) };
}

describe('rendered dice', () => {
  it.each(KINDS)('%s: the value shown on top of the mesh matches the value read', (kind) => {
    const sides = FACE_COUNT[kind];
    const { cols, rows } = cellsFor(sides);
    const g = decalGeometry(kind, cols, rows);
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    const poly = buildPoly(kind);

    // Group triangles into numbers by atlas cell (the label printed there).
    const quads = new Map<number, { p: Vector3[]; n: Vector3 }[]>();
    for (let t = 0; t < pos.count; t += 3) {
      const u = (uv.getX(t) + uv.getX(t + 1) + uv.getX(t + 2)) / 3;
      const v = (uv.getY(t) + uv.getY(t + 1) + uv.getY(t + 2)) / 3;
      const cell = Math.floor(u * cols) + Math.floor((1 - v) * rows) * cols;
      const arr = quads.get(cell + 1) ?? [];
      arr.push({
        p: [0, 1, 2].map((k) => new Vector3(pos.getX(t + k), pos.getY(t + k), pos.getZ(t + k))),
        n: new Vector3(nor.getX(t), nor.getY(t), nor.getZ(t)),
      });
      quads.set(cell + 1, arr);
    }
    expect([...quads.keys()].sort((a, b) => a - b)).toEqual(Array.from({ length: sides }, (_, i) => i + 1));

    for (let value = 1; value <= sides; value++) {
      const [qx, qy, qz, qw] = orientationFor(poly, value, 1.1);
      const q = new Quaternion(qx, qy, qz, qw);
      const tris = quads.get(value)!;
      if (kind === 'd4') {
        // The number sits near the corner that points up: its decals are the highest ones on the die.
        const meanY = (label: number) => {
          const ts = quads.get(label)!;
          return ts.reduce((s, t) => s + t.p.reduce((a, p) => a + p.clone().applyQuaternion(q).y, 0) / 3, 0) / ts.length;
        };
        const mine = meanY(value);
        for (let other = 1; other <= sides; other++) if (other !== value) expect(mine).toBeGreaterThan(meanY(other));
      } else {
        for (const t of tris) expect(t.n.clone().applyQuaternion(q).y).toBeGreaterThan(0.999);
      }
    }
  });

  it.each(KINDS)('%s body mesh is closed and its normals point outwards', (kind) => {
    const g = bodyGeometry(kind);
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    expect(pos.count % 3).toBe(0);
    let bad = 0;
    for (let t = 0; t < pos.count; t += 3) {
      const a = new Vector3(pos.getX(t), pos.getY(t), pos.getZ(t));
      const b = new Vector3(pos.getX(t + 1), pos.getY(t + 1), pos.getZ(t + 1));
      const c = new Vector3(pos.getX(t + 2), pos.getY(t + 2), pos.getZ(t + 2));
      const face = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      const centre = a.clone().add(b).add(c).divideScalar(3);
      if (face.dot(centre) <= 0) bad++; // winding must face away from the centre of the die
      const n = new Vector3(nor.getX(t), nor.getY(t), nor.getZ(t));
      if (n.dot(centre) <= 0) bad++;
    }
    expect(bad).toBe(0);
  });
});
