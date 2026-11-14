// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-62: full-width 2D view helpers (15_interfaz_v2.md §4.2, §4.3, §7.5).
import { describe, expect, it } from 'vitest';
import { project } from '../panorama/geometry';
import { earthPhase, HORIZON_AT, horizonFracFor, oklabRamp, oklabToRgb, phasePath, placeLabels, rgbToOklab, stageView } from './horizon2d';

const flat = (deg: number) => new Float64Array(720).fill(deg);

describe('stage view', () => {
  it('40° across the width, the same scale on both axes, horizon at HORIZON_AT of the height', () => {
    const { view, arrow } = stageView(1440, 900, flat(1.2), { azDeg: 100, elDeg: 0.5 }, null);
    expect(arrow).toBeNull();
    expect(view.widthDeg).toBe(40);
    expect(view.heightDeg).toBeCloseTo(25, 6);
    expect(view.w / view.widthDeg).toBeCloseTo(view.h / view.heightDeg, 9);
    expect(project(view, 100, 1.2).y).toBeCloseTo(HORIZON_AT * 900, 6);
  });
  it('the horizon stays above a tall bottom strip, between 30 % and HORIZON_AT', () => {
    expect(horizonFracFor(900, 380)).toBe(HORIZON_AT);
    expect(horizonFracFor(720, 394)).toBeCloseTo((720 - 394 - 24) / 720, 9);
    expect(horizonFracFor(500, 450)).toBe(0.3);
    const { view } = stageView(1280, 720, flat(0), { azDeg: 0, elDeg: 0.2 }, null, horizonFracFor(720, 394));
    expect(project(view, 0, 0).y).toBeCloseTo(720 - 394 - 24, 6);
  });

  it('a body far from the horizon is centred, with the arrow (10 §6.1)', () => {
    const { view, arrow } = stageView(1440, 900, flat(0), { azDeg: 30, elDeg: 20 }, null);
    expect(arrow).toEqual({ dir: 'below', deg: 20 });
    expect(project(view, 30, 20).y).toBeCloseTo(450, 6);
  });
});

describe('Earth phase seen from the site', () => {
  it('Sun and Earth in the same direction: new Earth; opposite: full Earth; 90° apart: half', () => {
    expect(earthPhase({ azDeg: 10, elDeg: 0 }, { azDeg: 10, elDeg: 0 }).lit).toBeCloseTo(0, 9);
    expect(earthPhase({ azDeg: 190, elDeg: 0 }, { azDeg: 10, elDeg: 0 }).lit).toBeCloseTo(1, 9);
    expect(earthPhase({ azDeg: 100, elDeg: 0 }, { azDeg: 10, elDeg: 0 }).lit).toBeCloseTo(0.5, 9);
  });
  it('the lit limb faces the Sun on screen: to the right when the Sun is to the right', () => {
    const right = earthPhase({ azDeg: 60, elDeg: 0 }, { azDeg: 10, elDeg: 0 });
    expect(Math.cos(right.towardSunRad)).toBeGreaterThan(0.99);
    const left = earthPhase({ azDeg: 320, elDeg: 0 }, { azDeg: 10, elDeg: 0 });
    expect(Math.cos(left.towardSunRad)).toBeLessThan(-0.99);
    const above = earthPhase({ azDeg: 10, elDeg: 30 }, { azDeg: 10, elDeg: 0 });
    expect(Math.sin(above.towardSunRad)).toBeLessThan(-0.99); // up on screen
  });
  it('phase path: empty when new, a closed path otherwise', () => {
    expect(phasePath(0, 0, 16, 0, 0)).toBe('');
    expect(phasePath(0, 0, 16, 1, 0)).toMatch(/^M.*Z$/);
    expect(phasePath(0, 0, 16, 0.3, 0)).toMatch(/^M.*A.*A.*Z$/);
  });
});

describe('labels without overlaps', () => {
  it('moves the second label below the first when they collide; leaves separate ones alone', () => {
    const [a, b, c] = placeLabels([
      { id: 'sun', x: 100, y: 100, w: 200, h: 34 },
      { id: 'ridge', x: 150, y: 110, w: 120, h: 18 },
      { id: 'earth', x: 600, y: 100, w: 140, h: 34 },
    ]);
    expect(a.y).toBe(100);
    expect(b.y).toBeGreaterThanOrEqual(a.y + a.h);
    expect(c.y).toBe(100);
  });
});

describe('OKLab map ramps', () => {
  it('round trip and end points', () => {
    for (const c of [[0x16, 0x20, 0x32], [0xf5, 0x9e, 0x0b], [0x38, 0xbd, 0xf8]] as [number, number, number][]) {
      expect(oklabToRgb(rgbToOklab(c))).toEqual(c);
    }
    expect(oklabRamp([0x16, 0x20, 0x32], [0xf5, 0x9e, 0x0b], 0)).toEqual([0x16, 0x20, 0x32]);
    expect(oklabRamp([0x16, 0x20, 0x32], [0xf5, 0x9e, 0x0b], 10)).toEqual([0xf5, 0x9e, 0x0b]);
  });
  it('lightness grows with every step', () => {
    let last = -1;
    for (let s = 0; s <= 10; s++) {
      const L = rgbToOklab(oklabRamp([0x16, 0x20, 0x32], [0x38, 0xbd, 0xf8], s))[0];
      expect(L).toBeGreaterThan(last);
      last = L;
    }
  });
});
