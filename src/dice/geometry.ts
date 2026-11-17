// Pure polyhedron math for the six physical dice: vertices, faces, face numbering and the "which face is up" rule.
// No three.js here, so it is shared by the renderer, the physics worker and the unit tests.

export type V3 = [number, number, number];
export type PolyKind = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20';
export type Quat = [number, number, number, number]; // x, y, z, w

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Rotates a vector by a unit quaternion. */
export function rotate(q: Quat, v: V3): V3 {
  const [x, y, z, w] = q;
  const t = mul(cross([x, y, z], v), 2);
  return add(add(v, mul(t, w)), cross([x, y, z], t));
}

export interface Face {
  /** Vertex indices, counter-clockwise seen from outside. */
  verts: number[];
  normal: V3;
  /** Area centroid of the polygon. */
  center: V3;
  /** Value printed on the face (1-based). Unused by the d4, whose faces carry vertex numbers instead. */
  value: number;
  /** Inscribed radius around `anchor`, used to size the number. */
  inradius: number;
  /** Where the number sits (face centre, or the corners for the d4). */
  anchors: { pos: V3; up: V3; label: number }[];
}

export interface Poly {
  kind: PolyKind;
  verts: V3[];
  faces: Face[];
  /** Largest distance from the centre to a vertex. */
  radius: number;
}

const PHI = (1 + Math.sqrt(5)) / 2;

/** Circumradius of each die in world units. */
export const DIE_RADIUS: Record<PolyKind, number> = { d4: 1.2, d6: 1.0, d8: 1.05, d10: 1.0, d12: 1.0, d20: 1.08 };

function rawVertices(kind: PolyKind): V3[] {
  switch (kind) {
    case 'd4':
      return [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
    case 'd6': {
      const out: V3[] = [];
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) out.push([x, y, z]);
      return out;
    }
    case 'd8':
      return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    case 'd12': {
      const out: V3[] = [];
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) out.push([x, y, z]);
      const a = 1 / PHI;
      for (const s of [-1, 1]) for (const t of [-1, 1]) {
        out.push([0, s * a, t * PHI], [s * a, t * PHI, 0], [s * PHI, 0, t * a]);
      }
      return out;
    }
    case 'd20': {
      const out: V3[] = [];
      for (const s of [-1, 1]) for (const t of [-1, 1]) {
        out.push([0, s, t * PHI], [s, t * PHI, 0], [t * PHI, 0, s]);
      }
      return out;
    }
    case 'd10':
      return trapezohedronVertices();
  }
}

const D10_A = 0.105;

/** Pentagonal trapezohedron: two poles and a zig-zag ring of ten vertices (radius 1). Vertex 0 = top, 1 = bottom. */
function trapezohedronVertices(): V3[] {
  const c = Math.cos(Math.PI / 5);
  // Pole height that makes the kite faces exactly planar.
  const h = (D10_A * (c + 1)) / (1 - c);
  const out: V3[] = [[0, h, 0], [0, -h, 0]];
  for (let i = 0; i < 5; i++) {
    const a = (i * 2 * Math.PI) / 5;
    out.push([Math.cos(a), D10_A, Math.sin(a)]); // upper ring: 2 + i
  }
  for (let i = 0; i < 5; i++) {
    const a = (i * 2 * Math.PI) / 5 + Math.PI / 5;
    out.push([Math.cos(a), -D10_A, Math.sin(a)]); // lower ring: 7 + i
  }
  return out;
}

/** Faces of a convex polyhedron by brute force over vertex triples (at most 20 vertices). */
function hullFaces(verts: V3[]): { idx: number[]; normal: V3 }[] {
  const n = verts.length;
  const centroid = mul(verts.reduce((s, v) => add(s, v), [0, 0, 0] as V3), 1 / n);
  const scale = Math.max(...verts.map((v) => len(sub(v, centroid))));
  const eps = 1e-7 * scale;
  const seen = new Set<string>();
  const out: { idx: number[]; normal: V3 }[] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
    let nrm = cross(sub(verts[j], verts[i]), sub(verts[k], verts[i]));
    if (len(nrm) < 1e-9) continue;
    nrm = norm(nrm);
    if (dot(nrm, sub(verts[i], centroid)) < 0) nrm = mul(nrm, -1);
    const d = dot(nrm, verts[i]);
    let ok = true;
    const on: number[] = [];
    for (let m = 0; m < n; m++) {
      const s = dot(nrm, verts[m]) - d;
      if (s > eps) { ok = false; break; }
      if (Math.abs(s) <= eps) on.push(m);
    }
    if (!ok) continue;
    const key = on.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    // Order the vertices counter-clockwise around the normal.
    const c = mul(on.reduce((s, m) => add(s, verts[m]), [0, 0, 0] as V3), 1 / on.length);
    const e1 = norm(sub(verts[on[0]], c));
    const e2 = cross(nrm, e1);
    on.sort((a, b) => {
      const va = sub(verts[a], c);
      const vb = sub(verts[b], c);
      return Math.atan2(dot(va, e2), dot(va, e1)) - Math.atan2(dot(vb, e2), dot(vb, e1));
    });
    out.push({ idx: on, normal: nrm });
  }
  return out;
}

function polygonCentroid(verts: V3[], normal: V3): V3 {
  // Area-weighted centroid via a triangle fan from the first vertex.
  let area = 0;
  let acc: V3 = [0, 0, 0];
  for (let i = 1; i < verts.length - 1; i++) {
    const a = verts[0];
    const b = verts[i];
    const c = verts[i + 1];
    const w = dot(cross(sub(b, a), sub(c, a)), normal) / 2;
    area += w;
    acc = add(acc, mul(add(add(a, b), c), w / 3));
  }
  return mul(acc, 1 / area);
}

function inscribedRadius(verts: V3[], center: V3): number {
  let r = Infinity;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    const e = norm(sub(b, a));
    const p = sub(center, a);
    r = Math.min(r, len(sub(p, mul(e, dot(p, e)))));
  }
  return r;
}

const cache = new Map<PolyKind, Poly>();

export function buildPoly(kind: PolyKind): Poly {
  const hit = cache.get(kind);
  if (hit) return hit;
  let verts = rawVertices(kind);
  const raw = Math.max(...verts.map(len));
  const k = DIE_RADIUS[kind] / raw;
  verts = verts.map((v) => mul(v, k));
  const hull = hullFaces(verts);

  // Opposite faces (antipodal normals) get values that sum to sides + 1.
  const sides = kind === 'd4' ? 4 : Number(kind.slice(1));
  const value = new Array<number>(hull.length).fill(0);
  if (kind !== 'd4') {
    let next = 1;
    for (let f = 0; f < hull.length; f++) {
      if (value[f]) continue;
      const o = hull.findIndex((g, gi) => gi !== f && dot(g.normal, hull[f].normal) < -0.999);
      if (o < 0) throw new Error(`${kind}: face ${f} has no opposite`);
      value[f] = next;
      value[o] = sides + 1 - next;
      next++;
    }
  }

  const faces: Face[] = hull.map((h, fi) => {
    const fv = h.idx.map((i) => verts[i]);
    const center = polygonCentroid(fv, h.normal);
    const inradius = inscribedRadius(fv, center);
    const planeUp = (target: V3): V3 => {
      const d = sub(target, center);
      return norm(sub(d, mul(h.normal, dot(d, h.normal))));
    };
    const anchors: Face['anchors'] = [];
    if (kind === 'd4') {
      // One number near every corner, its top pointing at the corner: the corner at the top of the die is the result.
      for (const vi of h.idx) {
        const up = planeUp(verts[vi]);
        anchors.push({ pos: add(center, mul(sub(verts[vi], center), 0.5)), up, label: vi + 1 });
      }
    } else if (kind === 'd10') {
      // Kite: the number's top points to the pole of the face.
      let pole = 0;
      h.idx.forEach((vi, i) => {
        if (Math.abs(verts[vi][1]) > Math.abs(verts[h.idx[pole]][1])) pole = i;
      });
      const tip = h.idx[(pole + 2) % 4];
      const up = norm(sub(verts[h.idx[pole]], verts[tip]));
      anchors.push({ pos: center, up: planeUp(add(center, up)), label: value[fi] });
    } else if (h.idx.length === 4) {
      const mid = mul(add(verts[h.idx[0]], verts[h.idx[1]]), 0.5);
      anchors.push({ pos: center, up: planeUp(mid), label: value[fi] });
    } else {
      anchors.push({ pos: center, up: planeUp(verts[h.idx[0]]), label: value[fi] });
    }
    return { verts: h.idx, normal: h.normal, center, value: value[fi], inradius, anchors };
  });
  const poly: Poly = { kind, verts, faces, radius: DIE_RADIUS[kind] };
  cache.set(kind, poly);
  return poly;
}

/** Number of faces of a die kind (the d4 reads vertices, but still has four faces). */
export const FACE_COUNT: Record<PolyKind, number> = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20 };

/** Value that is up for a die with orientation `q`. D4: the number at the top vertex; others: the upward face. */
export function readValue(poly: Poly, q: Quat): number {
  if (poly.kind === 'd4') {
    let best = 0;
    let top = -Infinity;
    poly.verts.forEach((v, i) => {
      const y = rotate(q, v)[1];
      if (y > top) { top = y; best = i; }
    });
    return best + 1;
  }
  let best = poly.faces[0];
  let bd = -Infinity;
  for (const f of poly.faces) {
    const d = rotate(q, f.normal)[1];
    if (d > bd) { bd = d; best = f; }
  }
  return best.value;
}

/** How flat the die lies: 1 = a face (or for the d4 a vertex) points straight up, smaller = cocked. */
export function flatness(poly: Poly, q: Quat): number {
  if (poly.kind === 'd4') {
    // Resting on a face means the opposite vertex points straight up.
    let top = -Infinity;
    for (const v of poly.verts) top = Math.max(top, rotate(q, norm(v))[1]);
    return top;
  }
  let bd = -Infinity;
  for (const f of poly.faces) bd = Math.max(bd, rotate(q, f.normal)[1]);
  return bd;
}

/** Orientation that shows the given value on top (d4: that vertex on top), with a yaw about the vertical axis. */
export function orientationFor(poly: Poly, value: number, yaw: number): Quat {
  let target: V3;
  if (poly.kind === 'd4') target = norm(poly.verts[value - 1]);
  else {
    const f = poly.faces.find((x) => x.value === value);
    if (!f) throw new Error(`${poly.kind}: no face ${value}`);
    target = f.normal;
  }
  const q = fromTo(target, [0, 1, 0]);
  const half = yaw / 2;
  const qy: Quat = [0, Math.sin(half), 0, Math.cos(half)];
  return qmul(qy, q);
}

export function qmul(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

/** Shortest rotation taking unit vector `a` to unit vector `b`. */
export function fromTo(a: V3, b: V3): Quat {
  const d = dot(a, b);
  if (d < -0.999999) {
    // Opposite: rotate half a turn about any axis perpendicular to a.
    const axis = norm(Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]));
    return [axis[0], axis[1], axis[2], 0];
  }
  const c = cross(a, b);
  const q: Quat = [c[0], c[1], c[2], 1 + d];
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

/**
 * Vertices of the polyhedron with every face plane moved inward by `r` (the "core" of a rounded die).
 * Each vertex is the least-squares meeting point of the planes that touch it, which is exact for the symmetric dice.
 */
export function insetVerts(poly: Poly, r: number): V3[] {
  return poly.verts.map((_, vi) => {
    const adj = poly.faces.filter((f) => f.verts.includes(vi));
    // Normal equations: (sum n n^T) p = sum n (d - r)
    const A = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const b: V3 = [0, 0, 0];
    for (const f of adj) {
      const n = f.normal;
      const d = dot(n, poly.verts[f.verts[0]]) - r;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) A[i * 3 + j] += n[i] * n[j];
        b[i] += n[i] * d;
      }
    }
    return solve3(A, b);
  });
}

function solve3(m: number[], b: V3): V3 {
  const det = (a: number[]) =>
    a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6]);
  const D = det(m);
  const col = (k: number) => {
    const c = [...m];
    for (let i = 0; i < 3; i++) c[i * 3 + k] = b[i];
    return det(c) / D;
  };
  return [col(0), col(1), col(2)];
}
