// Rigid-body simulation of the dice (Rapier, WASM). Independent of rendering and of the DOM,
// so the same code drives the on-screen roll, the headless fairness check and the unit tests.

import RAPIER from '@dimforge/rapier3d-compat';
import { buildPoly, flatness, insetVerts, type Poly, type PolyKind, type Quat, readValue, type V3 } from '../dice/geometry';

export const TABLE = { w: 18, d: 11 } as const;
export const GRAVITY = -48;
/** Fixed physics step. */
export const DT = 1 / 120;
/** Edge rounding of the dice, as a fraction of their circumradius. */
export const ROUND = 0.07;

let ready: Promise<void> | null = null;
export function initPhysics(): Promise<void> {
  ready ??= RAPIER.init();
  return ready;
}

export interface Rng {
  (): number;
}

/** Small seeded PRNG (mulberry32), used by the fairness check so its report is reproducible. */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random numbers from the OS for real rolls. */
export const cryptoRng: Rng = () => {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return b[0] / 4294967296;
};

export interface SimDie {
  /** Caller's id (die record, or an index in tests). */
  tag: number;
  kind: PolyKind;
  poly: Poly;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  nudges: number;
  restFor: number;
}

export interface Launch {
  pos: V3;
  vel: V3;
  spin: V3;
  rot: Quat;
}

export interface Flick {
  /** Unit direction on the table plane (x, z). */
  dir: [number, number];
  /** 0..1 */
  strength: number;
}

export class DiceWorld {
  readonly world: RAPIER.World;
  readonly events: RAPIER.EventQueue;
  readonly dice: SimDie[] = [];
  time = 0;

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
    this.world.timestep = DT;
    this.events = new RAPIER.EventQueue(true);
    const { w, d } = TABLE;
    const floor = RAPIER.ColliderDesc.cuboid(w, 1, d).setTranslation(0, -1, 0).setFriction(0.7).setRestitution(0.25);
    this.world.createCollider(floor);
    const wall = (hx: number, hy: number, hz: number, x: number, y: number, z: number) =>
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(0.3).setRestitution(0.45));
    const t = 1;
    wall(t, 11, d / 2 + t, w / 2 + t, 10, 0);
    wall(t, 11, d / 2 + t, -w / 2 - t, 10, 0);
    wall(w / 2 + t, 11, t, 0, 10, d / 2 + t);
    wall(w / 2 + t, 11, t, 0, 10, -d / 2 - t);
    wall(w / 2 + t, 1, d / 2 + t, 0, 22, 0); // ceiling
  }

  add(kind: PolyKind, tag: number, l: Launch): SimDie {
    const poly = buildPoly(kind);
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(l.pos[0], l.pos[1], l.pos[2])
        .setRotation({ x: l.rot[0], y: l.rot[1], z: l.rot[2], w: l.rot[3] })
        .setLinvel(l.vel[0], l.vel[1], l.vel[2])
        .setAngvel({ x: l.spin[0], y: l.spin[1], z: l.spin[2] })
        .setLinearDamping(0.12)
        .setAngularDamping(0.3)
        .setCcdEnabled(true),
    );
    const pts = new Float32Array(insetVerts(poly, poly.radius * ROUND).flat());
    const desc =
      RAPIER.ColliderDesc.roundConvexHull(pts, poly.radius * ROUND) ?? RAPIER.ColliderDesc.convexHull(pts);
    if (!desc) throw new Error(`could not build the collider for ${kind}`);
    const collider = this.world.createCollider(
      desc
        .setDensity(1.5)
        .setFriction(0.45)
        .setRestitution(0.38)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    const die: SimDie = { tag, kind, poly, body, collider, nudges: 0, restFor: 0 };
    this.dice.push(die);
    return die;
  }

  remove(die: SimDie): void {
    this.world.removeRigidBody(die.body);
    const i = this.dice.indexOf(die);
    if (i >= 0) this.dice.splice(i, 1);
  }

  clear(): void {
    for (const d of [...this.dice]) this.remove(d);
  }

  step(): void {
    this.world.step(this.events);
    this.time += DT;
    for (const d of this.dice) {
      const lv = d.body.linvel();
      const av = d.body.angvel();
      const calm = lv.x * lv.x + lv.y * lv.y + lv.z * lv.z < 0.03 && av.x * av.x + av.y * av.y + av.z * av.z < 0.12;
      d.restFor = calm ? d.restFor + DT : 0;
    }
  }

  quat(d: SimDie): Quat {
    const r = d.body.rotation();
    return [r.x, r.y, r.z, r.w];
  }

  /** The die has been calm for a while and lies flat on a face. */
  settled(d: SimDie): boolean {
    return d.restFor > 0.3 && flatness(d.poly, this.quat(d)) > 0.995;
  }

  /**
   * Called every step while rolling. Nudges calm-but-cocked dice (leaning on a wall or another die);
   * returns true when every die rests (cocked dice are accepted after a few nudges).
   */
  allResting(): boolean {
    let all = true;
    for (const d of this.dice) {
      if (d.restFor <= 0.3) { all = false; continue; }
      if (flatness(d.poly, this.quat(d)) > 0.995) continue;
      if (d.nudges >= 4) continue; // give up: read the nearest face
      d.nudges++;
      d.restFor = 0;
      d.body.applyImpulse({ x: (Math.random() - 0.5) * 2, y: 9 * d.body.mass(), z: (Math.random() - 0.5) * 2 }, true);
      d.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 6 }, true);
      all = false;
    }
    return all;
  }

  value(d: SimDie): number {
    return readValue(d.poly, this.quat(d));
  }

  free(): void {
    this.events.free();
    this.world.free();
  }
}

function randomQuat(rng: Rng): Quat {
  const u1 = rng();
  const u2 = rng() * 2 * Math.PI;
  const u3 = rng() * 2 * Math.PI;
  const a = Math.sqrt(1 - u1);
  const b = Math.sqrt(u1);
  return [a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3)];
}

/**
 * Launch parameters for `n` dice thrown in one go: they start in a loose block near one edge of the table
 * and fly across it with random speed and spin.
 */
export function makeLaunches(n: number, rng: Rng, flick?: Flick): Launch[] {
  const ang = flick ? Math.atan2(flick.dir[1], flick.dir[0]) : (rng() - 0.5) * 0.9 + (rng() < 0.5 ? 0 : Math.PI);
  const dir: [number, number] = [Math.cos(ang), Math.sin(ang)];
  const power = flick ? 0.55 + 0.45 * flick.strength : 0.35 + rng() * 0.55;
  const hw = TABLE.w / 2 - 2.0;
  const hd = TABLE.d / 2 - 1.5;
  const cx = -dir[0] * (hw - 3.4);
  const cz = -dir[1] * Math.max(0, hd - 2.3);
  // Grid of start cells so that dice never overlap at the start.
  const cell = 2.2;
  const cols = 4;
  const rows = 3;
  const perLayer = cols * rows;
  const out: Launch[] = [];
  const order = Array.from({ length: perLayer }, (_, i) => i);
  for (let i = 0; i < n; i++) {
    const layer = Math.floor(i / perLayer);
    if (i % perLayer === 0) order.sort(() => rng() - 0.5);
    const c = order[i % perLayer];
    const gx = (c % cols) - (cols - 1) / 2;
    const gz = Math.floor(c / cols) - (rows - 1) / 2;
    // Spread the block along the throw direction (gx) and across it (gz).
    const px = cx + dir[0] * gx * cell - dir[1] * gz * cell + (rng() - 0.5) * 0.5;
    const pz = cz + dir[1] * gx * cell + dir[0] * gz * cell + (rng() - 0.5) * 0.5;
    const py = 3.6 + layer * 2.3 + rng() * 0.5;
    const speed = (13 + rng() * 9) * power * 1.35;
    const jitter = (rng() - 0.5) * 0.7;
    const vx = Math.cos(ang + jitter) * speed;
    const vz = Math.sin(ang + jitter) * speed;
    out.push({
      pos: [Math.max(-hw, Math.min(hw, px)), py, Math.max(-hd, Math.min(hd, pz))],
      vel: [vx, -2 - rng() * 4, vz],
      spin: [(rng() - 0.5) * 40, (rng() - 0.5) * 40, (rng() - 0.5) * 40],
      rot: randomQuat(rng),
    });
  }
  return out;
}

/** Runs the world until every die rests or `maxTime` seconds of simulated time pass. Returns the elapsed simulated time. */
export function runToRest(world: DiceWorld, maxTime = 12): number {
  const t0 = world.time;
  while (world.time - t0 < maxTime) {
    world.step();
    if (world.allResting()) break;
  }
  return world.time - t0;
}
