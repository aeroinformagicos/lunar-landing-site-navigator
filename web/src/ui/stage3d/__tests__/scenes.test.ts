// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Unit tests of T-73 (16_vista_3d.md §15.1: U7, U10 and U11 complete) and of the pure parts behind the
// scenes off the polar mesh (§4.2–§4.4), their shadows (§6.3) and the projected layers (§9). Expected
// values come from the specification and the contract (bin distances of 06 §8, ramp of the map), not
// from the code under test.
import { describe, expect, it } from 'vitest';
import { GRID, latLonOfCell } from '../../../core/grid';
import type { Mask } from '../../../core/horizon';
import { profileBinDistance } from '../../../core/law';
import { PROFILE_NODATA } from '../../../core/loaders';
import { formatDeg } from '../../common/format';
import { LAYER_NODATA, rampColour, rampStep, type Band } from '../../map/mapData';
import { R_M, azElToMe, fromScene, makeSceneFrame, norm, type V3 } from '../frame';
import { buildProfile } from '../mesh.worker';
import { bandBytes, overlayChoices, overlayLutLinear, overlayRamp, overlayStep, shownLayer } from '../overlay';
import { FpsMonitor, TIER_SETTINGS, lowerTier, pickTier } from '../quality';
import {
  PROFILE_AZ,
  PROFILE_BINS,
  RING_FLAT_M,
  binOf,
  buildRingPanels,
  everyNthAzimuth,
  fillProfile,
  polarOfMe,
  profileDistances,
  radialHeightAt,
  ringGroundAt,
  ringTopAt,
  type RadialTerrain,
} from '../radial';
import { describeView, pickScene, reliefLine } from '../scenePlan';
import { binLut, radialLitFraction } from '../shadow';
import { radialGround } from '../terrain';

const BG1 = { lat: 18.562, lon: 61.81 }; // Blue Ghost 1 (sites.json): off the polar mesh, with a profile
const APOLLO11 = { lat: 0.67416, lon: 23.47314 }; // smooth Moon
const DEMO_A = { lat: -85.96708, lon: -2.2251 }; // polar

/** Scene point of vertex v of a mesh, back in MOON_ME (m). */
function vertexMe(f: ReturnType<typeof makeSceneFrame>, m: { offset: V3; position: Float32Array }, v: number): V3 {
  const s: V3 = [m.offset[0] + m.position[3 * v], m.offset[1] + m.position[3 * v + 1], m.offset[2] + m.position[3 * v + 2]];
  return fromScene(f, s);
}

describe('U7 · profile mesh', () => {
  const raw = new Int16Array(PROFILE_AZ * PROFILE_BINS).fill(100);
  const a = buildProfile({ id: 1, kind: 'profile', raw, law: 'full', latDeg: BG1.lat, lonDeg: BG1.lon, siteHeightM: 100, lod: 1 });
  const f = makeSceneFrame(BG1.lat, BG1.lon, 100);
  const nr = PROFILE_BINS + 1;

  it('one vertex per azimuth and bin, plus the site and the seam column', () => {
    expect(a.mesh.position.length / 3).toBe((PROFILE_AZ + 1) * nr);
    expect(a.drawn.nAz).toBe(720);
    const half = buildProfile({ id: 2, kind: 'profile', raw, law: 'full', latDeg: BG1.lat, lonDeg: BG1.lon, siteHeightM: 100, lod: 2 });
    expect(half.drawn.nAz).toBe(360);
  });

  it('vertex (j, b) at profileBinDistance(law, b) along the great circle (± 1 m) and 100 m high', () => {
    for (const j of [0, 90, 180, 359, 540, 719]) {
      for (const b of [0, 1, 50, 137, 300, 511]) {
        const me = vertexMe(f, a.mesh, j * nr + 1 + b);
        const { d, azDeg } = polarOfMe(f, me);
        expect(Math.abs(d - profileBinDistance('full', b))).toBeLessThan(1);
        // Float32 buffers relative to the site (§3.3): ± 1 cm within 100 km, ± 2 cm out to 300 km.
        expect(Math.abs(norm(me) - R_M - 100)).toBeLessThan(d < 100_000 ? 0.01 : 0.02);
        expect(Math.abs(((azDeg - j * 0.5 + 540) % 360) - 180)).toBeLessThan(1e-3);
      }
    }
  });

  it('azimuth j = 0 points north and j = 180 east of the site', () => {
    const north = polarOfMe(f, vertexMe(f, a.mesh, 0 * nr + 1 + 200));
    const east = polarOfMe(f, vertexMe(f, a.mesh, 180 * nr + 1 + 200));
    expect(Math.min(north.azDeg, 360 - north.azDeg)).toBeLessThan(1e-3);
    expect(Math.abs(east.azDeg - 90)).toBeLessThan(1e-3);
  });

  it('the seam column repeats the first one and the texture coordinates wrap the azimuth', () => {
    for (const b of [0, 200, 511]) {
      const v0 = 1 + b;
      const vs = PROFILE_AZ * nr + 1 + b;
      for (let k = 0; k < 3; k++) expect(a.mesh.position[3 * vs + k]).toBe(a.mesh.position[3 * v0 + k]);
      expect(a.mesh.uv[2 * vs]).toBe(a.mesh.uv[2 * v0]);
      expect(a.mesh.uv[2 * vs + 1] - a.mesh.uv[2 * v0 + 1]).toBeCloseTo(1, 6);
    }
  });

  it('the ground follows the profile: clearance 0 on a vertex, never under it after a clamp', () => {
    const g = radialGround(f, (d, az) => radialHeightAt(a.terrain, d, az));
    const s: V3 = [a.mesh.offset[0] + a.mesh.position[3 * 4000], a.mesh.offset[1] + a.mesh.position[3 * 4000 + 1], a.mesh.offset[2] + a.mesh.position[3 * 4000 + 2]];
    expect(Math.abs(g.clearance(s))).toBeLessThan(0.05);
    expect(g.clearance(g.surface([s[0], s[1] - 500, s[2]]))).toBeCloseTo(0, 3);
  });
});

describe('profile terrain: holes, interpolation and distances', () => {
  it('bin distances are those of 06 §8 and increase', () => {
    const d = profileDistances('full');
    expect(d.length).toBe(512);
    for (let b = 0; b < 512; b++) expect(d[b]).toBe(profileBinDistance('full', b));
    for (let b = 1; b < 512; b++) expect(d[b]).toBeGreaterThan(d[b - 1]);
  });

  it('holes are filled linearly in the bin, the ends take the nearest value, an empty azimuth is the sphere', () => {
    const nb = 8;
    const raw = new Int16Array(3 * nb).fill(PROFILE_NODATA);
    raw.set([PROFILE_NODATA, 10, PROFILE_NODATA, PROFILE_NODATA, 40, PROFILE_NODATA, 60, PROFILE_NODATA], 0);
    raw.set([5, 5, 5, 5, 5, 5, 5, 5], nb);
    const { heights, filled } = fillProfile(raw, 3, nb);
    expect([...heights.subarray(0, nb)]).toEqual([10, 10, 20, 30, 40, 50, 60, 60]);
    expect([...heights.subarray(nb, 2 * nb)]).toEqual([5, 5, 5, 5, 5, 5, 5, 5]);
    expect([...heights.subarray(2 * nb)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(filled).toBe(5 + 8);
  });

  it('heights interpolate between bins and azimuths, wrap at north, go to the site inside the first bin, and to 0 beyond', () => {
    const t: RadialTerrain = { nAz: 4, dist: Float64Array.from([100, 200, 300]), heights: Float32Array.from([0, 10, 20, 100, 110, 120, 200, 210, 220, 300, 310, 320]), centreH: -50 };
    expect(radialHeightAt(t, 200, 0)).toBeCloseTo(10, 9);
    expect(radialHeightAt(t, 150, 0)).toBeCloseTo(5, 9);
    expect(radialHeightAt(t, 200, 45)).toBeCloseTo(60, 9);
    expect(radialHeightAt(t, 200, 315)).toBeCloseTo(160, 9); // between j = 3 (310) and j = 0 (10)
    expect(radialHeightAt(t, 50, 0)).toBeCloseTo(-25, 9);
    expect(radialHeightAt(t, 301, 0)).toBe(0);
    expect(binOf(t.dist, 250)).toBeCloseTo(1.5, 12);
    expect(binOf(t.dist, 50)).toBeCloseTo(-0.5, 12);
    expect(Number.isNaN(binOf(t.dist, 301))).toBe(true);
  });

  it('one of every two azimuths for the medium and low tiers', () => {
    const t: RadialTerrain = { nAz: 4, dist: Float64Array.from([1, 2]), heights: Float32Array.from([0, 1, 10, 11, 20, 21, 30, 31]), centreH: 0 };
    const h = everyNthAzimuth(t, 2);
    expect(h.nAz).toBe(2);
    expect([...h.heights]).toEqual([0, 1, 20, 21]);
  });

  it('the GPU lookup table (distance → bin) is finite, increasing and ends on the last bin', () => {
    // Regression: d0·exp(k) rounding past the last distance gave NaN and dark texels on the GPU.
    for (const law of ['full', 'fast'] as const) {
      const d = profileDistances(law);
      const lut = binLut(d);
      expect(lut.every(Number.isFinite)).toBe(true);
      expect(lut[0]).toBe(0);
      expect(lut[lut.length - 1]).toBeCloseTo(511, 3);
      for (let i = 1; i < lut.length; i++) expect(lut[i]).toBeGreaterThanOrEqual(lut[i - 1]);
    }
  });
});

describe('cast shadows on the profile mesh (§6.3, TypeScript reference of the radial pass)', () => {
  // Flat terrain at 0 m with a 1 km wall 10–10.5 km east of the site (azimuths 60°–120°).
  const dist = profileDistances('full');
  const nb = dist.length;
  const make = (wall: boolean): RadialTerrain => {
    const heights = new Float32Array(PROFILE_AZ * nb);
    if (wall) {
      for (let j = 120; j <= 240; j++) for (let b = 0; b < nb; b++) if (dist[b] >= 10_000 && dist[b] <= 10_500) heights[j * nb + b] = 1000;
    }
    return { nAz: PROFILE_AZ, dist, heights, centreH: 0 };
  };
  const f = makeSceneFrame(BG1.lat, BG1.lon, 0);
  // Cell 1 km west of the site; the Sun due east.
  const b1 = dist.findIndex((d) => d >= 1000);
  const j = 540;
  const rho = (0.267 * Math.PI) / 180;
  const sunAt = (el: number) => azElToMe(90, el, f);
  /** Elevation of the wall's near top edge seen from the cell's eye (2 m), with the curvature drop. */
  const crestEl = (() => {
    const d = 11_000 + (dist[b1] - 1000);
    const th = d / R_M;
    return (Math.atan2(1000 - 2 - 2 * (R_M + 1000) * Math.sin(th / 2) ** 2, (R_M + 1000) * Math.sin(th)) * 180) / Math.PI;
  })();

  it('Sun at 2° behind the wall → 0; at 10° → 1', () => {
    expect(radialLitFraction(make(true), f, j, b1, sunAt(2), rho)).toBe(0);
    expect(radialLitFraction(make(true), f, j, b1, sunAt(10), rho)).toBe(1);
  });

  it('half lit with the disc centre on the crest (within the 5 % sampling step), penumbra the width of the disc', () => {
    const t = make(true);
    let lo = 2;
    let hi = 10;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (radialLitFraction(t, f, j, b1, sunAt(mid), rho) < 0.5) lo = mid;
      else hi = mid;
    }
    expect(Math.abs(hi - crestEl)).toBeLessThan(0.15);
    const rDeg = (rho * 180) / Math.PI;
    expect(radialLitFraction(t, f, j, b1, sunAt(hi - rDeg - 0.01), rho)).toBe(0);
    expect(radialLitFraction(t, f, j, b1, sunAt(hi + rDeg + 0.01), rho)).toBe(1);
  });

  it('no wall → lit with the Sun at 0.3°', () => {
    expect(radialLitFraction(make(false), f, j, b1, sunAt(0.3), rho)).toBe(1);
  });
});

describe('horizon ring (§4.3)', () => {
  // A mask whose ridge is 5–8 km away at 1–2°, the site in a 1.2 km deep floor.
  const n = 720;
  const mask: Mask = {
    observerHeightM: 2,
    siteHeightM: -1200,
    elDeg: Float64Array.from({ length: n }, (_, j) => 1 + Math.sin((j * Math.PI) / 360)),
    distM: Float64Array.from({ length: n }, (_, j) => (j === 7 ? Number.NaN : 5000 + 3000 * Math.abs(Math.cos((j * Math.PI) / 720)))),
    blkLatDeg: new Float64Array(n).fill(Number.NaN),
    blkLonDeg: new Float64Array(n).fill(Number.NaN),
    blkHeightM: new Float64Array(n).fill(Number.NaN),
    minElDeg: 0,
    maxElDeg: 2,
  };
  const f = makeSceneFrame(-70, 30, mask.siteHeightM);

  it('the ground is flat at the site height to 30 km, then goes down to the sphere', () => {
    expect(ringGroundAt(-1200, 0)).toBe(-1200);
    expect(ringGroundAt(-1200, RING_FLAT_M)).toBe(-1200);
    expect(ringGroundAt(-1200, RING_FLAT_M + 3000)).toBeCloseTo(-600, 9);
    expect(ringGroundAt(-1200, 50_000)).toBe(0);
  });

  it('a panel top is the blocking height, or the height that gives the mask elevation (NaN heights)', () => {
    const k = 100;
    const m = { ...mask, blkHeightM: mask.blkHeightM.map(() => Number.NaN) };
    const d = m.distM[k];
    const expected = m.siteHeightM + m.observerHeightM + d * Math.tan((m.elDeg[k] * Math.PI) / 180) + (d * d) / (2 * R_M);
    expect(ringTopAt(m, k)).toBeCloseTo(expected, 9);
    const withH = { ...mask, blkHeightM: mask.blkHeightM.map(() => 345) };
    expect(ringTopAt(withH, k)).toBe(345);
    expect(ringTopAt(m, k)).toBeGreaterThan(m.siteHeightM);
  });

  it('one panel per sample with a distance, at that distance and up to its top', () => {
    const m = { ...mask, blkHeightM: mask.blkHeightM.map((_, j) => (j % 2 ? Number.NaN : 2000)) };
    const p = buildRingPanels(f, m);
    const n = [...m.distM].filter((d, j) => Number.isFinite(d) && d > 0 && ringTopAt(m, j) > ringGroundAt(m.siteHeightM, d) - 50).length;
    expect(n).toBe(719); // sample 7 has no blocking distance
    expect(p.position.length / 12).toBe(n);
    // First panel: corners 2 and 3 are the top, at the mask distance.
    const top = vertexMe(f, p, 2);
    expect(Math.abs(polarOfMe(f, top).d - m.distM[0])).toBeLessThan(1);
    expect(Math.abs(norm(top) - R_M - ringTopAt(m, 0))).toBeLessThan(0.05);
  });
});

describe('U10 · scene selection, the four cases of §2.1 and the fallbacks', () => {
  const cell = latLonOfCell(415, 380);
  const at = (p: { lat: number; lon: number }, o: Partial<Parameters<typeof pickScene>[0]> = {}) =>
    pickScene({ latDeg: p.lat, lonDeg: p.lon, dem: 'ready', profile: 'none', mask: 'none', ...o });

  it('(a) polar for demo-a, a mesh point and coordinates inside the mesh; pending while the DEM loads', () => {
    expect(at(DEMO_A, { profile: 'ready', mask: 'ready' })).toEqual({ kind: 'polar', pending: false });
    expect(at({ lat: cell.latDeg, lon: cell.lonDeg }, { mask: 'ready' }).kind).toBe('polar');
    expect(at({ lat: -87.2, lon: 125.5 }).kind).toBe('polar');
    expect(at(DEMO_A, { dem: 'loading' })).toEqual({ kind: 'polar', pending: true });
  });

  it('(b) profile for a catalogue site off the mesh with a profile (Blue Ghost 1); pending while it loads', () => {
    expect(at(BG1, { profile: 'ready', mask: 'ready' })).toEqual({ kind: 'profile', pending: false });
    expect(at(BG1, { profile: 'loading', mask: 'ready' })).toEqual({ kind: 'profile', pending: true });
  });

  it('(c) ring without a profile but with a mask, or when the profile fails', () => {
    expect(at(BG1, { mask: 'ready' }).kind).toBe('ring');
    expect(at(BG1, { profile: 'error', mask: 'ready' }).kind).toBe('ring');
    expect(at(BG1, { profile: 'error', mask: 'loading' })).toEqual({ kind: 'ring', pending: true });
  });

  it('(d) smooth Moon for Apollo 11, and when every source fails', () => {
    expect(at(APOLLO11).kind).toBe('smooth');
    expect(at(BG1, { profile: 'error', mask: 'error' }).kind).toBe('smooth');
  });

  it('(a) without the DEM moves down: profile, then ring, then smooth Moon; never to 2D', () => {
    expect(at(DEMO_A, { dem: 'error', profile: 'ready', mask: 'ready' }).kind).toBe('profile');
    expect(at(DEMO_A, { dem: 'error', profile: 'error', mask: 'ready' }).kind).toBe('ring');
    expect(at({ lat: cell.latDeg, lon: cell.lonDeg }, { dem: 'error', mask: 'ready' }).kind).toBe('ring');
    expect(at(DEMO_A, { dem: 'error' }).kind).toBe('smooth');
  });

  it('relief lines: what the 3D shows and what the figures use; red triangle only for a smooth site', () => {
    expect(reliefLine('profile', false, 'SLDEM2015 59 m').text).toBe('3D terrain: reconstructed from the horizon profile · Figures: SLDEM2015 59 m');
    expect(reliefLine('ring', false, 'SLDEM2015 59 m').text).toBe('3D terrain: horizon ring only · Figures: SLDEM2015 59 m');
    expect(reliefLine('polar', false, 'LOLA polar 40 m + 120 m')).toMatchObject({ level: 'ok', warn: false });
    expect(reliefLine('smooth', true, 'Smooth Moon (no terrain)')).toEqual({ text: 'Smooth Moon (no terrain)', warn: true, level: 'red' });
    expect(reliefLine('smooth', false, 'SLDEM2015 59 m')).toMatchObject({ level: 'warn', warn: true });
  });

  it('descriptions of each scene and of the layer never show NaN or identifiers', () => {
    for (const scene of ['polar', 'profile', 'ring', 'smooth'] as const) {
      const text = describeView({ letter: 'A', name: 'Blue Ghost 1', latDeg: BG1.lat, lonDeg: BG1.lon, sky: null, mask: null, distM: 45_000, headingDeg: 10, scene, overlay: { layer: 'Sunlight', period: 'Aug 2027' } });
      expect(text).not.toMatch(/NaN|undefined|null|\{|blue-ghost/);
      expect(text).toContain('coloured by the map layer Sunlight, Aug 2027');
    }
    expect(formatDeg(1)).not.toMatch(/NaN/);
  });
});

describe('U11 · quality tiers, complete (§12.2)', () => {
  const base = { coarsePointer: false, widthPx: 1440, renderer: 'ANGLE (NVIDIA GeForce RTX 4060)', cores: 16, override: null };

  it('settings per tier: mesh, shadow texture and rate, halo, detail, pixel ratio', () => {
    expect(TIER_SETTINGS.alto).toEqual({ lod: 1, shadowDiv: 1, shadowEveryMs: 0, halo: true, detail: true, maxPixelRatio: 2 });
    expect(TIER_SETTINGS.medio.lod).toBe(2);
    expect(TIER_SETTINGS.medio.shadowDiv).toBe(2);
    expect(1000 / TIER_SETTINGS.medio.shadowEveryMs).toBeLessThanOrEqual(10);
    expect(TIER_SETTINGS.medio.maxPixelRatio).toBe(1);
    expect(TIER_SETTINGS.bajo).toMatchObject({ lod: 2, shadowDiv: 2, halo: false, detail: false, maxPixelRatio: 0.75 });
    expect(1000 / TIER_SETTINGS.bajo.shadowEveryMs).toBeLessThanOrEqual(4);
  });

  it('device rules: software renderers and llvmpipe → bajo; ≤ 4 cores → medio; ?q= wins, an unknown ?q= is ignored', () => {
    for (const r of ['Google SwiftShader', 'llvmpipe (LLVM 15.0.7, 256 bits)', 'Microsoft Basic Render Driver']) expect(pickTier({ ...base, renderer: r })).toBe('bajo');
    expect(pickTier({ ...base, cores: 2 })).toBe('medio');
    expect(pickTier({ ...base, override: 'medio' })).toBe('medio');
    expect(pickTier({ ...base, coarsePointer: true, override: 'alto' })).toBe('alto');
    expect(pickTier({ ...base, override: 'ultra' })).toBe('alto');
    expect(pickTier({ ...base, override: 'bajo' })).toBe('bajo');
  });

  it('one tier lower each time, never below bajo, and never up by itself', () => {
    expect(lowerTier('alto')).toBe('medio');
    expect(lowerTier('medio')).toBe('bajo');
    expect(lowerTier('bajo')).toBe('bajo');
    const m = new FpsMonitor(false);
    let t = 0;
    for (let k = 0; k < 200; k++) expect(m.frame(16, (t += 16))).toBe(false);
  });

  it('slow only for less than 2 s, or interrupted by a pause: no drop', () => {
    const m = new FpsMonitor(false);
    let t = 0;
    for (let k = 0; k < 40; k++) expect(m.frame(40, (t += 40))).toBe(false); // 1.6 s at 25 fps
    m.pause();
    for (let k = 0; k < 40; k++) expect(m.frame(40, (t += 40))).toBe(false); // the slow timer starts again
    expect(m.fps()).toBeCloseTo(25, 6);
  });

  it('frame gaps over 1 s (a hidden tab) do not count', () => {
    const m = new FpsMonitor(false);
    for (let k = 0; k < 500; k++) expect(m.frame(1500, k * 1500)).toBe(false);
    expect(m.fps()).toBeNull();
  });
});

describe('projected map layers (§9)', () => {
  it('the colour table is the 2D map ramp of each band, 11 steps', () => {
    for (const band of ['sun', 'earth', 'both'] as Band[]) {
      const ramp = overlayRamp(band);
      expect(ramp).toHaveLength(11);
      ramp.forEach((c, s) => expect(c).toEqual(rampColour(s, band)));
      const lin = overlayLutLinear(band);
      expect(lin).toHaveLength(33);
      for (const v of lin) expect(v >= 0 && v <= 1).toBe(true);
      // sRGB 255 → linear 1, sRGB 0 → 0: the shader's output conversion gives the map colour back.
      const top = rampColour(10, band);
      top.forEach((c, k) => expect(lin[30 + k]).toBeCloseTo(c <= 10.31 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4, 6));
    }
  });

  it('the shader step of a stored value is the map step; 255 is «no data»', () => {
    for (let v = 0; v <= 250; v++) expect(overlayStep(v)).toBe(rampStep(v));
    expect(overlayStep(LAYER_NODATA)).toBeNull();
  });

  it('plan B offers only Sunlight; the layer shows only once turned on and if the data has its band', () => {
    expect(overlayChoices('computed')).toEqual(['none', 'sun', 'earth', 'both']);
    expect(overlayChoices('nasa_avgvisib')).toEqual(['none', 'sun']);
    const bands: Band[] = ['sun', 'earth', 'both'];
    expect(shownLayer(false, 'both', 'computed', bands)).toBeNull();
    expect(shownLayer(true, 'both', 'computed', bands)).toBe('both');
    expect(shownLayer(true, 'none', 'computed', bands)).toBeNull();
    expect(shownLayer(true, 'earth', 'nasa_avgvisib', ['sun', 'earth'])).toBeNull();
    expect(shownLayer(true, 'sun', 'nasa_avgvisib', ['sun', 'earth'])).toBe('sun');
  });

  it('the texture of a band is its slice of the file (band, row, col)', () => {
    const n = GRID.nx * GRID.ny;
    const file = new Uint8Array(3 * n);
    file.fill(1, 0, n);
    file.fill(2, n, 2 * n);
    file.fill(3, 2 * n);
    for (let k = 0; k < 3; k++) {
      const b = bandBytes(file, k);
      expect(b.length).toBe(n);
      expect(b[0]).toBe(k + 1);
      expect(b[n - 1]).toBe(k + 1);
    }
  });
});
