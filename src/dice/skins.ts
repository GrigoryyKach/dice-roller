// Dice colour presets and the per-die-type skin selection.

import type { DieType } from '../rules/types';

export interface SkinSpec {
  body: string;
  num: string;
  roughness: number;
  metalness: number;
  clearcoat: number;
}

export type SkinId = 'ivory' | 'obsidian' | 'ruby' | 'sapphire' | 'emerald' | 'gold' | 'custom';

export const SKIN_IDS: SkinId[] = ['ivory', 'obsidian', 'ruby', 'sapphire', 'emerald', 'gold', 'custom'];

export const PRESETS: Record<Exclude<SkinId, 'custom'>, SkinSpec> = {
  ivory: { body: '#eee6d2', num: '#22201c', roughness: 0.42, metalness: 0, clearcoat: 0.5 },
  obsidian: { body: '#17181d', num: '#e9e6dc', roughness: 0.2, metalness: 0.05, clearcoat: 1 },
  ruby: { body: '#a2102a', num: '#f7ead2', roughness: 0.22, metalness: 0, clearcoat: 1 },
  sapphire: { body: '#1b3d9c', num: '#eef3ff', roughness: 0.22, metalness: 0, clearcoat: 1 },
  emerald: { body: '#0c7548', num: '#f1ffe8', roughness: 0.24, metalness: 0, clearcoat: 1 },
  gold: { body: '#d2a42a', num: '#2b1b00', roughness: 0.3, metalness: 0.85, clearcoat: 0.4 },
};

export interface SkinSettings {
  /** Skin used for every die type without an override. */
  all: SkinId;
  /** Per-type override; absent = use `all`. */
  per: Partial<Record<DieType, SkinId>>;
  custom: { body: string; num: string };
}

export function defaultSkins(): SkinSettings {
  return { all: 'ivory', per: {}, custom: { body: '#7a4bd6', num: '#ffffff' } };
}

export function resolveSkin(s: SkinSettings, type: DieType): SkinSpec {
  const id = s.per[type] ?? s.all;
  if (id === 'custom') return { body: s.custom.body, num: s.custom.num, roughness: 0.3, metalness: 0.05, clearcoat: 0.8 };
  return PRESETS[id] ?? PRESETS.ivory;
}

export function isSkinId(v: unknown): v is SkinId {
  return typeof v === 'string' && (SKIN_IDS as string[]).includes(v);
}
