// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-30: every story step produces the exact, valid state of 10_interfaz.md §11; variant without map;
// texts with the numbers from the data.
import { describe, expect, it } from 'vitest';
import { exampleJson } from '../../core/__tests__/fixtures';
import { DAY_S, isoToUnix } from '../../core/time';
import type { SitesFile } from '../../core/types';
import { missionEnd, type AppState } from '../../state/store';
import {
  exploreState,
  replanViewForStep,
  siteDistanceM,
  STEP1_PLAY_S,
  STEP1_SPEED,
  STORY_LENGTH,
  storyDistance,
  storySteps,
  type StoryContext,
} from './storySteps';

const sites = exampleJson<SitesFile>('sites.json');
const T = isoToUnix(sites.defaults.demo_landing_utc);
const ctx = (over: Partial<StoryContext> = {}): StoryContext => ({ defaults: sites.defaults, sites: sites.sites, hasMap: false, blockerDistM: 20_000, ...over });
const TABS = ['panorama', 'timeline', 'map', 'section', 'replan'];

function expectValid(s: Partial<AppState>, i: number) {
  expect(s.mode).toBe('learn');
  expect(s.storyStep).toBe(i);
  const scenarios = s.scenarios!;
  expect(scenarios.length).toBeGreaterThanOrEqual(1);
  expect(scenarios.length).toBeLessThanOrEqual(4);
  expect(new Set(scenarios.map((x) => x.id)).size).toBe(scenarios.length);
  const active = scenarios.find((x) => x.id === s.activeScenarioId)!;
  expect(active).toBeDefined();
  expect(s.cursorUnix!).toBeGreaterThanOrEqual(active.landingUnix);
  expect(s.cursorUnix!).toBeLessThanOrEqual(missionEnd(active));
  expect(TABS).toContain(s.tab);
  for (const sc of scenarios) {
    expect(sc.missionDays).toBe(sites.defaults.demo_mission_days);
    expect(sites.sites.map((x) => x.id)).toContain(sc.siteRef);
  }
}

describe('story steps (10 §11)', () => {
  it('seven steps covering 0–60 s', () => {
    expect(storySteps).toHaveLength(STORY_LENGTH);
    expect(storySteps[0].seconds[0]).toBe(0);
    expect(storySteps[6].seconds[1]).toBe(60);
    storySteps.forEach((s, i) => i && expect(s.seconds[0]).toBe(storySteps[i - 1].seconds[1]));
  });

  it('every step produces a valid state (with and without map)', () => {
    for (const hasMap of [false, true]) storySteps.forEach((s, i) => expectValid(s.apply(ctx({ hasMap })), i));
  });

  it('applying a step twice gives the same state (reproducible demo)', () => {
    storySteps.forEach((s) => expect(s.apply(ctx())).toEqual(s.apply(ctx())));
  });

  it('1: scenario A, Panorama on the Sun, cursor at T, playing at 6 h/s for 4 s', () => {
    const s = storySteps[0].apply(ctx());
    expect(s).toMatchObject({ activeScenarioId: 'A', tab: 'panorama', focusBody: 'sun', cursorUnix: T, playing: true, playSpeed: STEP1_SPEED });
    expect(storySteps[0].view(ctx()).playForS).toBe(STEP1_PLAY_S);
  });

  it('2: A and B side by side in Compare', () => {
    const s = storySteps[1].apply(ctx());
    expect(s.scenarios!.map((x) => x.siteRef)).toEqual(sites.defaults.demo_pair);
    expect(s.comparing).toBe(true);
  });

  it('3: scenario B active, Cross-section toward the Sun', () => {
    expect(storySteps[2].apply(ctx())).toMatchObject({ activeScenarioId: 'B', tab: 'section', focusBody: 'sun', comparing: false });
  });

  it('4: A in the reduced Replan matrix, active column from +0 to +12 d', () => {
    expect(storySteps[3].apply(ctx())).toMatchObject({ activeScenarioId: 'A', tab: 'replan' });
    expect(replanViewForStep(3)).toEqual({ compact: true, columnFrom: 0, columnTo: 12, highlightRank: false });
  });

  it('5: ranking for T + 12 d with the first row highlighted', () => {
    const s = storySteps[4].apply(ctx());
    expect(s.scenarios!.every((x) => x.landingUnix === T + 12 * DAY_S)).toBe(true);
    expect(replanViewForStep(4)?.highlightRank).toBe(true);
  });

  it('6 without map: blue-ghost-1 at its real landing, Timeline; with map: Map, Sun + Earth, month of T', () => {
    const noMap = storySteps[5].apply(ctx({ hasMap: false }));
    expect(noMap.tab).toBe('timeline');
    expect(noMap.scenarios).toHaveLength(1);
    expect(noMap.scenarios![0]).toMatchObject({ siteRef: 'blue-ghost-1', landingUnix: isoToUnix('2025-03-02T08:34:00Z') });
    expect(storySteps[5].text(ctx({ hasMap: false }))).toMatch(/^Near the equator a lunar day lasts two Earth weeks\./);
    const map = storySteps[5].apply(ctx({ hasMap: true }));
    expect(map).toMatchObject({ tab: 'map', mapLayer: 'both', mapPeriod: '2027-08' });
    expect(storySteps[5].text(ctx({ hasMap: true }))).toMatch(/^Or let it search/);
  });

  it('7: the validation page', () => {
    expect(storySteps[6].view(ctx()).route).toBe('validation');
    expect(storySteps.slice(0, 6).every((s) => s.view(ctx()).route === 'main')).toBe(true);
  });

  it('Explore it yourself: back to Explore with A and B', () => {
    const s = exploreState(ctx());
    expect(s).toMatchObject({ mode: 'explore', storyStep: null, activeScenarioId: 'A', comparing: false });
    expect(s.scenarios!.map((x) => x.siteRef)).toEqual(sites.defaults.demo_pair);
  });
});

describe('texts with numbers from the data', () => {
  it('{distance} and {blockerDist}: `830 m`, `41 km`', () => {
    expect(storyDistance(832)).toBe('830 m');
    expect(storyDistance(41_230)).toBe('41 km');
    const [a, b] = sites.defaults.demo_pair.map((id) => sites.sites.find((s) => s.id === id)!);
    const d = siteDistanceM(a, b);
    expect(d).toBeGreaterThan(20_000);
    expect(storySteps[1].text(ctx())).toBe(`These two sites are ${storyDistance(d)} apart. One has sunlight and a direct radio link to Earth. The other has neither.`);
    expect(storySteps[2].text(ctx({ blockerDistM: 41_230 }))).toBe('Here is why: a ridge 41 km away blocks the Sun. Every answer comes with its reason.');
  });

  it('great-circle distance: a quarter of a meridian', () => {
    expect(siteDistanceM({ lat_deg: 0, lon_deg: 0 }, { lat_deg: 90, lon_deg: 0 })).toBeCloseTo((Math.PI / 2) * 1_737_400, 3);
  });
});
