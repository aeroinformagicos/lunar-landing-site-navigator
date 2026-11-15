// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-74: realism of the 3D view. Pure parts only (no WebGL): catalogue markers ready for T-91, the
// near-site smoothing of the profile scene, the vertical exaggeration (D-131).
import { describe, expect, it } from 'vitest';
import { profileDistances, smoothNearAzimuths, PROFILE_AZ, PROFILE_BINS, type RadialTerrain } from '../radial';
import { catalogueMarker } from '../scenePlan';
import { POLAR_FRAME, R_M, add, fromScene, heightOf, makeSceneFrame, mapToScene, norm, scale, toScene, type V3 } from '../frame';
import { exaggeratedGround, polarGround, realHeight, sphereGround, shownHeight } from '../terrain';
import { GRID } from '../../../core/grid';

describe('catalogue markers (T-74 point 4, ready for T-91)', () => {
  it('a candidate region with a contour is drawn by its outline, not as a marker', () => {
    expect(catalogueMarker({ type: 'candidate_region', region_id: 'haworth' })).toBe(false);
  });
  it('a candidate point without a contour (region_id null) is a marker', () => {
    expect(catalogueMarker({ type: 'candidate_region', region_id: null })).toBe(true);
  });
  it('landings, validation and demo sites stay markers', () => {
    for (const type of ['landing', 'validation', 'demo'] as const) expect(catalogueMarker({ type, region_id: null })).toBe(true);
  });
});

describe('profile scene: near-site smoothing across azimuth (T-74 point 3, D-134)', () => {
  const dist = profileDistances('full');
  const nb = PROFILE_BINS;
  const make = (h: (j: number, b: number) => number): RadialTerrain => {
    const heights = new Float32Array(PROFILE_AZ * nb);
    for (let j = 0; j < PROFILE_AZ; j++) for (let b = 0; b < nb; b++) heights[j * nb + b] = h(j, b);
    return { nAz: PROFILE_AZ, dist, heights, centreH: 0 };
  };
  it('a constant profile stays constant (U7 unchanged)', () => {
    const s = smoothNearAzimuths(make(() => 100), 150, 24);
    expect(s.heights.reduce((m, v) => Math.max(m, Math.abs(v - 100)), 0)).toBeLessThan(1e-3);
  });
  it('streaks near the site are averaged out; the far profile (the horizon) is untouched', () => {
    const t = make((j, b) => (j % 2 === 0 ? 40 : -40) + b);
    const s = smoothNearAzimuths(t, 150, 24);
    // Bin 2 (380 m): azimuths 3.3 m apart, a window of ±22 azimuths; the ±40 m streaks almost vanish.
    for (let j = 0; j < PROFILE_AZ; j += 37) expect(Math.abs(s.heights[j * nb + 2] - 2)).toBeLessThan(40 / 45 + 1e-3);
    // Beyond about 8.6 km (bin 64 is at 10 km) the window is a single azimuth: identical heights.
    for (let b = 64; b < nb; b += 7) for (let j = 0; j < PROFILE_AZ; j += 11) expect(s.heights[j * nb + b]).toBe(t.heights[j * nb + b]);
  });
  it('the mean height of each ring is kept and the window wraps through north', () => {
    const t = make((j, b) => (j < 5 || j > 714 ? 500 : 0) + b);
    const s = smoothNearAzimuths(t, 150, 24);
    for (const b of [0, 1, 2, 5]) {
      let a = 0;
      let c = 0;
      for (let j = 0; j < PROFILE_AZ; j++) {
        a += t.heights[j * nb + b];
        c += s.heights[j * nb + b];
      }
      expect(c / PROFILE_AZ).toBeCloseTo(a / PROFILE_AZ, 3);
    }
    // North (j = 0) and the azimuths just west of it see the same peak, smoothed symmetrically.
    expect(s.heights[0 * nb + 1]).toBeCloseTo(s.heights[719 * nb + 1] + (s.heights[1 * nb + 1] - s.heights[719 * nb + 1]) / 2, 0);
  });
});

describe('vertical exaggeration (T-74 point 2, D-131)', () => {
  it('heights scale about the anchor, which stays put, and the inverse gives the real height back', () => {
    const f = makeSceneFrame(18.56, 61.81, -2500);
    expect(shownHeight(f, 3, -2500)).toBe(-2500);
    expect(shownHeight(f, 3, -2400)).toBeCloseTo(-2200, 9);
    expect(shownHeight(POLAR_FRAME, 2, 1500)).toBe(3000);
    for (const h of [-5000, -10, 0, 812.5, 6000]) expect(realHeight(f, 2, shownHeight(f, 2, h))).toBeCloseTo(h, 9);
  });

  it('×1 leaves the ground untouched', () => {
    const g = sphereGround(POLAR_FRAME);
    expect(exaggeratedGround(POLAR_FRAME, g, 1)).toBe(g);
  });

  it('the exaggerated polar ground follows the drawn mesh: k·h at every point, any camera height', () => {
    // A synthetic DEM: a 3 km Gaussian hill at the pole.
    const h = new Float32Array(GRID.nx * GRID.ny);
    for (let j = 0; j < GRID.ny; j++) {
      for (let i = 0; i < GRID.nx; i++) {
        const x = GRID.xMinM + (i + 0.5) * GRID.cellM;
        const y = GRID.yMaxM - (j + 0.5) * GRID.cellM;
        h[j * GRID.nx + i] = 3000 * Math.exp(-(x * x + y * y) / (2 * 15_000 ** 2));
      }
    }
    const base = polarGround(h);
    const k = 3;
    const shown = exaggeratedGround(POLAR_FRAME, base, k);
    for (const [x, y] of [[0, 0], [10_000, -5_000], [-40_000, 22_000]]) {
      const real = base.surface(mapToScene(x, y, 0));
      const drawn = shown.surface(mapToScene(x, y, 9000));
      const hReal = heightOf(POLAR_FRAME, real);
      expect(heightOf(POLAR_FRAME, drawn)).toBeCloseTo(k * hReal, 3);
      // Same latitude and longitude: the drawn point is on the real point's vertical.
      const a = fromScene(POLAR_FRAME, real);
      const b = fromScene(POLAR_FRAME, drawn);
      expect(norm(add(scale(a, 1 / norm(a)), scale(b, -1 / norm(b))))).toBeLessThan(1e-12);
      // Clearance: 0 on the drawn surface, +100 m one hundred metres above it.
      expect(shown.clearance(drawn)).toBeCloseTo(0, 3);
      const up: V3 = scale(b, 100 / norm(b));
      expect(shown.clearance(toScene(POLAR_FRAME, add(b, up)))).toBeCloseTo(100, 3);
    }
    expect(R_M).toBe(1_737_400);
  });
});
