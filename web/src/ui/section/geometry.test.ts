// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-18: cross-section (10_interfaz.md §6.3, 06_horizonte.md §8, 09_contrato_datos.md §6):
// profileBinDistance equals Python, the profile decoder, the horizon line touches the terrain at the
// blocking point (± 1 bin), smooth sphere, frame and texts.
import { describe, expect, it } from 'vitest';
import { exampleBytes, exampleJson } from '../../core/__tests__/fixtures';
import { gunzip } from '../../core/gz';
import { localXY, maskFromFile, smoothHorizon } from '../../core/horizon';
import { lawNSamples, profileBinDistance } from '../../core/law';
import { decodeProfile, DataError } from '../../core/loaders';
import type { HorizonFile } from '../../core/types';
import {
  blockerText,
  centreText,
  elevationOf,
  niceFloor,
  plotFrame,
  profilePoints,
  profileRow,
  rangeFor,
  smoothTangentDistance,
  smoothText,
  sphereCurve,
  ticks,
} from './geometry';

/** pipeline/horizon/profile.py profile_bin_distance, printed by Python. */
const PY_BINS: Record<'full' | 'fast', [number, number][]> = {
  full: [
    [0, 80.0], [1, 240.0], [2, 380.0], [63, 9220.0], [64, 9360.0], [100, 14580.0], [136, 19800.0], [137, 19940.0],
    [200, 31453.363483551184], [255, 46866.660416182196], [256, 47195.71288093861], [300, 64919.215984063536],
    [400, 133858.31731088556], [500, 276281.32734717516], [510, 296896.5235518771], [511, 298981.04444551055],
  ],
  fast: [
    [0, 80.0], [1, 240.0], [2, 400.0], [63, 9240.0], [64, 9360.0], [100, 14600.0], [136, 19800.0], [137, 19960.0],
    [200, 31477.6848706407], [255, 46846.73931450856], [256, 47222.639050613376], [300, 64881.0661208941],
    [400, 133998.7951401061], [500, 276195.17519581824], [510, 296793.2795949218], [511, 299174.7583725251],
  ],
};

async function exampleProfile() {
  return decodeProfile('profile/demo-a.bin.gz', await gunzip(exampleBytes('profile/demo-a.bin.gz')));
}

describe('profile_bin_distance and local_xy equal Python', () => {
  it('16 bins of each law', () => {
    for (const law of ['full', 'fast'] as const) {
      for (const [b, d] of PY_BINS[law]) expect(profileBinDistance(law, b), `${law}[${b}]`).toBe(d);
    }
  });

  it('local_xy of a blocking point and of the smooth tangent point', () => {
    const p = localXY(41_230, -2710.4, -3760.5, 2);
    expect(p.x).toBeCloseTo(41161.81621154526, 6);
    expect(p.y).toBeCloseTo(559.674383850707, 6);
    const s = localXY(2636.2081354208062, 0, 0, 2);
    expect(s.y).toBeCloseTo(-3.999997697688549, 9);
  });
});

describe('profile decoder (09 §6)', () => {
  it('reads the header and 720 × 512 heights of the example profile', async () => {
    const p = await exampleProfile();
    expect(p).toMatchObject({ law: 'full', nSamples: lawNSamples('full'), nBins: 512, observerHeightM: 2 });
    expect(p.heightM).toHaveLength(720 * 512);
  });

  it('rejects another major version, an unknown law and a wrong n_samples', async () => {
    const raw = await gunzip(exampleBytes('profile/demo-a.bin.gz'));
    const bad = (offset: number, value: number) => {
      const b = raw.slice();
      new DataView(b.buffer).setUint16(offset, value, true);
      try {
        decodeProfile('x', b);
      } catch (e) {
        return (e as DataError).kind;
      }
      return 'ok';
    };
    expect(bad(8, 2)).toBe('contract');
    expect(bad(16, 3)).toBe('format');
    expect(bad(18, 1855)).toBe('format');
    expect(() => decodeProfile('x', raw.subarray(0, 1000))).toThrow(DataError);
  });
});

describe('the horizon line touches the terrain at the blocking point (± 1 bin)', () => {
  it('in every 15° of the example demo-a profile', async () => {
    const p = await exampleProfile();
    const mask = maskFromFile(exampleJson<HorizonFile>('horizon/demo-a.json'), 2)!;
    for (let az = 0; az < 360; az += 15) {
      const j = profileRow(az);
      const pts = profilePoints(p, j, 2);
      const blockerBin = pts.reduce((a, b) => (Math.abs(b.d - mask.distM[j]) < Math.abs(a.d - mask.distM[j]) ? b : a)).bin;
      // The line at the mask elevation meets the terrain at the blocker's bin, give or take one.
      const near = pts.filter((q) => Math.abs(q.bin - blockerBin) <= 1);
      const gap = Math.min(...near.map((q) => Math.abs(elevationOf(q) - mask.elDeg[j])));
      expect(gap, `az ${az}`).toBeLessThan(0.01);
      // Other bins may rise a few hundredths of a degree over the line: heights are whole metres
      // (09 §6) and each bin is drawn at its middle distance (06 §8). The blocker comes from the mask.
    }
  });
});

describe('smooth sphere, ranges and frame', () => {
  it('the sphere through the site meets the horizon line at the tangent point (2.6 km at 2 m)', () => {
    const d = smoothTangentDistance(2);
    expect(d).toBeCloseTo(2636.21, 1);
    const curve = sphereCurve(0, 2, d, 1);
    expect(elevationOf(curve[1])).toBeCloseTo(smoothHorizon(2).elDeg, 6);
    expect(curve[0]).toEqual({ x: 0, y: -2 });
    expect(smoothText(2)).toBe('Smooth Moon: the horizon is the lunar sphere, 2.6 km away.');
  });

  it('Fit to blocker: 1.25 × the distance, at least 5 km; Full: 300 km', () => {
    expect(rangeFor('fit', 41_230)).toBeCloseTo(51_537.5, 6);
    expect(rangeFor('fit', 800)).toBe(5000);
    expect(rangeFor('full', 41_230)).toBe(300_000);
    expect(rangeFor('fit', Number.NaN)).toBe(5000);
  });

  it('vertical exaggeration is a round number that fits the terrain', () => {
    expect([niceFloor(0.3), niceFloor(1), niceFloor(13), niceFloor(27), niceFloor(640)]).toEqual([1, 1, 10, 20, 500]);
    const pts = [{ x: 0, y: 0 }, { x: 20_000, y: 113 }, { x: 25_000, y: -50 }];
    const f = plotFrame(pts, 25_000, 600, 300);
    expect(f.exaggeration).toBeGreaterThanOrEqual(1);
    for (const p of pts) {
      const q = f.px(p);
      expect(q.y).toBeGreaterThanOrEqual(0);
      expect(q.y).toBeLessThanOrEqual(300);
    }
    expect(f.px({ x: 25_000, y: 0 }).x).toBe(600);
  });

  it('ticks', () => {
    expect(ticks(0, 51.5, 6)).toEqual([0, 10, 20, 30, 40, 50]);
    expect(ticks(0, 300, 6)).toEqual([0, 50, 100, 150, 200, 250, 300]);
  });
});

describe('texts (10 §6.3)', () => {
  it('blocking point and centre', () => {
    expect(blockerText(41_230, 1930)).toBe('Blocking point: 41.2 km away, 1,930 m above the site');
    expect(blockerText(812, -40)).toBe('Blocking point: 0.8 km away, 40 m below the site');
    expect(centreText('Sun', 0.331)).toBe('Sun centre is 0.33° above the terrain here.');
    expect(centreText('Earth', -0.21)).toBe('Earth centre is 0.21° below the terrain here.');
  });

  it('profile row is the nearest mask azimuth', () => {
    expect(profileRow(0.24)).toBe(0);
    expect(profileRow(0.25)).toBe(1);
    expect(profileRow(359.8)).toBe(0);
    expect(profileRow(-90)).toBe(540);
  });
});
