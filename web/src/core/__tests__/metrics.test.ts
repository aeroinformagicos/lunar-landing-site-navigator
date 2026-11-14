// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-13: mission metrics (07 §7), edge cases (§10), invariants (§13.8) and budgets (§11).
import { describe, expect, it } from 'vitest';
import { formulaMask, maskFromFile, smoothMask, type Mask } from '../horizon';
import { curves, missionMetrics, NEXT_EVENT_HORIZON_S, terrainEffect, type Metrics } from '../metrics';
import { DAY_S, isoToUnix } from '../time';
import type { HorizonFile } from '../types';
import { frameFor } from '../visibility';
import type { Window } from '../events';
import { bestTimeMs, exampleJson, exampleTable } from './fixtures';

const table = exampleTable();
const LANDING = isoToUnix('2027-08-01T00:00:00Z');
const demoA = maskFromFile(exampleJson<HorizonFile>('horizon/demo-a.json'), 2)!;
const DEMO_A = { lat: -88.8, lon: 123.4 };

function run(mask: Mask, landingUnix = LANDING, missionDays = 14, cursor = landingUnix, site = DEMO_A): Metrics {
  return missionMetrics(table, frameFor(site.lat, site.lon, mask), mask, { landingUnix, missionDays }, cursor);
}

function sortedDisjoint(ws: Window[]) {
  for (let i = 0; i < ws.length; i++) {
    expect(ws[i].startUnix).toBeLessThan(ws[i].endUnix);
    if (i > 0) expect(ws[i].startUnix).toBeGreaterThanOrEqual(ws[i - 1].endUnix);
  }
}

describe('missionMetrics', () => {
  it('Sun always up: no events, open window, no night (07 §10)', () => {
    const m = run(formulaMask('flat:-90'));
    expect(m.sunHours).toBe(14 * 24);
    expect(m.sunPct).toBe(100);
    expect(m.longestNightH).toBe(0);
    expect(m.windows.sun).toEqual([{ startUnix: m.tA, endUnix: m.tB, openStart: true, openEnd: true }]);
    expect(m.nextSunEvent).toEqual({ kind: 'sunset', tUnix: null });
  });

  it('Sun never up: zero hours, the whole mission is night', () => {
    const m = run(formulaMask('flat:90'), LANDING, 3.5);
    expect(m.sunHours).toBe(0);
    expect(m.earthHours).toBe(0);
    expect(m.longestNightH).toBe(3.5 * 24);
    expect(m.longestLinkGapH).toBe(3.5 * 24);
    expect(m.nextEarthEvent).toEqual({ kind: 'earthrise', tUnix: null });
  });

  it('invariants on demo-a and smooth masks (07 §13.8)', () => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 20; i++) {
      const landing = isoToUnix('2024-02-01T00:00:00Z') + Math.floor(rnd() * 20 * 365) * DAY_S;
      const days = 0.5 + Math.floor(rnd() * 120) / 2;
      for (const mask of [demoA, smoothMask(2)]) {
        const m = run(mask, landing, days);
        const nightH = m.windows.nights.reduce((s, w) => s + (w.endUnix - w.startUnix), 0) / 3600;
        expect(Math.abs(m.sunHours + nightH - days * 24)).toBeLessThan(0.001);
        for (const ws of Object.values(m.windows)) sortedDisjoint(ws);
        expect(m.bothHours).toBeLessThanOrEqual(Math.min(m.sunHours, m.earthHours) + 1e-9);
        expect(m.sunElMinDeg).toBeLessThanOrEqual(m.sunElMaxDeg);
        expect(m.events.map((e) => e.tUnix)).toEqual([...m.events.map((e) => e.tUnix)].sort((a, b) => a - b));
      }
    }
  });

  it('a higher observer never loses Sun or Earth (10 m vs 2 m, smooth Moon)', () => {
    for (const landing of [LANDING, LANDING + 9 * DAY_S, LANDING + 200 * DAY_S]) {
      const m2 = run(smoothMask(2), landing);
      const m10 = run(smoothMask(10), landing);
      expect(m10.sunHours).toBeGreaterThanOrEqual(m2.sunHours - 0.02);
      expect(m10.earthHours).toBeGreaterThanOrEqual(m2.earthHours - 0.02);
    }
  });

  it('next events follow the state at the cursor and lie within 60 days', () => {
    const m = run(demoA, LANDING, 14, LANDING + 3 * DAY_S);
    const now = m.now!;
    expect(m.nextSunEvent!.kind).toBe(now.sun.visible ? 'sunset' : 'sunrise');
    expect(m.nextEarthEvent!.kind).toBe(now.earth.visible ? 'earthset' : 'earthrise');
    for (const e of [m.nextSunEvent!, m.nextEarthEvent!]) {
      if (e.tUnix !== null) {
        expect(e.tUnix).toBeGreaterThan(LANDING + 3 * DAY_S);
        expect(e.tUnix).toBeLessThanOrEqual(LANDING + 3 * DAY_S + NEXT_EVENT_HORIZON_S);
      }
    }
  });

  it('truncates a mission that runs past the end of the table', () => {
    const m = run(demoA, isoToUnix('2044-12-25T00:00:00Z'), 14);
    expect(m.truncated).toBe(true);
    expect(m.tB).toBe(isoToUnix('2045-01-01T00:00:00Z'));
    expect(run(demoA).truncated).toBe(false);
  });

  it('a landing outside the table is a RangeError', () => {
    expect(() => run(demoA, isoToUnix('1990-01-01T00:00:00Z'))).toThrow(RangeError);
  });

  it('terrain effect: real − smooth', () => {
    const real = run(demoA);
    const smooth = run(smoothMask(2));
    const fx = terrainEffect(real, smooth);
    expect(fx.dSunHours).toBeCloseTo(real.sunHours - smooth.sunHours, 12);
    expect(fx.dSunHours).toBeLessThanOrEqual(0.02); // a terrain mask above the smooth dip can only remove Sun
  });

  it('curves on the 10-min grid with NaN outside the table', () => {
    const c = curves(table, frameFor(DEMO_A.lat, DEMO_A.lon, demoA), demoA, LANDING, LANDING + DAY_S);
    expect(c.t).toHaveLength(145);
    expect(c.t[144]).toBe(LANDING + DAY_S);
    const out = curves(table, frameFor(0, 0, demoA), demoA, isoToUnix('2044-12-31T23:00:00Z'), isoToUnix('2045-01-01T02:00:00Z'));
    expect(Number.isNaN(out.sunElDeg[out.t.length - 1])).toBe(true);
  });
});

describe('budgets (07 §11)', () => {
  it('metrics of a 14-day mission in under 10 ms', () => {
    for (let i = 0; i < 5; i++) run(demoA, LANDING + i * DAY_S); // warm-up
    const n = 10;
    const ms = bestTimeMs(() => {
      for (let i = 0; i < n; i++) run(demoA, LANDING + i * 7 * DAY_S);
    });
    expect(ms / n).toBeLessThan(10);
  });
});
