// The side panel: Result, History, Stats, Presets and Rules tabs.
import {
  canRerollDie,
  copyText,
  deletePreset,
  editSpec,
  entryText,
  loadPreset,
  presetName,
  renamePreset,
  rerollDie,
  resultText,
  rollAgain,
  runPreset,
  savePreset,
  selectDie,
  setSpecWhole,
  wipeHistory,
} from '../actions';
import { h, svg } from '../dom';
import { getLang, t } from '../i18n';
import { icons } from '../icons';
import { dieText, formatParts, sortedDice } from '../rules/format';
import { toNotation, toSummary } from '../rules/notation';
import { BUCKETS, expectedAverage, type Stats } from '../rules/stats';
import { defaultRules, DIE_TYPES, type DieRec, type RollResult, type DieType, type KeepMode, type RollSpec } from '../rules/types';
import { saveConfig, state, type TabId, notify, type HistoryEntry } from '../store';
import { confirmDialog, promptDialog } from './dialog';
import { toast } from './toast';

const TABS: { id: TabId; key: 'tab.result' | 'tab.history' | 'tab.stats' | 'tab.presets' | 'tab.rules' }[] = [
  { id: 'result', key: 'tab.result' },
  { id: 'history', key: 'tab.history' },
  { id: 'stats', key: 'tab.stats' },
  { id: 'presets', key: 'tab.presets' },
  { id: 'rules', key: 'tab.rules' },
];

const tabsEl = h('div', { class: 'tabs', role: 'tablist' });
const body = h('div', { class: 'tab-body' });
export const panelEl = h('aside', { class: 'side' }, tabsEl, body);

let statsScope: 'session' | 'all' = 'session';
let presetDraft = '';

function setTab(id: TabId): void {
  state.config.tab = id;
  saveConfig();
  notify();
}

export function renderPanel(): void {
  panelEl.classList.toggle('closed', !state.config.panelOpen);
  tabsEl.replaceChildren(
    ...TABS.map((tab) =>
      h(
        'button',
        { class: `tab${state.config.tab === tab.id ? ' active' : ''}`, role: 'tab', 'aria-selected': state.config.tab === tab.id, title: t(tab.key), onclick: () => setTab(tab.id) },
        t(tab.key),
      ),
    ),
  );
  const scroll = body.scrollTop;
  const sameTab = body.dataset.tab === state.config.tab;
  switch (state.config.tab) {
    case 'result': body.replaceChildren(...resultView()); break;
    case 'history': body.replaceChildren(...historyView()); break;
    case 'stats': body.replaceChildren(...statsView()); break;
    case 'presets': body.replaceChildren(...presetsView()); break;
    case 'rules': body.replaceChildren(...rulesView()); break;
  }
  body.dataset.tab = state.config.tab;
  body.scrollTop = sameTab ? scroll : 0;
}

// ───────────── result ─────────────

function dieChip(d: DieRec, mixed: boolean): HTMLElement {
  const cls = ['die-chip'];
  if (d.status === 'dropped') cls.push('dropped');
  if (d.status === 'rerolled') cls.push('rerolled');
  if (d.crit) cls.push(d.crit);
  if (state.selected === d.id) cls.push('sel');
  const marks: string[] = [];
  if (d.exploded) marks.push('!');
  if (d.origin === 'reroll') marks.push('↻');
  if (d.status === 'rerolled') marks.push('↻');
  if (d.origin === 'explode') marks.push('+');
  const tips: string[] = [d.type.toUpperCase()];
  if (d.status === 'dropped') tips.push(t('result.dropped'));
  if (d.status === 'rerolled') tips.push(t('result.rerolled'));
  if (d.exploded) tips.push(t('result.exploded'));
  if (d.origin === 'reroll') tips.push(t('result.fromReroll'));
  if (d.origin === 'explode') tips.push(t('result.fromExplode'));
  if (d.crit) tips.push(t(d.crit === 'high' ? 'result.crit.high' : 'result.crit.low'));
  return h(
    'button',
    { class: cls.join(' '), title: tips.join(' · '), onclick: () => selectDie(d.id) },
    mixed ? h('small', null, d.type) : null,
    h('span', { class: 'v' }, d.value),
    marks.length ? h('span', { class: 'mark' }, marks.join('')) : null,
  );
}

/** Formula line with dropped dice struck through and greyed, rerolled ones in brackets. */
function formulaNodes(spec: RollSpec, result: RollResult, label?: string): (Node | string)[] {
  const p = formatParts(spec, result, label);
  const out: (Node | string)[] = [`${p.head}: `];
  p.dice.forEach((d, i) => {
    if (i) out.push(', ');
    if (d.status === 'dropped') out.push(h('s', { class: 'muted' }, String(d.value)));
    else out.push(dieText(d));
  });
  out.push(p.tail);
  return out;
}

function resultView(): HTMLElement[] {
  const cur = state.current;
  if (!cur) {
    return [h('div', { class: 'empty-note' }, state.busy ? t('tray.rolling') : t('result.empty'))];
  }
  const { result, spec } = cur;
  const dice = sortedDice(result.dice);
  const mixed = new Set(dice.map((d) => d.type)).size > 1;
  const out: HTMLElement[] = [];
  out.push(
    h(
      'div',
      { class: 'res-head' },
      h('div', { class: 'res-title' }, cur.label ? h('span', { class: 'res-label' }, `${cur.label} · `) : null, toNotation(spec)),
      h(
        'button',
        {
          class: 'icon-btn',
          title: t('result.copy'),
          'aria-label': t('result.copy'),
          onclick: async () => {
            await copyText(resultText());
            toast(t('result.copied'), 'ok', 1500);
          },
        },
        svg(icons.copy),
      ),
    ),
    h('div', { class: 'res-total' }, h('span', { class: 'big' }, result.total), h('span', { class: 'lbl' }, result.successes ? t('result.successes') : t('result.total'))),
  );
  if (spec.rules.display === 'subtotals' && !result.successes && result.subtotals.length > 1) {
    out.push(h('div', { class: 'res-sub' }, ...result.subtotals.map((s) => h('span', { class: 'subtotal' }, `${s.type.toUpperCase()}: ${s.sum}`))));
  }
  out.push(h('div', { class: 'res-formula' }, ...formulaNodes(spec, result, cur.label)));
  out.push(h('div', { class: 'chips-dice' }, ...dice.map((d) => dieChip(d, mixed))));
  if (result.modifier) out.push(h('div', { class: 'hint-line' }, `${t('result.modifier')}: ${result.modifier > 0 ? '+' : ''}${result.modifier}`));
  const sel = result.dice.find((d) => d.id === state.selected);
  if (sel) {
    const can = canRerollDie(sel);
    out.push(
      h(
        'div',
        { class: 'res-sel' },
        h('span', { class: 'grow' }, t('result.selected', { die: sel.type.toUpperCase(), v: sel.value })),
        h('button', { class: 'btn small primary', disabled: !can || state.busy, onclick: () => void rerollDie(sel.id) }, svg(icons.again), t('result.reroll')),
      ),
    );
    if (!can && sel.origin === 'base' && sel.status !== 'rerolled') out.push(h('div', { class: 'hint-line' }, t('result.rerollOff')));
  } else {
    out.push(h('div', { class: 'hint-line' }, t('result.pickHint')));
  }
  return out;
}

// ───────────── history ─────────────

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const lang = getLang();
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : d.toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' });
}

function diceLine(dice: DieRec[]): (Node | string)[] {
  const out: (Node | string)[] = [];
  sortedDice(dice).forEach((d, i) => {
    if (i) out.push(', ');
    if (d.status === 'dropped') out.push(h('s', null, String(d.value)));
    else out.push(dieText(d));
  });
  return out;
}

function historyView(): HTMLElement[] {
  const out: HTMLElement[] = [];
  out.push(
    h(
      'div',
      { class: 'bar-head' },
      h('span', { class: 'grow count' }, `${state.history.length}`),
      h(
        'button',
        {
          class: 'btn small danger-text',
          disabled: state.history.length === 0,
          onclick: async () => {
            const ok = await confirmDialog({ title: t('history.clear'), text: t('history.clear.confirm', { n: state.history.length }), confirm: t('dlg.delete'), danger: true });
            if (ok) wipeHistory();
          },
        },
        svg(icons.trash),
        t('history.clear'),
      ),
    ),
  );
  if (!state.history.length) {
    out.push(h('div', { class: 'empty-note' }, t('history.empty')));
    return out;
  }
  for (const e of state.history.slice(0, 200)) out.push(historyItem(e));
  return out;
}

function historyItem(e: HistoryEntry): HTMLElement {
  return h(
    'div',
    { class: 'list-item' },
    h(
      'div',
      { class: 'li-top' },
      h('div', { class: 'li-title', title: e.label ? `${e.label} (${toNotation(e.spec)})` : toNotation(e.spec) }, e.label ? `${e.label} · ${toNotation(e.spec)}` : toNotation(e.spec)),
      h('div', { class: 'li-total' }, e.total),
    ),
    h('div', { class: 'li-dice' }, ...diceLine(e.dice)),
    h(
      'div',
      { class: 'li-top', style: 'margin-top:8px' },
      h('div', { class: 'li-time', style: 'flex:1' }, fmtTime(e.ts)),
      h(
        'div',
        { class: 'li-actions' },
        h('button', { class: 'icon-btn small', title: t('history.copy'), 'aria-label': t('history.copy'), onclick: async () => { await copyText(entryText(e)); toast(t('result.copied'), 'ok', 1500); } }, svg(icons.copy)),
        h('button', { class: 'icon-btn small', title: t('history.again'), 'aria-label': t('history.again'), disabled: state.busy, onclick: () => rollAgain(e) }, svg(icons.again)),
      ),
    ),
  );
}

// ───────────── stats ─────────────

function statsView(): HTMLElement[] {
  const stats: Stats = statsScope === 'session' ? state.sessionStats : state.allStats;
  const out: HTMLElement[] = [
    h(
      'div',
      { class: 'bar-head' },
      h(
        'div',
        { class: 'segmented' },
        h('button', { class: `seg${statsScope === 'session' ? ' active' : ''}`, onclick: () => { statsScope = 'session'; notify(); } }, t('stats.session')),
        h('button', { class: `seg${statsScope === 'all' ? ' active' : ''}`, onclick: () => { statsScope = 'all'; notify(); } }, t('stats.all')),
      ),
    ),
  ];
  const types = DIE_TYPES.filter((d) => (stats[d]?.n ?? 0) > 0);
  if (!types.length) {
    out.push(h('div', { class: 'empty-note' }, t('stats.empty')));
    return out;
  }
  for (const type of types) {
    const s = stats[type]!;
    const max = Math.max(...s.dist, 1);
    const n = BUCKETS[type];
    out.push(
      h(
        'div',
        { class: 'stat-card' },
        h(
          'div',
          { class: 'stat-top' },
          h('span', { class: 'stat-name' }, type.toUpperCase()),
          h('span', { class: 'stat-meta' }, t('stats.rolls', { n: s.n })),
          h('span', { class: 'stat-meta' }, `${t('stats.avg', { a: (s.sum / s.n).toFixed(2) })} (${t('stats.expected', { e: expectedAverage(type).toFixed(1) })})`),
        ),
        h(
          'div',
          { class: 'bars' },
          ...s.dist.map((c, i) =>
            h('div', { class: `bar${c === max ? ' peak' : ''}`, style: `height:${Math.max(c ? 4 : 1, (c / max) * 100)}%`, title: `${type === 'd100' ? `${i * 10 + 1}–${i * 10 + 10}` : i + 1}: ${c}` }),
          ),
        ),
        h('div', { class: 'bar-axis' }, h('span', null, type === 'd100' ? '1' : '1'), h('span', null, type === 'd100' ? '100' : String(n))),
      ),
    );
  }
  out.push(h('div', { class: 'hint-line' }, t('stats.note')));
  return out;
}

// ───────────── presets ─────────────

function presetsView(): HTMLElement[] {
  const nameInput = h('input', { class: 'input text-input', type: 'text', maxlength: 60, placeholder: t('presets.name.ph'), value: presetDraft }) as HTMLInputElement;
  nameInput.value = presetDraft;
  nameInput.addEventListener('input', () => (presetDraft = nameInput.value));
  const save = () => {
    if (savePreset(presetDraft.trim())) presetDraft = '';
  };
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') save();
    e.stopPropagation();
  });
  const out: HTMLElement[] = [h('div', { class: 'preset-save' }, nameInput, h('button', { class: 'btn small', onclick: save }, svg(icons.plus), t('dlg.save')))];
  if (!state.config.presets.length) out.push(h('div', { class: 'empty-note' }, t('presets.empty')));
  for (const p of state.config.presets) {
    out.push(
      h(
        'div',
        { class: 'list-item' },
        h(
          'div',
          { class: 'li-top' },
          h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'p-name' }, presetName(p)), h('div', { class: 'p-sum' }, summaryOf(p.spec))),
          h(
            'div',
            { class: 'li-actions' },
            h('button', { class: 'icon-btn small', title: t('presets.load'), 'aria-label': t('presets.load'), onclick: () => loadPreset(p) }, svg(icons.dice)),
            h(
              'button',
              {
                class: 'icon-btn small',
                title: t('presets.rename'),
                'aria-label': t('presets.rename'),
                onclick: async () => {
                  const name = await promptDialog({ title: t('presets.rename.title'), value: presetName(p), confirm: t('dlg.save') });
                  if (name) renamePreset(p.id, name);
                },
              },
              svg(icons.edit),
            ),
            h(
              'button',
              {
                class: 'icon-btn small',
                title: t('presets.delete'),
                'aria-label': t('presets.delete'),
                onclick: async () => {
                  if (await confirmDialog({ title: t('presets.delete'), text: t('presets.delete.confirm', { n: presetName(p) }), confirm: t('dlg.delete'), danger: true })) deletePreset(p.id);
                },
              },
              svg(icons.trash),
            ),
            h('button', { class: 'btn small', style: 'margin-left:8px', disabled: state.busy, onclick: () => runPreset(p) }, svg(icons.play), t('presets.run')),
          ),
        ),
      ),
    );
  }
  return out;
}

function summaryOf(spec: RollSpec): string {
  const bits = [toSummary(spec)];
  const r = spec.rules;
  if (r.reroll.enabled) bits.push(`↻≤${r.reroll.threshold}`);
  if (r.successes.enabled) bits.push(`≥${r.successes.target}`);
  return bits.join('  ');
}

// ───────────── rules ─────────────

function toggle(on: boolean, onchange: (v: boolean) => void, label: string): HTMLElement {
  const input = h('input', { type: 'checkbox', 'aria-label': label }) as HTMLInputElement;
  input.checked = on;
  input.addEventListener('change', () => onchange(input.checked));
  return h('span', { class: 'switch' }, input, h('span'));
}

function numField(value: number, min: number, max: number, onchange: (v: number) => void, label?: string): HTMLInputElement {
  const el = h('input', { class: 'input num-input', type: 'number', min, max, step: 1, 'aria-label': label ?? '' }) as HTMLInputElement;
  el.value = String(value);
  el.addEventListener('change', () => {
    const v = Math.max(min, Math.min(max, Math.round(Number(el.value) || 0)));
    el.value = String(v);
    onchange(v);
  });
  el.addEventListener('keydown', (e) => e.stopPropagation());
  return el;
}

function rule(title: string, hint: string, on: boolean | null, onToggle: ((v: boolean) => void) | null, ...children: (HTMLElement | null)[]): HTMLElement {
  const kids = children.filter(Boolean) as HTMLElement[];
  return h(
    'div',
    { class: 'rule' },
    h('div', { class: 'rule-head' }, h('div', { class: 'set-text' }, h('div', { class: 'set-title' }, title), h('div', { class: 'hint' }, hint)), onToggle ? toggle(!!on, onToggle, title) : null),
    kids.length && (on === null || on) ? h('div', { class: 'rule-body' }, ...kids) : null,
  );
}

function rulesView(): HTMLElement[] {
  const spec = state.config.spec;
  const r = spec.rules;
  const out: HTMLElement[] = [h('div', { class: 'hint', style: 'margin-bottom:12px' }, t('rules.intro'))];

  out.push(
    rule(
      t('rules.modifier'),
      t('rules.modifier.hint'),
      null,
      null,
      h('div', { class: 'rule-row' }, numField(spec.modifier, -999, 999, (v) => editSpec((s) => (s.modifier = v)), t('rules.modifier'))),
    ),
  );

  // Keep / drop per die type.
  const keepRows = spec.groups.length
    ? spec.groups.map((g) => {
        const select = h(
          'select',
          { class: 'select small', 'aria-label': `${g.type} ${t('rules.keep')}` },
          h('option', { value: '' }, t('rules.keep.none')),
          ...(['kh', 'kl', 'dh', 'dl'] as KeepMode[]).map((m) => h('option', { value: m }, t(`rules.keep.${m}` as 'rules.keep.kh'))),
        ) as HTMLSelectElement;
        select.value = g.keep?.mode ?? '';
        select.addEventListener('change', () =>
          editSpec((s) => {
            const x = s.groups.find((q) => q.type === g.type)!;
            x.keep = select.value ? { mode: select.value as KeepMode, n: x.keep?.n ?? 1 } : null;
          }),
        );
        return h(
          'div',
          { class: 'rule-row' },
          h('span', { class: 'lbl' }, `${g.count}${g.type}`),
          select,
          g.keep ? numField(g.keep.n, 1, g.count, (v) => editSpec((s) => { const x = s.groups.find((q) => q.type === g.type)!; if (x.keep) x.keep.n = v; }), t('rules.keep')) : null,
        );
      })
    : [h('div', { class: 'hint' }, t('rules.keep.empty'))];
  out.push(
    rule(
      t('rules.keep'),
      t('rules.adv.hint'),
      null,
      null,
      h(
        'div',
        { class: 'pill-row' },
        h('button', { class: 'pill', onclick: () => editSpec((s) => (s.groups = [{ type: 'd20', count: 2, keep: { mode: 'kh', n: 1 } }])) }, t('rules.adv')),
        h('button', { class: 'pill', onclick: () => editSpec((s) => (s.groups = [{ type: 'd20', count: 2, keep: { mode: 'kl', n: 1 } }])) }, t('rules.dis')),
      ),
      ...keepRows,
    ),
  );

  out.push(rule(t('rules.explode'), t('rules.explode.hint'), r.explode, (v) => editSpec((s) => (s.rules.explode = v))));

  const rr = r.reroll;
  out.push(
    rule(
      t('rules.reroll'),
      t('rules.reroll.hint'),
      rr.enabled,
      (v) => editSpec((s) => (s.rules.reroll.enabled = v)),
      h('div', { class: 'rule-row' }, h('span', { class: 'grow' }, t('rules.reroll.le')), numField(rr.threshold, 1, 99, (v) => editSpec((s) => (s.rules.reroll.threshold = v)), t('rules.reroll.le'))),
      h(
        'div',
        { class: 'pill-row' },
        h('button', { class: `pill${!rr.until ? ' on' : ''}`, onclick: () => editSpec((s) => (s.rules.reroll.until = false)) }, t('rules.reroll.once')),
        h('button', { class: `pill${rr.until ? ' on' : ''}`, onclick: () => editSpec((s) => (s.rules.reroll.until = true)) }, t('rules.reroll.until')),
      ),
    ),
  );

  const su = r.successes;
  out.push(
    rule(
      t('rules.successes'),
      t('rules.successes.hint'),
      su.enabled,
      (v) => editSpec((s) => (s.rules.successes.enabled = v)),
      h('div', { class: 'rule-row' }, h('span', { class: 'grow' }, t('rules.successes.target')), numField(su.target, 1, 100, (v) => editSpec((s) => (s.rules.successes.target = v)), t('rules.successes.target'))),
      h('div', { class: 'rule-row' }, h('span', { class: 'grow' }, t('rules.successes.ones')), toggle(su.onesSubtract, (v) => editSpec((s) => (s.rules.successes.onesSubtract = v)), t('rules.successes.ones'))),
    ),
  );

  out.push(
    rule(
      t('rules.crit'),
      t('rules.crit.hint'),
      null,
      null,
      h(
        'div',
        { class: 'pill-row' },
        ...DIE_TYPES.map((type: DieType) =>
          h(
            'button',
            {
              class: `pill${r.crit.includes(type) ? ' on' : ''}`,
              'aria-pressed': r.crit.includes(type),
              onclick: () => editSpec((s) => (s.rules.crit = s.rules.crit.includes(type) ? s.rules.crit.filter((x) => x !== type) : [...s.rules.crit, type])),
            },
            type.toUpperCase(),
          ),
        ),
      ),
    ),
  );

  out.push(
    rule(
      t('rules.display'),
      '',
      null,
      null,
      h(
        'div',
        { class: 'pill-row' },
        h('button', { class: `pill${r.display === 'total' ? ' on' : ''}`, onclick: () => editSpec((s) => (s.rules.display = 'total')) }, t('rules.display.total')),
        h('button', { class: `pill${r.display === 'subtotals' ? ' on' : ''}`, onclick: () => editSpec((s) => (s.rules.display = 'subtotals')) }, t('rules.display.sub')),
      ),
    ),
  );

  out.push(
    h(
      'button',
      {
        class: 'btn small',
        style: 'margin-top:8px',
        onclick: () => {
          const s = JSON.parse(JSON.stringify(state.config.spec)) as RollSpec;
          s.rules = defaultRules();
          s.groups.forEach((g) => (g.keep = null));
          s.modifier = 0;
          setSpecWhole(s);
        },
      },
      svg(icons.again),
      t('rules.reset'),
    ),
  );
  return out;
}
