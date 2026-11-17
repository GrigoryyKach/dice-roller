// Roll engine: pure functions, no rendering. A roll is driven in rounds:
//   session.next() -> dice that must be thrown now (base dice, explosions, rerolls)
//   session.supply(values) -> their values; the session decides whether more dice are needed.
// When session.done is true, finalize() applies keep/drop, critical marks and totals.

import { DIE_TYPES, type DieRec, type DieType, MAX_CHAIN, type RollResult, type RollSpec, SIDES } from './types';

export interface ThrowRequest {
  type: DieType;
  origin: DieRec['origin'];
  parent?: number;
}

interface Pending extends ThrowRequest {
  depth: number;
  tries: number;
}

export class RollSession {
  readonly dice: DieRec[] = [];
  private pending: Pending[] = [];
  private nextId: number;

  constructor(readonly spec: RollSpec, firstId = 1) {
    this.nextId = firstId;
    for (const g of spec.groups) {
      for (let i = 0; i < g.count; i++) this.pending.push({ type: g.type, origin: 'base', depth: 0, tries: 0 });
    }
  }

  /** Dice to throw now; empty when the roll is complete. */
  next(): ThrowRequest[] {
    return this.pending.map(({ type, origin, parent }) => ({ type, origin, parent }));
  }

  get done(): boolean {
    return this.pending.length === 0;
  }

  /** Values for the dice returned by `next()`, in the same order. Returns the new die records. */
  supply(values: number[]): DieRec[] {
    const batch = this.pending;
    if (values.length !== batch.length) throw new Error('supply: wrong number of values');
    this.pending = [];
    const { reroll, explode } = this.spec.rules;
    const made: DieRec[] = [];
    batch.forEach((req, i) => {
      const max = SIDES[req.type];
      const die: DieRec = { id: this.nextId++, type: req.type, value: values[i], origin: req.origin, status: 'kept' };
      if (req.parent !== undefined) die.parent = req.parent;
      this.dice.push(die);
      made.push(die);
      const canReroll = reroll.enabled && req.origin !== 'explode' && die.value <= reroll.threshold && reroll.threshold < max;
      if (canReroll && req.tries < (reroll.until ? MAX_CHAIN : 1)) {
        die.status = 'rerolled';
        this.pending.push({ type: req.type, origin: 'reroll', parent: die.id, depth: req.depth, tries: req.tries + 1 });
      } else if (explode && die.value === max && req.depth < MAX_CHAIN) {
        die.exploded = true;
        this.pending.push({ type: req.type, origin: 'explode', parent: die.id, depth: req.depth + 1, tries: 0 });
      }
    });
    return made;
  }
}

/** Dice a keep/drop rule removes, from `ofType` (already restricted to one die type). */
function droppedBy(mode: 'kh' | 'kl' | 'dh' | 'dl', n: number, ofType: DieRec[]): DieRec[] {
  const asc = [...ofType].sort((a, b) => a.value - b.value || a.id - b.id);
  const len = asc.length;
  const k = Math.max(0, Math.min(n, len));
  switch (mode) {
    case 'kh': return asc.slice(0, len - k); // keep the k highest
    case 'kl': return asc.slice(k); // keep the k lowest
    case 'dh': return asc.slice(len - k); // drop the k highest
    case 'dl': return asc.slice(0, k); // drop the k lowest
  }
}

/** Applies keep/drop, critical marks and totals to the dice of a finished roll. Safe to call again after a die changes. */
export function finalize(spec: RollSpec, dice: DieRec[]): RollResult {
  for (const d of dice) {
    if (d.status === 'dropped') d.status = 'kept';
    delete d.crit;
  }
  const active = dice.filter((d) => d.status !== 'rerolled');
  for (const g of spec.groups) {
    if (!g.keep) continue;
    for (const d of droppedBy(g.keep.mode, g.keep.n, active.filter((x) => x.type === g.type))) d.status = 'dropped';
  }
  const kept = active.filter((d) => d.status === 'kept');
  for (const d of kept) {
    if (!spec.rules.crit.includes(d.type)) continue;
    if (d.value === SIDES[d.type]) d.crit = 'high';
    else if (d.value === 1) d.crit = 'low';
  }
  const subtotals = DIE_TYPES.filter((type) => kept.some((d) => d.type === type)).map((type) => ({
    type,
    sum: kept.filter((d) => d.type === type).reduce((s, d) => s + d.value, 0),
  }));
  const { successes } = spec.rules;
  let total: number;
  if (successes.enabled) {
    const hit = kept.filter((d) => d.value >= successes.target).length;
    const ones = successes.onesSubtract ? kept.filter((d) => d.value === 1).length : 0;
    total = hit - ones + spec.modifier;
  } else {
    total = kept.reduce((s, d) => s + d.value, 0) + spec.modifier;
  }
  return { dice, total, subtotals, successes: successes.enabled, modifier: spec.modifier };
}

/** Uniform integer in 1..sides from crypto.getRandomValues, without modulo bias. */
export function cryptoDie(sides: number): number {
  const range = 0x1_0000_0000;
  const limit = range - (range % sides);
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return (buf[0] % sides) + 1;
  }
}

/** Whole roll without animation. `roll` supplies a value for a die type. */
export function rollInstant(spec: RollSpec, roll: (type: DieType) => number = (t) => cryptoDie(SIDES[t])): RollResult {
  const s = new RollSession(spec);
  while (!s.done) s.supply(s.next().map((r) => roll(r.type)));
  return finalize(spec, s.dice);
}
