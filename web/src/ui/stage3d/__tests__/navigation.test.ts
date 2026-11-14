// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Unit tests of T-72 (16_vista_3d.md §15.1: U5 for fly and Go to, U9, and the ray of §8.6/§10.2).
// Expected values come from the specification (speeds, limits, geometry), not from the code.
import { describe, expect, it } from 'vitest';
import { GRID, cellCentreXY } from '../../../core/grid';
import { makeMask } from '../../../core/horizon';
import type { TracePoint } from '../../panorama/texts';
import type { OrbitState } from '../camera';
import { POLAR_FRAME, R_M, add, localBasisAt, mapToScene, norm, scale, sceneToMap, sub, unit, type V3 } from '../frame';
import { FLY, GROUND, flightAt, flightDurationMs, flySpeed, flyStep, lookDir, makeFlight, raycastGround, turn, type GroundFns, type LookState } from '../navigation';
import { crestIndices, pathOnDome, regionOutline, scaleBar } from '../signals';
import { polarGround, polarHeightAt } from '../terrain';

const N = GRID.nx * GRID.ny;
const rnd = (() => {
  let s = 4242;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
})();

// A 3 km Gaussian mountain (σ = 8 km) centred at map (0, 50 km), as in U5.
const h = new Float32Array(N);
for (let j = 0; j < GRID.ny; j++) {
  for (let i = 0; i < GRID.nx; i++) {
    const { x, y } = cellCentreXY(i, j);
    h[j * GRID.nx + i] = 3000 * Math.exp(-(x * x + (y - 50_000) ** 2) / (2 * 8000 ** 2));
  }
}
const ground = polarGround(h);
const fns: GroundFns = { clearance: (p) => ground.clearance(p), basisAt: (p) => localBasisAt(POLAR_FRAME, p) };

describe('U5 · fly mode never goes under the terrain (§7.2, §7.6)', () => {
  it('speed follows the height: 0.8·AGL between 20 m/s and 80 km/s, × 5 with Shift', () => {
    expect(flySpeed(0, false)).toBe(20);
    expect(flySpeed(1000, false)).toBe(800);
    expect(flySpeed(1e9, false)).toBe(80_000);
    expect(flySpeed(1000, true)).toBe(4000);
  });

  it('2,000 random flights toward and over the mountain keep 5 m of clearance', () => {
    for (let k = 0; k < 2000; k++) {
      const x = (rnd() - 0.5) * 40_000;
      const y = 50_000 + (rnd() - 0.5) * 40_000;
      const start = ground.surface(mapToScene(x, y, 0));
      let s: LookState = { pos: add(start, scale(fns.basisAt(start).u, 5 + rnd() * 3000)), yawDeg: rnd() * 360, pitchDeg: -89 + rnd() * 178, fovDeg: 50 };
      for (let step = 0; step < 30; step++) {
        s = flyStep(s, { forward: 1, right: rnd() - 0.5, up: rnd() < 0.3 ? -1 : 0, fast: rnd() < 0.5 }, 0.05 + rnd() * 0.2, fns);
        expect(ground.clearance(s.pos)).toBeGreaterThanOrEqual(FLY.clearanceM - 0.01);
      }
    }
  });

  it('turning limits the pitch to ±89° and the field of view to 20–90°', () => {
    const s: LookState = { pos: [0, 0, 0], yawDeg: 350, pitchDeg: 80, fovDeg: 60 };
    const a = turn(s, 20, 30, 0.1);
    expect(a.yawDeg).toBeCloseTo(10, 9);
    expect(a.pitchDeg).toBe(89);
    expect(a.fovDeg).toBe(GROUND.minFov);
    expect(turn(s, 0, -500, 10).pitchDeg).toBe(-89);
    expect(turn(s, 0, 0, 10).fovDeg).toBe(GROUND.maxFov);
  });

  it('the view direction is unit length, north at yaw 0 and up at pitch 90', () => {
    const b = fns.basisAt(mapToScene(0, 50_000, 0));
    const d = lookDir(0, 0, b);
    expect(norm(d)).toBeCloseTo(1, 12);
    expect(d[0] * b.n[0] + d[1] * b.n[1] + d[2] * b.n[2]).toBeCloseTo(1, 12);
    const up = lookDir(123, 90, b);
    expect(up[0] * b.u[0] + up[1] * b.u[1] + up[2] * b.u[2]).toBeCloseTo(1, 12);
  });
});

describe('Go to flights (§7.4)', () => {
  const surface = (p: V3) => ground.surface(p);
  const target = (x: number, y: number) => surface(mapToScene(x, y, 0));

  it('duration: clamp(0.8 + 0.4·log10(km + 1), 0.8, 3) s', () => {
    expect(flightDurationMs(0)).toBe(800);
    expect(flightDurationMs(999_000)).toBeCloseTo(2000, 0);
    expect(flightDurationMs(1e12)).toBe(3000);
  });

  it('starts at the origin, ends at the goal, keeps the target on the terrain and rises half way', () => {
    const from: OrbitState = { target: target(-60_000, 20_000), headingDeg: 350, pitchDeg: 20, distM: 30_000 };
    const to: OrbitState = { target: target(80_000, 120_000), headingDeg: 10, pitchDeg: 40, distM: 10_000 };
    const fl = makeFlight(POLAR_FRAME, from, to, 0);
    const sep = norm(sub(from.target, to.target));
    expect(fl.peakM).toBeCloseTo(Math.max(30_000, 10_000, 0.6 * sep), 6);
    expect(norm(sub(flightAt(fl, POLAR_FRAME, 0, surface).state.target, from.target))).toBeLessThan(1);
    const end = flightAt(fl, POLAR_FRAME, fl.durMs, surface);
    expect(end.done).toBe(true);
    expect(end.state).toEqual(to);
    const mid = flightAt(fl, POLAR_FRAME, fl.durMs / 2, surface).state;
    expect(mid.distM).toBeGreaterThan(0.95 * fl.peakM);
    // The heading takes the short way round (350° → 10° passes through 0°).
    expect(Math.min(mid.headingDeg, 360 - mid.headingDeg)).toBeLessThan(10.01);
    for (let k = 1; k < 20; k++) {
      const s = flightAt(fl, POLAR_FRAME, (fl.durMs * k) / 20, surface).state;
      expect(Math.abs(ground.clearance(s.target))).toBeLessThan(1);
    }
  });
});

describe('ray against the terrain (§8.6, §10.2)', () => {
  it('a 45° ray from 1,000 m over flat ground lands 1,000 m away horizontally', () => {
    const flat = polarGround(new Float32Array(N));
    const p0 = mapToScene(0, 100_000, 1000);
    const b = localBasisAt(POLAR_FRAME, p0);
    const d = unit(add(b.n, scale(b.u, -1)));
    const hit = raycastGround(p0, d, (p) => flat.clearance(p))!;
    const m = sceneToMap(hit);
    expect(Math.abs(m.hM)).toBeLessThan(0.01);
    // 1 km along the ground, plus the curvature: the ray meets the sphere ≈ 0.6 m further.
    expect(Math.abs(Math.hypot(m.x, m.y) - 101_000)).toBeLessThan(2);
    expect(raycastGround(p0, b.u, (p) => flat.clearance(p), 2e6)).toBeNull();
  });

  it('the mountain stops the ray before the flat ground behind it', () => {
    const p0 = mapToScene(0, 0, 4000);
    const b = localBasisAt(POLAR_FRAME, p0);
    const d = unit(add(b.n, scale(b.u, -0.06)));
    const hit = raycastGround(p0, d, (p) => ground.clearance(p))!;
    const m = sceneToMap(hit);
    expect(m.hM).toBeGreaterThan(1000);
    expect(Math.abs(m.hM - polarHeightAt(h, m.x, m.y))).toBeLessThan(0.5);
  });
});

describe('U9 · signals', () => {
  it('a region outline is closed, every 250 m and 15 m over the terrain', () => {
    const box: [number, number, number, number] = [-5000, 45_000, 5000, 55_000];
    const pts = regionOutline(box, (x, y, lift) => mapToScene(x, y, polarHeightAt(h, x, y) + lift));
    expect(pts.length).toBe(4 * 40 + 1);
    expect(pts[0]).toEqual(pts[pts.length - 1]);
    for (const p of pts) {
      const m = sceneToMap(p);
      expect(m.hM - polarHeightAt(h, m.x, m.y)).toBeCloseTo(15, 3);
    }
  });

  it('paths: hourly points on the dome, runs split at the horizon, a mark every 24 h', () => {
    // Three days; the mask is flat at 1° and the body oscillates between 0° and 2° (period 12 h).
    const nan = new Float64Array(720).fill(Number.NaN);
    const mask = makeMask(2, 0, { elDeg: new Float64Array(720).fill(1), distM: new Float64Array(720).fill(5000), blkLatDeg: nan, blkLonDeg: nan, blkHeightM: nan });
    const trace: TracePoint[] = Array.from({ length: 73 }, (_, k) => ({ t: k * 3600, azDeg: (k * 5) % 360, elDeg: 1 + Math.sin((2 * Math.PI * (k + 0.5)) / 12), daily: k % 24 === 0 }));
    const eye = mapToScene(0, 100_000, 2);
    const b = localBasisAt(POLAR_FRAME, eye);
    const dirOf = (az: number, el: number) => lookDir(az, el, b);
    const p = pathOnDome(trace, mask, eye, 20_000, dirOf);
    expect(p.ticks.map((x) => x.day)).toEqual([0, 1, 2, 3]);
    const visibleExpected = trace.map((x) => x.elDeg > 1);
    let changes = 0;
    for (let k = 1; k < trace.length; k++) if (visibleExpected[k] !== visibleExpected[k - 1]) changes++;
    expect(p.runs.length).toBe(changes + 1);
    for (const run of p.runs) for (const q of run.points) expect(norm(sub(q, eye))).toBeCloseTo(20_000, 3);
    expect(p.runs[0].visible).toBe(visibleExpected[0]);
    expect(p.end).toEqual(p.runs[p.runs.length - 1].points.at(-1));
  });

  it('crest highlight indices wrap around north; scale bar between 60 and 150 px', () => {
    expect(crestIndices(0, 1)).toEqual([718, 719, 0, 1, 2]);
    for (const mpp of [0.37, 3, 17, 250, 1234, 9999]) {
      const s = scaleBar(mpp)!;
      expect(s.px).toBeGreaterThanOrEqual(60);
      expect(s.px).toBeLessThanOrEqual(150);
      expect([1, 2, 5]).toContain(Number((s.metres / 10 ** Math.floor(Math.log10(s.metres))).toFixed(6)));
    }
    expect(scaleBar(Number.NaN)).toBeNull();
  });

  it('R is the lunar radius of the contract', () => {
    expect(R_M).toBe(1_737_400);
  });
});
