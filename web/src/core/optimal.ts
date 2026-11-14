// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Optimal site (08_mapa_polar.md §10, F32): «most Sun + Earth in a period» from the layers, and
// «longest continuous Sun + Earth from a date» on the compact masks (run in a Web Worker).
// Pure TypeScript, no DOM: the worker and the main thread share it.
import { CONTRACT_MAJOR } from './constants';
import { bodyVectorsInto, findSegment, type EphemerisTable } from './ephemeris';
import { azelFromVector, siteFrame } from './frames';
import { GRID, cellCentreXY, latLonOfCell } from './grid';

/** Cells within 1,000 m of an earlier result are skipped (08 §10.1): 500·√(Δi² + Δj²) ≤ 1000. */
export const NEIGHBOUR_M = 1000;
export const TOP_N = 10;
const LAYER_NODATA = 255;
const PCT_PER_UNIT = 0.4;

export type Box = [number, number, number, number];

export interface PeriodHit {
  i: number;
  j: number;
  latDeg: number;
  lonDeg: number;
  bothPct: number;
  sunPct: number;
  earthPct: number;
}

function inBoxes(i: number, j: number, boxes: readonly Box[] | null): boolean {
  if (!boxes) return true;
  const { x, y } = cellCentreXY(i, j);
  return boxes.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
}

function nearAny(i: number, j: number, out: readonly { i: number; j: number }[]): boolean {
  return out.some((o) => GRID.cellM * Math.hypot(o.i - i, o.j - j) <= NEIGHBOUR_M);
}

/**
 * 08 §10.1 on one period's layer bytes (`uint8[3][672][752]`, bands sun, earth, both): cells with data
 * that pass the filter (`boxes` = region boxes, null = every cell), by both, sun, earth desc, then
 * j, i asc, skipping neighbours of earlier results.
 */
export function bestByPeriod(layer: Uint8Array, bands: readonly string[], boxes: readonly Box[] | null, topN = TOP_N): PeriodHit[] {
  const n = GRID.nx * GRID.ny;
  const bi = { sun: bands.indexOf('sun'), earth: bands.indexOf('earth'), both: bands.indexOf('both') };
  if (bi.both < 0) return [];
  const cand: number[] = [];
  for (let k = 0; k < n; k++) {
    if (layer[bi.both * n + k] === LAYER_NODATA) continue;
    if (inBoxes(k % GRID.nx, Math.floor(k / GRID.nx), boxes)) cand.push(k);
  }
  const v = (band: number, k: number) => (band < 0 ? 0 : layer[band * n + k]);
  cand.sort((a, b) => v(bi.both, b) - v(bi.both, a) || v(bi.sun, b) - v(bi.sun, a) || v(bi.earth, b) - v(bi.earth, a) || a - b);
  const out: PeriodHit[] = [];
  for (const k of cand) {
    const i = k % GRID.nx;
    const j = Math.floor(k / GRID.nx);
    if (nearAny(i, j, out)) continue;
    const { latDeg, lonDeg } = latLonOfCell(i, j);
    const pct = (band: number) => (band < 0 || v(band, k) === LAYER_NODATA ? Number.NaN : v(band, k) * PCT_PER_UNIT);
    out.push({ i, j, latDeg, lonDeg, bothPct: pct(bi.both), sunPct: pct(bi.sun), earthPct: pct(bi.earth) });
    if (out.length === topN) break;
  }
  return out;
}

// ---- Compact masks (09 §11) ------------------------------------------------------------------

export const COMPACT_MAGIC = 'LLSNCMP1';
export const COMPACT_N_AZ = 180;

export interface Compact {
  nPoints: number;
  i: Uint16Array;
  j: Uint16Array;
  heightM: Int16Array;
  region: Uint8Array;
  /** int16[n][180], elevation × 100 of the ±1° maximum around azimuth 2·b. */
  elQ: Int16Array;
}

export function decodeCompact(bytes: Uint8Array): Compact {
  const head = String.fromCharCode(...bytes.subarray(0, 8));
  if (head !== COMPACT_MAGIC) throw new Error(`Compact masks: header ${head}`);
  const b = bytes.byteOffset % 2 === 0 ? bytes : bytes.slice();
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (dv.getUint16(8, true) !== CONTRACT_MAJOR) throw new Error('Compact masks: contract version');
  const n = dv.getUint32(12, true);
  if (dv.getUint16(16, true) !== COMPACT_N_AZ || dv.getUint16(18, true) !== 200) throw new Error('Compact masks: azimuth grid');
  if (b.byteLength !== 32 + 368 * n) throw new Error(`Compact masks: ${b.byteLength} B for ${n} points`);
  const o = b.byteOffset;
  return {
    nPoints: n,
    i: new Uint16Array(b.buffer, o + 32, n),
    j: new Uint16Array(b.buffer, o + 32 + 2 * n, n),
    heightM: new Int16Array(b.buffer, o + 32 + 4 * n, n),
    region: new Uint8Array(b.buffer, o + 32 + 6 * n, n),
    elQ: new Int16Array(b.buffer, o + 32 + 8 * n, n * COMPACT_N_AZ),
  };
}

// ---- «Longest continuous Sun + Earth from a date» (08 §10.2) -----------------------------------

export interface DateHit {
  i: number;
  j: number;
  latDeg: number;
  lonDeg: number;
  regionIndex: number;
  hours: number;
  capped: boolean;
}

export interface DateResult {
  top: DateHit[];
  evaluated: number;
  /** K: steps of 1 h actually searched (90 days unless the table ends first). */
  maxHours: number;
}

/** Hourly Sun and Earth vectors from t0, K + 1 samples; throws RangeError outside the table. */
export function hourlyVectors(table: EphemerisTable, t0: number, maxDays: number): { K: number; v: Float64Array } {
  const seg = findSegment(table, t0);
  if (!seg) throw new RangeError('Date outside the supported range (1969–1972 and 2024–2044).');
  const K = Math.min(maxDays * 24, Math.floor((seg.validToUnix - t0) / 3600));
  const v = new Float64Array(6 * (K + 1));
  const tmp = new Float64Array(6);
  for (let k = 0; k <= K; k++) v.set(bodyVectorsInto(table, t0 + 3600 * k, tmp), 6 * k);
  return { K, v };
}

/** Compact horizon at an azimuth: bin round(az / 2) mod 180, × 0.01. */
function compactHorizon(c: Compact, q: number, azDeg: number): number {
  return 0.01 * c.elQ[q * COMPACT_N_AZ + (Math.floor(azDeg / 2 + 0.5) % COMPACT_N_AZ)];
}

/** Hours from t0 while both Sun and Earth stay above the compact horizon of point q (≤ K). */
export function hoursBoth(c: Compact, q: number, K: number, v: Float64Array): { hours: number; capped: boolean } {
  const { latDeg, lonDeg } = latLonOfCell(c.i[q], c.j[q]);
  const f = siteFrame(latDeg, lonDeg, c.heightM[q] + 2);
  let k = 0;
  for (; k <= K; k++) {
    const o = 6 * k;
    const s = azelFromVector(v[o] - f.p[0], v[o + 1] - f.p[1], v[o + 2] - f.p[2], f);
    if (s.elDeg <= compactHorizon(c, q, s.azDeg)) break;
    const e = azelFromVector(v[o + 3] - f.p[0], v[o + 4] - f.p[1], v[o + 5] - f.p[2], f);
    if (e.elDeg <= compactHorizon(c, q, e.azDeg)) break;
  }
  return { hours: Math.min(k, K), capped: k > K };
}

/**
 * The worker algorithm of 08 §10.2: every point of the region filter (null = all), then the 10 best
 * by hours desc (ties j, i asc) with the same 1,000 m neighbour suppression. `onProgress` every 256.
 */
export function longestBothFrom(
  c: Compact,
  table: EphemerisTable,
  t0: number,
  maxDays: number,
  regionIndex: number | null,
  onProgress?: (done: number, total: number) => void,
): DateResult {
  const { K, v } = hourlyVectors(table, t0, maxDays);
  const points: number[] = [];
  for (let q = 0; q < c.nPoints; q++) if (regionIndex === null || c.region[q] === regionIndex) points.push(q);
  const hours = new Float64Array(c.nPoints);
  const capped = new Uint8Array(c.nPoints);
  points.forEach((q, n) => {
    const h = hoursBoth(c, q, K, v);
    hours[q] = h.hours;
    capped[q] = h.capped ? 1 : 0;
    if ((n + 1) % 256 === 0) onProgress?.(n + 1, points.length);
  });
  onProgress?.(points.length, points.length);
  points.sort((a, b) => hours[b] - hours[a] || c.j[a] - c.j[b] || c.i[a] - c.i[b]);
  const top: DateHit[] = [];
  for (const q of points) {
    if (nearAny(c.i[q], c.j[q], top)) continue;
    const { latDeg, lonDeg } = latLonOfCell(c.i[q], c.j[q]);
    top.push({ i: c.i[q], j: c.j[q], latDeg, lonDeg, regionIndex: c.region[q], hours: hours[q], capped: capped[q] === 1 });
    if (top.length === TOP_N) break;
  }
  return { top, evaluated: points.length, maxHours: K };
}
