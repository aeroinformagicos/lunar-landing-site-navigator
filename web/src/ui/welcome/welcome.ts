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

/** A URL carries state when its fragment or query is not empty (`#/validation` included). */
export function urlHasState(hash: string, search: string): boolean {
  return (hash !== '' && hash !== '#') || (search !== '' && search !== '?');
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
  try {
    store?.setItem(WELCOME_KEY, '1');
  } catch {
    // Nothing to do: the card will show again next time.
  }
}

/** Read once when the app starts, before the URL sync writes the state into the fragment. */
export const WELCOME_AT_START = typeof location === 'undefined' ? false : shouldWelcome(location.hash, location.search);
