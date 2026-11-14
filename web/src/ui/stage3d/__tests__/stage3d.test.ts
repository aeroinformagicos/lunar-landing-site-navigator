// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Unit tests of the 3D view (16_vista_3d.md §15.1: U1–U6, U8, U10–U12). Pure geometry in Node, no
// WebGL. Expected values come from the specification (frame, curvature, shadow geometry), not from
// the code under test.
import { describe, expect, it } from 'vitest';
import { enuBasis, siteFrame, skyAt } from '../../../core/frames';
import { GRID, cellCentreXY, cellOfXY, latLonOfCell, xyOfLatLon } from '../../../core/grid';
import { formulaMask } from '../../../core/horizon';
import { evaluate } from '../../../core/visibility';
import { exampleTable } from '../../../core/__tests__/fixtures';
import { ORBIT, clampOrbit, orbitPosition, type OrbitState } from '../camera';
import {
  POLAR_FRAME,
  R_M,
  azElToMe,
  dirToScene,
  dot,
  localBasisAt,
  mapToScene,
  meToAzEl,
  norm,
  rotFromScene,
  sceneToMap,
  sub,
  type V3,
} from '../frame';
import { DEM_NODATA, SKIRT_M, buildPolarTiles, downsample2, fillHoles, fineGrid } from '../meshes';
import { FpsMonitor, pickTier } from '../quality';
import { bodyStatus, chooseScene, describeView, inPolarMesh } from '../scenePlan';
import { litFraction } from '../shadow';
import { polarGround } from '../terrain';

const N = GRID.nx * GRID.ny;
const CENTRE: V3 = [0, -R_M, 0]; // Moon centre in the polar scene (16 §3.1)
const rnd = (() => {
  let s = 12345;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
})();

describe('U1 · polar scene frame', () => {
  it('pole at the origin, map +x → +X, map +y → −Z', () => {
    for (const v of mapToScene(0, 0, 0)) expect(Math.abs(v)).toBeLessThan(1e-9);
    const px = mapToScene(10_000, 0, 0);
    expect(px[0]).toBeGreaterThan(9_990);
    expect(Math.abs(px[2])).toBeLessThan(1e-6);
    const py = mapToScene(0, 10_000, 0);
    expect(py[2]).toBeLessThan(-9_990);
    expect(Math.abs(py[0])).toBeLessThan(1e-6);
    // Curvature: 10 km from the pole the ground is d²/2R = 28.8 m below the tangent plane.
    expect(px[1]).toBeCloseTo(-(10_000 ** 2) / (2 * R_M), 1);
  });

  it('map ↔ scene round trip within 1 mm on 1,000 random points', () => {
    let worst = 0;
    for (let k = 0; k < 1000; k++) {
      const x = GRID.xMinM + rnd() * GRID.nx * GRID.cellM;
      const y = GRID.yMaxM - rnd() * GRID.ny * GRID.cellM;
      const h = -5000 + rnd() * 10_000;
      const m = sceneToMap(mapToScene(x, y, h));
      worst = Math.max(worst, Math.abs(m.x - x), Math.abs(m.y - y), Math.abs(m.hM - h));
    }
    expect(worst).toBeLessThan(1e-3);
  });
});

describe('U2 · mesh of a flat DEM', () => {
  const g = fineGrid(new Float32Array(N));

  it('every vertex on the reference sphere (float32 relative positions: ± 5 mm)', () => {
    let worst = 0;
    for (const t of buildPolarTiles(g)) {
      for (let v = 0; v < t.position.length / 3; v++) {
        const p: V3 = [t.offset[0] + t.position[3 * v], t.offset[1] + t.position[3 * v + 1], t.offset[2] + t.position[3 * v + 2]];
        const r = norm(sub(p, CENTRE));
        if (r > R_M - SKIRT_M / 2) worst = Math.max(worst, Math.abs(r - R_M)); // skirt vertices are 3 km lower
      }
    }
    expect(worst).toBeLessThan(5e-3);
  });

  it('752 × 672 vertices and 2 · 751 · 671 triangles in one piece; 376 × 336 at 1 km', () => {
    const [one] = buildPolarTiles(g, 1);
    const skirt = 2 * GRID.nx + 2 * GRID.ny;
    expect(one.position.length / 3).toBe(GRID.nx * GRID.ny + skirt);
    const skirtTris = 4 * (2 * (GRID.nx - 1) + 2 * (GRID.ny - 1));
    expect(one.index.length / 3).toBe(2 * 751 * 671 + skirtTris);
    const lod = downsample2(g.heights, GRID.nx, GRID.ny);
    expect([lod.nx, lod.ny]).toEqual([376, 336]);
  });
});

describe('U3 · ramp and holes', () => {
  it('heights follow the DEM and normals tilt atan(0.01) from the local vertical', () => {
    const h = new Float32Array(N);
    for (let j = 0; j < GRID.ny; j++) for (let i = 0; i < GRID.nx; i++) h[j * GRID.nx + i] = 0.01 * cellCentreXY(i, j).x;
    const tiles = buildPolarTiles(fineGrid(h), 1);
    const t = tiles[0];
    for (const [i, j] of [
      [300, 200],
      [500, 400],
      [100, 600],
    ]) {
      const v = j * GRID.nx + i;
      const p: V3 = [t.offset[0] + t.position[3 * v], t.offset[1] + t.position[3 * v + 1], t.offset[2] + t.position[3 * v + 2]];
      const m = sceneToMap(p);
      expect(m.hM).toBeCloseTo(0.01 * cellCentreXY(i, j).x, 1);
      const up = localBasisAt(POLAR_FRAME, p).u;
      const n: V3 = [t.normal[3 * v], t.normal[3 * v + 1], t.normal[3 * v + 2]];
      const tilt = (Math.acos(Math.min(1, dot(n, up) / norm(n))) * 180) / Math.PI;
      expect(Math.abs(tilt - (Math.atan(0.01) * 180) / Math.PI)).toBeLessThan(0.01);
    }
  });

  it('a 3 × 3 hole is filled between its neighbours and flagged', () => {
    const dem = new Int16Array(N);
    for (let j = 0; j < GRID.ny; j++) for (let i = 0; i < GRID.nx; i++) dem[j * GRID.nx + i] = i;
    for (let j = 100; j < 103; j++) for (let i = 200; i < 203; i++) dem[j * GRID.nx + i] = DEM_NODATA;
    const f = fillHoles(dem, GRID.nx, GRID.ny);
    expect(f.filled).toBe(9);
    for (let j = 100; j < 103; j++) {
      for (let i = 200; i < 203; i++) {
        expect(f.holes[j * GRID.nx + i]).toBe(1);
        expect(f.heights[j * GRID.nx + i]).toBeGreaterThanOrEqual(199);
        expect(f.heights[j * GRID.nx + i]).toBeLessThanOrEqual(203);
      }
    }
    expect(f.holes[0]).toBe(0);
  });
});

describe('U4 · Sun and Earth directions match the core', () => {
  it('200 random (az, el) at random sites come back within 1e-9°', () => {
    let worst = 0;
    for (let k = 0; k < 200; k++) {
      const lat = -90 + rnd() * 180;
      const lon = -180 + rnd() * 360;
      const az = rnd() * 360;
      const el = -10 + rnd() * 100;
      const d = dirToScene(POLAR_FRAME, az, el, lat, lon);
      const back = meToAzEl(rotFromScene(POLAR_FRAME, d), enuBasis(lat, lon));
      const daz = Math.abs(((back.azDeg - az + 540) % 360) - 180);
      worst = Math.max(worst, el < 89.9 ? daz : 0, Math.abs(back.elDeg - el));
    }
    expect(worst).toBeLessThan(1e-9);
  });

  it('the Sun and Earth of demo-a at three instants, as skyAt gives them', () => {
    const table = exampleTable();
    const lat = -88.8;
    const lon = 123.4;
    const frame = siteFrame(lat, lon, 2);
    for (const t of [1817078400, 1817078400 + 86_400 * 3.3, 1817078400 + 86_400 * 9.7]) {
      const sky = skyAt(table, frame, t);
      for (const b of [sky.sun, sky.earth]) {
        const me = azElToMe(b.azDeg, b.elDeg, enuBasis(lat, lon));
        const back = meToAzEl(me, enuBasis(lat, lon));
        expect(Math.abs(((back.azDeg - b.azDeg + 540) % 360) - 180)).toBeLessThan(1e-9);
        expect(Math.abs(back.elDeg - b.elDeg)).toBeLessThan(1e-9);
      }
    }
  });
});

describe('U5 · the camera never goes under the terrain', () => {
  // A 3 km Gaussian mountain (σ = 8 km) centred at map (0, 50 km).
  const h = new Float32Array(N);
  for (let j = 0; j < GRID.ny; j++) {
    for (let i = 0; i < GRID.nx; i++) {
      const { x, y } = cellCentreXY(i, j);
      h[j * GRID.nx + i] = 3000 * Math.exp(-(x * x + (y - 50_000) ** 2) / (2 * 8000 ** 2));
    }
  }
  const ground = polarGround(h);

  it('1,000 random orbits around and behind the mountain keep 50 m of clearance', () => {
    for (let k = 0; k < 1000; k++) {
      const tx = (rnd() - 0.5) * 60_000;
      const ty = 50_000 + (rnd() - 0.5) * 60_000;
      const target = ground.surface(mapToScene(tx, ty, 0));
      const s: OrbitState = { target, headingDeg: rnd() * 360, pitchDeg: -10 + rnd() * 100, distM: 100 + rnd() * 120_000 };
      const b = localBasisAt(POLAR_FRAME, target);
      const c = clampOrbit(s, b, (p) => ground.clearance(p));
      expect(ground.clearance(orbitPosition(c, b))).toBeGreaterThanOrEqual(ORBIT.clearanceM - 0.5);
      expect(c.pitchDeg).toBeGreaterThanOrEqual(ORBIT.minPitchDeg);
      expect(c.distM).toBeGreaterThanOrEqual(ORBIT.minDistM);
    }
  });
});

describe('U6 · cast shadows (TypeScript reference of the GPU pass)', () => {
  // Flat ground with a 1 km wall 10 km east of the point (0, 100 km); there east is map +x (08 §1.2).
  const px = 0;
  const py = 100_000;
  const wall = new Float32Array(N);
  for (let j = 0; j < GRID.ny; j++) {
    for (let i = 0; i < GRID.nx; i++) {
      const { x, y } = cellCentreXY(i, j);
      if (x >= 9_750 && x <= 10_750 && Math.abs(y - py) < 30_000) wall[j * GRID.nx + i] = 1000;
    }
  }
  const { latDeg, lonDeg } = (() => {
    const c = 2 * Math.atan(Math.hypot(px, py) / (2 * R_M));
    return { latDeg: -90 + (c * 180) / Math.PI, lonDeg: (Math.atan2(px, py) * 180) / Math.PI };
  })();
  const sunEast = (el: number) => azElToMe(90, el, enuBasis(latDeg, lonDeg));
  const rho = (0.266 * Math.PI) / 180;
  // Wall top seen from the eye at 2 m: its near face is between 9.75 and 10.75 km away, so the
  // half-lit Sun elevation lies between atan((998 − d²/2R)/d) at those two distances.
  const elAt = (d: number) => (Math.atan((1000 - 2 - d ** 2 / (2 * R_M)) / d) * 180) / Math.PI;

  it('Sun at 2° → in shadow; at 10° → lit', () => {
    expect(litFraction(wall, px, py, sunEast(2), rho)).toBe(0);
    expect(litFraction(wall, px, py, sunEast(10), rho)).toBe(1);
  });

  it('the disc centre on the crest is the half-lit point, and the penumbra spans the disc', () => {
    let lo = 2;
    let hi = 10;
    for (let k = 0; k < 50; k++) {
      const mid = (lo + hi) / 2;
      if (litFraction(wall, px, py, sunEast(mid), rho) < 0.5) lo = mid;
      else hi = mid;
    }
    expect(lo).toBeGreaterThanOrEqual(elAt(10_750) - 0.01);
    expect(lo).toBeLessThanOrEqual(elAt(9_750) + 0.01);
    const rhoDeg = (rho * 180) / Math.PI;
    expect(litFraction(wall, px, py, sunEast(lo + rhoDeg * 1.01), rho)).toBe(1);
    expect(litFraction(wall, px, py, sunEast(lo - rhoDeg * 1.01), rho)).toBe(0);
  });

  it('no wall: lit with the Sun at 0.3° (the smooth horizon at 2 m is −0.087°)', () => {
    expect(litFraction(new Float32Array(N), px, py, sunEast(0.3), rho)).toBe(1);
  });
});

describe('U8 · click on the terrain', () => {
  it('a scene point over Shackleton (415, 380) gives back that cell', () => {
    const { x, y } = cellCentreXY(415, 380);
    const p = mapToScene(x, y, -2000);
    const m = sceneToMap(p);
    expect(cellOfXY(m.x, m.y)).toEqual({ i: 415, j: 380 });
  });
});

describe('U10 · scene selection (16 §2.1, T-71 subset)', () => {
  const shackleton = latLonOfCell(415, 380);
  it('polar for demo-a, a mesh point and coordinates inside the mesh', () => {
    expect(chooseScene(-88.8, 123.4, 'ready')).toBe('polar');
    expect(chooseScene(shackleton.latDeg, shackleton.lonDeg, 'loading')).toBe('polar');
    expect(chooseScene(-87.2, 125.5, 'ready')).toBe('polar');
  });
  it('smooth Moon outside the mesh (Blue Ghost 1, Apollo 11) and when the DEM failed', () => {
    expect(chooseScene(18.562, 61.81, 'ready')).toBe('smooth');
    expect(chooseScene(0.674, 23.473, 'ready')).toBe('smooth');
    expect(chooseScene(-88.8, 123.4, 'error')).toBe('smooth');
  });
  it('the mesh rectangle: Peak near Cabeus B inside, a point at −80° outside', () => {
    expect(inPolarMesh(-83.6, -68.7)).toBe(true);
    const { y } = xyOfLatLon(-80, 0);
    expect(y).toBeGreaterThan(GRID.yMaxM);
    expect(inPolarMesh(-80, 0)).toBe(false);
  });
});

describe('U11 · quality tiers', () => {
  const base = { coarsePointer: false, widthPx: 1440, renderer: 'ANGLE (NVIDIA GeForce RTX 4060)', cores: 16, override: null };
  it('picks the tier from the device', () => {
    expect(pickTier(base)).toBe('alto');
    expect(pickTier({ ...base, coarsePointer: true })).toBe('bajo');
    expect(pickTier({ ...base, renderer: 'ANGLE (Google, SwiftShader Device)' })).toBe('bajo');
    expect(pickTier({ ...base, widthPx: 700 })).toBe('bajo');
    expect(pickTier({ ...base, cores: 4 })).toBe('medio');
    expect(pickTier({ ...base, renderer: 'SwiftShader', override: 'alto' })).toBe('alto');
  });
  it('drops after 2 s below 45 fps, at most once every 10 s', () => {
    const m = new FpsMonitor(false);
    let t = 0;
    const drops: number[] = [];
    for (let k = 0; k < 1500; k++) {
      t += 40; // 25 fps
      if (m.frame(40, t)) drops.push(t);
    }
    expect(drops.length).toBeGreaterThan(0);
    expect(drops[0]).toBeGreaterThanOrEqual(2000);
    for (let k = 1; k < drops.length; k++) expect(drops[k] - drops[k - 1]).toBeGreaterThanOrEqual(10_000);
    const fast = new FpsMonitor(false);
    for (let k = 0; k < 500; k++) expect(fast.frame(16, k * 16)).toBe(false);
    const locked = new FpsMonitor(true);
    for (let k = 0; k < 500; k++) expect(locked.frame(40, k * 40)).toBe(false);
  });
});

describe('U12 · texts', () => {
  const bad = /NaN|undefined|null|demo-a|grid:|\{/;
  it('description and status lines never show NaN, identifiers or placeholders', () => {
    const table = exampleTable();
    const mask = formulaMask('sine:0.6,3'); // the shape of demo-a's example mask (09 §13)
    const frame = siteFrame(-88.8, 123.4, mask.siteHeightM + mask.observerHeightM);
    for (const t of [1817078400, 1817078400 + 86_400 * 4]) {
      const sky = evaluate(table, frame, mask, t);
      const text = describeView({ letter: 'A', name: 'Demo A', latDeg: -88.8, lonDeg: 123.4, sky, mask, distM: 18_000, headingDeg: 74 });
      expect(text).not.toMatch(bad);
      expect(text).toContain('site A, Demo A');
      for (const s of [bodyStatus('sun', sky.sun.visible, sky.sun.elDeg), bodyStatus('earth', sky.earth.visible, sky.earth.elDeg)]) {
        expect(s).toMatch(/^[✓✕] (Sun|Earth) /);
        expect(s).not.toMatch(bad);
      }
    }
    expect(describeView({ letter: 'B', name: 'X', latDeg: 0, lonDeg: 0, sky: null, mask: null, distM: Number.NaN, headingDeg: 0 })).not.toMatch(bad);
  });
});
