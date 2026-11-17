// The dice tray at the bottom: one button per die type, the notation field, the summary and the Roll button.
import { addDie, applyNotation, clearDice, roll } from '../actions';
import { h, svg } from '../dom';
import { dieIcons, icons } from '../icons';
import { notationError, t } from '../i18n';
import { toNotation, toSummary } from '../rules/notation';
import { DIE_TYPES, type DieType, MAX_DICE } from '../rules/types';
import { state, totalDice } from '../store';

const input = h('input', {
  type: 'text',
  spellcheck: 'false',
  autocomplete: 'off',
  autocapitalize: 'off',
}) as HTMLInputElement;
const err = h('div', { class: 'notation-err', role: 'alert' });
const notationBox = h('div', { class: 'notation' }, input, err);

input.addEventListener('input', () => {
  const text = input.value.trim();
  if (!text) {
    notationBox.classList.remove('bad');
    err.textContent = '';
    return;
  }
  // Apply while typing; an incomplete or wrong entry leaves the selection untouched and shows the reason.
  const e = applyNotation(text);
  notationBox.classList.toggle('bad', !!e);
  err.textContent = e ? notationError(e) : '';
});
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    input.blur();
    void roll();
  }
  e.stopPropagation();
});
input.addEventListener('blur', () => syncInput(true));

function syncInput(force = false): void {
  if (!force && document.activeElement === input) return;
  input.value = toNotation(state.config.spec);
  notationBox.classList.remove('bad');
  err.textContent = '';
}

const chipsEl = h('div', { class: 'chips' });
const summary = h('div', { class: 'summary' });
const rollBtn = h('button', { class: 'btn primary roll', onclick: () => void roll() });
const clearBtn = h('button', { class: 'btn ghost small', onclick: () => clearDice() }, t('tray.clear'));

export const trayEl = h(
  'footer',
  { class: 'tray' },
  chipsEl,
  h('div', { class: 'tray-right' }, notationBox, h('div', { class: 'tray-actions' }, summary, clearBtn, rollBtn)),
);

export function renderTray(): void {
  const spec = state.config.spec;
  const total = totalDice(spec);
  const full = total >= MAX_DICE;
  chipsEl.replaceChildren(
    ...DIE_TYPES.map((type) => {
      const count = spec.groups.find((g) => g.type === type)?.count ?? 0;
      const name = type.toUpperCase();
      const main = h(
        'button',
        { class: 'chip-main', title: full ? t('tray.limit', { n: MAX_DICE }) : `${t('tray.add', { die: name })}. ${t('tray.add.hint')}`, onclick: () => addDie(type, 1) },
        svg(dieIcons[type]),
        h('span', { class: 'chip-name' }, name),
      );
      main.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (count > 0) addDie(type, -1);
      });
      return h(
        'div',
        { class: `chip${count ? ' has' : ''}` },
        main,
        count ? h('span', { class: 'chip-count' }, count) : null,
        h(
          'div',
          { class: 'chip-step' },
          h('button', { title: t('tray.minus', { die: name }), 'aria-label': t('tray.minus', { die: name }), disabled: count === 0, onclick: () => addDie(type as DieType, -1) }, svg(icons.minus)),
          h('button', { title: t('tray.plus', { die: name }), 'aria-label': t('tray.plus', { die: name }), disabled: full, onclick: () => addDie(type as DieType, 1) }, svg(icons.plus)),
        ),
      );
    }),
  );
  summary.textContent = total || spec.modifier ? toSummary(spec) : t('tray.empty');
  summary.title = full ? t('tray.limit', { n: MAX_DICE }) : '';
  clearBtn.textContent = t('tray.clear');
  clearBtn.title = t('tray.clear.hint');
  clearBtn.disabled = total === 0 && spec.modifier === 0;
  input.placeholder = t('tray.notation.ph');
  input.setAttribute('aria-label', t('tray.notation'));
  rollBtn.replaceChildren(svg(icons.play), state.busy ? t('tray.rolling') : t('tray.roll'));
  (rollBtn as HTMLButtonElement).disabled = state.busy;
  rollBtn.title = t('tray.roll.hint');
  syncInput();
}
