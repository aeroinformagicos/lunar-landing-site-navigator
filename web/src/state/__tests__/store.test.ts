// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-11: the store builds its initial state from sites.json.defaults.
import { beforeEach, describe, expect, it } from 'vitest';
import { exampleJson } from '../../core/__tests__/fixtures';
import type { SitesFile } from '../../core/types';
import { DEFAULT_REQUIREMENTS, initialState, missionEnd, useAppStore } from '../store';

const { defaults } = exampleJson<SitesFile>('sites.json');
const LANDING = 1_817_078_400; // 2027-08-01T00:00:00Z (10_interfaz.md §10)

describe('initialState', () => {
  it('uses demo_pair, demo_landing_utc and demo_mission_days', () => {
    const s = initialState(defaults);
    expect(s.scenarios).toEqual([
      { id: 'A', siteRef: 'demo-a', landingUnix: LANDING, missionDays: 14, observerHeightM: 2 },
      { id: 'B', siteRef: 'demo-b', landingUnix: LANDING, missionDays: 14, observerHeightM: 2 },
    ]);
    expect(s.activeScenarioId).toBe('A');
    expect(s.cursorUnix).toBe(LANDING);
    expect(s).toMatchObject({
      mode: 'explore',
      tab: 'panorama',
      playing: false,
      playSpeed: 3600,
      focusBody: 'sun',
      showSmooth: false,
      mapLayer: 'both',
      mapPeriod: 'mean186',
      storyStep: null,
    });
    expect(s.requirements).toEqual(DEFAULT_REQUIREMENTS);
  });

  it('follows other defaults', () => {
    const s = initialState({
      demo_pair: ['apollo-11', 'blue-ghost-1'],
      demo_landing_utc: '2025-03-02T08:34:00Z',
      demo_mission_days: 3.5,
    });
    expect(s.scenarios.map((x) => x.siteRef)).toEqual(['apollo-11', 'blue-ghost-1']);
    expect(missionEnd(s.scenarios[0]) - s.scenarios[0].landingUnix).toBe(3.5 * 86_400);
  });

  it('rejects an invalid landing instant', () => {
    expect(() => initialState({ ...defaults, demo_landing_utc: 'soon' })).toThrow();
  });
});

describe('useAppStore', () => {
  beforeEach(() => useAppStore.getState().init(defaults));
  const get = () => useAppStore.getState();

  it('init marks the store as initialised and resets it', () => {
    get().setTab('map');
    get().init(defaults);
    expect(get().initialised).toBe(true);
    expect(get().tab).toBe('panorama');
  });

  it('requirements are a copy, not the frozen defaults', () => {
    get().setRequirements({ maxNightHours: 48 });
    expect(get().requirements.maxNightHours).toBe(48);
    expect(DEFAULT_REQUIREMENTS.maxNightHours).toBe(24);
  });

  it('clamps the cursor to the active mission', () => {
    get().setCursor(LANDING - 100);
    expect(get().cursorUnix).toBe(LANDING);
    get().setCursor(LANDING + 30 * 86_400);
    expect(get().cursorUnix).toBe(LANDING + 14 * 86_400);
  });

  it('adds up to 4 scenarios with the active dates and reuses free letters', () => {
    expect(get().addScenario('apollo-11')).toBe('C');
    expect(get().addScenario('blue-ghost-1')).toBe('D');
    expect(get().addScenario('demo-a')).toBeNull();
    get().removeScenario('B');
    expect(get().addScenario('demo-b')).toBe('B');
    expect(get().scenarios.map((s) => s.id)).toEqual(['A', 'B', 'C', 'D']);
    expect(get().scenarios[2].landingUnix).toBe(LANDING);
  });

  it('keeps at least one scenario and moves the active one', () => {
    get().setActiveScenario('B');
    get().removeScenario('B');
    expect(get().activeScenarioId).toBe('A');
    get().removeScenario('A');
    expect(get().scenarios).toHaveLength(1);
  });

  it('cycles the playback speed', () => {
    get().cycleSpeed();
    expect(get().playSpeed).toBe(21_600);
    get().cycleSpeed();
    get().cycleSpeed();
    expect(get().playSpeed).toBe(3600);
  });

  it('Learn mode starts the story at step 0; other modes clear it', () => {
    get().setMode('learn');
    expect(get().storyStep).toBe(0);
    get().setMode('plan');
    expect(get().storyStep).toBeNull();
  });
});
