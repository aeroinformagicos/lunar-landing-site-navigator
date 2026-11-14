// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Which interface to show (15_interfaz_v2.md §10): `?ui=v1` or `?ui=v2`. Since T-63 the v2 is the
// default; the previous interface stays available with `?ui=v1` (the safety net).

export type UiVersion = 'v1' | 'v2';
export const DEFAULT_UI: UiVersion = 'v2';

export function uiVersionOf(search: string, fallback: UiVersion = DEFAULT_UI): UiVersion {
  const ui = new URLSearchParams(search).get('ui');
  return ui === 'v1' || ui === 'v2' ? ui : fallback;
}

/** Read once at start: the query is not part of the shared state and does not change. */
export const UI_VERSION: UiVersion = typeof location === 'undefined' ? DEFAULT_UI : uiVersionOf(location.search);
