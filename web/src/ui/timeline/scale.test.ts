// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-16: timeline geometry (10_interfaz.md §6.2): the dragged cursor equals the slider, bars coincide
// with the events, day ticks, elevation domain; countdowns (F6) and the requirement chip (F7).
import { describe, expect, it } from 'vitest';
import { exampleJson, exampleTable } from '../../core/__tests__/fixtures';
import { formulaMask, maskFromFile } from '../../core/horizon';
import type { Curves } from '../../core/metrics';
import { DAY_S, isoToUnix } from '../../core/time';
import type { HorizonFile } from '../../core/types';
import { frameFor } from '../../core/visibility';
import { SLIDER_STEP_S } from '../../state/selectors';
import { DEFAULT_REQUIREMENTS, type Scenario } from '../../state/store';
import { countdownText, cursorState, requirementChecks } from '../metrics/derive';
import { computeMission } from '../metrics/useMission';
import type { ScenarioModel } from '../common/model';
import { barSegments, cursorFromX, dayTicks, displayRange, elevationDomain, eventLabel, timeScale } from './scale';

const LANDING = isoToUnix('2027-08-01T00:00:00Z');
const table = exampleTable();
const demoA = maskFromFile(exampleJson<HorizonFile>('horizon/demo-a.json'), 2)!;

function model(mask = demoA): ScenarioModel {
  return { table, mask, frame: frameFor(-88.8, 123.4, mask), site: undefined, latDeg: -88.8, lonDeg: 123.4, reliefLabel: 'x', smooth: false };
}
const scenario: Scenario = { id: 'A', siteRef: 'demo-a', landingUnix: LANDING, missionDays: 14, observerHeightM: 2 };

describe('time axis', () => {
  it('shows the mission with 10 % on each side', () => {
    expect(displayRange(LANDING, 10)).toEqual({ t0: LANDING - DAY_S, t1: LANDING + 11 * DAY_S });
  });

  it('dragging the cursor gives the same values as the slider (10-min grid, clamped)', () => {
    const s = timeScale(LANDING - 1.4 * DAY_S, LANDING + 15.4 * DAY_S, 44, 900);
    const end = LANDING + 14 * DAY_S;
    for (let px = 44; px <= 900; px += 7.3) {
      const c = cursorFromX(px, s, LANDING, end);
      expect((c - LANDING) % SLIDER_STEP_S).toBe(0);
      expect(c).toBeGreaterThanOrEqual(LANDING);
      expect(c).toBeLessThanOrEqual(end);
      if (s.t(px) > LANDING && s.t(px) < end) expect(Math.abs(c - s.t(px))).toBeLessThanOrEqual(SLIDER_STEP_S / 2);
    }
    expect(cursorFromX(s.x(LANDING + 3 * DAY_S + 299), s, LANDING, end)).toBe(LANDING + 3 * DAY_S);
  });

  it('day ticks and elevation domain', () => {
    const ticks = dayTicks(LANDING, LANDING - 1.4 * DAY_S, LANDING + 15.4 * DAY_S);
    expect(ticks[0]).toMatchObject({ day: -1, date: '2027-07-31' });
    expect(ticks.at(-1)).toMatchObject({ day: 15, date: '2027-08-16' });
    const nan = new Float64Array([Number.NaN, Number.NaN]);
    const c: Curves = { t: new Float64Array(2), sunElDeg: new Float64Array([2, 5]), earthElDeg: new Float64Array([1, 3]), sunHorizonDeg: nan, earthHorizonDeg: nan };
    const d = elevationDomain(c);
    expect(d.min).toBeLessThan(0); // 0° always inside
    expect(d.max).toBeGreaterThan(5);
  });
});

describe('bars coincide with the events (F5)', () => {
  const m = computeMission(model(), scenario);
  const scale = timeScale(m.range.t0, m.range.t1, 0, 1000);

  it('every closed window edge is an event of the same body', () => {
    const times = (kinds: string[]) => m.metrics.events.filter((e) => kinds.includes(e.kind)).map((e) => e.tUnix);
    for (const [ws, kinds] of [
      [m.metrics.windows.sun, ['sunrise', 'sunset']],
      [m.metrics.windows.earth, ['earthrise', 'earthset']],
    ] as const) {
      const ev = times([...kinds]);
      for (const w of ws) {
        if (!w.openStart) expect(ev).toContain(w.startUnix);
        if (!w.openEnd) expect(ev).toContain(w.endUnix);
      }
    }
    expect(m.metrics.events.length).toBeGreaterThan(0);
  });

  it('bar rectangles start and end at the event x positions', () => {
    const segs = barSegments(m.metrics.windows.sun, scale);
    m.metrics.windows.sun.forEach((w, i) => {
      expect(segs[i].x).toBeCloseTo(scale.x(w.startUnix), 9);
      expect(segs[i].x + segs[i].w).toBeCloseTo(scale.x(w.endUnix), 9);
    });
  });

  it('event markers are labelled `Sunset, 2027-08-09 03:12 UTC`', () => {
    expect(eventLabel({ kind: 'sunset', tUnix: isoToUnix('2027-08-09T03:12:00Z') })).toBe('Sunset, 2027-08-09 03:12 UTC');
  });
});

describe('countdowns (F6) and requirement chip (F7)', () => {
  it('the countdown points at the next event of the timeline, to the minute', () => {
    const m = computeMission(model(), scenario);
    for (const cursor of [LANDING, LANDING + 2 * DAY_S + 3600, LANDING + 7 * DAY_S]) {
      const st = cursorState(table, model().frame, demoA, cursor)!;
      const next = m.metrics.events.find((e) => e.tUnix > cursor && (e.kind === 'sunrise' || e.kind === 'sunset'));
      if (next && st.nextSun?.tUnix !== null) {
        expect(st.nextSun!.kind).toBe(next.kind);
        expect(Math.abs(st.nextSun!.tUnix! - next.tUnix)).toBeLessThanOrEqual(60);
      }
      expect(st.nextSun!.kind).toBe(st.sky.sun.visible ? 'sunset' : 'sunrise');
    }
  });

  it('texts: `Sunset in 4d 12h 52m`, under an hour `MMm SSs`, and `No … in the next 60 days`', () => {
    expect(countdownText({ kind: 'sunset', tUnix: LANDING + 4 * DAY_S + 12 * 3600 + 52 * 60 }, LANDING)).toBe('Sunset in 4d 12h 52m');
    expect(countdownText({ kind: 'earthrise', tUnix: LANDING + 125 }, LANDING)).toBe('Earthrise in 02m 05s');
    expect(countdownText({ kind: 'sunset', tUnix: null }, LANDING)).toBe('No sunset in the next 60 days');
    expect(countdownText({ kind: 'earthset', tUnix: null }, LANDING)).toBe('No earthset in the next 60 days');
    const always = model(formulaMask('flat:-90'));
    expect(cursorState(table, always.frame, always.mask, LANDING)!.nextSun).toEqual({ kind: 'sunset', tUnix: null });
  });

  it('basic chip: Sun and Earth at landing, longest night against the limit', () => {
    const up = computeMission(model(formulaMask('flat:-90')), scenario);
    expect(requirementChecks(up.landing, up.metrics, DEFAULT_REQUIREMENTS)).toEqual([
      { key: 'sun', ok: true },
      { key: 'earth', ok: true },
      { key: 'night', ok: true },
    ]);
    const down = computeMission(model(formulaMask('flat:90')), scenario);
    expect(requirementChecks(down.landing, down.metrics, { ...DEFAULT_REQUIREMENTS, needEarthAtLanding: false })).toEqual([
      { key: 'sun', ok: false },
      { key: 'night', ok: false },
    ]);
  });

  it('a landing outside the table makes the mission fail with RangeError', () => {
    expect(() => computeMission(model(), { ...scenario, landingUnix: isoToUnix('1990-01-01T00:00:00Z') })).toThrow(RangeError);
  });
});
