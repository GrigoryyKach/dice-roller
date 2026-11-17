import { describe, expect, it } from 'vitest';
import { finalize, RollSession, rollInstant } from './engine';
import { formatRoll } from './format';
import { parseNotation, toNotation, toSummary } from './notation';
import { addDice } from './stats';
import { defaultRules, type DieType, type RollSpec, SIDES } from './types';

function spec(text: string, patch?: (r: RollSpec) => void): RollSpec {
  const p = parseNotation(text);
  if (!p.ok) throw new Error(JSON.stringify(p.error));
  const s: RollSpec = { groups: p.groups, modifier: p.modifier, rules: { ...defaultRules(), explode: p.explode } };
  patch?.(s);
  return s;
}

/** Roller that returns the listed values in order. */
function seq(values: number[]): (t: DieType) => number {
  let i = 0;
  return () => values[i++];
}

describe('notation', () => {
  it('parses the common forms', () => {
    expect(parseNotation('3d6+2')).toMatchObject({ ok: true, modifier: 2, groups: [{ type: 'd6', count: 3 }] });
    expect(parseNotation('2d20kh1')).toMatchObject({ ok: true, groups: [{ type: 'd20', count: 2, keep: { mode: 'kh', n: 1 } }] });
    expect(parseNotation('4d6dl1')).toMatchObject({ ok: true, groups: [{ type: 'd6', count: 4, keep: { mode: 'dl', n: 1 } }] });
    expect(parseNotation('d100')).toMatchObject({ ok: true, groups: [{ type: 'd100', count: 1 }] });
    expect(parseNotation('1d8+1d6+3')).toMatchObject({ ok: true, modifier: 3, groups: [{ type: 'd6' }, { type: 'd8' }] });
    expect(parseNotation('4d6k3')).toMatchObject({ ok: true, groups: [{ keep: { mode: 'kh', n: 3 } }] });
    expect(parseNotation('2d6 + 1d6 - 1')).toMatchObject({ ok: true, modifier: -1, groups: [{ type: 'd6', count: 3 }] });
    expect(parseNotation('3d6!')).toMatchObject({ ok: true, explode: true });
  });

  it('reports errors', () => {
    expect(parseNotation('')).toMatchObject({ ok: false, error: { code: 'empty' } });
    expect(parseNotation('2d7')).toMatchObject({ ok: false, error: { code: 'sides', arg: '7' } });
    expect(parseNotation('0d6')).toMatchObject({ ok: false, error: { code: 'count' } });
    expect(parseNotation('51d6')).toMatchObject({ ok: false, error: { code: 'tooMany' } });
    expect(parseNotation('-1d6')).toMatchObject({ ok: false, error: { code: 'negDice' } });
    expect(parseNotation('2d6kh3')).toMatchObject({ ok: false, error: { code: 'keepN' } });
    expect(parseNotation('2d6 x')).toMatchObject({ ok: false, error: { code: 'syntax' } });
    expect(parseNotation('2d6+')).toMatchObject({ ok: false, error: { code: 'syntax' } });
  });

  it('round-trips through toNotation', () => {
    for (const t of ['3d6+2', '2d20kh1', '4d6dl1', '1d100', '1d6+1d8-4', '2d6!']) {
      const s = spec(t);
      expect(toNotation(s)).toBe(t);
      const again = parseNotation(toNotation(s));
      expect(again.ok).toBe(true);
    }
    expect(toSummary(spec('2d6+1d20'))).toBe('2d6 + 1d20');
  });
});

describe('rules', () => {
  it('sums dice with a modifier', () => {
    const r = rollInstant(spec('3d6+2'), seq([1, 2, 3]));
    expect(r.total).toBe(8);
  });

  it('drops the lowest die and keeps the order stable', () => {
    const s = spec('4d6dl1');
    const r = rollInstant(s, seq([6, 5, 3, 1]));
    expect(r.total).toBe(14);
    expect(r.dice.filter((d) => d.status === 'dropped').map((d) => d.value)).toEqual([1]);
    expect(formatRoll(s, r)).toBe('4d6dl1: 6, 5, 3, ~~1~~ = 14');
    // ties: exactly one of the equal dice is dropped
    const t = rollInstant(s, seq([2, 2, 2, 2]));
    expect(t.dice.filter((d) => d.status === 'dropped')).toHaveLength(1);
    expect(t.total).toBe(6);
  });

  it('keep highest / lowest and drop highest', () => {
    expect(rollInstant(spec('2d20kh1'), seq([4, 17])).total).toBe(17);
    expect(rollInstant(spec('2d20kl1'), seq([4, 17])).total).toBe(4);
    expect(rollInstant(spec('3d6dh1'), seq([1, 5, 3])).total).toBe(4);
    expect(rollInstant(spec('5d6kh3'), seq([1, 2, 3, 4, 5])).total).toBe(12);
  });

  it('explodes on the maximum and caps the chain', () => {
    const s = spec('2d6!');
    const r = rollInstant(s, seq([6, 2, 4]));
    expect(r.total).toBe(12);
    expect(r.dice.map((d) => d.origin)).toEqual(['base', 'base', 'explode']);
    const always = rollInstant(spec('1d4!'), () => 4);
    expect(always.dice).toHaveLength(11); // 1 base + 10 explosions
    expect(always.total).toBe(44);
  });

  it('rerolls once or until above the threshold', () => {
    const once = spec('2d6', (r) => (r.rules.reroll = { enabled: true, threshold: 2, until: false }));
    const a = rollInstant(once, seq([1, 5, 1]));
    expect(a.total).toBe(6); // first 1 rerolled to 1 and kept, 5
    expect(a.dice.filter((d) => d.status === 'rerolled')).toHaveLength(1);
    const until = spec('1d6', (r) => (r.rules.reroll = { enabled: true, threshold: 2, until: true }));
    expect(rollInstant(until, seq([1, 2, 1, 4])).total).toBe(4);
    const forever = rollInstant(until, () => 1);
    expect(forever.dice.length).toBeLessThanOrEqual(11);
  });

  it('counts successes, optionally subtracting ones', () => {
    const s = spec('5d10', (r) => (r.rules.successes = { enabled: true, target: 8, onesSubtract: true }));
    const r = rollInstant(s, seq([8, 9, 1, 3, 10]));
    expect(r.total).toBe(2);
    s.rules.successes.onesSubtract = false;
    expect(finalize(s, r.dice).total).toBe(3);
  });

  it('marks critical dice only for the configured types', () => {
    const r = rollInstant(spec('1d20+1d6'), seq([1, 20].reverse()));
    // d6 got 20? sequence order is d6 then d20 -> d6=20 invalid but irrelevant: check marks by type
    const d20 = r.dice.find((d) => d.type === 'd20')!;
    expect(d20.crit).toBeDefined();
    const all = spec('1d6+1d20', (x) => (x.rules.crit = ['d6', 'd20']));
    const r2 = rollInstant(all, seq([6, 1]));
    expect(r2.dice.map((d) => d.crit)).toEqual(['high', 'low']);
  });

  it('computes subtotals per die type', () => {
    const r = rollInstant(spec('2d6+1d20'), seq([3, 4, 9]));
    expect(r.subtotals).toEqual([
      { type: 'd6', sum: 7 },
      { type: 'd20', sum: 9 },
    ]);
  });

  it('session asks for exactly the dice it needs', () => {
    const s = new RollSession(spec('2d6!'));
    expect(s.next()).toHaveLength(2);
    s.supply([6, 6]);
    expect(s.next().map((r) => r.origin)).toEqual(['explode', 'explode']);
    s.supply([1, 2]);
    expect(s.done).toBe(true);
  });

  it('instant rolls stay in range', () => {
    const s = spec('3d6+2d20+1d100+2d4+2d8+2d10+2d12');
    for (let i = 0; i < 200; i++) {
      for (const d of rollInstant(s).dice) {
        expect(d.value).toBeGreaterThanOrEqual(1);
        expect(d.value).toBeLessThanOrEqual(SIDES[d.type]);
      }
    }
  });

  it('records statistics', () => {
    const r = rollInstant(spec('2d6+1d100'), seq([3, 4, 55]));
    const st = {};
    addDice(st, r.dice);
    expect(st).toMatchObject({ d6: { n: 2, sum: 7 }, d100: { n: 1, sum: 55 } });
  });
});
