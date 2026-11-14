// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Which interface to show (15_interfaz_v2.md §10): `?ui=v1` or `?ui=v2`. Until T-63 the current
// interface (v1) stays the default and the v2 is opened with `?ui=v2`.

export type UiVersion = 'v1' | 'v2';
export const DEFAULT_UI: UiVersion = 'v1';

export function uiVersionOf(search: string, fallback: UiVersion = DEFAULT_UI): UiVersion {
  const ui = new URLSearchParams(search).get('ui');
  return ui === 'v1' || ui === 'v2' ? ui : fallback;
}

/** Read once at start: the query is not part of the shared state and does not change. */
export const UI_VERSION: UiVersion = typeof location === 'undefined' ? DEFAULT_UI : uiVersionOf(location.search);
