// Modal windows: shared wrapper, confirm and text-prompt dialogs. Esc and a click outside close them.
import { h, svg } from '../dom';
import { t } from '../i18n';
import { icons } from '../icons';

export interface ModalHandle {
  el: HTMLElement;
  close: () => void;
}

export function openModal(content: HTMLElement, cls = '', onClose?: () => void): ModalHandle {
  const backdrop = h('div', { class: 'modal-backdrop' });
  const box = h('div', { class: `modal ${cls}`, role: 'dialog', 'aria-modal': 'true' }, content);
  backdrop.append(box);
  const prevFocus = document.activeElement as HTMLElement | null;
  let closed = false;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    backdrop.classList.add('out');
    setTimeout(() => backdrop.remove(), 160);
    prevFocus?.focus?.();
    onClose?.();
  };
  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener('keydown', onKey, true);
  document.body.append(backdrop);
  requestAnimationFrame(() => (box.querySelector('[autofocus]') as HTMLElement | null)?.focus());
  return { el: box, close };
}

export function modalHeader(title: string, close: () => void): HTMLElement {
  return h(
    'div',
    { class: 'modal-head' },
    h('div', { class: 'modal-title' }, title),
    h('button', { class: 'icon-btn', title: t('dlg.close'), 'aria-label': t('dlg.close'), onclick: close }, svg(icons.close)),
  );
}

export function confirmDialog(o: { title: string; text: string; confirm: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    let answered = false;
    const finish = (v: boolean) => {
      if (answered) return;
      answered = true;
      resolve(v);
      m.close();
    };
    const body = h(
      'div',
      { class: 'confirm' },
      h('div', { class: 'modal-title' }, o.title),
      h('p', { class: 'confirm-text' }, o.text),
      h(
        'div',
        { class: 'modal-actions' },
        h('button', { class: 'btn ghost', onclick: () => finish(false) }, t('dlg.cancel')),
        h('button', { class: `btn ${o.danger ? 'danger' : 'primary'}`, autofocus: true, onclick: () => finish(true) }, o.confirm),
      ),
    );
    const m = openModal(body, 'small', () => finish(false));
  });
}

export function promptDialog(o: { title: string; value: string; confirm: string }): Promise<string | null> {
  return new Promise((resolve) => {
    let answered = false;
    const finish = (v: string | null) => {
      if (answered) return;
      answered = true;
      resolve(v);
      m.close();
    };
    const input = h('input', { class: 'text-input', type: 'text', maxlength: 60, autofocus: true, value: o.value });
    input.value = o.value;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(input.value.trim() || null);
    });
    const body = h(
      'div',
      { class: 'field-dialog' },
      h('div', { class: 'modal-title' }, o.title),
      input,
      h(
        'div',
        { class: 'modal-actions' },
        h('button', { class: 'btn ghost', onclick: () => finish(null) }, t('dlg.cancel')),
        h('button', { class: 'btn primary', onclick: () => finish(input.value.trim() || null) }, o.confirm),
      ),
    );
    const m = openModal(body, 'small', () => finish(null));
    requestAnimationFrame(() => input.select());
  });
}
