// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-53: when the welcome card shows (14_ux_malaga.md §1, §9).
import { describe, expect, it } from 'vitest';
import { rememberWelcomeClosed, shouldWelcome, urlHasState, welcomePending, WELCOME_KEY, type KeyStore } from './welcome';

function memory(): KeyStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const broken: KeyStore = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('welcome card', () => {
  it('shows on a first visit without state in the URL', () => {
    expect(shouldWelcome('', '', memory())).toBe(true);
    expect(shouldWelcome('#', '?', memory())).toBe(true);
  });

  it('does not show with a shared link (F16) or on the validation page', () => {
    expect(urlHasState('#s=A~demo', '')).toBe(true);
    expect(shouldWelcome('#s=A~demo', '', memory())).toBe(false);
    expect(shouldWelcome('#/validation', '', memory())).toBe(false);
    expect(shouldWelcome('', '?x=1', memory())).toBe(false);
  });

  it('does not show again once closed', () => {
    const m = memory();
    rememberWelcomeClosed(m);
    expect(m.data.get(WELCOME_KEY)).toBe('1');
    expect(shouldWelcome('', '', m)).toBe(false);
    expect(welcomePending()).toBe(false); // nor when the layout mounts again in this page load
  });

  it('storage that throws or is missing: the card shows and closing does not crash', () => {
    expect(shouldWelcome('', '', broken)).toBe(true);
    expect(() => rememberWelcomeClosed(broken)).not.toThrow();
    expect(shouldWelcome('', '', null)).toBe(true);
  });
});
