// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-13: sampling law, horizon interpolation, smooth mask and cross-section coordinates.
import { describe, expect, it } from 'vitest';
import { N_AZ } from '../constants';
import {
  blockerAt,
  formulaMask,
  horizonAt,
  localXY,
  makeMask,
  maskFromFile,
  pointAt,
  smoothHorizon,
  smoothMask,
  wrap180,
} from '../horizon';
import { lawDistance, lawNSamples, profileBinDistance } from '../law';
import type { HorizonFile } from '../types';
import { exampleJson } from './fixtures';

/** pipeline/horizon/law.py law_distance, printed by Python (repr) for these indices. */
const PY_LAW: Record<'full' | 'fast', [number, number][]> = {
  full: [
    [0, 20.0], [1, 40.0], [2, 60.0], [499, 10000.0], [500, 10020.0], [501, 10040.0], [998, 19980.0],
    [999, 20000.0], [1000, 20019.999999999996], [1001, 20040.019999999993], [1200, 24450.039721083635],
    [1500, 32999.154516587216], [1853, 46960.440603674964], [1854, 47007.40104427863],
    [2000, 54392.81712335657], [2500, 89656.19264965609], [3000, 147781.14658416147],
    [3500, 243589.05548297553], [3707, 299579.30551544594], [3708, 299878.8848209614],
  ],
  fast: [
    [0, 40.0], [1, 80.0], [2, 120.0], [499, 20000.0], [500, 20040.0], [501, 20080.079999999998],
    [998, 54202.96448406644], [999, 54311.370413034565], [1000, 54419.99315386064],
    [1001, 54528.83314016835], [1200, 81152.66550699818], [1500, 147781.22030270653],
    [1853, 299174.7583725251], [1854, 299773.1078892702],
  ],
};

describe('law_distance (06 §3)', () => {
  it('equals Python at 20 + 14 indices', () => {
    for (const law of ['full', 'fast'] as const) {
      for (const [i, d] of PY_LAW[law]) expect(lawDistance(law, i), `${law}[${i}]`).toBe(d);
    }
  });

  it('has N_S = 3709 / 1855 and rejects other indices', () => {
    expect(lawNSamples('full')).toBe(3709);
    expect(lawNSamples('fast')).toBe(1855);
    expect(() => lawDistance('full', 3709)).toThrow(RangeError);
    expect(() => lawDistance('fast', -1)).toThrow(RangeError);
    expect(() => lawDistance('full', 1.5)).toThrow(RangeError);
  });

  it('profile bins: first bin is 140–160 m away, last near 300 km', () => {
    expect(profileBinDistance('full', 0)).toBe(lawDistance('full', 3));
    expect(profileBinDistance('full', 511)).toBeGreaterThan(297_000);
  });
});

describe('horizon_at (07 §13.1)', () => {
  const el = Float64Array.from({ length: N_AZ }, (_, j) => j);

  it('interpolates linearly and periodically', () => {
    expect(horizonAt(el, 0.25)).toBe(0.5);
    expect(horizonAt(el, 359.75)).toBe(359.5);
    expect(horizonAt(el, 360)).toBe(0);
    expect(horizonAt(el, 0)).toBe(0);
    expect(horizonAt(el, -0.5)).toBe(719);
    expect(horizonAt(el, 720.5)).toBe(1);
  });

  it('blocker_at takes the nearest sample', () => {
    const m = makeMask(2, 0, { elDeg: el, distM: el, blkLatDeg: el, blkLonDeg: el, blkHeightM: el });
    expect(blockerAt(m, 0.24)).toMatchObject({ azDeg: 0, elDeg: 0 });
    expect(blockerAt(m, 0.25)).toMatchObject({ azDeg: 0.5, elDeg: 1, distM: 1, latDeg: 1, lonDeg: 1, heightM: 1 });
    expect(blockerAt(m, 359.8)).toMatchObject({ azDeg: 0, elDeg: 0 });
    expect(m.minElDeg).toBe(0);
    expect(m.maxElDeg).toBe(719);
  });
});

describe('smooth Moon (06 §9)', () => {
  it('dip is 0 at 0 m and −0.0869° / 2,636 m at 2 m, like Python', () => {
    expect(smoothHorizon(0)).toEqual({ elDeg: 0, distM: 0 });
    expect(Object.is(smoothHorizon(0).elDeg, -0)).toBe(false);
    const h = smoothHorizon(2);
    expect(h.elDeg).toBeCloseTo(-0.08693657193373108, 14);
    expect(h.distM).toBeCloseTo(2636.2081354208062, 8);
    expect(smoothHorizon(10).elDeg).toBeCloseTo(-0.1944, 4);
  });

  it('blocking points match pipeline smooth_mask(−89.9°, 0°, [2])', () => {
    const m = smoothMask(2, -89.9, 0);
    const py: [number, number, number][] = [
      [0, -89.81306342806627, 0.0],
      [180, -89.86749354783524, 41.00261362829014],
      [359, -89.98691125644258, 3.3228624223176872],
      [719, -89.81306519887914, -0.23252981121839866],
    ];
    for (const [j, lat, lon] of py) {
      expect(Math.abs(m.blkLatDeg[j] - lat)).toBeLessThan(1e-9);
      expect(Math.abs(m.blkLonDeg[j] - lon)).toBeLessThan(1e-6);
    }
    expect(m.siteHeightM).toBe(0);
    expect(m.minElDeg).toBe(m.maxElDeg);
    expect(Number.isNaN(smoothMask(2).blkLatDeg[0])).toBe(true);
  });

  it('pointAt keeps the distance and wraps longitude to (−180, 180]', () => {
    const p = pointAt(0, 179.9, 90, 10_000);
    expect(p.lonDeg).toBeLessThan(-179);
    expect(wrap180(-180)).toBe(180);
    expect(wrap180(540)).toBe(180);
  });
});

describe('formula masks (07 §12.3)', () => {
  it('flat, tilt and sine', () => {
    expect(formulaMask('flat:0.5').elDeg[123]).toBe(0.5);
    const tilt = formulaMask('tilt:0.3');
    expect(tilt.elDeg[0]).toBeCloseTo(-0.3, 15);
    expect(tilt.elDeg[360]).toBe(0);
    expect(formulaMask('sine:1,3').elDeg[60]).toBeCloseTo(1, 12); // az 30°: sin 90°
    expect(() => formulaMask('bump:1')).toThrow();
  });
});

describe('maskFromFile', () => {
  it('reads the 2 m mask of the example demo-a', () => {
    const file = exampleJson<HorizonFile>('horizon/demo-a.json');
    const m = maskFromFile(file, 2)!;
    expect(m.elDeg).toHaveLength(N_AZ);
    expect(m.siteHeightM).toBe(file.site_height_m);
    expect(m.maxElDeg).toBeCloseTo(1.0, 3); // 0.4° + 0.6°
    expect(maskFromFile(file, 10)).toBeNull();
  });
});

describe('local_xy (06 §8)', () => {
  it('starts at the eye and sees the smooth tangent point on the horizon line', () => {
    expect(localXY(0, 100, 100, 2)).toEqual({ x: 0, y: -2 });
    const { elDeg, distM } = smoothHorizon(2);
    const p = localXY(distM, 0, 0, 2);
    expect(Math.atan2(p.y, p.x) * (180 / Math.PI)).toBeCloseTo(elDeg, 6);
  });
});
