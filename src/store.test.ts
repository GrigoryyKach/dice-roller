import { describe, expect, it } from 'vitest';
import { isNewer } from './api';
import { defaultConfig, parseJson, sanitizeConfig, sanitizeSpec } from './store';

describe('config loading', () => {
  it('falls back to defaults for garbage', () => {
    expect(sanitizeConfig(null)).toEqual(defaultConfig());
    expect(sanitizeConfig('x')).toEqual(defaultConfig());
    const c = sanitizeConfig({ theme: 'purple', speed: 7, language: 'de', quick: 'yes', skins: { all: 'nope', custom: { body: 'red' } } });
    expect(c.theme).toBe('system');
    expect(c.speed).toBe(1);
    expect(c.language).toBeUndefined();
    expect(c.quick).toBe(false);
    expect(c.skins.all).toBe('ivory');
    expect(c.skins.custom.body).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('keeps valid values', () => {
    const c = sanitizeConfig({ language: 'uk', theme: 'light', speed: 1.5, sound: true, d6Pips: true });
    expect(c).toMatchObject({ language: 'uk', theme: 'light', speed: 1.5, sound: true, d6Pips: true });
  });

  it('reads JSON that starts with a byte-order mark', () => {
    expect(parseJson('﻿{"language":"ru"}')).toEqual({ language: 'ru' });
    expect(parseJson('{broken')).toBeNull();
    expect(parseJson(null)).toBeNull();
  });

  it('limits a saved roll to 50 dice and valid die types', () => {
    const spec = sanitizeSpec(
      { groups: [{ type: 'd6', count: 40 }, { type: 'd20', count: 30 }, { type: 'd7', count: 1 }, { type: 'd6', count: 5 }], modifier: 5000 },
      defaultConfig().spec,
    );
    expect(spec.groups.reduce((s, g) => s + g.count, 0)).toBe(50);
    expect(spec.groups.map((g) => g.type)).toEqual(['d6', 'd20']);
    expect(spec.modifier).toBe(999);
  });

  it('ships three built-in presets', () => {
    expect(defaultConfig().presets.map((p) => p.name)).toEqual(['Attack (d20+5)', 'Fireball (8d6)', 'Stats (4d6 drop lowest)']);
  });
});

describe('update check', () => {
  it('compares versions', () => {
    expect(isNewer('v1.0.1', '1.0.0')).toBe(true);
    expect(isNewer('v1.0.0', '1.0.0')).toBe(false);
    expect(isNewer('0.9.0', '1.0.0')).toBe(false);
    expect(isNewer('v1.10.0', '1.9.0')).toBe(true);
  });
});
