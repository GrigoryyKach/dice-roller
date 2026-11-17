// Small transient messages in the bottom-right corner.
import { h, svg } from '../dom';
import { t } from '../i18n';
import { icons } from '../icons';

let host: HTMLElement | null = null;

export function toast(text: string, kind: 'info' | 'ok' | 'error' = 'info', ms = 4200): void {
  if (!host) {
    host = h('div', { class: 'toasts', 'aria-live': 'polite' });
    document.body.append(host);
  }
  const el = h(
    'div',
    { class: `toast ${kind}` },
    svg(kind === 'error' ? icons.close : icons.check),
    h('div', { class: 'toast-text' }, text),
    h('button', { class: 'icon-btn small', title: t('dlg.close'), 'aria-label': t('dlg.close'), onclick: () => remove() }, svg(icons.close)),
  );
  const remove = () => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 180);
  };
  host.append(el);
  setTimeout(remove, ms);
}
