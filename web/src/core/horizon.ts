// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Horizon masks in the web core (07_visibilidad.md §1–§2; 06_horizonte.md §4.1, §8, §9).
import { AZ_STEP_DEG, N_AZ, R_MOON_KM } from './constants';
import { enuBasis } from './frames';
import type { HorizonFile } from './types';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const R_M = R_MOON_KM * 1000;

/** One observer height of a horizon file (07 §1), with the site height used by the frame. */
export interface Mask {
  observerHeightM: number;
  /** Terrain height at the site (`site_height_m`; 0 on a smooth Moon). */
  siteHeightM: number;
  elDeg: Float64Array;
  distM: Float64Array;
  blkLatDeg: Float64Array;
  blkLonDeg: Float64Array;
  blkHeightM: Float64Array;
  minElDeg: number;
  maxElDeg: number;
}

export interface Blocker {
  azDeg: number;
  elDeg: number;
  distM: number;
  latDeg: number;
  lonDeg: number;
  heightM: number;
}

function minMax(a: Float64Array): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let j = 0; j < a.length; j++) {
    if (a[j] < lo) lo = a[j];
    if (a[j] > hi) hi = a[j];
  }
  return [lo, hi];
}

/** Builds a Mask from five 720-value vectors; min and max elevation are computed here. */
export function makeMask(
  observerHeightM: number,
  siteHeightM: number,
  v: { elDeg: ArrayLike<number>; distM: ArrayLike<number>; blkLatDeg: ArrayLike<number>; blkLonDeg: ArrayLike<number>; blkHeightM: ArrayLike<number> },
): Mask {
  const elDeg = Float64Array.from(v.elDeg);
  const [minElDeg, maxElDeg] = minMax(elDeg);
  return {
    observerHeightM,
    siteHeightM,
    elDeg,
    distM: Float64Array.from(v.distM),
    blkLatDeg: Float64Array.from(v.blkLatDeg),
    blkLonDeg: Float64Array.from(v.blkLonDeg),
    blkHeightM: Float64Array.from(v.blkHeightM),
    minElDeg,
    maxElDeg,
  };
}

/** Mask of `horizon/<site>.json` for one observer height, or null if the file does not have it. */
export function maskFromFile(file: HorizonFile, observerHeightM: number): Mask | null {
  const m = file.masks.find((x) => x.observer_height_m === observerHeightM);
  if (!m) return null;
  return makeMask(observerHeightM, file.site_height_m, {
    elDeg: m.el_deg,
    distM: m.dist_m,
    blkLatDeg: m.blk_lat_deg,
    blkLonDeg: m.blk_lon_deg,
    blkHeightM: m.blk_height_m,
  });
}

/** Azimuth reduced to [0, 360) the way 07 §2 writes it. */
function wrapAz(azDeg: number): number {
  return ((azDeg % 360) + 360) % 360;
}

/** Periodic linear interpolation between the two neighbouring mask samples (07 §2). */
export function horizonAt(el: ArrayLike<number>, azDeg: number): number {
  const x = wrapAz(azDeg) / AZ_STEP_DEG;
  const j = Math.floor(x);
  const f = x - j;
  return (1 - f) * el[j % N_AZ] + f * el[(j + 1) % N_AZ];
}

/** Nearest mask sample, not interpolated (07 §2). Rounding is half up: floor(x + 0.5). */
export function blockerAt(mask: Mask, azDeg: number): Blocker {
  const j = Math.floor(wrapAz(azDeg) / AZ_STEP_DEG + 0.5) % N_AZ;
  return {
    azDeg: AZ_STEP_DEG * j,
    elDeg: mask.elDeg[j],
    distM: mask.distM[j],
    latDeg: mask.blkLatDeg[j],
    lonDeg: mask.blkLonDeg[j],
    heightM: mask.blkHeightM[j],
  };
}

/** Longitude in (−180, 180] (convention of every contract file). */
export function wrap180(lonDeg: number): number {
  const r = ((lonDeg % 360) + 360) % 360;
  return r > 180 ? r - 360 : r;
}

/** Point at great-circle distance `distM` from the site in azimuth `azDeg` (06 §4.1). */
export function pointAt(latDeg: number, lonDeg: number, azDeg: number, distM: number): { latDeg: number; lonDeg: number } {
  const phi = latDeg * DEG;
  const lam = lonDeg * DEG;
  const u0 = [Math.cos(phi) * Math.cos(lam), Math.cos(phi) * Math.sin(lam), Math.sin(phi)];
  const { e, n } = enuBasis(latDeg, lonDeg);
  const a = azDeg * DEG;
  const th = distM / R_M;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const p = [0, 1, 2].map((k) => c * u0[k] + s * (Math.cos(a) * n[k] + Math.sin(a) * e[k]));
  return {
    latDeg: Math.atan2(p[2], Math.sqrt(p[0] * p[0] + p[1] * p[1])) * RAD,
    lonDeg: wrap180(Math.atan2(p[1], p[0]) * RAD),
  };
}

/** Smooth-Moon horizon for an observer height: elevation (°) and tangent distance (m) (06 §9). */
export function smoothHorizon(observerHeightM: number): { elDeg: number; distM: number } {
  const dip = Math.acos(R_M / (R_M + observerHeightM));
  return { elDeg: -dip * RAD + 0, distM: R_M * dip };
}

/**
 * Smooth-Moon mask (06 §9): the same dip in every azimuth. The blocking points need the site;
 * without it they are NaN (only the elevations are meaningful).
 */
export function smoothMask(observerHeightM: number, latDeg = Number.NaN, lonDeg = Number.NaN): Mask {
  const { elDeg, distM } = smoothHorizon(observerHeightM);
  const lat = new Float64Array(N_AZ);
  const lon = new Float64Array(N_AZ);
  for (let j = 0; j < N_AZ; j++) {
    if (Number.isNaN(latDeg) || Number.isNaN(lonDeg)) {
      lat[j] = Number.NaN;
      lon[j] = Number.NaN;
    } else {
      const p = pointAt(latDeg, lonDeg, AZ_STEP_DEG * j, distM);
      lat[j] = p.latDeg;
      lon[j] = p.lonDeg;
    }
  }
  return makeMask(observerHeightM, 0, {
    elDeg: new Float64Array(N_AZ).fill(elDeg),
    distM: new Float64Array(N_AZ).fill(distM),
    blkLatDeg: lat,
    blkLonDeg: lon,
    blkHeightM: new Float64Array(N_AZ),
  });
}

/**
 * Synthetic masks of the shared vectors (07 §12.3), from their id: `flat:<deg>`,
 * `tilt:<deg>` = deg·(az − 180)/180, `sine:<amp>,<k>` = amp·sin(k·az). Observer 0 m, site height 0;
 * no blocking points (NaN).
 */
export function formulaMask(id: string): Mask {
  const [kind, args = ''] = id.split(':');
  const p = args.split(',').map(Number);
  const el = new Float64Array(N_AZ);
  for (let j = 0; j < N_AZ; j++) {
    const az = AZ_STEP_DEG * j;
    if (kind === 'flat') el[j] = p[0];
    else if (kind === 'tilt') el[j] = (p[0] * (az - 180)) / 180;
    else if (kind === 'sine') el[j] = p[0] * Math.sin(p[1] * az * DEG);
    else throw new Error(`Unknown formula mask ${id}`);
  }
  if (p.some((x) => !Number.isFinite(x))) throw new Error(`Bad formula mask ${id}`);
  const nan = new Float64Array(N_AZ).fill(Number.NaN);
  return makeMask(0, 0, { elDeg: el, distM: nan, blkLatDeg: nan, blkLonDeg: nan, blkHeightM: nan });
}

/**
 * Cross-section coordinates (06 §8): vertical plane of the observer where lines of sight are
 * straight lines from the origin. x horizontal and y vertical relative to the eye, metres.
 */
export function localXY(dM: number, hM: number, hSiteM: number, hObsM: number): { x: number; y: number } {
  const th = dM / R_M;
  const s = Math.sin(th / 2);
  return {
    x: (R_M + hM) * Math.sin(th),
    y: hM - hSiteM - hObsM - 2 * (R_M + hM) * s * s,
  };
}
