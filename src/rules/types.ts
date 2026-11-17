// Pure data types shared by the rules engine, the UI and the persisted config.

export type DieType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100';

export const DIE_TYPES: DieType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

export const SIDES: Record<DieType, number> = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20, d100: 100 };

/** Total number of dice (logical dice, a d100 counts as one) allowed in one roll. */
export const MAX_DICE = 50;

/** Explosions and rerolls per die are capped to keep the roll finite. */
export const MAX_CHAIN = 10;

export type KeepMode = 'kh' | 'kl' | 'dh' | 'dl';

export interface KeepRule {
  mode: KeepMode;
  n: number;
}

export interface Group {
  type: DieType;
  count: number;
  keep?: KeepRule | null;
}

export interface Rules {
  /** A die showing its maximum rolls again and adds the new value. */
  explode: boolean;
  /** Reroll values <= threshold, once or until above it (capped). */
  reroll: { enabled: boolean; threshold: number; until: boolean };
  /** Count dice >= target instead of summing them. */
  successes: { enabled: boolean; target: number; onesSubtract: boolean };
  /** Die types that get critical highlights (natural max / natural 1). */
  crit: DieType[];
  display: 'total' | 'subtotals';
}

export interface RollSpec {
  groups: Group[];
  modifier: number;
  rules: Rules;
}

export function defaultRules(): Rules {
  return {
    explode: false,
    reroll: { enabled: false, threshold: 1, until: false },
    successes: { enabled: false, target: 5, onesSubtract: false },
    crit: ['d20'],
    display: 'total',
  };
}

export function emptySpec(): RollSpec {
  return { groups: [], modifier: 0, rules: defaultRules() };
}

export type DieOrigin = 'base' | 'explode' | 'reroll';
export type DieStatus = 'kept' | 'dropped' | 'rerolled';

export interface DieRec {
  id: number;
  type: DieType;
  value: number;
  origin: DieOrigin;
  /** Id of the die this one was spawned by (explosion or reroll). */
  parent?: number;
  status: DieStatus;
  /** The die exploded (showed its maximum and spawned another one). */
  exploded?: boolean;
  crit?: 'high' | 'low';
}

export interface RollResult {
  dice: DieRec[];
  /** Sum (or success count) plus the modifier. */
  total: number;
  /** Sum of kept dice per type, in display order. */
  subtotals: { type: DieType; sum: number }[];
  successes: boolean;
  modifier: number;
}
