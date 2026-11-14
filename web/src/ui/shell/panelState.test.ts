// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-61: floating panels remember their state per viewer; storage that fails is harmless (15 §6.4).
import { describe, expect, it } from 'vitest';
import type { KeyStore } from '../welcome/welcome';
import { readPanelOpen, writePanelOpen } from './panelState';

const memory = (): KeyStore => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};
const broken: KeyStore = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('floating panel state', () => {
  it('default until changed, then remembered', () => {
    const m = memory();
    expect(readPanelOpen('now', true, m)).toBe(true);
    writePanelOpen('now', false, m);
    expect(readPanelOpen('now', true, m)).toBe(false);
    writePanelOpen('now', true, m);
    expect(readPanelOpen('now', false, m)).toBe(true);
  });
  it('storage that throws or is missing: the default, and writing does not crash', () => {
    expect(readPanelOpen('sites', false, broken)).toBe(false);
    expect(() => writePanelOpen('sites', true, broken)).not.toThrow();
    expect(readPanelOpen('sites', true, null)).toBe(true);
  });
});
