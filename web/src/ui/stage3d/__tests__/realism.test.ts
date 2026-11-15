// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-74: realism of the 3D view. Pure parts only (no WebGL): catalogue markers ready for T-91, the
// near-site smoothing of the profile scene.
import { describe, expect, it } from 'vitest';
import { profileDistances, smoothNearAzimuths, PROFILE_AZ, PROFILE_BINS, type RadialTerrain } from '../radial';
import { catalogueMarker } from '../scenePlan';

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
