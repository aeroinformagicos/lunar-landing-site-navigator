// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// App state (02_arquitectura.md §8): only what the user chooses. Sky state, metrics and events are
// derived with selectors (state/selectors.ts, T-14) and never stored here.
import { create } from 'zustand';
import {
  DEFAULT_OBSERVER_HEIGHT_M,
  MAX_SCENARIOS,
  PLAY_SPEEDS,
  SCENARIO_LETTERS,
} from '../core/constants';
import type { Requirements } from '../core/requirements';
import { DAY_S, isoToUnix } from '../core/time';
import type { ObserverHeight, SiteDefaults } from '../core/types';
import { can3d, defaultViewMode, type ViewMode } from './viewMode';

export type { ViewMode };

export type Mode = 'explore' | 'plan' | 'learn';
export type Tab = 'panorama' | 'timeline' | 'map' | 'section' | 'replan';
export type FocusBody = 'sun' | 'earth';
export type MapLayer = 'sun' | 'earth' | 'both' | 'none';
export type PlaySpeed = (typeof PLAY_SPEEDS)[number];
export type ScenarioId = (typeof SCENARIO_LETTERS)[number];

export interface Scenario {
  /** Letter A–D; also its marker shape (10_interfaz.md §2). */
  id: ScenarioId;
  /** Catalogue id, `grid:i,j` or `custom:lat,lon` (10 §10). */
  siteRef: string;
  landingUnix: number;
  missionDays: number;
  observerHeightM: ObserverHeight;
}

/** 07_visibilidad.md §8.1 (defined in core/requirements.ts). */
export type { Requirements };

export const DEFAULT_REQUIREMENTS: Readonly<Requirements> = Object.freeze({
  needSunAtLanding: true,
  needEarthAtLanding: true,
  maxNightHours: 24,
  marginalEarthMarginDeg: 1.0,
  marginalSunFraction: 1.0,
});

export interface AppState {
  mode: Mode;
  scenarios: Scenario[];
  activeScenarioId: ScenarioId;
  cursorUnix: number;
  playing: boolean;
  playSpeed: PlaySpeed;
  tab: Tab;
  focusBody: FocusBody;
  showSmooth: boolean;
  requirements: Requirements;
  mapLayer: MapLayer;
  /** `mean186` or `YYYY-MM` (09 §9). */
  mapPeriod: string;
  /** Step of the guided story, or null outside Learn. */
  storyStep: number | null;
  /** `Link dates` (10_interfaz.md §4, on by default): landing and duration apply to every scenario. */
  linkDates: boolean;
  /** The comparison table (F8) replaces the main view until `Close comparison`. */
  comparing: boolean;
  /** 3D or 2D central stage of the v2 interface (15_interfaz_v2.md §4.1); shared as `vm` (F16). */
  viewMode: ViewMode;
  /** Set when the 3D view failed after mounting and the stage fell back to 2D (16 §10.3). */
  viewNotice: 'webgl_failed' | null;
}

export interface AppActions {
  /** Resets everything to the initial state built from `sites.json.defaults`. */
  init(defaults: SiteDefaults): void;
  setMode(mode: Mode): void;
  setTab(tab: Tab): void;
  setActiveScenario(id: ScenarioId): void;
  /** Moves the cursor, clamped to the active scenario's mission. */
  setCursor(unix: number): void;
  setPlaying(playing: boolean): void;
  cycleSpeed(): void;
  setFocusBody(body: FocusBody): void;
  setShowSmooth(show: boolean): void;
  setRequirements(patch: Partial<Requirements>): void;
  setMapLayer(layer: MapLayer): void;
  setMapPeriod(period: string): void;
  setStoryStep(step: number | null): void;
  /** Adds a scenario with the active one's dates; no-op with 4 scenarios. Returns its id. */
  addScenario(siteRef: string): ScenarioId | null;
  updateScenario(id: ScenarioId, patch: Partial<Omit<Scenario, 'id'>>): void;
  /** Removes a scenario; the last one cannot be removed. */
  removeScenario(id: ScenarioId): void;
  /** Copies scenario `id` into a free letter (no-op with 4). Returns the new id. */
  duplicateScenario(id: ScenarioId): ScenarioId | null;
  setLinkDates(link: boolean): void;
  setComparing(comparing: boolean): void;
  /** Landing of the active scenario, or of all with `linkDates`; the cursor keeps its offset. */
  setLanding(unix: number): void;
  /** Mission length (days) of the active scenario, or of all with `linkDates`. */
  setMissionDays(days: number): void;
  /** 3D only if this device and build can show it (15 §4.1). */
  setViewMode(mode: ViewMode): void;
  /** Called by the 3D view when WebGL fails after mounting: 2D with a plain notice (16 §10.3). */
  fallbackTo2d(reason: string): void;
  dismissViewNotice(): void;
}

export type AppStore = AppState & AppActions & { initialised: boolean };

/** `YYYY-MM-DDTHH:MM:SSZ` → Unix seconds (core/time.ts). */
export const parseUtc = isoToUnix;

export function missionEnd(s: Scenario): number {
  return s.landingUnix + Math.round(s.missionDays * DAY_S);
}

/** Initial state: scenarios A and B on `demo_pair`, landing `demo_landing_utc`, cursor at landing. */
export function initialState(defaults: SiteDefaults): AppState {
  const landingUnix = parseUtc(defaults.demo_landing_utc);
  const scenarios = defaults.demo_pair.slice(0, MAX_SCENARIOS).map(
    (siteRef, i): Scenario => ({
      id: SCENARIO_LETTERS[i],
      siteRef,
      landingUnix,
      missionDays: defaults.demo_mission_days,
      observerHeightM: DEFAULT_OBSERVER_HEIGHT_M,
    }),
  );
  return {
    mode: 'explore',
    scenarios,
    activeScenarioId: scenarios[0].id,
    cursorUnix: landingUnix,
    playing: false,
    playSpeed: PLAY_SPEEDS[0],
    tab: 'panorama',
    focusBody: 'sun',
    showSmooth: false,
    requirements: { ...DEFAULT_REQUIREMENTS },
    mapLayer: 'both',
    mapPeriod: 'mean186',
    storyStep: null,
    linkDates: true,
    comparing: false,
    viewMode: defaultViewMode(),
    viewNotice: null,
  };
}

const EMPTY_DEFAULTS: SiteDefaults = {
  demo_pair: ['demo-a', 'demo-b'],
  demo_landing_utc: '2027-08-01T00:00:00Z',
  demo_mission_days: 14,
};

function activeOf(s: AppState): Scenario {
  return s.scenarios.find((x) => x.id === s.activeScenarioId) ?? s.scenarios[0];
}

function clampCursor(s: AppState, unix: number): number {
  const a = activeOf(s);
  return Math.min(Math.max(unix, a.landingUnix), missionEnd(a));
}

/** Scenarios after adding a copy of `base` with a free letter and `siteRef`; null with 4. */
function withCopy(s: AppState, base: Scenario, siteRef: string): { scenarios: Scenario[]; id: ScenarioId } | null {
  if (s.scenarios.length >= MAX_SCENARIOS) return null;
  const used = new Set(s.scenarios.map((x) => x.id));
  const id = SCENARIO_LETTERS.find((l) => !used.has(l));
  if (!id) return null;
  const scenarios = [...s.scenarios, { ...base, id, siteRef }].sort((a, b) => a.id.localeCompare(b.id));
  return { scenarios, id };
}

export const useAppStore = create<AppStore>()((set, get) => ({
  ...initialState(EMPTY_DEFAULTS),
  initialised: false,

  init: (defaults) => set({ ...initialState(defaults), initialised: true }),
  // `Replan` exists only in Plan: leaving Plan on that tab goes back to Panorama.
  setMode: (mode) =>
    set((s) => ({
      mode,
      storyStep: mode === 'learn' ? (s.storyStep ?? 0) : null,
      tab: mode !== 'plan' && s.tab === 'replan' ? 'panorama' : s.tab,
    })),
  setTab: (tab) => set({ tab }),
  setActiveScenario: (id) => {
    if (!get().scenarios.some((s) => s.id === id)) return;
    set((s) => {
      const next = { ...s, activeScenarioId: id };
      return { activeScenarioId: id, cursorUnix: clampCursor(next, s.cursorUnix) };
    });
  },
  setCursor: (unix) => set((s) => ({ cursorUnix: clampCursor(s, unix) })),
  setPlaying: (playing) => set({ playing }),
  cycleSpeed: () =>
    set((s) => ({ playSpeed: PLAY_SPEEDS[(PLAY_SPEEDS.indexOf(s.playSpeed) + 1) % PLAY_SPEEDS.length] })),
  setFocusBody: (focusBody) => set({ focusBody }),
  setShowSmooth: (showSmooth) => set({ showSmooth }),
  setRequirements: (patch) => set((s) => ({ requirements: { ...s.requirements, ...patch } })),
  setMapLayer: (mapLayer) => set({ mapLayer }),
  setMapPeriod: (mapPeriod) => set({ mapPeriod }),
  setStoryStep: (storyStep) => set({ storyStep }),

  addScenario: (siteRef) => {
    const s = get();
    const r = withCopy(s, activeOf(s), siteRef);
    if (r) set({ scenarios: r.scenarios });
    return r?.id ?? null;
  },
  duplicateScenario: (id) => {
    const s = get();
    const base = s.scenarios.find((x) => x.id === id);
    const r = base ? withCopy(s, base, base.siteRef) : null;
    if (r) set({ scenarios: r.scenarios });
    return r?.id ?? null;
  },
  setLinkDates: (linkDates) => set({ linkDates }),
  setComparing: (comparing) => set({ comparing }),
  setLanding: (unix) =>
    set((s) => {
      const active = activeOf(s);
      const offset = s.cursorUnix - active.landingUnix;
      const scenarios = s.scenarios.map((x) => (s.linkDates || x.id === active.id ? { ...x, landingUnix: unix } : x));
      return { scenarios, cursorUnix: clampCursor({ ...s, scenarios }, unix + offset) };
    }),
  setMissionDays: (days) =>
    set((s) => {
      const active = activeOf(s);
      const scenarios = s.scenarios.map((x) => (s.linkDates || x.id === active.id ? { ...x, missionDays: days } : x));
      return { scenarios, cursorUnix: clampCursor({ ...s, scenarios }, s.cursorUnix) };
    }),
  updateScenario: (id, patch) =>
    set((s) => {
      const scenarios = s.scenarios.map((x) => (x.id === id ? { ...x, ...patch } : x));
      const next = { ...s, scenarios };
      return { scenarios, cursorUnix: clampCursor(next, s.cursorUnix) };
    }),
  setViewMode: (viewMode) => {
    if (viewMode === '3d' && !can3d()) return;
    set({ viewMode });
  },
  fallbackTo2d: () => set({ viewMode: '2d', viewNotice: 'webgl_failed' }),
  dismissViewNotice: () => set({ viewNotice: null }),
  removeScenario: (id) =>
    set((s) => {
      if (s.scenarios.length <= 1) return {};
      const scenarios = s.scenarios.filter((x) => x.id !== id);
      const activeScenarioId = s.activeScenarioId === id ? scenarios[0].id : s.activeScenarioId;
      const next = { ...s, scenarios, activeScenarioId };
      return { scenarios, activeScenarioId, cursorUnix: clampCursor(next, s.cursorUnix) };
    }),
}));
