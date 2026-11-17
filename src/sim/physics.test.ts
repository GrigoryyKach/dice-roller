import { beforeAll, describe, expect, it } from 'vitest';
import { formatFairness, runFairness } from '../dev/fairness';
import { FACE_COUNT, type PolyKind } from '../dice/geometry';
import { DiceWorld, initPhysics, makeLaunches, runToRest, seeded, TABLE } from './physics';

const KINDS: PolyKind[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];

beforeAll(async () => {
  await initPhysics();
});

describe('physics roll', () => {
  it.each(KINDS)('%s dice come to rest flat, inside the table, with a valid value', (kind) => {
    const world = new DiceWorld();
    const rng = seeded(7);
    makeLaunches(10, rng).forEach((l, i) => world.add(kind, i, l));
    const t = runToRest(world);
    expect(t).toBeLessThan(12);
    for (const d of world.dice) {
      const p = d.body.translation();
      expect(Math.abs(p.x)).toBeLessThan(TABLE.w / 2);
      expect(Math.abs(p.z)).toBeLessThan(TABLE.d / 2);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(2.5);
      const v = world.value(d);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(FACE_COUNT[kind]);
    }
    world.free();
  });

  it('50 mixed dice settle', () => {
    const world = new DiceWorld();
    const rng = seeded(11);
    makeLaunches(50, rng).forEach((l, i) => world.add(KINDS[i % KINDS.length], i, l));
    runToRest(world, 14);
    expect(world.dice.every((d) => d.body.translation().y < 6)).toBe(true);
    world.free();
  });

  it('small fairness run stays within the chi-square bound', async () => {
    const rows = await runFairness(240, { batch: 12 });
    console.log(formatFairness(rows));
    for (const r of rows) expect(r.pass, `${r.kind} chi2 ${r.chi2} limit ${r.limit}`).toBe(true);
  });
});
