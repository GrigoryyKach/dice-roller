// Fairness check: throws many dice through the real physics (no rendering) and compares the distribution of the
// resulting faces with the uniform one (chi-square). Run from the app with `DiceRoller.exe --dev-fairness N`.

import { FACE_COUNT, type PolyKind } from '../dice/geometry';
import { DiceWorld, initPhysics, makeLaunches, runToRest, seeded } from '../sim/physics';

/** Critical chi-square values at p = 0.001 by degrees of freedom. */
const CRITICAL: Record<number, number> = { 3: 16.266, 5: 20.515, 7: 24.322, 9: 27.877, 11: 31.264, 19: 43.82 };

export interface FairRow {
  kind: PolyKind;
  throws: number;
  counts: number[];
  chi2: number;
  df: number;
  limit: number;
  pass: boolean;
  /** Dice that never settled flat (accepted after the nudges ran out). */
  cocked: number;
}

export const FAIR_KINDS: PolyKind[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];

/** `perType` dice of each kind, thrown in batches of `batch` at a time. */
export async function runFairness(perType: number, opts: { batch?: number; seed?: number; onProgress?: (kind: PolyKind, done: number) => void } = {}): Promise<FairRow[]> {
  await initPhysics();
  const batch = opts.batch ?? 12;
  const rng = seeded(opts.seed ?? 20261117);
  const rows: FairRow[] = [];
  for (const kind of FAIR_KINDS) {
    const sides = FACE_COUNT[kind];
    const counts = new Array<number>(sides).fill(0);
    let thrown = 0;
    let cocked = 0;
    while (thrown < perType) {
      const n = Math.min(batch, perType - thrown);
      const world = new DiceWorld();
      makeLaunches(n, rng).forEach((l, i) => world.add(kind, i, l));
      runToRest(world);
      for (const d of world.dice) {
        counts[world.value(d) - 1]++;
        if (!world.settled(d)) cocked++;
      }
      world.free();
      thrown += n;
      opts.onProgress?.(kind, thrown);
    }
    const expected = perType / sides;
    const chi2 = counts.reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
    const df = sides - 1;
    const limit = CRITICAL[df];
    rows.push({ kind, throws: perType, counts, chi2, df, limit, pass: chi2 < limit, cocked });
  }
  return rows;
}

export function formatFairness(rows: FairRow[]): string {
  const lines = ['Dice Roller fairness check (physics rolls, chi-square against uniform, limit at p = 0.001)', ''];
  for (const r of rows) {
    lines.push(
      `${r.kind.padEnd(4)} n=${r.throws}  chi2=${r.chi2.toFixed(2)}  df=${r.df}  limit=${r.limit}  ${r.pass ? 'PASS' : 'FAIL'}  cocked=${r.cocked}`,
      `     counts: ${r.counts.join(' ')}`,
    );
  }
  lines.push('', rows.every((r) => r.pass) ? 'All dice within bounds.' : 'Some dice are outside bounds.');
  return lines.join('\n');
}
