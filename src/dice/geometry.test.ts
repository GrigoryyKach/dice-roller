import { describe, expect, it } from 'vitest';
import { buildPoly, dot, FACE_COUNT, flatness, len, orientationFor, type PolyKind, readValue, sub } from './geometry';

const KINDS: PolyKind[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];

describe('polyhedra', () => {
  it.each(KINDS)('%s has the right number of faces with unit outward normals', (kind) => {
    const p = buildPoly(kind);
    expect(p.faces).toHaveLength(FACE_COUNT[kind]);
    for (const f of p.faces) {
      expect(len(f.normal)).toBeCloseTo(1, 9);
      // Every vertex lies on or behind the face plane, and the normal points away from the centre.
      const d = dot(f.normal, p.verts[f.verts[0]]);
      expect(d).toBeGreaterThan(0);
      for (const v of p.verts) expect(dot(f.normal, v) - d).toBeLessThan(1e-6);
      // Face vertices are coplanar.
      for (const vi of f.verts) expect(Math.abs(dot(f.normal, p.verts[vi]) - d)).toBeLessThan(1e-6);
    }
  });

  it.each(KINDS.filter((k) => k !== 'd4'))('%s numbers every face once and opposite faces sum to sides + 1', (kind) => {
    const p = buildPoly(kind);
    const sides = FACE_COUNT[kind];
    expect(p.faces.map((f) => f.value).sort((a, b) => a - b)).toEqual(Array.from({ length: sides }, (_, i) => i + 1));
    for (const f of p.faces) {
      const o = p.faces.find((g) => dot(g.normal, f.normal) < -0.999)!;
      expect(f.value + o.value).toBe(sides + 1);
    }
  });

  it('d4 labels each vertex 1..4 and every face shows its three corners', () => {
    const p = buildPoly('d4');
    for (const f of p.faces) {
      expect(f.anchors.map((a) => a.label).sort()).toEqual(f.verts.map((v) => v + 1).sort());
      for (const a of f.anchors) expect(Math.abs(len(a.up) - 1)).toBeLessThan(1e-9);
    }
  });

  it.each(KINDS)('%s: placing a value on top reads back the same value, for every value', (kind) => {
    const p = buildPoly(kind);
    for (let v = 1; v <= FACE_COUNT[kind]; v++) {
      for (const yaw of [0, 0.7, 2.1, 4]) {
        const q = orientationFor(p, v, yaw);
        expect(readValue(p, q)).toBe(v);
        expect(flatness(p, q)).toBeGreaterThan(0.999);
      }
    }
  });

  it('every face anchor sits on its face plane and its up vector lies in the plane', () => {
    for (const kind of KINDS) {
      const p = buildPoly(kind);
      for (const f of p.faces) {
        const d = dot(f.normal, p.verts[f.verts[0]]);
        for (const a of f.anchors) {
          expect(Math.abs(dot(f.normal, a.pos) - d)).toBeLessThan(1e-6);
          expect(Math.abs(dot(f.normal, a.up))).toBeLessThan(1e-6);
        }
        expect(f.inradius).toBeGreaterThan(0.1);
      }
    }
  });

  it('circumradius matches the configured size', () => {
    for (const kind of KINDS) {
      const p = buildPoly(kind);
      const r = Math.max(...p.verts.map((v) => len(v)));
      expect(r).toBeCloseTo(p.radius, 9);
      expect(len(sub(p.verts[0], p.verts[0]))).toBe(0);
    }
  });
});

describe('rounded core', () => {
  it('inset vertices lie r inside every adjacent face plane', async () => {
    const { insetVerts } = await import('./geometry');
    for (const kind of KINDS) {
      const p = buildPoly(kind);
      const r = 0.07;
      const s = insetVerts(p, r);
      p.faces.forEach((f) => {
        const d = dot(f.normal, p.verts[f.verts[0]]) - r;
        for (const vi of f.verts) expect(Math.abs(dot(f.normal, s[vi]) - d)).toBeLessThan(1e-6);
      });
    }
  });
});
