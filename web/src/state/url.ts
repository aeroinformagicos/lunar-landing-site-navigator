// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Shareable link (F16, 10_interfaz.md §10; 02_arquitectura.md §8): the serialisable state goes into
// the fragment as `#s=<base64url(JSON)>`. Reading validates every field and drops what is not valid;
// writing uses `history.replaceState`, at most twice per second and never during playback (D-87).
import { MAX_SCENARIOS, SCENARIO_LETTERS } from '../core/constants';
import { inGrid } from '../core/grid';
import type { ObserverHeight, SitesFile } from '../core/types';
import { routeOf } from '../ui/validation/report';
import { normaliseMissionDays, SUPPORTED_RANGES } from './selectors';
import { can3d, VIEW_MODES, type ViewMode } from './viewMode';
import {
  initialState,
  missionEnd,
  useAppStore,
  type AppState,
  type FocusBody,
  type MapLayer,
  type Mode,
  type Scenario,
  type Tab,
} from './store';

/** `v` of the link format (10 §10). */
export const URL_VERSION = 1;
/** Prefix of the fragment that carries the state (10 §10). */
export const HASH_PREFIX = '#s=';
/** «como mucho dos veces por segundo» (10 §10). */
export const URL_WRITE_INTERVAL_MS = 500;
/** `maxNightHours` is editable in 0–400 h (07_visibilidad.md §8.1). */
export const MAX_NIGHT_HOURS_RANGE = { min: 0, max: 400 } as const;

const MODES: readonly Mode[] = ['explore', 'plan', 'learn'];
const TABS: readonly Tab[] = ['panorama', 'timeline', 'map', 'section', 'replan'];
const BODIES: readonly FocusBody[] = ['sun', 'earth'];
const LAYERS: readonly MapLayer[] = ['sun', 'earth', 'both', 'none'];
const HEIGHTS: readonly ObserverHeight[] = [2, 10];

/** JSON of the link, with the short keys of 10 §10. */
export interface LinkScenario {
  s: string;
  l: number;
  d: number;
  h: number;
}

export interface LinkState {
  v: number;
  m: Mode;
  t: Tab;
  c: number;
  f: FocusBody;
  sc: LinkScenario[];
  a: number;
  rq: { n: number; su: 0 | 1; ea: 0 | 1 };
  ml: MapLayer;
  mp: string;
  /** 3D or 2D stage (15_interfaz_v2.md §4.1); absent in links made before the v2. */
  vm?: ViewMode;
}

// ---- Encoding ------------------------------------------------------------------------------

/** UTF-8 text → base64url without padding (RFC 4648 §5). */
export function toBase64Url(text: string): string {
  let bin = '';
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url (with or without padding) → UTF-8 text, or null if it is not valid. */
export function fromBase64Url(data: string): string | null {
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(data)) return null;
  const bare = data.replace(/=+$/, '');
  if (bare.length % 4 === 1) return null;
  try {
    const bin = atob(bare.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (bare.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** The link JSON of a state. Fields outside 10 §10 (speed, smooth line, comparison…) are not shared. */
export function toLinkState(s: AppState): LinkState {
  const a = s.scenarios.findIndex((x) => x.id === s.activeScenarioId);
  return {
    v: URL_VERSION,
    m: s.mode,
    t: s.tab,
    c: s.cursorUnix,
    f: s.focusBody,
    sc: s.scenarios.map((x) => ({ s: x.siteRef, l: x.landingUnix, d: x.missionDays, h: x.observerHeightM })),
    a: Math.max(a, 0),
    rq: { n: s.requirements.maxNightHours, su: s.requirements.needSunAtLanding ? 1 : 0, ea: s.requirements.needEarthAtLanding ? 1 : 0 },
    ml: s.mapLayer,
    mp: s.mapPeriod,
    vm: s.viewMode,
  };
}

/** `#s=<base64url(JSON)>` of a state. */
export function encodeHash(s: AppState): string {
  return HASH_PREFIX + toBase64Url(JSON.stringify(toLinkState(s)));
}

/** True when the fragment carries a shared state (also an unreadable one). */
export function hasSharedState(hash: string): boolean {
  return hash.startsWith(HASH_PREFIX);
}

// ---- Decoding and validation ---------------------------------------------------------------

export interface Restored {
  state: AppState;
  /** Some field was not valid and was dropped: show `Some settings in this link could not be restored.` */
  partial: boolean;
}

type Json = Record<string, unknown>;

function isObject(x: unknown): x is Json {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function oneOf<T>(list: readonly T[], x: unknown): x is T {
  return list.includes(x as T);
}

function inSupportedRange(unix: number): boolean {
  return SUPPORTED_RANGES.some((r) => unix >= r.from && unix <= r.to);
}

const NUM = '-?\\d+(?:\\.\\d+)?';
const CUSTOM_RE = new RegExp(`^custom:(${NUM}),(${NUM})$`);
const GRID_RE = /^grid:(\d+),(\d+)$/;

/** A site reference of the link is valid if it names a catalogue site, a mesh cell or valid coordinates. */
export function validSiteRef(ref: unknown, sites: SitesFile['sites']): ref is string {
  if (typeof ref !== 'string') return false;
  const grid = GRID_RE.exec(ref);
  if (grid) return inGrid(Number(grid[1]), Number(grid[2]));
  const custom = CUSTOM_RE.exec(ref);
  if (custom) {
    const lat = Number(custom[1]);
    const lon = Number(custom[2]);
    return lat >= -90 && lat <= 90 && lon > -180 && lon <= 180; // 00_indice.md §3: lon in (−180, 180]
  }
  return sites.some((s) => s.id === ref);
}

function validHeight(h: unknown, ref: string, sites: SitesFile['sites']): h is ObserverHeight {
  if (!oneOf(HEIGHTS, h)) return false;
  const site = sites.find((s) => s.id === ref);
  return site === undefined || site.observer_heights_m.length === 0 || site.observer_heights_m.includes(h);
}

/**
 * State described by the fragment, built on the initial state of `sites.json.defaults`; null when
 * the fragment carries no shared state. Each field is checked; what is not valid keeps its initial
 * value (a scenario with an unknown site is dropped) and `partial` is set. Absent fields keep their
 * initial value without warning.
 */
export function restoreFromHash(hash: string, sitesFile: SitesFile): Restored | null {
  if (!hasSharedState(hash)) return null;
  const base = initialState(sitesFile.defaults);
  const text = fromBase64Url(hash.slice(HASH_PREFIX.length));
  let raw: unknown = null;
  if (text !== null) {
    try {
      raw = JSON.parse(text);
    } catch {
      raw = null;
    }
  }
  if (!isObject(raw) || raw.v !== URL_VERSION) return { state: base, partial: true };

  const sites = sitesFile.sites;
  let partial = false;
  const bad = () => {
    partial = true;
  };
  const has = (k: string) => Object.prototype.hasOwnProperty.call(raw, k);
  const state: AppState = { ...base, requirements: { ...base.requirements } };
  const ref = base.scenarios[0];

  // Mode, tab (`Replan` only in Plan), focus body.
  if (has('m')) {
    if (oneOf(MODES, raw.m)) state.mode = raw.m;
    else bad();
  }
  state.storyStep = state.mode === 'learn' ? 0 : null;
  if (has('t')) {
    if (oneOf(TABS, raw.t) && (raw.t !== 'replan' || state.mode === 'plan')) state.tab = raw.t;
    else bad();
  }
  if (has('f')) {
    if (oneOf(BODIES, raw.f)) state.focusBody = raw.f;
    else bad();
  }

  // Scenarios: an unknown site drops the scenario; a bad landing, length or height keeps the default.
  let activeId = state.activeScenarioId;
  if (has('sc')) {
    const list = Array.isArray(raw.sc) ? raw.sc : null;
    if (!list || list.length === 0 || list.length > MAX_SCENARIOS) bad();
    const kept: Scenario[] = [];
    let activeIndex = -1;
    const a = raw.a;
    (list ?? []).slice(0, MAX_SCENARIOS).forEach((item: unknown, i: number) => {
      if (!isObject(item) || !validSiteRef(item.s, sites)) {
        bad();
        return;
      }
      const l = item.l;
      const d = item.d;
      const landingUnix = typeof l === 'number' && Number.isInteger(l) && inSupportedRange(l) ? l : (bad(), ref.landingUnix);
      const missionDays = typeof d === 'number' && normaliseMissionDays(d) === d ? d : (bad(), ref.missionDays);
      const observerHeightM = validHeight(item.h, item.s, sites) ? item.h : (bad(), ref.observerHeightM);
      if (i === a) activeIndex = kept.length;
      kept.push({ id: SCENARIO_LETTERS[kept.length], siteRef: item.s, landingUnix, missionDays, observerHeightM });
    });
    if (kept.length > 0) {
      state.scenarios = kept;
      activeId = kept[0].id;
      if (has('a')) {
        if (activeIndex >= 0) activeId = kept[activeIndex].id;
        else bad();
      }
    }
  } else if (has('a')) {
    if (typeof raw.a === 'number' && Number.isInteger(raw.a) && raw.a >= 0 && raw.a < state.scenarios.length) {
      activeId = state.scenarios[raw.a].id;
    } else bad();
  }
  state.activeScenarioId = activeId;
  // `Link dates` (D-70) stays on only when every scenario shares landing and length.
  state.linkDates = state.scenarios.every((x) => x.landingUnix === state.scenarios[0].landingUnix && x.missionDays === state.scenarios[0].missionDays);

  // Cursor: inside the active mission.
  const active = state.scenarios.find((x) => x.id === activeId) ?? state.scenarios[0];
  state.cursorUnix = active.landingUnix;
  if (has('c')) {
    const c = raw.c;
    if (typeof c === 'number' && Number.isInteger(c) && c >= active.landingUnix && c <= missionEnd(active)) state.cursorUnix = c;
    else bad();
  }

  // Requirements (07 §8.1).
  if (has('rq')) {
    const rq = raw.rq;
    if (!isObject(rq)) bad();
    else {
      const n = rq.n;
      if (rq.n !== undefined) {
        if (typeof n === 'number' && Number.isFinite(n) && n >= MAX_NIGHT_HOURS_RANGE.min && n <= MAX_NIGHT_HOURS_RANGE.max) state.requirements.maxNightHours = n;
        else bad();
      }
      if (rq.su !== undefined) {
        if (rq.su === 0 || rq.su === 1) state.requirements.needSunAtLanding = rq.su === 1;
        else bad();
      }
      if (rq.ea !== undefined) {
        if (rq.ea === 0 || rq.ea === 1) state.requirements.needEarthAtLanding = rq.ea === 1;
        else bad();
      }
    }
  }

  // Map layer and period (`mean186` or `YYYY-MM`, 09_contrato_datos.md §9).
  if (has('ml')) {
    if (oneOf(LAYERS, raw.ml)) state.mapLayer = raw.ml;
    else bad();
  }
  if (has('mp')) {
    if (typeof raw.mp === 'string' && /^(mean186|\d{4}-(0[1-9]|1[0-2]))$/.test(raw.mp)) state.mapPeriod = raw.mp;
    else bad();
  }

  // View mode: a link asking for 3D on a device that cannot show it opens in 2D without a notice.
  if (has('vm')) {
    if (oneOf(VIEW_MODES, raw.vm)) state.viewMode = raw.vm === '3d' && !can3d() ? '2d' : raw.vm;
    else bad();
  }

  return { state, partial };
}

// ---- Keeping the URL up to date (browser) --------------------------------------------------

/** The fragment the URL should carry now, or null when it must not be touched. */
export function targetHash(s: AppState & { initialised: boolean }, currentHash: string, initialHash: string): string | null {
  // Learn writes its own route (story step 6), the validation page owns its fragment, playback
  // would write on every frame (10 §10).
  if (!s.initialised || s.mode === 'learn' || s.playing || routeOf(currentHash) === 'validation') return null;
  const h = encodeHash(s);
  return h === initialHash ? '' : h; // the initial state keeps a clean URL
}

let activeFlush: (() => void) | null = null;

/** Writes any pending change to the URL now (before `Share` copies it). */
export function flushUrl(): void {
  activeFlush?.();
}

/**
 * Keeps `location` in step with the store and restores a shared state pasted into the same tab.
 * Returns the function that stops it.
 */
export function startUrlSync(sitesFile: SitesFile, onRestored: (partial: boolean) => void): () => void {
  const initialHash = encodeHash(initialState(sitesFile.defaults));
  let lastWrite = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const write = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    const h = targetHash(useAppStore.getState(), location.hash, initialHash);
    if (h === null || h === location.hash) return;
    lastWrite = Date.now();
    history.replaceState(history.state, '', h || location.pathname + location.search);
  };
  const schedule = () => {
    if (timer !== null) return;
    const wait = lastWrite + URL_WRITE_INTERVAL_MS - Date.now();
    if (wait <= 0) write();
    else timer = setTimeout(write, wait);
  };
  const onHash = () => {
    // A different link pasted into this tab; going back to the state shown already restores nothing.
    if (hasSharedState(location.hash) && location.hash !== encodeHash(useAppStore.getState())) {
      const r = restoreFromHash(location.hash, sitesFile);
      if (r) {
        useAppStore.setState(r.state);
        onRestored(r.partial);
      }
    }
    schedule();
  };

  const unsubscribe = useAppStore.subscribe(schedule);
  window.addEventListener('hashchange', onHash);
  activeFlush = write;
  schedule();
  return () => {
    unsubscribe();
    window.removeEventListener('hashchange', onHash);
    if (timer !== null) clearTimeout(timer);
    if (activeFlush === write) activeFlush = null;
  };
}
