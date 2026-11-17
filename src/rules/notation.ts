// Dice notation: parse "3d6+2", "2d20kh1", "4d6dl1", "d100", "1d8+1d6+3", "4d6!" and print a spec back.

import { DIE_TYPES, type DieType, type Group, type KeepMode, MAX_DICE, type RollSpec, SIDES } from './types';

export type NotationError =
  | { code: 'empty' }
  | { code: 'syntax'; arg: string }
  | { code: 'sides'; arg: string }
  | { code: 'count'; arg: string }
  | { code: 'tooMany'; arg: string }
  | { code: 'negDice' }
  | { code: 'keepN'; arg: string }
  | { code: 'dupKeep'; arg: string };

export type Parsed = { ok: true; groups: Group[]; modifier: number; explode: boolean } | { ok: false; error: NotationError };

const TERM = /^(\d*)d(\d+)(?:(kh|kl|dh|dl|k)(\d*))?(!)?/;
const CONST = /^\d+/;

export function parseNotation(input: string): Parsed {
  const text = input.toLowerCase().replace(/\s+/g, '');
  if (!text) return { ok: false, error: { code: 'empty' } };
  const groups = new Map<DieType, Group>();
  let modifier = 0;
  let explode = false;
  let pos = 0;
  let first = true;
  while (pos < text.length) {
    let sign = 1;
    const c = text[pos];
    if (c === '+' || c === '-') {
      sign = c === '-' ? -1 : 1;
      pos++;
    } else if (!first) {
      return { ok: false, error: { code: 'syntax', arg: text.slice(pos, pos + 3) } };
    }
    first = false;
    const rest = text.slice(pos);
    const m = TERM.exec(rest);
    if (m) {
      const count = m[1] === '' ? 1 : parseInt(m[1], 10);
      const sides = parseInt(m[2], 10);
      const type = `d${sides}` as DieType;
      if (!DIE_TYPES.includes(type)) return { ok: false, error: { code: 'sides', arg: m[2] } };
      if (sign < 0) return { ok: false, error: { code: 'negDice' } };
      if (count < 1) return { ok: false, error: { code: 'count', arg: m[1] } };
      let keep: Group['keep'] = null;
      if (m[3]) {
        const mode = (m[3] === 'k' ? 'kh' : m[3]) as KeepMode;
        const n = m[4] === '' || m[4] === undefined ? 1 : parseInt(m[4], 10);
        if (n < 1 || n > count) return { ok: false, error: { code: 'keepN', arg: `${m[3]}${m[4] ?? ''}` } };
        keep = { mode, n };
      }
      if (m[5]) explode = true;
      const prev = groups.get(type);
      if (prev) {
        if (prev.keep && keep && (prev.keep.mode !== keep.mode || prev.keep.n !== keep.n)) return { ok: false, error: { code: 'dupKeep', arg: type } };
        prev.count += count;
        prev.keep = prev.keep ?? keep;
      } else {
        groups.set(type, { type, count, keep });
      }
      pos += m[0].length;
      continue;
    }
    const k = CONST.exec(rest);
    if (k && !rest.slice(k[0].length).startsWith('d')) {
      modifier += sign * parseInt(k[0], 10);
      pos += k[0].length;
      continue;
    }
    return { ok: false, error: { code: 'syntax', arg: rest.slice(0, 3) } };
  }
  const list = DIE_TYPES.filter((t) => groups.has(t)).map((t) => groups.get(t)!);
  if (!list.length && modifier === 0) return { ok: false, error: { code: 'empty' } };
  const total = list.reduce((s, g) => s + g.count, 0);
  if (total > MAX_DICE) return { ok: false, error: { code: 'tooMany', arg: String(MAX_DICE) } };
  for (const g of list) {
    if (g.keep && g.keep.n > g.count) return { ok: false, error: { code: 'keepN', arg: `${g.keep.mode}${g.keep.n}` } };
  }
  if (modifier > 999 || modifier < -999) return { ok: false, error: { code: 'syntax', arg: String(modifier) } };
  return { ok: true, groups: list, modifier, explode };
}

function groupText(g: Group, explode: boolean): string {
  return `${g.count}${g.type}${g.keep ? `${g.keep.mode}${g.keep.n}` : ''}${explode ? '!' : ''}`;
}

/** Compact notation that `parseNotation` reads back: "2d6+1d20kh1+3". */
export function toNotation(spec: RollSpec): string {
  return toSummary(spec).replace(/ /g, '');
}

/** Readable summary line: "2d6 + 1d20 + 3". */
export function toSummary(spec: RollSpec): string {
  const groups = spec.groups.filter((g) => g.count > 0);
  let s = groups.map((g) => groupText(g, spec.rules.explode)).join(' + ');
  if (spec.modifier !== 0) {
    const m = `${spec.modifier < 0 ? '-' : '+'} ${Math.abs(spec.modifier)}`;
    s = s ? `${s} ${m}` : String(spec.modifier);
  }
  return s;
}

export function totalDice(spec: RollSpec): number {
  return spec.groups.reduce((s, g) => s + g.count, 0);
}

export function sidesOf(type: DieType): number {
  return SIDES[type];
}
