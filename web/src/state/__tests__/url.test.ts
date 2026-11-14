// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-33 (F16, 10_interfaz.md §10): the shared link round-trips the state, ignores what is not valid
// and warns, and the URL is written at most twice per second, never during playback or in Learn.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exampleJson } from '../../core/__tests__/fixtures';
import type { SitesFile } from '../../core/types';
import { initialState, useAppStore, type AppState } from '../store';
import {
  encodeHash,
  flushUrl,
  fromBase64Url,
  hasSharedState,
  restoreFromHash,
  startUrlSync,
  targetHash,
  toBase64Url,
  toLinkState,
  URL_WRITE_INTERVAL_MS,
} from '../url';

const example = exampleJson<SitesFile>('sites.json');
// The example of 10 §10 names `region-malapert-massif`: added as a copy of `demo-a`.
const SITES: SitesFile = {
  ...example,
  sites: [...example.sites, { ...example.sites[0], id: 'region-malapert-massif', name: 'Malapert Massif', short_name: 'Malapert' }],
};
const LANDING = 1_817_078_400; // 2027-08-01T00:00:00Z (10 §10)
const CURSOR = 1_817_389_200; // landing + 3 d 14 h 20 min (10 §10)

/** The JSON of the example in 10 §10, verbatim. */
const SPEC_EXAMPLE = {
  v: 1,
  m: 'plan',
  t: 'panorama',
  c: 1817389200,
  f: 'sun',
  sc: [
    { s: 'region-malapert-massif', l: 1817078400, d: 14, h: 2 },
    { s: 'grid:538,117', l: 1817078400, d: 14, h: 2 },
  ],
  a: 0,
  rq: { n: 24, su: 1, ea: 1 },
  ml: 'both',
  mp: '2027-08',
};

const hashOf = (json: unknown) => `#s=${toBase64Url(JSON.stringify(json))}`;
const restore = (json: unknown) => restoreFromHash(hashOf(json), SITES)!;
const base = () => initialState(SITES.defaults);

describe('base64url', () => {
  it('round-trips ASCII and UTF-8 text without padding or + and /', () => {
    for (const text of ['', 'a', 'ab', 'abc', '{"s":"demo-a"}', 'Aeroinformágicos · 84.79° S', '\u{1F315}>>>???']) {
      const enc = toBase64Url(text);
      expect(enc).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(fromBase64Url(enc)).toBe(text);
    }
    expect(toBase64Url('>>>???')).toBe('Pj4-Pz8_'); // RFC 4648 §5 alphabet
  });

  it('accepts padding and rejects what is not base64url or not UTF-8', () => {
    expect(fromBase64Url('YQ==')).toBe('a');
    expect(fromBase64Url('a+b/')).toBeNull();
    expect(fromBase64Url('abcde')).toBeNull(); // length 4k + 1
    expect(fromBase64Url('%%')).toBeNull();
    expect(fromBase64Url('_w')).toBeNull(); // byte 0xFF is not UTF-8
  });
});

describe('restoreFromHash: the example of 10 §10', () => {
  it('gives the scenarios, cursor, mode, tab, requirements and map of the example', () => {
    const r = restore(SPEC_EXAMPLE);
    expect(r.partial).toBe(false);
    expect(r.state).toMatchObject({
      mode: 'plan',
      tab: 'panorama',
      cursorUnix: CURSOR,
      focusBody: 'sun',
      activeScenarioId: 'A',
      mapLayer: 'both',
      mapPeriod: '2027-08',
      storyStep: null,
      playing: false,
      linkDates: true,
    });
    expect(r.state.scenarios).toEqual([
      { id: 'A', siteRef: 'region-malapert-massif', landingUnix: LANDING, missionDays: 14, observerHeightM: 2 },
      { id: 'B', siteRef: 'grid:538,117', landingUnix: LANDING, missionDays: 14, observerHeightM: 2 },
    ]);
    expect(r.state.requirements).toMatchObject({ maxNightHours: 24, needSunAtLanding: true, needEarthAtLanding: true });
  });

  it('writes the example back with the same JSON, plus the view mode (vm, 15_interfaz_v2.md §4.1)', () => {
    // The example predates `vm`: restored with the device default (2D without WebGL 2 here).
    expect(toLinkState(restore(SPEC_EXAMPLE).state)).toEqual({ ...SPEC_EXAMPLE, vm: '2d' });
  });

  it('vm: 2d is kept, 3d needs a device that can show it, anything else is dropped with the notice', () => {
    expect(restore({ ...SPEC_EXAMPLE, vm: '2d' }).state.viewMode).toBe('2d');
    expect(restore({ ...SPEC_EXAMPLE, vm: '3d' }).state.viewMode).toBe('2d'); // no WebGL 2 in the test runner
    const bad = restore({ ...SPEC_EXAMPLE, vm: 'vr' });
    expect(bad.partial).toBe(true);
    expect(bad.state.viewMode).toBe('2d');
  });
});

describe('round trip', () => {
  const states: [string, (s: AppState) => AppState][] = [
    ['initial', (s) => s],
    [
      'Plan on Replan, four scenarios, active C, changed requirements',
      (s) => ({
        ...s,
        mode: 'plan',
        tab: 'replan',
        focusBody: 'earth',
        scenarios: [
          { id: 'A', siteRef: 'demo-a', landingUnix: LANDING, missionDays: 14, observerHeightM: 2 },
          { id: 'B', siteRef: 'apollo-11', landingUnix: LANDING + 86_400, missionDays: 3.5, observerHeightM: 2 },
          { id: 'C', siteRef: 'custom:-89.5,-45.25', landingUnix: LANDING + 600, missionDays: 60, observerHeightM: 10 },
          { id: 'D', siteRef: 'grid:0,0', landingUnix: 31_536_000, missionDays: 0.5, observerHeightM: 2 },
        ],
        activeScenarioId: 'C',
        cursorUnix: LANDING + 600 + 59 * 86_400,
        linkDates: false,
        requirements: { ...s.requirements, maxNightHours: 400, needSunAtLanding: false, needEarthAtLanding: true },
        mapLayer: 'none',
        mapPeriod: 'mean186',
      }),
    ],
    [
      'Explore on the map, one scenario at the end of the 2044 segment',
      (s) => ({
        ...s,
        tab: 'map',
        scenarios: [{ id: 'A', siteRef: 'grid:751,671', landingUnix: 2_366_841_600, missionDays: 1, observerHeightM: 2 }],
        activeScenarioId: 'A',
        cursorUnix: 2_366_841_600 + 86_400,
        requirements: { ...s.requirements, maxNightHours: 0 },
        mapLayer: 'earth',
        mapPeriod: '2030-12',
      }),
    ],
  ];

  it.each(states)('%s', (_name, make) => {
    const s = make(base());
    const r = restoreFromHash(encodeHash(s), SITES)!;
    expect(r.partial).toBe(false);
    expect(toLinkState(r.state)).toEqual(toLinkState(s));
    expect(r.state.scenarios).toEqual(s.scenarios);
    expect(r.state.linkDates).toBe(s.linkDates);
    expect(encodeHash(r.state)).toBe(encodeHash(s));
  });

  it('opens Learn at step 1 of the story', () => {
    const r = restore({ v: 1, m: 'learn' });
    expect(r.state).toMatchObject({ mode: 'learn', storyStep: 0 });
  });
});

describe('restoreFromHash: no shared state', () => {
  it.each(['', '#', '#/validation', '#s', '#x=abc'])('%j → null', (hash) => {
    expect(hasSharedState(hash)).toBe(false);
    expect(restoreFromHash(hash, SITES)).toBeNull();
  });
});

describe('restoreFromHash: corrupt links open the initial state with the warning', () => {
  const corrupt: [string, string][] = [
    ['empty', '#s='],
    ['not base64url', '#s=%%%***'],
    ['not JSON', `#s=${toBase64Url('{"v":1,')}`],
    ['JSON array', hashOf([1, 2])],
    ['JSON null', hashOf(null)],
    ['JSON string', hashOf('plan')],
    ['other version', hashOf({ ...SPEC_EXAMPLE, v: 2 })],
    ['version as text', hashOf({ ...SPEC_EXAMPLE, v: '1' })],
    ['every field wrong', hashOf({ v: 1, m: 1, t: [], c: 'x', f: null, sc: 'demo-a', a: -1, rq: 7, ml: 0, mp: 2027 })],
  ];
  it.each(corrupt)('%s', (_name, hash) => {
    const r = restoreFromHash(hash, SITES)!;
    expect(r.partial).toBe(true);
    expect(r.state).toEqual(base());
  });

  it('absent fields keep their initial value without warning', () => {
    const r = restore({ v: 1 });
    expect(r).toEqual({ state: base(), partial: false });
  });
});

describe('restoreFromHash: each field is checked on its own', () => {
  const sc = SPEC_EXAMPLE.sc;
  const withScenario = (patch: Record<string, unknown>) => restore({ ...SPEC_EXAMPLE, sc: [{ ...sc[0], ...patch }, sc[1]] });

  it('a scenario with an unknown or invalid site is dropped; letters and the active one follow', () => {
    for (const s of ['atlantis', 'grid:752,0', 'grid:0,672', 'grid:-1,0', 'custom:91,0', 'custom:-90.5,0', 'custom:0,-180', 'custom:0,180.5', 'custom:1e2,0', 'custom:0,1.2.3', 42, null]) {
      const r = restore({ ...SPEC_EXAMPLE, sc: [{ ...sc[0], s }, sc[1]], a: 1 });
      expect(r.partial, String(s)).toBe(true);
      expect(r.state.scenarios.map((x) => [x.id, x.siteRef])).toEqual([['A', 'grid:538,117']]);
      expect(r.state.activeScenarioId).toBe('A');
    }
    const edge = restore({ ...SPEC_EXAMPLE, sc: [{ ...sc[0], s: 'custom:-90,180' }] });
    expect(edge.partial).toBe(false);
  });

  it('a bad landing, length or height keeps its default', () => {
    const bad: Record<string, unknown>[] = [
      { l: 946_684_800 }, // 2000-01-01: outside the ephemeris (1969–1972, 2024–2044)
      { l: 2_366_841_601 }, // one second after 2045-01-01
      { l: LANDING + 0.5 },
      { l: '1817078400' },
      { d: 0 },
      { d: 60.5 },
      { d: 1.25 },
      { d: Number.NaN },
      { h: 5 },
      { h: 10 }, // region-malapert-massif only has 2 m
      { h: '2' },
    ];
    for (const patch of bad) {
      const r = withScenario(patch);
      expect(r.partial, JSON.stringify(patch)).toBe(true);
      expect(r.state.scenarios[0]).toEqual({ id: 'A', siteRef: 'region-malapert-massif', landingUnix: LANDING, missionDays: 14, observerHeightM: 2 });
    }
    // Inside the Apollo segment (1969–1972): valid.
    const apollo = restore({ v: 1, sc: [{ s: 'apollo-11', l: -14_182_940, d: 3, h: 2 }] });
    expect(apollo.partial).toBe(false);
    expect(apollo.state.scenarios[0].landingUnix).toBe(-14_182_940); // 1969-07-20T20:17:40Z
  });

  it('more than four scenarios keeps the first four', () => {
    const five = Array.from({ length: 5 }, (_, i) => ({ s: `grid:${i},0`, l: LANDING, d: 14, h: 2 }));
    const r = restore({ v: 1, sc: five, a: 3 });
    expect(r.partial).toBe(true);
    expect(r.state.scenarios.map((x) => x.siteRef)).toEqual(['grid:0,0', 'grid:1,0', 'grid:2,0', 'grid:3,0']);
    expect(r.state.activeScenarioId).toBe('D');
  });

  it('an empty list keeps the demo pair', () => {
    const r = restore({ v: 1, sc: [] });
    expect(r.partial).toBe(true);
    expect(r.state.scenarios).toEqual(base().scenarios);
  });

  it('active scenario and cursor', () => {
    expect(restore({ ...SPEC_EXAMPLE, a: 1 }).state.activeScenarioId).toBe('B');
    for (const a of [2, -1, 0.5, '0', null]) {
      const r = restore({ ...SPEC_EXAMPLE, a });
      expect(r.partial, String(a)).toBe(true);
      expect(r.state.activeScenarioId).toBe('A');
    }
    for (const c of [LANDING - 1, LANDING + 14 * 86_400 + 1, CURSOR + 0.5, 'x']) {
      const r = restore({ ...SPEC_EXAMPLE, c });
      expect(r.partial, String(c)).toBe(true);
      expect(r.state.cursorUnix).toBe(LANDING);
    }
    expect(restore({ ...SPEC_EXAMPLE, c: LANDING + 14 * 86_400 }).partial).toBe(false);
    // Without `c`, the cursor starts at the landing of the active scenario.
    const { c: _c, ...noCursor } = SPEC_EXAMPLE;
    expect(restore({ ...noCursor, sc: [sc[0], { ...sc[1], l: LANDING + 7200 }], a: 1 }).state.cursorUnix).toBe(LANDING + 7200);
  });

  it('dates that differ switch `Link dates` off', () => {
    expect(restore({ ...SPEC_EXAMPLE, sc: [sc[0], { ...sc[1], l: LANDING + 600 }] }).state.linkDates).toBe(false);
    expect(restore({ ...SPEC_EXAMPLE, sc: [sc[0], { ...sc[1], d: 7 }] }).state.linkDates).toBe(false);
  });

  it('mode, tab and focus body', () => {
    const cases: [Record<string, unknown>, Partial<AppState>][] = [
      [{ m: 'admin' }, { mode: 'explore' }],
      [{ t: 'settings' }, { tab: 'panorama' }],
      [{ m: 'explore', t: 'replan' }, { mode: 'explore', tab: 'panorama' }], // Replan only in Plan
      [{ f: 'moon' }, { focusBody: 'sun' }],
    ];
    for (const [patch, expected] of cases) {
      const r = restore({ ...SPEC_EXAMPLE, ...patch });
      expect(r.partial, JSON.stringify(patch)).toBe(true);
      expect(r.state).toMatchObject(expected);
    }
    expect(restore({ ...SPEC_EXAMPLE, t: 'replan' }).state.tab).toBe('replan');
    expect(restore({ ...SPEC_EXAMPLE, f: 'earth', t: 'section' }).state).toMatchObject({ focusBody: 'earth', tab: 'section' });
  });

  it('requirements: night limit 0–400 h (07 §8.1), flags 0 or 1', () => {
    for (const rq of [{ n: 401 }, { n: -1 }, { n: '24' }, { n: null }, { su: 2 }, { su: true }, { ea: -1 }, []]) {
      const r = restore({ ...SPEC_EXAMPLE, rq });
      expect(r.partial, JSON.stringify(rq)).toBe(true);
      expect(r.state.requirements).toEqual(base().requirements);
    }
    const r = restore({ ...SPEC_EXAMPLE, rq: { n: 36.5, su: 0 } });
    expect(r.partial).toBe(false);
    expect(r.state.requirements).toMatchObject({ maxNightHours: 36.5, needSunAtLanding: false, needEarthAtLanding: true });
  });

  it('map layer and period', () => {
    for (const patch of [{ ml: 'ice' }, { mp: '2027-13' }, { mp: '2027-8' }, { mp: 'mean' }, { mp: 202708 }]) {
      const r = restore({ ...SPEC_EXAMPLE, ...patch });
      expect(r.partial, JSON.stringify(patch)).toBe(true);
      expect(r.state).toMatchObject({ mapLayer: 'both', mapPeriod: 'mp' in patch ? 'mean186' : '2027-08' });
    }
    expect(restore({ ...SPEC_EXAMPLE, ml: 'none', mp: 'mean186' }).state).toMatchObject({ mapLayer: 'none', mapPeriod: 'mean186' });
  });

  it('never throws on hostile input', () => {
    const hostile = [
      '#s=' + 'A'.repeat(10_000),
      hashOf({ v: 1, __proto__: { m: 'plan' } }),
      `#s=${toBase64Url('{"v":1,"constructor":{"prototype":{"x":1}},"sc":[{"s":"toString"}]}')}`,
      hashOf({ v: 1, sc: [{}, [], 'demo-a', { s: 'demo-a', l: Number.MAX_VALUE, d: 1e308, h: 2 }] }),
    ];
    for (const hash of hostile) {
      const r = restoreFromHash(hash, SITES)!;
      expect(r).not.toBeNull();
      expect(r.state.scenarios.length).toBeGreaterThan(0);
      expect(({} as Record<string, unknown>).x).toBeUndefined();
    }
  });
});

describe('targetHash', () => {
  const init = encodeHash(base());
  const live = (patch: Partial<AppState>) => ({ ...base(), ...patch, initialised: true });

  it('clears the fragment for the initial state and encodes any other', () => {
    expect(targetHash(live({}), '', init)).toBe('');
    expect(targetHash(live({ tab: 'timeline' }), '', init)).toBe(encodeHash(live({ tab: 'timeline' })));
  });

  it('does not touch the URL before start, in Learn, during playback or on the validation page', () => {
    expect(targetHash({ ...live({ tab: 'map' }), initialised: false }, '', init)).toBeNull();
    expect(targetHash(live({ mode: 'learn', storyStep: 0 }), '', init)).toBeNull();
    expect(targetHash(live({ playing: true }), '', init)).toBeNull();
    expect(targetHash(live({ tab: 'map' }), '#/validation', init)).toBeNull();
  });
});

describe('startUrlSync (fake browser)', () => {
  let hash = '';
  const replaceState = vi.fn((_s: unknown, _t: string, url: string) => {
    hash = url.startsWith('#') ? url : '';
  });
  const listeners = new Map<string, () => void>();

  beforeEach(() => {
    vi.useFakeTimers();
    hash = '';
    replaceState.mockClear();
    listeners.clear();
    vi.stubGlobal('location', {
      get hash() {
        return hash;
      },
      pathname: '/app/',
      search: '',
    });
    vi.stubGlobal('history', { state: null, replaceState });
    vi.stubGlobal('window', {
      addEventListener: (k: string, f: () => void) => listeners.set(k, f),
      removeEventListener: (k: string) => listeners.delete(k),
    });
    useAppStore.setState({ ...base(), initialised: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('writes at most twice per second and the last change wins', () => {
    const stop = startUrlSync(SITES, () => {});
    expect(replaceState).not.toHaveBeenCalled(); // initial state: clean URL already
    const s = useAppStore.getState();
    s.setTab('timeline');
    expect(replaceState).toHaveBeenCalledTimes(1);
    for (let k = 1; k <= 10; k++) s.setCursor(LANDING + k * 600);
    expect(replaceState).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(URL_WRITE_INTERVAL_MS - 1);
    expect(replaceState).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(replaceState).toHaveBeenCalledTimes(2);
    expect(restoreFromHash(hash, SITES)!.state.cursorUnix).toBe(LANDING + 6000);
    stop();
    expect(listeners.size).toBe(0);
  });

  it('flushUrl writes a pending change at once (Share)', () => {
    const stop = startUrlSync(SITES, () => {});
    const s = useAppStore.getState();
    s.setTab('timeline');
    s.setFocusBody('earth');
    expect(restoreFromHash(hash, SITES)!.state.focusBody).toBe('sun');
    flushUrl();
    expect(restoreFromHash(hash, SITES)!.state.focusBody).toBe('earth');
    stop();
  });

  it('pauses during playback and writes when it stops', () => {
    const stop = startUrlSync(SITES, () => {});
    const s = useAppStore.getState();
    s.setPlaying(true);
    for (let k = 1; k <= 5; k++) {
      s.setCursor(LANDING + k * 3600);
      vi.advanceTimersByTime(1000);
    }
    expect(replaceState).not.toHaveBeenCalled();
    s.setPlaying(false);
    vi.advanceTimersByTime(URL_WRITE_INTERVAL_MS);
    expect(restoreFromHash(hash, SITES)!.state.cursorUnix).toBe(LANDING + 5 * 3600);
    stop();
  });

  it('going back to the initial state clears the fragment', () => {
    const stop = startUrlSync(SITES, () => {});
    useAppStore.getState().setTab('section');
    expect(hash).not.toBe('');
    vi.advanceTimersByTime(URL_WRITE_INTERVAL_MS);
    useAppStore.getState().init(SITES.defaults);
    vi.advanceTimersByTime(URL_WRITE_INTERVAL_MS);
    expect(replaceState).toHaveBeenLastCalledWith(null, '', '/app/');
    stop();
  });

  it('a link pasted into the same tab is restored and reports a partial restore', () => {
    const onRestored = vi.fn();
    const stop = startUrlSync(SITES, onRestored);
    hash = hashOf({ ...SPEC_EXAMPLE, ml: 'ice' });
    listeners.get('hashchange')!();
    expect(onRestored).toHaveBeenCalledWith(true);
    expect(useAppStore.getState()).toMatchObject({ mode: 'plan', cursorUnix: CURSOR });
    // The page rewrites the link with what it could restore.
    vi.advanceTimersByTime(URL_WRITE_INTERVAL_MS);
    expect(restoreFromHash(hash, SITES)!.partial).toBe(false);
    stop();
  });
});
