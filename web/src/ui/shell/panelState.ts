// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Open / folded state of the floating panels, remembered per viewer (15_interfaz_v2.md §6.4).
// Storage can be missing or throw: then the panel uses its default.
import type { KeyStore } from '../welcome/welcome';

const PREFIX = 'llsn.panel.';

function storage(): KeyStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readPanelOpen(id: string, fallback: boolean, store: KeyStore | null = storage()): boolean {
  try {
    const v = store?.getItem(PREFIX + id);
    return v === '1' ? true : v === '0' ? false : fallback;
  } catch {
    return fallback;
  }
}

export function writePanelOpen(id: string, open: boolean, store: KeyStore | null = storage()): void {
  try {
    store?.setItem(PREFIX + id, open ? '1' : '0');
  } catch {
    // Not remembered: the panel still opens and folds.
  }
}
