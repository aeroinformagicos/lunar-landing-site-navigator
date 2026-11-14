// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Cross-section geometry (10_interfaz.md §6.3, 06_horizonte.md §8, F12): the observer's local vertical
// plane where lines of sight are straight lines from the eye. Pure; tested without a DOM.
import { AZ_STEP_DEG, N_AZ, R_MOON_KM } from '../../core/constants';
import type { Blocker } from '../../core/horizon';
import { localXY } from '../../core/horizon';
import { profileBinDistance } from '../../core/law';
import { PROFILE_NODATA, type Profile } from '../../core/loaders';

const DEG = Math.PI / 180;
const R_M = R_MOON_KM * 1000;

/** Minimum horizontal range and the `Full 300 km` range (10 §6.3). */
export const MIN_RANGE_M = 5000;
export const FULL_RANGE_M = 300_000;
/** `Fit to blocker`: 1.25 × the blocker distance. */
export const FIT_FACTOR = 1.25;

export interface XY {
  x: number;
  y: number;
}

/** Profile azimuth row nearest to `azDeg` (the mask sample `blocker_at` uses: floor(x + 0.5)). */
export function profileRow(azDeg: number): number {
  const a = ((azDeg % 360) + 360) % 360;
  return Math.floor(a / AZ_STEP_DEG + 0.5) % N_AZ;
}

/** Terrain points of row `j` in the local plane (metres), skipping empty bins. */
export function profilePoints(p: Profile, j: number, observerHeightM: number): (XY & { bin: number; d: number })[] {
  const out = [];
  for (let b = 0; b < p.nBins; b++) {
    const h = p.heightM[j * p.nBins + b];
    if (h === PROFILE_NODATA) continue;
    const d = profileBinDistance(p.law, b, p.nBins);
    out.push({ ...localXY(d, h, p.siteHeightM, observerHeightM), bin: b, d });
  }
  return out;
}

/** Smooth sphere through the site (dashed `Smooth Moon` curve), sampled up to `rangeM`. */
export function sphereCurve(siteHeightM: number, observerHeightM: number, rangeM: number, n = 120): XY[] {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(localXY((rangeM * i) / n, siteHeightM, siteHeightM, observerHeightM));
  return out;
}

/** Elevation (degrees) of a point of the plane seen from the eye. */
export function elevationOf(p: XY): number {
  return Math.atan2(p.y, p.x) / DEG;
}

/** Blocking point in the plane, from the mask (exact; the profile is reduced). */
export function blockerPoint(b: Blocker, siteHeightM: number, observerHeightM: number): XY {
  return localXY(b.distM, b.heightM, siteHeightM, observerHeightM);
}

/** Horizontal range: `Fit to blocker` (1.25 × distance, at least 5 km) or `Full 300 km`. */
export function rangeFor(mode: 'fit' | 'full', blockerDistM: number): number {
  if (mode === 'full' || !Number.isFinite(blockerDistM)) return mode === 'full' ? FULL_RANGE_M : MIN_RANGE_M;
  return Math.min(FULL_RANGE_M, Math.max(MIN_RANGE_M, FIT_FACTOR * blockerDistM));
}

/** 1, 2, 5 × 10ⁿ at or below `x` (at least 1). */
export function niceFloor(x: number): number {
  if (!(x > 1)) return 1;
  const p = 10 ** Math.floor(Math.log10(x));
  const m = x / p;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
}

export interface Frame {
  /** Metres → pixels. */
  px(p: XY): XY;
  exaggeration: number;
  rangeM: number;
  yMinM: number;
  yMaxM: number;
}

/**
 * Plot frame: x from 0 to `rangeM` across `w` px; y scaled by `exaggeration × (w / rangeM)` so the
 * points of interest (terrain, sphere, eye, blocker) fill the height with 10 % padding.
 */
export function plotFrame(points: XY[], rangeM: number, w: number, h: number): Frame {
  let lo = 0;
  let hi = 0;
  for (const p of points) {
    if (p.x < 0 || p.x > rangeM || !Number.isFinite(p.y)) continue;
    lo = Math.min(lo, p.y);
    hi = Math.max(hi, p.y);
  }
  const span = Math.max(hi - lo, 1);
  const pad = 0.1 * span;
  const sx = w / rangeM;
  const exaggeration = niceFloor(h / (span + 2 * pad) / sx);
  const sy = sx * exaggeration;
  const mid = (hi + lo) / 2;
  return {
    px: (p) => ({ x: p.x * sx, y: h / 2 - (p.y - mid) * sy }),
    exaggeration,
    rangeM,
    yMinM: mid - h / 2 / sy,
    yMaxM: mid + h / 2 / sy,
  };
}

/** A straight line of sight from the eye at elevation `elDeg`, out to `rangeM`. */
export function sightLine(elDeg: number, rangeM: number): [XY, XY] {
  return [
    { x: 0, y: 0 },
    { x: rangeM, y: rangeM * Math.tan(elDeg * DEG) },
  ];
}

/** Distance (m) to the tangent point of the smooth sphere for an observer height (06 §9). */
export function smoothTangentDistance(observerHeightM: number): number {
  return R_M * Math.acos(R_M / (R_M + observerHeightM));
}

// ---- Texts (10 §6.3) ------------------------------------------------------------------------

/** `Blocking point: 41.2 km away, 1,930 m above the site` (`below` when lower). */
export function blockerText(distM: number, relHeightM: number): string {
  const km = (distM / 1000).toFixed(1);
  const h = Math.round(Math.abs(relHeightM)).toLocaleString('en-US');
  return `Blocking point: ${km} km away, ${h} m ${relHeightM >= 0 ? 'above' : 'below'} the site`;
}

/** `Sun centre is 0.33° above the terrain here.` / `below`. */
export function centreText(body: 'Sun' | 'Earth', marginDeg: number): string {
  return `${body} centre is ${Math.abs(marginDeg).toFixed(2)}° ${marginDeg > 0 ? 'above' : 'below'} the terrain here.`;
}

/** `Smooth Moon: the horizon is the lunar sphere, 2.6 km away.` */
export function smoothText(observerHeightM: number): string {
  return `Smooth Moon: the horizon is the lunar sphere, ${(smoothTangentDistance(observerHeightM) / 1000).toFixed(1)} km away.`;
}

/** Axis ticks every 1, 2, 5 × 10ⁿ giving at most `maxTicks` labels. */
export function ticks(min: number, max: number, maxTicks: number): number[] {
  const raw = (max - min) / Math.max(1, maxTicks);
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? 10 * p;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}
