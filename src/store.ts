// Application state: persisted config, history and statistics, plus the current selection and result.

import { api, type InitData } from './api';
import { defaultSkins, isSkinId, type SkinSettings } from './dice/skins';
import { isLang, type Lang } from './i18n';
import { addDice, emptyStats, sanitizeStats, type Stats } from './rules/stats';
import {
  defaultRules,
  DIE_TYPES,
  type DieRec,
  type DieType,
  type Group,
  MAX_DICE,
  type RollResult,
  type RollSpec,
  type Rules,
} from './rules/types';

export type Theme = 'system' | 'light' | 'dark';
export type TabId = 'result' | 'history' | 'stats' | 'presets' | 'rules';

export interface Preset {
  id: string;
  name: string;
  /** Built-in presets are translated through this key until they are renamed. */
  nameKey?: 'presets.attack' | 'presets.fireball' | 'presets.stats';
  spec: RollSpec;
}

export interface Config {
  /** Absent until the first start: then the marker or `en` decides and the choice is saved. */
  language?: Lang;
  theme: Theme;
  skins: SkinSettings;
  d6Pips: boolean;
  quick: boolean;
  sound: boolean;
  speed: 1 | 1.5 | 2;
  checkUpdates: boolean;
  spec: RollSpec;
  presets: Preset[];
  panelOpen: boolean;
  tab: TabId;
}

export interface HistoryEntry {
  id: number;
  ts: number;
  label?: string;
  spec: RollSpec;
  dice: DieRec[];
  total: number;
  subtotals: { type: DieType; sum: number }[];
  successes: boolean;
  modifier: number;
}

export const HISTORY_LIMIT = 500;

export function builtinPresets(): Preset[] {
  const rules = defaultRules;
  return [
    { id: 'builtin-attack', name: 'Attack (d20+5)', nameKey: 'presets.attack', spec: { groups: [{ type: 'd20', count: 1 }], modifier: 5, rules: rules() } },
    { id: 'builtin-fireball', name: 'Fireball (8d6)', nameKey: 'presets.fireball', spec: { groups: [{ type: 'd6', count: 8 }], modifier: 0, rules: rules() } },
    {
      id: 'builtin-stats',
      name: 'Stats (4d6 drop lowest)',
      nameKey: 'presets.stats',
      spec: { groups: [{ type: 'd6', count: 4, keep: { mode: 'dl', n: 1 } }], modifier: 0, rules: rules() },
    },
  ];
}

export function defaultConfig(): Config {
  return {
    theme: 'system',
    skins: defaultSkins(),
    d6Pips: false,
    quick: false,
    sound: false,
    speed: 1,
    checkUpdates: true,
    spec: { groups: [{ type: 'd20', count: 1 }], modifier: 0, rules: defaultRules() },
    presets: builtinPresets(),
    panelOpen: true,
    tab: 'result',
  };
}

// ───────────── sanitising whatever is on disk ─────────────

const num = (v: unknown, d: number, lo: number, hi: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : d;
  return Math.max(lo, Math.min(hi, Math.round(n)));
};
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const isType = (v: unknown): v is DieType => typeof v === 'string' && (DIE_TYPES as string[]).includes(v);
const color = (v: unknown, d: string): string => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d);

export function sanitizeSpec(raw: unknown, fallback: RollSpec): RollSpec {
  if (!raw || typeof raw !== 'object') return fallback;
  const r = raw as Record<string, unknown>;
  const groups: Group[] = [];
  let total = 0;
  if (Array.isArray(r.groups)) {
    for (const g of r.groups) {
      if (!g || typeof g !== 'object' || !isType((g as Group).type)) continue;
      const type = (g as Group).type;
      if (groups.some((x) => x.type === type)) continue;
      const count = Math.min(num((g as Group).count, 1, 1, MAX_DICE), MAX_DICE - total);
      if (count < 1) continue;
      total += count;
      const k = (g as Group).keep;
      const keep = k && ['kh', 'kl', 'dh', 'dl'].includes(k.mode) ? { mode: k.mode, n: num(k.n, 1, 1, count) } : null;
      groups.push({ type, count, keep });
    }
  }
  groups.sort((a, b) => DIE_TYPES.indexOf(a.type) - DIE_TYPES.indexOf(b.type));
  const d = defaultRules();
  const ru = (r.rules && typeof r.rules === 'object' ? r.rules : {}) as Partial<Rules>;
  const rr = (ru.reroll ?? {}) as Partial<Rules['reroll']>;
  const su = (ru.successes ?? {}) as Partial<Rules['successes']>;
  const rules: Rules = {
    explode: bool(ru.explode, false),
    reroll: { enabled: bool(rr.enabled, false), threshold: num(rr.threshold, 1, 1, 99), until: bool(rr.until, false) },
    successes: { enabled: bool(su.enabled, false), target: num(su.target, 5, 1, 100), onesSubtract: bool(su.onesSubtract, false) },
    crit: Array.isArray(ru.crit) ? ru.crit.filter(isType) : d.crit,
    display: ru.display === 'subtotals' ? 'subtotals' : 'total',
  };
  return { groups, modifier: num(r.modifier, 0, -999, 999), rules };
}

export function sanitizeConfig(raw: unknown): Config {
  const d = defaultConfig();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const sk = (r.skins && typeof r.skins === 'object' ? r.skins : {}) as Partial<SkinSettings>;
  const per: SkinSettings['per'] = {};
  for (const t of DIE_TYPES) {
    const v = sk.per?.[t];
    if (isSkinId(v)) per[t] = v;
  }
  const presets: Preset[] = [];
  if (Array.isArray(r.presets)) {
    for (const p of r.presets) {
      if (!p || typeof p !== 'object' || typeof (p as Preset).name !== 'string' || typeof (p as Preset).id !== 'string') continue;
      const spec = sanitizeSpec((p as Preset).spec, d.spec);
      if (!spec.groups.length) continue;
      const nk = (p as Preset).nameKey;
      presets.push({
        id: (p as Preset).id,
        name: (p as Preset).name.slice(0, 60),
        ...(nk === 'presets.attack' || nk === 'presets.fireball' || nk === 'presets.stats' ? { nameKey: nk } : {}),
        spec,
      });
    }
  }
  const tabs: TabId[] = ['result', 'history', 'stats', 'presets', 'rules'];
  return {
    language: isLang(r.language) ? r.language : undefined,
    theme: r.theme === 'light' || r.theme === 'dark' ? r.theme : 'system',
    skins: {
      all: isSkinId(sk.all) ? sk.all : 'ivory',
      per,
      custom: { body: color(sk.custom?.body, d.skins.custom.body), num: color(sk.custom?.num, d.skins.custom.num) },
    },
    d6Pips: bool(r.d6Pips, false),
    quick: bool(r.quick, false),
    sound: bool(r.sound, false),
    speed: r.speed === 1.5 || r.speed === 2 ? r.speed : 1,
    checkUpdates: bool(r.checkUpdates, true),
    spec: (() => {
      const s = sanitizeSpec(r.spec, d.spec);
      return s.groups.length || s.modifier ? s : d.spec;
    })(),
    presets: Array.isArray(r.presets) ? presets : d.presets,
    panelOpen: bool(r.panelOpen, true),
    tab: tabs.includes(r.tab as TabId) ? (r.tab as TabId) : 'result',
  };
}

/** Parses JSON that may start with a byte-order mark. */
export function parseJson(text: string | null): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return null;
  }
}

// ───────────── runtime state ─────────────

type Listener = () => void;

export interface UpdatePhase {
  phase: 'idle' | 'downloading' | 'verifying' | 'installing' | 'restarting' | 'failed';
  done: number;
  total: number;
  error?: string | null;
}

export const state = {
  config: defaultConfig(),
  history: [] as HistoryEntry[],
  allStats: emptyStats() as Stats,
  sessionStats: emptyStats() as Stats,
  /** The roll shown in the result panel. */
  current: null as { entry: HistoryEntry; result: RollResult; spec: RollSpec; label?: string } | null,
  selected: null as number | null,
  busy: false,
  update: null as { version: string; url: string } | null,
  updateStatus: 'idle' as 'idle' | 'checking' | 'latest' | 'available' | 'failed',
  /** Progress of a running self-update (null when none). */
  updatePhase: null as UpdatePhase | null,
  /** Test hook: start the update right after the check finds one (`DICE_ROLLER_AUTO_UPDATE=1`). */
  autoUpdate: false,
  version: '1.0.0',
  dataDir: '',
  webgl: true,
};

const listeners = new Set<Listener>();
export function subscribe(fn: Listener): void {
  listeners.add(fn);
}
export function notify(): void {
  for (const l of listeners) l();
}

export function loadState(init: InitData): void {
  state.config = sanitizeConfig(parseJson(init.config));
  state.version = init.version;
  state.dataDir = init.dataDir;
  const h = parseJson(init.history);
  state.history = Array.isArray(h) ? (h as HistoryEntry[]).filter((e) => e && Array.isArray(e.dice) && e.spec).slice(0, HISTORY_LIMIT) : [];
  state.allStats = sanitizeStats(parseJson(init.stats));
}

let saveTimers: Partial<Record<'config' | 'history' | 'stats', number>> = {};

function saveSoon(name: 'config' | 'history' | 'stats', text: () => string): void {
  window.clearTimeout(saveTimers[name]);
  saveTimers[name] = window.setTimeout(() => void api.saveJson(name, text()).catch(() => {}), 250);
}

export function saveConfig(): void {
  saveSoon('config', () => JSON.stringify(state.config, null, 1));
}

export function saveHistory(): void {
  saveSoon('history', () => JSON.stringify(state.history));
  saveSoon('stats', () => JSON.stringify(state.allStats));
}

/** Writes config, history and statistics right now (cancelling the delayed saves). `false` if any write failed. */
export async function flushAll(): Promise<boolean> {
  const files: [keyof typeof saveTimers, string][] = [
    ['config', JSON.stringify(state.config, null, 1)],
    ['history', JSON.stringify(state.history)],
    ['stats', JSON.stringify(state.allStats)],
  ];
  let ok = true;
  for (const [name, text] of files) {
    clearTimeout(saveTimers[name]);
    try {
      await api.saveJson(name, text);
    } catch {
      ok = false;
    }
  }
  return ok;
}

export function nextEntryId(): number {
  return state.history.reduce((m, e) => Math.max(m, e.id), 0) + 1;
}

export function recordEntry(entry: HistoryEntry): void {
  state.history.unshift(entry);
  if (state.history.length > HISTORY_LIMIT) state.history.length = HISTORY_LIMIT;
  saveHistory();
}

export function recordStats(dice: DieRec[]): void {
  addDice(state.allStats, dice);
  addDice(state.sessionStats, dice);
  saveHistory();
}

export function clearHistory(): void {
  state.history = [];
  saveHistory();
}

export function totalDice(spec: RollSpec): number {
  return spec.groups.reduce((s, g) => s + g.count, 0);
}
