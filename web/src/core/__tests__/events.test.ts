// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-13: crossings, windows and events (07 §6), smooth-Moon events against Horizons (§13.3).
import { describe, expect, it } from 'vitest';
import {
  complementWindows,
  findCrossings,
  findEvents,
  intersectWindows,
  longestHours,
  windowHours,
  windowsFrom,
  type Window,
} from '../events';
import { formulaMask, smoothMask } from '../horizon';
import { siteFrame } from '../frames';
import { isoToUnix, unixToIso } from '../time';
import { realTable } from './fixtures';

const w = (startUnix: number, endUnix: number, openStart = false, openEnd = false): Window => ({
  startUnix,
  endUnix,
  openStart,
  openEnd,
});

describe('findCrossings', () => {
  it('finds sign changes to the second, with their direction', () => {
    // Positive on (1000.4, 5000.6): rises at 1000.4, sets at 5000.6.
    const f = (t: number) => (t - 1000.4) * (5000.6 - t);
    const { crossings, initialState } = findCrossings(f, 0, 10_000);
    expect(initialState).toBe(false);
    expect(crossings).toHaveLength(2);
    expect(crossings[0].rising).toBe(true);
    expect(Math.abs(crossings[0].t - 1000.4)).toBeLessThanOrEqual(1);
    expect(crossings[1].rising).toBe(false);
    expect(Math.abs(crossings[1].t - 5000.6)).toBeLessThanOrEqual(1);
    expect(Number.isInteger(crossings[1].t)).toBe(true);
  });

  it('margin exactly 0 does not count as visible', () => {
    const { initialState } = findCrossings(() => 0, 0, 100);
    expect(initialState).toBe(false);
  });

  it('ignores windows shorter than the 10-min step (on purpose)', () => {
    const f = (t: number) => (t > 700 && t < 1000 ? 1 : -1);
    expect(findCrossings(f, 0, 3000).crossings).toHaveLength(0);
  });

  it('stops at the first crossing when asked', () => {
    const f = (t: number) => Math.sin(t / 1000);
    expect(findCrossings(f, 1, 20_000, 600, true).crossings).toHaveLength(1);
  });
});

describe('windows (07 §6.3)', () => {
  it('builds windows with open ends', () => {
    const ws = windowsFrom(
      [
        { t: 100, rising: false },
        { t: 300, rising: true },
        { t: 500, rising: false },
        { t: 700, rising: true },
      ],
      true,
      0,
      1000,
    );
    expect(ws).toEqual([w(0, 100, true), w(300, 500), w(700, 1000, false, true)]);
  });

  it('no crossings: all or nothing', () => {
    expect(windowsFrom([], true, 0, 10)).toEqual([w(0, 10, true, true)]);
    expect(windowsFrom([], false, 0, 10)).toEqual([]);
  });

  it('intersection and complement', () => {
    const sun = [w(0, 100, true), w(300, 500), w(700, 1000, false, true)];
    const earth = [w(50, 400), w(450, 1000, false, true)];
    expect(intersectWindows(sun, earth)).toEqual([w(50, 100), w(300, 400), w(450, 500), w(700, 1000, false, true)]);
    expect(complementWindows(sun, 0, 1000)).toEqual([w(100, 300), w(500, 700)]);
    expect(complementWindows([], 0, 1000)).toEqual([w(0, 1000, true, true)]);
    expect(windowHours([w(0, 3600), w(7200, 9000)])).toBe(1.5);
    expect(longestHours(complementWindows(sun, 0, 1000))).toBeCloseTo(200 / 3600, 12);
  });
});

// ---- 07 §13.3: smooth Moon, observer at 0 m, against Horizons. Needs the real table (T-06). ----

const REAL = realTable();

describe.skipIf(!REAL)('smooth-Moon events against Horizons (07 §13.3)', () => {
  const flat0 = formulaMask('flat:0');
  const firstOf = (lat: number, lon: number, hObs: number, kind: string, from: string, to: string) => {
    const mask = hObs === 0 ? flat0 : smoothMask(hObs);
    const ev = findEvents(REAL!, siteFrame(lat, lon, hObs), mask, isoToUnix(from), isoToUnix(to));
    return ev.find((e) => e.kind === kind)!.tUnix;
  };

  it('Blue Ghost 1 sunset on 2025-03-16 at 20:10:39 UTC ± 10 s', () => {
    const t = firstOf(18.56, 61.81, 0, 'sunset', '2025-03-16T12:00:00Z', '2025-03-17T06:00:00Z');
    expect(Math.abs(t - isoToUnix('2025-03-16T20:10:39Z')), unixToIso(t)).toBeLessThanOrEqual(10);
  });

  it('IM-2 site sunrise on 2025-03-04 at 09:14:10 UTC ± 20 s', () => {
    const t = firstOf(-84.78, 29.13, 0, 'sunrise', '2025-03-04T00:00:00Z', '2025-03-05T00:00:00Z');
    expect(Math.abs(t - isoToUnix('2025-03-04T09:14:10Z')), unixToIso(t)).toBeLessThanOrEqual(20);
  });

  it('Blue Ghost 1 sunset with the observer at 2 m: 20:21:31 UTC ± 15 s', () => {
    const t = firstOf(18.56, 61.81, 2, 'sunset', '2025-03-16T12:00:00Z', '2025-03-17T06:00:00Z');
    expect(Math.abs(t - isoToUnix('2025-03-16T20:21:31Z')), unixToIso(t)).toBeLessThanOrEqual(15);
  });
});
