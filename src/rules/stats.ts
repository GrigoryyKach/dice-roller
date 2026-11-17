// Roll statistics per die type: count, sum and a distribution (d100 is bucketed by tens).

import { DIE_TYPES, type DieRec, type DieType, SIDES } from './types';

export interface TypeStats {
  n: number;
  sum: number;
  /** Counts per value (index 0 = value 1). For d100: 10 buckets of ten values. */
  dist: number[];
}

export type Stats = Partial<Record<DieType, TypeStats>>;

export const BUCKETS: Record<DieType, number> = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20, d100: 10 };

export function emptyStats(): Stats {
  return {};
}

export function bucketOf(type: DieType, value: number): number {
  return type === 'd100' ? Math.min(9, Math.floor((value - 1) / 10)) : value - 1;
}

/** Records every die that was physically thrown, including dropped and rerolled ones. */
export function addDice(stats: Stats, dice: DieRec[]): void {
  for (const d of dice) {
    const s = (stats[d.type] ??= { n: 0, sum: 0, dist: new Array(BUCKETS[d.type]).fill(0) });
    s.n++;
    s.sum += d.value;
    s.dist[bucketOf(d.type, d.value)]++;
  }
}

export function expectedAverage(type: DieType): number {
  return (SIDES[type] + 1) / 2;
}

/** Loads persisted stats, ignoring anything malformed. */
export function sanitizeStats(raw: unknown): Stats {
  const out: Stats = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const t of DIE_TYPES) {
    const s = (raw as Record<string, unknown>)[t] as Partial<TypeStats> | undefined;
    if (!s || !Array.isArray(s.dist) || s.dist.length !== BUCKETS[t]) continue;
    out[t] = { n: Number(s.n) || 0, sum: Number(s.sum) || 0, dist: s.dist.map((x) => Number(x) || 0) };
  }
  return out;
}
