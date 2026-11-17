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

export interface RollParts {
  head: string;
  dice: DieRec[];
  /** Text after the dice: modifier, subtotals and total. */
  tail: string;
}

/** The pieces of the formula line, so the UI can style dropped dice instead of printing markup. */
export function formatParts(spec: RollSpec, result: RollResult, label?: string): RollParts {
  const head = label ? `${label} (${toNotation(spec)})` : toNotation(spec);
  const mod = result.modifier ? ` ${result.modifier < 0 ? '-' : '+'} ${Math.abs(result.modifier)}` : '';
  const unit = result.successes ? ' successes' : '';
  let tail = `= ${result.total}${unit}`;
  if (spec.rules.display === 'subtotals' && !result.successes && result.subtotals.length > 1) {
    tail = `[${result.subtotals.map((x) => `${x.type}: ${x.sum}`).join(', ')}] ${tail}`;
  }
  return { head, dice: sortedDice(result.dice), tail: `${mod} ${tail}` };
}

/** `4d6dl1: 6, 5, 3, ~~1~~ = 14` (plain text for copying; ~~ marks a dropped die, as in Markdown). */
export function formatRoll(spec: RollSpec, result: RollResult, label?: string): string {
  const p = formatParts(spec, result, label);
  return `${p.head}: ${p.dice.map(dieText).join(', ')}${p.tail}`;
}
