// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
import { describe, expect, it } from 'vitest';
import en from '../en.json';
import { t } from '../t';

describe('t', () => {
  it('has the general texts of 10_interfaz.md §7', () => {
    expect(t('app.title')).toBe('Lunar Landing Site Navigator');
    expect(t('banner.example')).toBe('Example data — not for use');
    expect(t('status.marginal')).toBe('Tight');
    expect(t('error.contract')).toBe('Data format not supported by this version of the app. Reload the page.');
  });

  it('fills placeholders and leaves unknown ones', () => {
    expect(t('req.night', { h: 24 })).toBe('No night over 24 h');
    expect(t('req.night')).toBe('No night over {h} h');
  });

  it('has no empty texts', () => {
    for (const [key, text] of Object.entries(en)) expect(text, key).not.toBe('');
  });
});
