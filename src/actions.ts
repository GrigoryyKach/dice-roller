// Application logic: building the roll, running it (animated or quick), results, history, presets, updates.

import { api, isNewer } from './api';
import { setLang, t } from './i18n';
import { cryptoDie, finalize, rollInstant, RollSession } from './rules/engine';
import { formatRoll } from './rules/format';
import { parseNotation } from './rules/notation';
import { DIE_TYPES, type DieRec, type DieType, type Group, MAX_DICE, type RollResult, type RollSpec, SIDES } from './rules/types';
import type { Flick } from './sim/physics';
import type { Marks, Stage } from './scene/stage';
import {
  clearHistory,
  type HistoryEntry,
  nextEntryId,
  notify,
  type Preset,
  recordEntry,
  recordStats,
  saveConfig,
  saveHistory,
  state,
  totalDice,
} from './store';
import { toast } from './ui/toast';

export const ctx: { stage: Stage | null } = { stage: null };

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// ───────────── editing the selection ─────────────

/** Brings a spec into a valid shape: sorted groups, no empty ones, keep counts within range, at most MAX_DICE dice. */
export function normalize(spec: RollSpec): void {
  let left = MAX_DICE;
  spec.groups = spec.groups
    .filter((g) => g.count > 0)
    .sort((a, b) => DIE_TYPES.indexOf(a.type) - DIE_TYPES.indexOf(b.type))
    .map((g) => {
      const count = Math.min(g.count, left);
      left -= count;
      const keep = g.keep && g.keep.n >= 1 ? { mode: g.keep.mode, n: Math.min(g.keep.n, count) } : null;
      return { ...g, count, keep };
    })
    .filter((g) => g.count > 0);
}

export function editSpec(mut: (s: RollSpec) => void): void {
  mut(state.config.spec);
  normalize(state.config.spec);
  saveConfig();
  notify();
}

export function addDie(type: DieType, delta: number): void {
  const spec = state.config.spec;
  if (delta > 0 && totalDice(spec) >= MAX_DICE) {
    toast(t('tray.limit', { n: MAX_DICE }), 'info', 2200);
    return;
  }
  editSpec((s) => {
    const g = s.groups.find((x) => x.type === type);
    if (g) g.count += delta;
    else if (delta > 0) s.groups.push({ type, count: delta, keep: null });
  });
}

export function clearDice(): void {
  editSpec((s) => {
    s.groups = [];
    s.modifier = 0;
  });
}

/** Applies typed notation to the selection. Returns an error for the UI, or null. */
export function applyNotation(text: string): { code: string; arg?: string } | null {
  const p = parseNotation(text);
  if (!p.ok) return p.error;
  state.config.spec.groups = p.groups as Group[];
  state.config.spec.modifier = p.modifier;
  state.config.spec.rules.explode = p.explode;
  normalize(state.config.spec);
  saveConfig();
  notify();
  return null;
}

export function setSpecWhole(spec: RollSpec): void {
  state.config.spec = clone(spec);
  normalize(state.config.spec);
  saveConfig();
  notify();
}

// ───────────── marks and selection ─────────────

function marksFor(result: RollResult | null, selected: number | null): Map<number, Marks> {
  const m = new Map<number, Marks>();
  if (!result) return m;
  for (const d of result.dice) {
    const mk: Marks = {};
    if (d.status !== 'kept') mk.dropped = true;
    if (d.crit) mk.crit = d.crit;
    if (d.id === selected) mk.selected = true;
    m.set(d.id, mk);
  }
  return m;
}

export function refreshMarks(): void {
  ctx.stage?.setMarks(marksFor(state.current?.result ?? null, state.selected));
}

export function selectDie(tag: number | null): void {
  state.selected = tag !== null && state.selected === tag ? null : tag;
  refreshMarks();
  notify();
}

// ───────────── rolling ─────────────

let busy = false;

function entryFrom(spec: RollSpec, result: RollResult, label?: string): HistoryEntry {
  return {
    id: nextEntryId(),
    ts: Date.now(),
    ...(label ? { label } : {}),
    spec: clone(spec),
    dice: result.dice,
    total: result.total,
    subtotals: result.subtotals,
    successes: result.successes,
    modifier: result.modifier,
  };
}

function show(spec: RollSpec, result: RollResult, label?: string): void {
  const entry = entryFrom(spec, result, label);
  recordEntry(entry);
  recordStats(result.dice);
  state.current = { entry, result, spec: clone(spec), label };
  state.selected = null;
  refreshMarks();
  notify();
}

export async function roll(opts: { flick?: Flick; spec?: RollSpec; label?: string } = {}): Promise<void> {
  if (busy) return;
  const spec = clone(opts.spec ?? state.config.spec);
  normalize(spec);
  if (totalDice(spec) === 0) {
    toast(t('tray.pick'), 'info', 2200);
    return;
  }
  busy = true;
  state.busy = true;
  state.current = null;
  state.selected = null;
  notify();
  const stage = ctx.stage;
  if (stage) stage.clatter.enabled = state.config.sound;
  try {
    if (!stage || state.config.quick || !state.webgl) {
      const result = rollInstant(spec);
      await stage?.place(result.dice.map((d) => ({ tag: d.id, type: d.type, value: d.value })));
      show(spec, result, opts.label);
    } else {
      stage.clear();
      const session = new RollSession(spec);
      let first = true;
      while (!session.done) {
        const reqs = session.next();
        const base = session.dice.length + 1;
        const tags = reqs.map((_, i) => base + i);
        const values = await stage.throwDice(
          reqs.map((r, i) => ({ tag: tags[i], type: r.type })),
          { speed: state.config.speed, flick: first ? opts.flick : undefined },
        );
        first = false;
        session.supply(tags.map((tag) => values.get(tag)!));
      }
      show(spec, finalize(spec, session.dice), opts.label);
    }
  } catch (err) {
    console.error(err);
    toast(String(err), 'error');
  } finally {
    busy = false;
    state.busy = false;
    notify();
  }
}

/** A single die can be rerolled when no rule chains dice to each other. */
export function canRerollDie(d: DieRec | undefined): boolean {
  const cur = state.current;
  if (!cur || !d || busy) return false;
  const r = cur.spec.rules;
  return !r.explode && !r.reroll.enabled && d.origin === 'base' && d.status !== 'rerolled';
}

export async function rerollDie(tag: number): Promise<void> {
  const cur = state.current;
  const die = cur?.result.dice.find((d) => d.id === tag);
  if (!cur || !die || !canRerollDie(die)) return;
  busy = true;
  state.busy = true;
  notify();
  try {
    const stage = ctx.stage;
    let value: number;
    if (!stage || state.config.quick || !state.webgl) {
      value = cryptoDie(SIDES[die.type]);
    } else {
      stage.removeDie(tag);
      const out = await stage.throwDice([{ tag, type: die.type }], { speed: state.config.speed });
      value = out.get(tag)!;
    }
    die.value = value;
    const res = finalize(cur.spec, cur.result.dice);
    cur.result = res;
    cur.entry.total = res.total;
    cur.entry.subtotals = res.subtotals;
    recordStats([{ ...die }]);
    saveHistory();
    if (!stage || state.config.quick || !state.webgl) {
      await stage?.place(res.dice.map((d) => ({ tag: d.id, type: d.type, value: d.value })));
    }
    refreshMarks();
  } finally {
    busy = false;
    state.busy = false;
    notify();
  }
}

export function resultText(): string {
  const c = state.current;
  return c ? formatRoll(c.spec, c.result, c.label) : '';
}

export function entryText(e: HistoryEntry): string {
  const res: RollResult = { dice: e.dice, total: e.total, subtotals: e.subtotals, successes: e.successes, modifier: e.modifier };
  return formatRoll(e.spec, res, e.label);
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

// ───────────── presets and history ─────────────

export function presetName(p: Preset): string {
  return p.nameKey ? t(p.nameKey) : p.name;
}

export function savePreset(name: string): boolean {
  if (totalDice(state.config.spec) === 0) {
    toast(t('presets.needDice'), 'info', 2200);
    return false;
  }
  state.config.presets.push({ id: `p${Date.now().toString(36)}`, name: name.slice(0, 60) || t('presets.new'), spec: clone(state.config.spec) });
  saveConfig();
  notify();
  return true;
}

export function renamePreset(id: string, name: string): void {
  const p = state.config.presets.find((x) => x.id === id);
  if (!p) return;
  p.name = name.slice(0, 60);
  delete p.nameKey;
  saveConfig();
  notify();
}

export function deletePreset(id: string): void {
  state.config.presets = state.config.presets.filter((p) => p.id !== id);
  saveConfig();
  notify();
}

export function runPreset(p: Preset): void {
  setSpecWhole(p.spec);
  void roll({ spec: p.spec, label: presetName(p) });
}

export function loadPreset(p: Preset): void {
  setSpecWhole(p.spec);
}

export function rollAgain(e: HistoryEntry): void {
  setSpecWhole(e.spec);
  void roll({ spec: e.spec, label: e.label });
}

export function wipeHistory(): void {
  clearHistory();
  notify();
}

// ───────────── settings ─────────────

export function applySettings(): void {
  const c = state.config;
  const root = document.documentElement;
  if (c.theme === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = c.theme;
  if (c.language) setLang(c.language);
  const stage = ctx.stage;
  if (stage) {
    stage.setSkins(c.skins, c.d6Pips);
    stage.setSpeed(c.speed);
    stage.clatter.enabled = c.sound;
  }
}

// ───────────── updates ─────────────

export async function checkUpdates(): Promise<void> {
  state.updateStatus = 'checking';
  notify();
  try {
    const r = await api.checkUpdate();
    if (!r) {
      state.updateStatus = 'failed';
    } else if (isNewer(r.tag, state.version)) {
      state.update = { version: r.tag.replace(/^v/, ''), url: r.url };
      state.updateStatus = 'available';
    } else {
      state.update = null;
      state.updateStatus = 'latest';
    }
  } catch {
    state.updateStatus = 'failed';
  }
  notify();
}

export async function applyUpdate(): Promise<void> {
  if (await api.applyUpdate()) await api.exit();
}
