// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Radial terrain around a site (16_vista_3d.md §4.2–§4.4): heights by azimuth and distance, read from
// the horizon profile (case b), the flat ground of the horizon ring (case c), and the ring panels
// drawn from the mask. Pure: the mesh worker, the ground functions and the tests use it.
import { profileBinDistance, type LawName } from '../../core/law';
import { PROFILE_NODATA } from '../../core/loaders';
import type { Mask } from '../../core/horizon';
import { R_M, add, dot, fromScene, norm, scale, toScene, unit, type SceneFrame, type V3 } from './frame';
import type { TileMesh } from './meshes';

/** Azimuths and bins of a profile file (09 §6). */
export const PROFILE_AZ = 720;
export const PROFILE_BINS = 512;
/** Radius of the profile mesh and of the smooth caps: beyond it, the sphere (§4.2). */
export const RADIAL_MAX_M = 300_000;
/** Horizon ring scene (§4.3): flat ground at the site height out to this radius, then down to the sphere. */
export const RING_FLAT_M = 30_000;
export const RING_RAMP_M = 6_000;

/**
 * Heights (m above the sphere) on a polar grid around a site: `nAz` azimuths (j·360/nAz degrees from
 * north toward east) × `dist.length` distances, `heights[j·nb + b]`, and the height at the site.
 */
export interface RadialTerrain {
  nAz: number;
  dist: Float64Array;
  heights: Float32Array;
  centreH: number;
}

/** Drawing distances of the 512 bins of a profile with law `law` (06 §8). */
export function profileDistances(law: LawName): Float64Array {
  return Float64Array.from({ length: PROFILE_BINS }, (_, b) => profileBinDistance(law, b));
}

/**
 * Profile heights with the holes filled (§4.2): linear in `b` between the valid neighbours, the nearest
 * valid value at the ends, the smooth Moon (0 m) for an azimuth without any data.
 */
export function fillProfile(raw: Int16Array, nAz = PROFILE_AZ, nb = PROFILE_BINS): { heights: Float32Array; filled: number } {
  const out = new Float32Array(nAz * nb);
  let filled = 0;
  for (let j = 0; j < nAz; j++) {
    const row = j * nb;
    let prev = -1;
    for (let b = 0; b < nb; b++) {
      const v = raw[row + b];
      if (v === PROFILE_NODATA) continue;
      out[row + b] = v;
      if (prev < 0) for (let k = 0; k < b; k++) out[row + k] = v;
      else for (let k = prev + 1; k < b; k++) out[row + k] = raw[row + prev] + ((v - raw[row + prev]) * (k - prev)) / (b - prev);
      prev = b;
    }
    if (prev < 0) out.fill(0, row, row + nb);
    else for (let k = prev + 1; k < nb; k++) out[row + k] = raw[row + prev];
    for (let b = 0; b < nb; b++) if (raw[row + b] === PROFILE_NODATA) filled++;
  }
  return { heights: out, filled };
}

/** Every `step`-th azimuth (the medium and low tiers draw one of every two, §4.2). */
export function everyNthAzimuth(t: RadialTerrain, step: number): RadialTerrain {
  if (step <= 1) return t;
  const nb = t.dist.length;
  const nAz = Math.floor(t.nAz / step);
  const heights = new Float32Array(nAz * nb);
  for (let j = 0; j < nAz; j++) heights.set(t.heights.subarray(j * step * nb, (j * step + 1) * nb), j * nb);
  return { nAz, dist: t.dist, heights, centreH: t.centreH };
}

/** Fractional bin of a distance: −1 … 0 between the site and the first bin, NaN beyond the last. */
export function binOf(dist: Float64Array, d: number): number {
  const nb = dist.length;
  if (d < dist[0]) return d / dist[0] - 1;
  if (d > dist[nb - 1]) return Number.NaN;
  let lo = 0;
  let hi = nb - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (dist[mid] <= d) lo = mid;
    else hi = mid;
  }
  return lo + (d - dist[lo]) / (dist[hi] - dist[lo]);
}

/** Height of the radial terrain at distance `d` (m) and azimuth `azDeg`; 0 (the sphere) beyond it. */
export function radialHeightAt(t: RadialTerrain, d: number, azDeg: number): number {
  const fb = binOf(t.dist, d);
  if (Number.isNaN(fb)) return 0;
  const nb = t.dist.length;
  const fa = ((((azDeg % 360) + 360) % 360) / 360) * t.nAz;
  const j0 = Math.floor(fa) % t.nAz;
  const j1 = (j0 + 1) % t.nAz;
  const wa = fa - Math.floor(fa);
  const at = (j: number) => {
    if (fb < 0) return t.centreH + (t.heights[j * nb] - t.centreH) * (fb + 1);
    const b0 = Math.min(Math.floor(fb), nb - 2);
    const wb = fb - b0;
    return t.heights[j * nb + b0] * (1 - wb) + t.heights[j * nb + b0 + 1] * wb;
  };
  return at(j0) * (1 - wa) + at(j1) * wa;
}

/** Distance along the surface (m) and azimuth (deg) of a MOON_ME point seen from the anchor of `f`. */
export function polarOfMe(f: SceneFrame, p: V3): { d: number; azDeg: number } {
  const u = unit(p);
  const th = Math.acos(Math.max(-1, Math.min(1, dot(u, f.u))));
  let az = (Math.atan2(dot(u, f.e), dot(u, f.n)) * 180) / Math.PI;
  if (az < 0) az += 360;
  return { d: th * R_M, azDeg: az };
}

/** MOON_ME position of the point at distance `d` and azimuth `azDeg` from the anchor, `h` above the sphere. */
export function meOfPolar(f: SceneFrame, d: number, azDeg: number, h: number): V3 {
  const a = (azDeg * Math.PI) / 180;
  const th = d / R_M;
  const T = add(scale(f.n, Math.cos(a)), scale(f.e, Math.sin(a)));
  return scale(add(scale(f.u, Math.cos(th)), scale(T, Math.sin(th))), R_M + h);
}

/** Terrain of the profile scene (case b) from a decoded profile. */
export function profileTerrain(raw: Int16Array, law: LawName, siteHeightM: number): RadialTerrain & { filled: number } {
  const { heights, filled } = fillProfile(raw);
  return { nAz: PROFILE_AZ, dist: profileDistances(law), heights, centreH: siteHeightM, filled };
}

/** Ground height of the horizon ring scene (case c) at distance d: flat, then a ramp to the sphere. */
export function ringGroundAt(siteHeightM: number, d: number): number {
  if (d <= RING_FLAT_M) return siteHeightM;
  if (d >= RING_FLAT_M + RING_RAMP_M) return 0;
  return siteHeightM * (1 - (d - RING_FLAT_M) / RING_RAMP_M);
}

/**
 * Top of the ring panel of mask sample j (§4.3): the blocking height, or, for a mesh point (NaN), the
 * height that gives the mask's elevation at that distance, h = siteH + hObs + d·tan(el) + d²/(2R).
 */
export function ringTopAt(mask: Mask, j: number): number {
  const h = mask.blkHeightM[j];
  if (Number.isFinite(h)) return h;
  const d = mask.distM[j];
  return mask.siteHeightM + mask.observerHeightM + d * Math.tan((mask.elDeg[j] * Math.PI) / 180) + (d * d) / (2 * R_M);
}

/**
 * Vertical panels of the horizon ring (§4.3): for each mask sample with a blocking distance, a quad
 * 0.5° wide from the ground (sunk 50 m) up to `ringTopAt`, facing the site. One mesh, offset at the site.
 */
export function buildRingPanels(f: SceneFrame, mask: Mask): TileMesh {
  const n = mask.distM.length;
  const step = 360 / n;
  const quads: { a0: number; a1: number; d: number; lo: number; hi: number }[] = [];
  for (let j = 0; j < n; j++) {
    const d = mask.distM[j];
    if (!Number.isFinite(d) || d <= 0) continue;
    const hi = ringTopAt(mask, j);
    const lo = ringGroundAt(mask.siteHeightM, d) - 50;
    if (!(hi > lo)) continue;
    quads.push({ a0: (j - 0.5) * step, a1: (j + 0.5) * step, d, lo, hi });
  }
  const position = new Float32Array(quads.length * 12);
  const normal = new Float32Array(quads.length * 12);
  const uv = new Float32Array(quads.length * 8);
  const index = new Uint32Array(quads.length * 6);
  const offset = toScene(f, scale(f.u, R_M + mask.siteHeightM));
  quads.forEach((q, k) => {
    const corners = [
      meOfPolar(f, q.d, q.a0, q.lo),
      meOfPolar(f, q.d, q.a1, q.lo),
      meOfPolar(f, q.d, q.a0, q.hi),
      meOfPolar(f, q.d, q.a1, q.hi),
    ].map((p) => toScene(f, p));
    // Facing the site: the horizontal direction back toward the anchor.
    const mid = (q.a0 + q.a1) / 2;
    const out = toScene(f, meOfPolar(f, q.d + 1, mid, q.lo));
    const nrm = unit([corners[0][0] - out[0], corners[0][1] - out[1], corners[0][2] - out[2]]);
    corners.forEach((c, v) => {
      position.set([c[0] - offset[0], c[1] - offset[1], c[2] - offset[2]], 12 * k + 3 * v);
      normal.set(nrm, 12 * k + 3 * v);
    });
    const b = 4 * k;
    index.set([b, b + 2, b + 1, b + 1, b + 2, b + 3], 6 * k);
  });
  return { offset, position, normal, uv, index };
}

/** Scene point of the radial terrain under a scene point (for the ground functions). */
export function radialSurface(f: SceneFrame, t: RadialTerrain, s: V3): { h: number; clearance: number; surface: V3 } {
  const me = fromScene(f, s);
  const { d, azDeg } = polarOfMe(f, me);
  const h = radialHeightAt(t, d, azDeg);
  const r = norm(me);
  return { h, clearance: r - R_M - h, surface: toScene(f, scale(me, (R_M + h) / r)) };
}
