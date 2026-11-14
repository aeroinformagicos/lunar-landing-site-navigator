// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-15: drawing geometry of the panorama (a disc centred on the horizon is cut in half), view centring,
// projection, grid, 360° strip, and the F4 texts (10_interfaz.md §6.1).
import { describe, expect, it } from 'vitest';
import { exampleTable } from '../../core/__tests__/fixtures';
import { formulaMask, smoothMask, type Mask } from '../../core/horizon';
import { missionMetrics, terrainEffect } from '../../core/metrics';
import { DAY_S, isoToUnix } from '../../core/time';
import { frameFor } from '../../core/visibility';
import {
  azDelta,
  azLabel,
  discOf,
  drawnVisibleShare,
  gridLines,
  horizonLine,
  horizonYAt,
  project,
  pxPerDeg,
  stripAzAt,
  stripBracket,
  unproject,
  viewCentre,
  type View,
} from './geometry';
import { bodyTrace, pointerReadout, ridgeLabel, shiftText, signedHours, terrainEffectLines } from './texts';

const view = (az: number, el: number, w = 640): View => ({ az, el, widthDeg: 40, heightDeg: 20, w, h: w / 2 });

describe('drawing geometry', () => {
  const flat0 = formulaMask('flat:0');
  const v = view(90, 0);
  const hy = horizonYAt(v, flat0.elDeg);

  it('a disc centred on the horizon is cut in half', () => {
    const d = discOf(v, { azDeg: 90, elDeg: 0, radiusDeg: 1 });
    expect(drawnVisibleShare(d, hy)).toBeCloseTo(0.5, 2);
    // Also with the real solar radius and off the view centre.
    expect(drawnVisibleShare(discOf(v, { azDeg: 101.3, elDeg: 0, radiusDeg: 0.267 }), hy)).toBeCloseTo(0.5, 2);
  });

  it('a disc above the horizon is whole, below it is hidden', () => {
    expect(drawnVisibleShare(discOf(v, { azDeg: 90, elDeg: 2, radiusDeg: 1 }), hy)).toBe(1);
    expect(drawnVisibleShare(discOf(v, { azDeg: 90, elDeg: -2, radiusDeg: 1 }), hy)).toBe(0);
  });

  it('the drawn disc follows a sloping horizon too', () => {
    const tilt = formulaMask('tilt:0.3');
    const vt = view(180, 0);
    expect(drawnVisibleShare(discOf(vt, { azDeg: 180, elDeg: 0, radiusDeg: 0.95 }), horizonYAt(vt, tilt.elDeg))).toBeCloseTo(0.5, 2);
  });

  it('same scale on both axes; projection round trip; real disc size', () => {
    expect(pxPerDeg(v)).toBe(16);
    expect(v.h / v.heightDeg).toBe(16);
    const p = project(v, 101.5, 3.25);
    expect(unproject(v, p.x, p.y).az).toBeCloseTo(101.5, 9);
    expect(unproject(v, p.x, p.y).el).toBeCloseTo(3.25, 9);
    expect(discOf(v, { azDeg: 90, elDeg: 0, radiusDeg: 0.267 }).r).toBeCloseTo(4.272, 3);
  });

  it('azimuths wrap around north', () => {
    expect(azDelta(359, 1)).toBe(-2);
    expect(azDelta(1, 359)).toBe(2);
    const vn = view(5, 0);
    const line = horizonLine(vn, formulaMask('sine:1,3').elDeg);
    for (let i = 1; i < line.length; i++) expect(line[i].x).toBeGreaterThan(line[i - 1].x);
    expect(line[0].x).toBe(0);
    expect(line.at(-1)!.x).toBe(vn.w);
  });

  it('grid every 5° with compass labels', () => {
    const g = gridLines(view(270, 0), 5);
    expect(g.az.map((a) => a.label)).toContain('270° W');
    expect(g.az.map((a) => a.label)).toContain('255°');
    expect(g.el.map((e) => e.label)).toEqual(['−10°', '−5°', '0°', '5°', '10°']);
    expect(azLabel(0)).toBe('0° N');
    expect(azLabel(360)).toBe('0° N');
  });
});

describe('view centre (§6.1)', () => {
  const m = formulaMask('flat:0.5');

  it('centres on the horizon at the body azimuth', () => {
    expect(viewCentre(m.elDeg, { azDeg: 120, elDeg: 3 }, null)).toEqual({ az: 120, el: 0.5, arrow: null });
  });

  it('beyond 8° it centres on the body and points at the horizon', () => {
    expect(viewCentre(m.elDeg, { azDeg: 120, elDeg: 25.5 }, null)).toEqual({ az: 120, el: 25.5, arrow: { dir: 'below', deg: 25 } });
    expect(viewCentre(m.elDeg, { azDeg: 120, elDeg: -12 }, null).arrow).toEqual({ dir: 'above', deg: 13 });
  });

  it('a panned view stays on the horizon of the chosen azimuth', () => {
    expect(viewCentre(m.elDeg, { azDeg: 120, elDeg: 25 }, 200)).toEqual({ az: 200, el: 0.5, arrow: null });
  });
});

describe('360° strip', () => {
  it('bracket of the 40° window, split across north', () => {
    expect(stripBracket(720, 180)).toEqual([{ x: 320, w: 80 }]);
    expect(stripBracket(720, 5)).toEqual([
      { x: 690, w: 30 },
      { x: 0, w: 50 },
    ]);
    expect(stripAzAt(720, 540)).toBe(270);
    expect(stripAzAt(720, 900)).toBe(0);
  });
});

describe('texts (F3, F4)', () => {
  it('signed hours and event shifts', () => {
    expect(signedHours(-2.13)).toBe('−2.1 h');
    expect(signedHours(0.01)).toBe('0 h');
    expect(signedHours(1.25)).toBe('+1.3 h');
    expect(shiftText(-(2 * 3600 + 5 * 60))).toBe('2 h 05 min earlier');
    expect(shiftText(12 * 60)).toBe('12 min later');
    expect(shiftText(20)).toBe('no change');
  });

  it('ridge label and pointer readout', () => {
    expect(ridgeLabel(41_230)).toBe('Ridge 41 km away');
    expect(ridgeLabel(812)).toBe('Ridge 810 m away');
    expect(ridgeLabel(Number.NaN)).toBeNull();
    expect(pointerReadout(271.54, 0.921, 0.88)).toBe('Az 271.5° · El 0.92° · Horizon 0.88°');
  });

  it('first-event line for every combination', () => {
    const fx = { dSunHours: -1, dEarthHours: 0, firstSunEventShiftS: -600 };
    expect(terrainEffectLines(fx, 'sunset', 'sunset').firstEvent).toBe('Sunset: 10 min earlier');
    expect(terrainEffectLines({ ...fx, firstSunEventShiftS: null }, 'sunrise', null).firstEvent).toBe('Sunrise: only with terrain');
    expect(terrainEffectLines({ ...fx, firstSunEventShiftS: null }, null, 'sunset').firstEvent).toBe('Sunset: only on a smooth Moon');
    expect(terrainEffectLines({ ...fx, firstSunEventShiftS: null }, null, null).firstEvent).toBe('Sunset: no change');
    expect(terrainEffectLines(fx, 'sunset', 'sunset').sunlight).toBe('Sunlight: −1.0 h');
    expect(terrainEffectLines(fx, 'sunset', 'sunset').earthLink).toBe('Earth link: 0 h');
  });

  it('terrain above the smooth horizon makes the sunset earlier (F4, on the example table)', () => {
    const table = exampleTable();
    const real: Mask = formulaMask('flat:0.5');
    const smooth = smoothMask(0);
    const frame = frameFor(-85, 30, smooth);
    let checked = 0;
    for (let d = 0; d < 60 && checked < 3; d += 2) {
      const mission = { landingUnix: isoToUnix('2027-08-01T00:00:00Z') + d * DAY_S, missionDays: 14 };
      const r = missionMetrics(table, frame, real, mission, mission.landingUnix);
      const s = missionMetrics(table, frame, smooth, mission, mission.landingUnix);
      const rk = r.events.find((e) => e.kind === 'sunset' || e.kind === 'sunrise');
      const sk = s.events.find((e) => e.kind === 'sunset' || e.kind === 'sunrise');
      if (rk?.kind !== 'sunset' || sk?.kind !== 'sunset') continue;
      const fx = terrainEffect(r, s);
      expect(fx.firstSunEventShiftS!).toBeLessThan(0);
      expect(fx.dSunHours).toBeLessThanOrEqual(0);
      expect(terrainEffectLines(fx, 'sunset', 'sunset').firstEvent).toMatch(/earlier$/);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('trace: hourly points with a mark every 24 h', () => {
    const table = exampleTable();
    const t0 = isoToUnix('2027-08-01T00:00:00Z');
    const tr = bodyTrace(table, frameFor(-85, 30, smoothMask(2)), 'sun', t0, t0 + 2 * DAY_S);
    expect(tr).toHaveLength(49);
    expect(tr.filter((p) => p.daily).map((p) => p.t)).toEqual([t0, t0 + DAY_S, t0 + 2 * DAY_S]);
  });
});
