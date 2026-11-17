// Plain-text description of a finished roll (used for "copy" and for the history list).

import { toNotation } from './notation';
import { DIE_TYPES, type DieRec, type RollResult, type RollSpec } from './types';

/** One die as text: `~~1~~` dropped, `2^` superseded by a reroll, `6!` exploded, `3r` is a reroll result. */
export function dieText(d: DieRec): string {
  const v = String(d.value);
  if (d.status === 'dropped') return `~~${v}~~`;
  if (d.status === 'rerolled') return `(${v})`;
  let s = v;
  if (d.exploded) s += '!';
  if (d.origin === 'reroll') s += 'r';
  return s;
}

/** Dice in display order: by type, then by throw order. */
export function sortedDice(dice: DieRec[]): DieRec[] {
  return [...dice].sort((a, b) => DIE_TYPES.indexOf(a.type) - DIE_TYPES.indexOf(b.type) || a.id - b.id);
}

/** `4d6dl1: 6, 5, 3, ~~1~~ = 14`. */
export function formatRoll(spec: RollSpec, result: RollResult, label?: string): string {
  const head = label ? `${label} (${toNotation(spec)})` : toNotation(spec);
  const body = sortedDice(result.dice).map(dieText).join(', ');
  const mod = result.modifier ? ` ${result.modifier < 0 ? '-' : '+'} ${Math.abs(result.modifier)}` : '';
  const unit = result.successes ? ' successes' : '';
  let tail = `= ${result.total}${unit}`;
  if (spec.rules.display === 'subtotals' && !result.successes && result.subtotals.length > 1) {
    tail = `[${result.subtotals.map((s) => `${s.type}: ${s.sum}`).join(', ')}] ${tail}`;
  }
  return `${head}: ${body}${mod} ${tail}`;
}
