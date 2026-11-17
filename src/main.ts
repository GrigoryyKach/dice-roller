import './styles.css';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { applySettings, applyUpdate, checkUpdates, ctx, refreshMarks, roll, selectDie } from './actions';
import { api, inTauri } from './api';
import { h, svg } from './dom';
import { icons, logo } from './icons';
import { isLang, setLang, t } from './i18n';
import { toNotation } from './rules/notation';
import { Stage } from './scene/stage';
import { loadState, notify, saveConfig, state, subscribe } from './store';
import { panelEl, renderPanel } from './ui/panel';
import { notifySettings, openSettings } from './ui/settings';
import { toast } from './ui/toast';
import { renderTray, trayEl } from './ui/tray';

const app = document.getElementById('app')!;
const win = inTauri ? getCurrentWindow() : null;

// ───────────── window frame ─────────────

const brandName = h('span', { class: 'brand-name' }, 'DICE ROLLER');
const updBtn = h('button', { class: 'upd-banner', hidden: true, onclick: () => void applyUpdate() });
const btnPanel = h('button', { class: 'tb-btn', onclick: () => { state.config.panelOpen = !state.config.panelOpen; saveConfig(); notify(); } }, svg(icons.panel));
const btnSettings = h('button', { class: 'tb-btn', onclick: () => openSettings() }, svg(icons.gear));
const btnMin = h('button', { class: 'tb-btn', onclick: () => void win?.minimize() }, svg(icons.minimize));
const btnMax = h('button', { class: 'tb-btn', onclick: () => void win?.toggleMaximize() }, svg(icons.maximize));
const btnClose = h('button', { class: 'tb-btn close', onclick: () => void win?.close() }, svg(icons.close));

const titlebar = h(
  'header',
  { class: 'titlebar', 'data-tauri-drag-region': true },
  h('div', { class: 'brand', 'data-tauri-drag-region': true }, h('span', { class: 'brand-logo', html: logo }), brandName),
  h('div', { class: 'spacer', 'data-tauri-drag-region': true }),
  updBtn,
  btnPanel,
  btnSettings,
  ...(inTauri ? [btnMin, btnMax, btnClose] : []),
);

const stageHost = h('div', { class: 'stage-wrap' });
const hint = h('div', { class: 'stage-hint' });
const totalBox = h('div', { class: 'stage-total', hidden: true });
stageHost.append(hint, totalBox);

app.append(titlebar, h('div', { class: 'main' }, h('div', { class: 'workspace' }, stageHost, panelEl), trayEl));

function renderChrome(): void {
  document.title = t('app.title');
  btnPanel.title = btnPanel.ariaLabel = t('tb.panel');
  btnSettings.title = btnSettings.ariaLabel = t('tb.settings');
  btnMin.title = btnMin.ariaLabel = t('tb.minimize');
  btnMax.title = btnMax.ariaLabel = t('tb.maximize');
  btnClose.title = btnClose.ariaLabel = t('tb.close');
  if (state.update) {
    updBtn.hidden = false;
    updBtn.replaceChildren(svg(icons.download, 'ico tiny'), t('update.banner', { v: state.update.version }));
  } else {
    updBtn.hidden = true;
  }
  const cur = state.current;
  hint.hidden = !!cur || state.busy;
  hint.textContent = t('stage.hint');
  totalBox.hidden = !cur;
  if (cur) {
    const hasCrit = cur.result.dice.some((d) => d.status === 'kept' && d.crit);
    const high = cur.result.dice.some((d) => d.status === 'kept' && d.crit === 'high');
    totalBox.className = `stage-total${hasCrit ? (high ? ' crit-high' : ' crit-low') : ''}`;
    totalBox.replaceChildren(
      h('span', { class: 'lbl' }, cur.result.successes ? t('result.successes') : t('stage.total')),
      h('span', { class: 'big' }, cur.result.total),
      h('span', { class: 'sub' }, cur.label ? `${cur.label} · ${toNotation(cur.spec)}` : toNotation(cur.spec)),
    );
  }
}

function renderAll(): void {
  renderChrome();
  renderTray();
  renderPanel();
  notifySettings();
}

// ───────────── keyboard ─────────────

document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat) return;
  const el = document.activeElement as HTMLElement | null;
  if (document.querySelector('.modal-backdrop')) return;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
  e.preventDefault();
  if (el && el.tagName === 'BUTTON') el.blur();
  void roll();
});

// Suppress the browser context menu (right-click removes dice in the tray).
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ───────────── start ─────────────

async function boot(): Promise<void> {
  const init = await api.init();
  loadState(init);
  // Language: the config wins, then the launcher marker, then English; the choice is saved.
  const fromConfig = state.config.language;
  const lang = fromConfig ?? (isLang(init.markerLanguage) ? init.markerLanguage : 'en');
  state.config.language = lang;
  setLang(lang);
  if (!fromConfig) saveConfig();

  const dev = init.args.indexOf('--dev-fairness');
  if (dev >= 0) {
    await runFairnessMode(Number(init.args[dev + 1]) || 600, init.args.includes('--out') ? init.args[init.args.indexOf('--out') + 1] : null, init.dataDir);
    return;
  }

  try {
    const stage = new Stage(stageHost, state.config.skins);
    ctx.stage = stage;
    stage.onPick = (tag) => selectDie(tag);
    stage.onFlick = (f) => void roll({ flick: f });
  } catch (err) {
    console.error(err);
    state.webgl = false;
    toast(t('toast.noWebgl'), 'error', 8000);
  }
  applySettings();
  subscribe(renderAll);
  renderAll();
  refreshMarks();

  if (state.config.checkUpdates && inTauri) void checkUpdates();
}

async function runFairnessMode(n: number, out: string | null, dataDir: string): Promise<void> {
  app.replaceChildren(h('div', { class: 'empty-note', style: 'padding:80px' }, `Fairness check: ${n} dice per type…`));
  const { runFairness, formatFairness } = await import('./dev/fairness');
  const rows = await runFairness(n);
  const text = formatFairness(rows);
  app.replaceChildren(h('pre', { style: 'padding:24px;user-select:text;font-family:var(--mono)' }, text));
  const path = out ?? `${dataDir}\\fairness.txt`;
  await api.writeFile(path, text);
  if (inTauri && !new URLSearchParams(location.search).has('keep')) await api.exit();
}

void boot();
