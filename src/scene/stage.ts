// The 3D stage: renderer, camera, lights, table and dice. Rendering happens on demand: while nothing moves
// no frames are drawn, so an idle window costs no CPU/GPU.

import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Plane,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildPoly, dot, orientationFor, type PolyKind } from '../dice/geometry';
import { bodyGeometry, decalGeometry } from '../dice/mesh';
import { resolveSkin, type SkinSettings, type SkinSpec } from '../dice/skins';
import { atlasFor, type LabelStyle } from '../dice/textures';
import type { DieType } from '../rules/types';
import { SIDES } from '../rules/types';
import { DiceWorld, type Flick, initPhysics, makeLaunches, MAX_ROLL, type SimDie, TABLE } from '../sim/physics';
import { Clatter } from './audio';
import { buildTable, RAIL, RAIL_H } from './table';

export interface Marks {
  dropped?: boolean;
  crit?: 'high' | 'low';
  selected?: boolean;
}

interface Part {
  kind: PolyKind;
  style: LabelStyle;
  group: Group;
  body: Mesh;
  decal: Mesh;
  sim: SimDie | null;
}

interface DieView {
  tag: number;
  type: DieType;
  parts: Part[];
  marks: Marks;
  skin: SkinSpec;
}

export interface ThrowRequest {
  tag: number;
  type: DieType;
}

const PICK_COLOR = new Color('#8fd9b6');
const CRIT_HIGH = new Color('#ffb11b');
const CRIT_LOW = new Color('#ff3030');

const kindOf = (type: DieType): PolyKind => (type === 'd100' ? 'd10' : (type as PolyKind));

export class Stage {
  readonly clatter = new Clatter();
  onPick: (tag: number | null) => void = () => {};
  onFlick: (f: Flick) => void = () => {};

  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(30, 1, 0.5, 200);
  private dice = new Map<number, DieView>();
  private world: DiceWorld | null = null;
  private colliders = new Map<number, SimDie>();
  private skins: SkinSettings;
  private pips = false;
  private raf = 0;
  private lastFrame = 0;
  private acc = 0;
  private speed = 1;
  private rolling: { parts: { view: DieView; part: Part }[]; t0: number; resolve: (v: Map<number, number>) => void } | null = null;
  private observer: ResizeObserver;
  private ray = new Raycaster();
  private ground = new Plane(new Vector3(0, 1, 0), 0);
  private pointer: { x: number; y: number; t: number; hit: boolean; samples: { x: number; y: number; t: number }[] } | null = null;
  /** Frames per second measured during the last roll (diagnostics). */
  lastRollFps = 0;
  private frames = 0;
  private rollStart = 0;

  constructor(private host: HTMLElement, skins: SkinSettings) {
    this.skins = skins;
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.className = 'stage-canvas';
    host.append(this.renderer.domElement);

    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
    this.scene.environmentIntensity = 0.75;
    pmrem.dispose();

    this.scene.add(new HemisphereLight('#dfe8ff', '#2a1d12', 0.35));
    const sun = new DirectionalLight('#fff4e0', 2.6);
    sun.position.set(-7, 18, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -TABLE.w / 2 - 3;
    sc.right = TABLE.w / 2 + 3;
    sc.top = TABLE.d / 2 + 3;
    sc.bottom = -TABLE.d / 2 - 3;
    sc.near = 2;
    sc.far = 50;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    this.scene.add(buildTable());

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', () => (this.pointer = null));
    this.resize();
  }

  // ───────────── settings ─────────────

  setSkins(skins: SkinSettings, pips: boolean): void {
    this.skins = skins;
    this.pips = pips;
    for (const v of this.dice.values()) this.restyle(v);
    this.invalidate();
  }

  setSpeed(s: number): void {
    this.speed = s;
  }

  get busy(): boolean {
    return this.rolling !== null;
  }

  get count(): number {
    return this.dice.size;
  }

  // ───────────── dice meshes ─────────────

  private styleFor(type: DieType, part: number): LabelStyle {
    if (type === 'd100') return part === 0 ? 'tens' : 'units';
    if (type === 'd6' && this.pips) return 'pips';
    return 'numbers';
  }

  private makePart(view: DieView, kind: PolyKind, style: LabelStyle): Part {
    const group = new Group();
    const body = new Mesh(bodyGeometry(kind), new MeshPhysicalMaterial());
    body.castShadow = true;
    body.receiveShadow = true;
    const decal = new Mesh(decalGeometry(kind, 1, 1), new MeshStandardMaterial());
    decal.renderOrder = 2;
    group.add(body, decal);
    this.scene.add(group);
    const part: Part = { kind, style, group, body, decal, sim: null };
    this.styleOne(view, part);
    return part;
  }

  private styleOne(view: DieView, part: Part): void {
    const s = (view.skin = resolveSkin(this.skins, view.type));
    const count = part.style === 'units' || part.style === 'tens' ? 10 : SIDES[view.type === 'd100' ? 'd10' : view.type];
    const atlas = atlasFor(part.kind, count, part.style, s.num);
    part.decal.geometry = decalGeometry(part.kind, atlas.cols, atlas.rows);
    const dm = part.decal.material as MeshStandardMaterial;
    dm.dispose();
    part.decal.material = new MeshStandardMaterial({
      map: atlas.texture,
      transparent: true,
      depthWrite: false,
      roughness: 0.55,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const bm = part.body.material as MeshPhysicalMaterial;
    bm.dispose();
    part.body.material = new MeshPhysicalMaterial({
      color: s.body,
      roughness: s.roughness,
      metalness: s.metalness,
      clearcoat: s.clearcoat,
      clearcoatRoughness: 0.18,
      envMapIntensity: 1,
    });
    this.applyMarks(view, part);
  }

  private restyle(view: DieView): void {
    view.parts.forEach((p, i) => {
      p.style = this.styleFor(view.type, i);
      this.styleOne(view, p);
    });
  }

  private applyMarks(view: DieView, part: Part): void {
    const m = part.body.material as MeshPhysicalMaterial;
    const base = new Color(view.skin.body);
    if (view.marks.dropped) base.lerp(new Color('#4a4d55'), 0.62).multiplyScalar(0.8);
    m.color.copy(base);
    if (view.marks.selected) {
      m.emissive.copy(PICK_COLOR);
      m.emissiveIntensity = 0.55;
    } else if (view.marks.crit) {
      m.emissive.copy(view.marks.crit === 'high' ? CRIT_HIGH : CRIT_LOW);
      m.emissiveIntensity = view.marks.crit === 'high' ? 0.7 : 0.55;
    } else {
      m.emissive.set('#000000');
      m.emissiveIntensity = 0;
    }
  }

  setMarks(marks: Map<number, Marks>): void {
    for (const v of this.dice.values()) {
      v.marks = marks.get(v.tag) ?? {};
      for (const p of v.parts) this.applyMarks(v, p);
    }
    this.invalidate();
  }

  private addDie(tag: number, type: DieType): DieView {
    const view: DieView = { tag, type, parts: [], marks: {}, skin: resolveSkin(this.skins, type) };
    const kind = kindOf(type);
    const n = type === 'd100' ? 2 : 1;
    for (let i = 0; i < n; i++) view.parts.push(this.makePart(view, kind, this.styleFor(type, i)));
    this.dice.set(tag, view);
    return view;
  }

  clear(): void {
    if (this.rolling) return;
    for (const v of this.dice.values()) {
      for (const p of v.parts) {
        this.scene.remove(p.group);
        (p.body.material as MeshPhysicalMaterial).dispose();
        (p.decal.material as MeshStandardMaterial).dispose();
      }
    }
    this.dice.clear();
    this.colliders.clear();
    this.world?.clear();
    this.invalidate();
  }

  /** Removes one die (for example before it is thrown again). */
  removeDie(tag: number): void {
    const v = this.dice.get(tag);
    if (!v || this.rolling) return;
    for (const p of v.parts) {
      this.scene.remove(p.group);
      if (p.sim) {
        this.colliders.delete(p.sim.collider.handle);
        this.world?.remove(p.sim);
      }
    }
    this.dice.delete(tag);
    this.invalidate();
  }

  // ───────────── rolling ─────────────

  /** Throws the dice and resolves with the value of each (by tag) once everything has come to rest. */
  async throwDice(reqs: ThrowRequest[], opts: { speed: number; flick?: Flick }): Promise<Map<number, number>> {
    await initPhysics();
    this.world ??= new DiceWorld();
    const world = this.world;
    this.speed = opts.speed;
    const parts: { view: DieView; part: Part }[] = [];
    for (const r of reqs) {
      const view = this.addDie(r.tag, r.type);
      for (const p of view.parts) parts.push({ view, part: p });
    }
    const launches = makeLaunches(parts.length, () => {
      const b = new Uint32Array(1);
      crypto.getRandomValues(b);
      return b[0] / 4294967296;
    }, opts.flick);
    parts.forEach(({ part, view }, i) => {
      const sim = world.add(part.kind, view.tag, launches[i]);
      part.sim = sim;
      this.colliders.set(sim.collider.handle, sim);
      part.group.position.set(...launches[i].pos);
    });
    this.invalidate();
    return new Promise((resolve) => {
      this.rolling = { parts, t0: world.time, resolve };
      this.acc = 0;
      this.frames = 0;
      this.rollStart = performance.now();
      this.lastFrame = performance.now();
      this.kick();
    });
  }

  private stepRoll(dt: number): void {
    const world = this.world;
    const roll = this.rolling;
    if (!world || !roll) return;
    this.acc += Math.min(dt, 0.05) * this.speed;
    const DTs = 1 / 120;
    let steps = 0;
    let done = false;
    while (this.acc >= DTs && steps < 14) {
      world.step();
      this.acc -= DTs;
      steps++;
      world.events.drainCollisionEvents((h1, h2, started) => {
        if (!started) return;
        const a = this.colliders.get(h1);
        const b = this.colliders.get(h2);
        let power = 0;
        for (const s of [a, b]) {
          if (!s) continue;
          const v = s.body.linvel();
          power = Math.max(power, Math.hypot(v.x, v.y, v.z));
        }
        this.clatter.hit(power);
      });
      if (world.allResting() || world.time - roll.t0 > MAX_ROLL) {
        done = true;
        break;
      }
    }
    this.syncMeshes();
    if (done) this.finishRoll();
  }

  private syncMeshes(): void {
    for (const v of this.dice.values()) {
      for (const p of v.parts) {
        if (!p.sim) continue;
        const t = p.sim.body.translation();
        const r = p.sim.body.rotation();
        p.group.position.set(t.x, t.y, t.z);
        p.group.quaternion.set(r.x, r.y, r.z, r.w);
      }
    }
  }

  private finishRoll(): void {
    const roll = this.rolling!;
    const world = this.world!;
    this.rolling = null;
    const secs = (performance.now() - this.rollStart) / 1000;
    this.lastRollFps = this.frames / Math.max(0.001, secs);
    const out = new Map<number, number>();
    const byTag = new Map<number, number[]>();
    for (const { view, part } of roll.parts) {
      const arr = byTag.get(view.tag) ?? [];
      arr.push(world.value(part.sim!));
      byTag.set(view.tag, arr);
    }
    for (const [tag, vals] of byTag) {
      const type = this.dice.get(tag)!.type;
      out.set(tag, type === 'd100' ? combineD100(vals[0], vals[1]) : vals[0]);
    }
    this.invalidate();
    roll.resolve(out);
  }

  /** Lays dice out showing the given values, without any animation (quick roll). */
  async place(items: { tag: number; type: DieType; value: number }[]): Promise<void> {
    this.clear();
    this.world?.clear();
    const n = items.reduce((s, i) => s + (i.type === 'd100' ? 2 : 1), 0);
    const cols = Math.max(1, Math.ceil(Math.sqrt(n * (TABLE.w / TABLE.d))));
    const rows = Math.ceil(n / cols);
    const gap = Math.min(3.1, (TABLE.w - 3) / cols, (TABLE.d - 3) / rows);
    let k = 0;
    for (const it of items) {
      const view = this.addDie(it.tag, it.type);
      const vals = it.type === 'd100' ? splitD100(it.value) : [it.value];
      view.parts.forEach((p, i) => {
        const poly = buildPoly(p.kind);
        const c = k % cols;
        const r = Math.floor(k / cols);
        k++;
        const yaw = Math.random() * Math.PI * 2;
        const q = orientationFor(poly, vals[i], yaw);
        const f = poly.faces[0];
        p.group.position.set((c - (cols - 1) / 2) * gap, dot(f.normal, poly.verts[f.verts[0]]), (r - (rows - 1) / 2) * gap);
        p.group.quaternion.set(q[0], q[1], q[2], q[3]);
      });
    }
    this.invalidate();
  }

  // ───────────── rendering ─────────────

  invalidate(): void {
    this.kick();
  }

  private kick(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private frame(now: number): void {
    this.raf = 0;
    const dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    if (this.rolling) {
      this.stepRoll(dt);
      this.frames++;
    }
    this.renderer.render(this.scene, this.camera);
    if (this.rolling) this.kick();
  }

  private resize(): void {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.fitCamera();
    this.invalidate();
  }

  /** Moves the camera back until the whole table (rails included) is inside the view. */
  private fitCamera(): void {
    const pitch = (62 * Math.PI) / 180;
    const dir = new Vector3(0, Math.sin(pitch), Math.cos(pitch));
    const hx = TABLE.w / 2 + RAIL;
    const hz = TABLE.d / 2 + RAIL;
    const corners = [
      [-hx, 0, -hz], [hx, 0, -hz], [-hx, 0, hz], [hx, 0, hz],
      [-hx, RAIL_H, -hz], [hx, RAIL_H, -hz], [-hx, RAIL_H, hz], [hx, RAIL_H, hz],
    ].map((c) => new Vector3(...c));
    let dist = 12;
    for (let i = 0; i < 160; i++, dist *= 1.012) {
      this.camera.position.copy(dir).multiplyScalar(dist);
      this.camera.lookAt(0, -0.4, 0);
      this.camera.updateProjectionMatrix();
      this.camera.updateMatrixWorld(true);
      const ok = corners.every((c) => {
        const p = c.clone().project(this.camera);
        return Math.abs(p.x) < 0.985 && Math.abs(p.y) < 0.985;
      });
      if (ok) break;
    }
  }

  // ───────────── pointer: pick and flick ─────────────

  private ndc(e: PointerEvent): Vector2 {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private pickAt(e: PointerEvent): number | null {
    this.ray.setFromCamera(this.ndc(e), this.camera);
    const hits = this.ray.intersectObjects(
      [...this.dice.values()].flatMap((v) => v.parts.map((p) => p.body)),
      false,
    );
    if (!hits.length) return null;
    const mesh = hits[0].object;
    for (const v of this.dice.values()) if (v.parts.some((p) => p.body === mesh)) return v.tag;
    return null;
  }

  private down(e: PointerEvent): void {
    if (e.button !== 0) return;
    const hit = this.pickAt(e) !== null;
    this.pointer = { x: e.clientX, y: e.clientY, t: performance.now(), hit, samples: [{ x: e.clientX, y: e.clientY, t: performance.now() }] };
    this.renderer.domElement.setPointerCapture(e.pointerId);
  }

  private move(e: PointerEvent): void {
    const p = this.pointer;
    if (!p) return;
    const now = performance.now();
    p.samples.push({ x: e.clientX, y: e.clientY, t: now });
    while (p.samples.length > 2 && now - p.samples[0].t > 120) p.samples.shift();
  }

  private up(e: PointerEvent): void {
    const p = this.pointer;
    this.pointer = null;
    if (!p) return;
    const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y);
    if (moved < 6) {
      this.onPick(this.pickAt(e));
      return;
    }
    if (this.rolling) return;
    const a = p.samples[0];
    const dt = Math.max(16, performance.now() - a.t);
    const dx = e.clientX - a.x;
    const dy = e.clientY - a.y;
    const px = Math.hypot(dx, dy);
    if (px < 24) return;
    const speed = (px / dt) * 1000;
    // Convert the screen flick to a direction on the table plane.
    const hitPoint = (x: number, y: number): Vector3 | null => {
      const r = this.renderer.domElement.getBoundingClientRect();
      this.ray.setFromCamera(new Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.camera);
      return this.ray.ray.intersectPlane(this.ground, new Vector3());
    };
    const p0 = hitPoint(a.x, a.y);
    const p1 = hitPoint(e.clientX, e.clientY);
    if (!p0 || !p1) return;
    const dir = new Vector2(p1.x - p0.x, p1.z - p0.z);
    if (dir.length() < 1e-3) return;
    dir.normalize();
    this.onFlick({ dir: [dir.x, dir.y], strength: Math.max(0, Math.min(1, speed / 2500)) });
  }

  // ───────────── diagnostics ─────────────

  dispose(): void {
    this.observer.disconnect();
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
  }
}

/** Tens die shows 00..90, units die 0..9; 00 + 0 means 100. */
export function combineD100(tensFace: number, unitsFace: number): number {
  const v = (tensFace % 10) * 10 + (unitsFace % 10);
  return v === 0 ? 100 : v;
}

export function splitD100(value: number): [number, number] {
  const v = value % 100;
  const tens = Math.floor(v / 10);
  const units = v % 10;
  return [tens === 0 ? 10 : tens, units === 0 ? 10 : units];
}
