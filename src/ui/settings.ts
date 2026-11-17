// Settings window.
import { applySettings, applyUpdate, checkUpdates } from '../actions';
import { api, REPO_URL } from '../api';
import { PRESETS, SKIN_IDS, type SkinId } from '../dice/skins';
import { h, svg } from '../dom';
import { icons } from '../icons';
import { getLang, LANGS, type Lang, setLang, t } from '../i18n';
import { DIE_TYPES } from '../rules/types';
import { notify, saveConfig, state, type Theme } from '../store';
import { modalHeader, openModal } from './dialog';

let open: { close: () => void } | null = null;

const skinKey = (id: SkinId) => `skin.${id}` as 'skin.ivory';

function change(fn: () => void): void {
  fn();
  saveConfig();
  applySettings();
  notify();
}

function setting(title: string, hint: string | null, control: HTMLElement): HTMLElement {
  return h('div', { class: 'set-row' }, h('div', { class: 'set-text' }, h('div', { class: 'set-title' }, title), hint ? h('div', { class: 'hint' }, hint) : null), control);
}

function seg<T extends string | number>(value: T, options: { v: T; label: string }[], onpick: (v: T) => void): HTMLElement {
  return h(
    'div',
    { class: 'segmented' },
    ...options.map((o) => h('button', { class: `seg${o.v === value ? ' active' : ''}`, 'aria-pressed': o.v === value, onclick: () => onpick(o.v) }, o.label)),
  );
}

function switchEl(on: boolean, onchange: (v: boolean) => void, label: string): HTMLElement {
  const input = h('input', { type: 'checkbox', 'aria-label': label }) as HTMLInputElement;
  input.checked = on;
  input.addEventListener('change', () => onchange(input.checked));
  return h('span', { class: 'switch' }, input, h('span'));
}

function swatches(current: SkinId, onpick: (id: SkinId) => void): HTMLElement {
  return h(
    'div',
    { class: 'skin-swatches', role: 'radiogroup' },
    ...SKIN_IDS.map((id) => {
      const spec = id === 'custom' ? null : PRESETS[id];
      return h('button', {
        class: `swatch${id === 'custom' ? ' custom' : ''}${id === current ? ' on' : ''}`,
        style: spec ? `background:${spec.body}` : '',
        title: t(skinKey(id)),
        role: 'radio',
        'aria-checked': id === current,
        'aria-label': t(skinKey(id)),
        onclick: () => onpick(id),
      });
    }),
  );
}

function colorInput(value: string, label: string, onchange: (v: string) => void): HTMLElement {
  const input = h('input', { type: 'color', title: label, 'aria-label': label }) as HTMLInputElement;
  input.value = value;
  input.addEventListener('input', () => onchange(input.value));
  return input;
}

function statusText(): string {
  const v = state.version;
  switch (state.updateStatus) {
    case 'checking': return t('update.checking');
    case 'latest': return t('update.latest', { v });
    case 'available': return t('update.available', { v: state.update?.version ?? '' });
    case 'failed': return t('update.failed');
    default: return t('update.installed', { v });
  }
}

function build(): HTMLElement[] {
  const c = state.config;
  const out: HTMLElement[] = [];

  out.push(h('div', { class: 'sec-title' }, t('settings.language')));
  const lang = h('select', { class: 'select', 'aria-label': t('settings.language') }, ...LANGS.map((l) => h('option', { value: l.code }, l.name))) as HTMLSelectElement;
  lang.value = getLang();
  lang.addEventListener('change', () => change(() => { c.language = lang.value as Lang; setLang(c.language); }));
  out.push(
    h(
      'div',
      { class: 'set-card' },
      setting(t('settings.language'), null, lang),
      setting(
        t('settings.theme'),
        null,
        seg<Theme>(c.theme, [
          { v: 'system', label: t('theme.system') },
          { v: 'light', label: t('theme.light') },
          { v: 'dark', label: t('theme.dark') },
        ], (v) => change(() => (c.theme = v))),
      ),
    ),
  );

  // Dice skins
  out.push(h('div', { class: 'sec-title' }, t('settings.skin')));
  const skinCard = h('div', { class: 'set-card' });
  skinCard.append(setting(t('settings.skin.all'), null, swatches(c.skins.all, (id) => change(() => (c.skins.all = id)))));
  const usesCustom = c.skins.all === 'custom' || Object.values(c.skins.per).includes('custom');
  if (usesCustom) {
    skinCard.append(
      setting(t('settings.skin.body'), null, colorInput(c.skins.custom.body, t('settings.skin.body'), (v) => change(() => (c.skins.custom.body = v)))),
      setting(t('settings.skin.num'), null, colorInput(c.skins.custom.num, t('settings.skin.num'), (v) => change(() => (c.skins.custom.num = v)))),
    );
  }
  const per = h('details', { class: 'set-row', style: 'display:block' }) as HTMLDetailsElement;
  per.open = Object.keys(c.skins.per).length > 0;
  per.append(
    h('summary', { class: 'set-title', style: 'cursor:pointer' }, t('settings.skin.perType')),
    ...DIE_TYPES.map((type) => {
      const sel = h(
        'select',
        { class: 'select small', 'aria-label': type.toUpperCase() },
        h('option', { value: '' }, t('settings.skin.same')),
        ...SKIN_IDS.map((id) => h('option', { value: id }, t(skinKey(id)))),
      ) as HTMLSelectElement;
      sel.value = c.skins.per[type] ?? '';
      sel.addEventListener('change', () =>
        change(() => {
          if (sel.value) c.skins.per[type] = sel.value as SkinId;
          else delete c.skins.per[type];
        }),
      );
      return h('div', { class: 'skin-row' }, h('span', { class: 'lbl' }, type.toUpperCase()), sel);
    }),
  );
  skinCard.append(per);
  out.push(skinCard);

  // Behaviour
  out.push(h('div', { class: 'sec-title' }, t('settings.d6')));
  out.push(
    h(
      'div',
      { class: 'set-card' },
      setting(t('settings.d6'), null, seg<'n' | 'p'>(c.d6Pips ? 'p' : 'n', [{ v: 'n', label: t('d6.numbers') }, { v: 'p', label: t('d6.pips') }], (v) => change(() => (c.d6Pips = v === 'p')))),
      setting(t('settings.quick'), t('settings.quick.hint'), switchEl(c.quick, (v) => change(() => (c.quick = v)), t('settings.quick'))),
      setting(t('settings.sound'), t('settings.sound.hint'), switchEl(c.sound, (v) => change(() => (c.sound = v)), t('settings.sound'))),
      setting(
        t('settings.speed'),
        null,
        seg<number>(c.speed, [{ v: 1, label: '1×' }, { v: 1.5, label: '1.5×' }, { v: 2, label: '2×' }], (v) => change(() => (c.speed = v as 1 | 1.5 | 2))),
      ),
    ),
  );

  // Updates
  out.push(h('div', { class: 'sec-title' }, t('settings.updates')));
  const status = h('div', { class: 'hint' }, statusText());
  const checkBtn = h('button', { class: 'btn ghost small', disabled: state.updateStatus === 'checking', onclick: () => void checkUpdates() }, svg(icons.again), t('settings.updates.now'));
  const updBtn =
    state.updateStatus === 'available'
      ? h('button', { class: 'btn primary small', onclick: () => void applyUpdate() }, svg(icons.download), t('update.btn'))
      : null;
  out.push(
    h(
      'div',
      { class: 'set-card' },
      setting(t('settings.updates.start'), t('settings.updates.hint'), switchEl(c.checkUpdates, (v) => change(() => (c.checkUpdates = v)), t('settings.updates.start'))),
      h('div', { class: 'set-row' }, h('div', { class: 'set-text' }, status), h('div', { class: 'set-actions' }, checkBtn, updBtn)),
    ),
  );

  // About
  out.push(h('div', { class: 'sec-title' }, t('settings.about')));
  out.push(
    h(
      'div',
      { class: 'set-card' },
      h(
        'div',
        { class: 'set-row' },
        h(
          'div',
          { class: 'set-text' },
          h('div', { class: 'set-title' }, `${t('app.title')} · ${t('about.version', { v: state.version })}`),
          h('div', { class: 'hint' }, t('about.offline')),
        ),
        h('button', { class: 'btn ghost small', title: REPO_URL, onclick: () => void api.openUrl(REPO_URL) }, svg(icons.external), t('about.repo')),
      ),
    ),
  );
  return out;
}

export function openSettings(): void {
  if (open) return;
  const body = h('div', { class: 'settings-body' });
  const refresh = () => {
    const top = body.scrollTop;
    body.replaceChildren(...build());
    body.scrollTop = top;
  };
  refresh();
  const box = h('div', { class: 'settings' });
  const m = openModal(box, 'medium', () => {
    open = null;
    unsub();
  });
  const render = () => {
    box.replaceChildren(modalHeader(t('settings.title'), m.close), body);
    refresh();
  };
  render();
  open = m;
  // Re-render when state changes (language switch, update status).
  const unsub = onChange(render);
}

const subs = new Set<() => void>();
function onChange(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}
export function notifySettings(): void {
  for (const fn of subs) fn();
}
