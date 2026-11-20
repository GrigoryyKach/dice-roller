// Progress of a self-update: a modal card with a thin accent bar (no wizard, no browser). Driven by `state.updatePhase`.
// The DOM is created once; a tick only changes the text node and the bar's transform, so nothing flashes or re-animates.
import { h } from '../dom';
import { t } from '../i18n';
import { applyUpdate, openReleasePage } from '../actions';
import { state } from '../store';

interface Parts {
  backdrop: HTMLElement;
  version: HTMLElement;
  line: HTMLElement;
  bar: HTMLElement;
  fill: HTMLElement;
  progress: HTMLElement;
  failure: HTMLElement;
  error: HTMLElement;
}

let parts: Parts | null = null;
let lastFailed = false;

const mb = (n: number) => (n / 1048576).toFixed(1);

function create(): Parts {
  const version = h('div', { class: 'hint' });
  const line = h('div', { class: 'upd-line' });
  const fill = h('div', { class: 'upd-fill' });
  const bar = h('div', { class: 'upd-bar' }, fill);
  const progress = h('div', { class: 'upd-body' }, version, line, bar);
  const error = h('div', { class: 'upd-err' });
  const failure = h(
    'div',
    { class: 'upd-body', hidden: true },
    error,
    h(
      'div',
      { class: 'modal-actions' },
      h('button', { class: 'btn small', onclick: () => void openReleasePage() }, t('update.manual')),
      h('button', { class: 'btn primary small', onclick: () => void applyUpdate() }, t('update.retry')),
    ),
  );
  const box = h('div', { class: 'modal small upd-modal', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'upd-head' }, h('div', { class: 'modal-title' }, t('update.title'))), progress, failure);
  const backdrop = h('div', { class: 'modal-backdrop' }, box);
  document.body.append(backdrop);
  return { backdrop, version, line, bar, fill, progress, failure, error };
}

/** Shows, updates or removes the overlay to match `state.updatePhase`. Cheap enough to call on every tick. */
export function renderUpdating(): void {
  const p = state.updatePhase;
  if (!p || p.phase === 'idle') {
    parts?.backdrop.remove();
    parts = null;
    return;
  }
  parts ??= create();
  const failed = p.phase === 'failed';
  if (failed !== lastFailed || (failed && parts.progress.hidden === false)) {
    parts.progress.hidden = failed;
    parts.failure.hidden = !failed;
    lastFailed = failed;
  }
  if (failed) {
    parts.error.textContent = t(`update.err.${p.error ?? 'download'}` as 'update.err.download');
    return;
  }
  let line = '';
  let frac = 1;
  switch (p.phase) {
    case 'downloading':
      line = p.total > 0 ? `${t('update.downloading')} ${mb(p.done)} / ${mb(p.total)} MB` : t('update.downloading');
      frac = p.total > 0 ? Math.min(1, p.done / p.total) : 0;
      break;
    case 'verifying': line = t('update.verifying'); break;
    case 'installing': line = t('update.installing'); break;
    case 'restarting': line = t('update.restarting'); break;
  }
  const v = `${state.version} → ${state.update?.version ?? ''}`;
  if (parts.version.textContent !== v) parts.version.textContent = v;
  if (parts.line.textContent !== line) parts.line.textContent = line;
  parts.fill.style.transform = `scaleX(${frac})`;
}
