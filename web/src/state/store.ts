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
import { DAY_S, isoToUnix } from '../core/time';
import type { ObserverHeight, SiteDefaults } from '../core/types';

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

/** 07_visibilidad.md §8.1. */
export interface Requirements {
  needSunAtLanding: boolean;
  needEarthAtLanding: boolean;
  maxNightHours: number;
  marginalEarthMarginDeg: number;
  marginalSunFraction: number;
}

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

export const useAppStore = create<AppStore>()((set, get) => ({
  ...initialState(EMPTY_DEFAULTS),
  initialised: false,

  init: (defaults) => set({ ...initialState(defaults), initialised: true }),
  setMode: (mode) => set({ mode, storyStep: mode === 'learn' ? (get().storyStep ?? 0) : null }),
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
    if (s.scenarios.length >= MAX_SCENARIOS) return null;
    const used = new Set(s.scenarios.map((x) => x.id));
    const id = SCENARIO_LETTERS.find((l) => !used.has(l));
    if (!id) return null;
    const base = activeOf(s);
    const scenario: Scenario = { ...base, id, siteRef };
    const scenarios = [...s.scenarios, scenario].sort((a, b) => a.id.localeCompare(b.id));
    set({ scenarios });
    return id;
  },
  updateScenario: (id, patch) =>
    set((s) => {
      const scenarios = s.scenarios.map((x) => (x.id === id ? { ...x, ...patch } : x));
      const next = { ...s, scenarios };
      return { scenarios, cursorUnix: clampCursor(next, s.cursorUnix) };
    }),
  removeScenario: (id) =>
    set((s) => {
      if (s.scenarios.length <= 1) return {};
      const scenarios = s.scenarios.filter((x) => x.id !== id);
      const activeScenarioId = s.activeScenarioId === id ? scenarios[0].id : s.activeScenarioId;
      const next = { ...s, scenarios, activeScenarioId };
      return { scenarios, activeScenarioId, cursorUnix: clampCursor(next, s.cursorUnix) };
    }),
}));
