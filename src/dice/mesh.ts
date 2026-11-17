// three.js geometry of a die: a rounded body (flat faces, cylindrical edges, spherical corners) plus number decals.

import { BufferGeometry, Float32BufferAttribute } from 'three';
import { add, buildPoly, cross, dot, insetVerts, mul, norm, type Poly, type PolyKind, sub, type V3 } from './geometry';

const SEG = 3;
export const ROUND_FRAC = 0.07;

function slerp(a: V3, b: V3, t: number): V3 {
  const d = Math.max(-1, Math.min(1, dot(a, b)));
  const th = Math.acos(d);
  if (th < 1e-6) return a;
  const s = Math.sin(th);
  return add(mul(a, Math.sin((1 - t) * th) / s), mul(b, Math.sin(t * th) / s));
}

class Builder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];

  /** Adds a triangle, flipping its winding so the front side faces along the supplied normals. */
  tri(p: [V3, V3, V3], n: [V3, V3, V3]): void {
    const face = cross(sub(p[1], p[0]), sub(p[2], p[0]));
    const avg = add(add(n[0], n[1]), n[2]);
    const flip = dot(face, avg) < 0;
    const order = flip ? [0, 2, 1] : [0, 1, 2];
    for (const i of order) {
      this.pos.push(...p[i]);
      this.nor.push(...n[i]);
    }
  }

  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    if (this.uv.length) g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    return g;
  }
}

const bodyCache = new Map<PolyKind, BufferGeometry>();

/** Rounded body: the inset polyhedron swept by a sphere of radius r. */
export function bodyGeometry(kind: PolyKind): BufferGeometry {
  const hit = bodyCache.get(kind);
  if (hit) return hit;
  const poly = buildPoly(kind);
  const r = poly.radius * ROUND_FRAC;
  const S = insetVerts(poly, r);
  const b = new Builder();

  // Flat faces.
  for (const f of poly.faces) {
    const pts = f.verts.map((vi) => add(S[vi], mul(f.normal, r)));
    for (let i = 1; i < pts.length - 1; i++) b.tri([pts[0], pts[i], pts[i + 1]], [f.normal, f.normal, f.normal]);
  }

  // Edges: a cylindrical strip between the two faces that share the edge.
  const edgeFaces = new Map<string, number[]>();
  poly.faces.forEach((f, fi) => {
    f.verts.forEach((a, i) => {
      const c = f.verts[(i + 1) % f.verts.length];
      const key = a < c ? `${a}-${c}` : `${c}-${a}`;
      edgeFaces.set(key, [...(edgeFaces.get(key) ?? []), fi]);
    });
  });
  for (const [key, fs] of edgeFaces) {
    if (fs.length !== 2) continue;
    const [a, c] = key.split('-').map(Number);
    const n0 = poly.faces[fs[0]].normal;
    const n1 = poly.faces[fs[1]].normal;
    for (let k = 0; k < SEG; k++) {
      const na = slerp(n0, n1, k / SEG);
      const nb = slerp(n0, n1, (k + 1) / SEG);
      const p = (v: number, n: V3) => add(S[v], mul(n, r));
      b.tri([p(a, na), p(c, na), p(c, nb)], [na, na, nb]);
      b.tri([p(a, na), p(c, nb), p(a, nb)], [na, nb, nb]);
    }
  }

  // Corners: a spherical patch bounded by the arcs between the faces around the vertex.
  poly.verts.forEach((_, vi) => {
    const adj = poly.faces.filter((f) => f.verts.includes(vi));
    const axis = norm(poly.verts[vi]);
    const ref = Math.abs(axis[1]) < 0.9 ? ([0, 1, 0] as V3) : ([1, 0, 0] as V3);
    const e1 = norm(cross(axis, ref));
    const e2 = cross(axis, e1);
    adj.sort((p, q) => Math.atan2(dot(p.normal, e2), dot(p.normal, e1)) - Math.atan2(dot(q.normal, e2), dot(q.normal, e1)));
    const ring: V3[] = [];
    for (let i = 0; i < adj.length; i++) {
      const na = adj[i].normal;
      const nb = adj[(i + 1) % adj.length].normal;
      for (let k = 0; k < SEG; k++) ring.push(slerp(na, nb, k / SEG));
    }
    const centre = norm(adj.reduce((s, f) => add(s, f.normal), [0, 0, 0] as V3));
    for (let i = 0; i < ring.length; i++) {
      const n0 = ring[i];
      const n1 = ring[(i + 1) % ring.length];
      b.tri(
        [add(S[vi], mul(centre, r)), add(S[vi], mul(n0, r)), add(S[vi], mul(n1, r))],
        [centre, n0, n1],
      );
    }
  });

  const g = b.geometry();
  bodyCache.set(kind, g);
  return g;
}

const decalCache = new Map<string, BufferGeometry>();

/**
 * Number decals as one geometry: a quad per number laid just above the face, textured from an atlas of
 * `cols` x `rows` cells (value v lives in cell v - 1, counted left to right, top to bottom).
 */
export function decalGeometry(kind: PolyKind, cols: number, rows: number): BufferGeometry {
  const key = `${kind}|${cols}|${rows}`;
  const hit = decalCache.get(key);
  if (hit) return hit;
  const poly: Poly = buildPoly(kind);
  const lift = poly.radius * 0.006;
  const b = new Builder();
  for (const f of poly.faces) {
    for (const a of f.anchors) {
      const size = kind === 'd4' ? f.inradius * 1.25 : f.inradius * (kind === 'd6' ? 1.7 : kind === 'd10' ? 1.5 : 1.55);
      const half = size / 2;
      const up = a.up;
      const right = norm(cross(up, f.normal));
      const c = add(a.pos, mul(f.normal, lift));
      const p = (sx: number, sy: number): V3 => add(add(c, mul(right, sx * half)), mul(up, sy * half));
      const cell = a.label - 1;
      const cx = cell % cols;
      const cy = Math.floor(cell / cols);
      const u0 = cx / cols;
      const u1 = (cx + 1) / cols;
      const v1 = 1 - cy / rows;
      const v0 = 1 - (cy + 1) / rows;
      const corners: [V3, [number, number]][] = [
        [p(-1, -1), [u0, v0]],
        [p(1, -1), [u1, v0]],
        [p(1, 1), [u1, v1]],
        [p(-1, 1), [u0, v1]],
      ];
      for (const idx of [[0, 1, 2], [0, 2, 3]]) {
        const tri = idx.map((i) => corners[i]);
        const flip = dot(cross(sub(tri[1][0], tri[0][0]), sub(tri[2][0], tri[0][0])), f.normal) < 0;
        for (const i of flip ? [0, 2, 1] : [0, 1, 2]) {
          b.pos.push(...tri[i][0]);
          b.nor.push(...f.normal);
          b.uv.push(...tri[i][1]);
        }
      }
    }
  }
  const g = b.geometry();
  decalCache.set(key, g);
  return g;
}

