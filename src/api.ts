// Bridge to the Rust side (config files, updates, window). Falls back to localStorage in a plain browser (dev server).

import { invoke } from '@tauri-apps/api/core';
import type { UpdatePhase } from './store';

export const REPO = 'GrigoryyKach/dice-roller';
export const REPO_URL = `https://github.com/${REPO}`;
export const TOOL_ID = 'dice-roller';

export interface InitData {
  config: string | null;
  history: string | null;
  stats: string | null;
  /** Language from the `.nimvoro.json` marker next to the exe (written by the launcher). */
  markerLanguage: string | null;
  version: string;
  args: string[];
  dataDir: string;
  autoUpdate?: boolean;
}

export const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const ls = (name: string) => `dice-roller.${name}`;

export type JsonName = 'config' | 'history' | 'stats';

export const api = {
  async init(): Promise<InitData> {
    if (inTauri) return invoke<InitData>('init_state');
    const get = (n: string) => {
      try {
        return localStorage.getItem(ls(n));
      } catch {
        return null;
      }
    };
    return { config: get('config'), history: get('history'), stats: get('stats'), markerLanguage: null, version: '1.0.0', args: [], dataDir: '(browser)' };
  },

  async saveJson(name: JsonName, text: string): Promise<void> {
    if (inTauri) return invoke('save_json', { name, text });
    try {
      localStorage.setItem(ls(name), text);
    } catch {
      /* private mode: nothing to do */
    }
  },

  /** Latest release tag from GitHub, or null when the check failed. */
  async checkUpdate(): Promise<{ tag: string; url: string } | null> {
    if (!inTauri) return null;
    return invoke<{ tag: string; url: string } | null>('check_update', { repo: REPO });
  },

  /** Starts the update: `launcher` (the app should close), `self` (it updates itself: poll `updatePhase`) or `page`. */
  async applyUpdate(): Promise<'launcher' | 'self' | 'page'> {
    if (!inTauri) return 'page';
    return invoke<'launcher' | 'self' | 'page'>('apply_update', { id: TOOL_ID, repo: REPO });
  },

  async updatePhase(): Promise<UpdatePhase> {
    if (!inTauri) return { phase: 'idle', done: 0, total: 0 };
    return invoke<UpdatePhase>('update_phase');
  },

  async openUrl(url: string): Promise<void> {
    if (inTauri) await invoke('open_url', { url });
    else window.open(url, '_blank');
  },

  async writeFile(path: string, text: string): Promise<void> {
    if (inTauri) await invoke('write_text', { path, text });
  },

  async exit(): Promise<void> {
    if (inTauri) await invoke('exit_app');
  },
};

/** `true` if `candidate` is newer than `current` (semver without pre-release). */
export function isNewer(candidate: string, current: string): boolean {
  const parse = (v: string) =>
    v
      .trim()
      .replace(/^[vV]/, '')
      .split(/[-+]/)[0]
      .split('.')
      .map((p) => parseInt(p, 10) || 0);
  const a = parse(candidate);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}
