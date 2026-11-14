// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// When the welcome card shows (14_ux_malaga.md §1): on a first visit without state in the URL (a
// shared link, F16, skips it) and only until it has been closed once. Storage can be missing or
// throw (private windows, blocked site data): then the card simply shows.

export const WELCOME_KEY = 'llsn.welcome.closed';

/** Minimal storage shape, so tests can pass a fake one. */
export interface KeyStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function storage(): KeyStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Query parameters that choose the interface, not shared state (15_interfaz_v2.md §10, §4.1). */
const UI_PARAMS = new Set(['ui', 'vm']);

/** A URL carries state when its fragment is not empty (`#/validation` included) or its query has
 * anything besides the interface choice (`?ui=v2`, `?vm=2d`). */
export function urlHasState(hash: string, search: string): boolean {
  if (hash !== '' && hash !== '#') return true;
  return [...new URLSearchParams(search).keys()].some((k) => !UI_PARAMS.has(k));
}

export function shouldWelcome(hash: string, search: string, store: KeyStore | null = storage()): boolean {
  if (urlHasState(hash, search)) return false;
  try {
    return store?.getItem(WELCOME_KEY) !== '1';
  } catch {
    return true;
  }
}

export function rememberWelcomeClosed(store: KeyStore | null = storage()): void {
  pending = false;
  try {
    store?.setItem(WELCOME_KEY, '1');
  } catch {
    // Nothing to do: the card will show again next time.
  }
}

/** Read once when the app starts, before the URL sync writes the state into the fragment. */
export const WELCOME_AT_START = typeof location === 'undefined' ? false : shouldWelcome(location.hash, location.search);

/**
 * Whether the card is still due in this page load. Kept outside React: the layout unmounts while the
 * story shows the validation page (step 7), and the card must not come back when it mounts again.
 */
let pending = WELCOME_AT_START;
export function welcomePending(): boolean {
  return pending;
}
