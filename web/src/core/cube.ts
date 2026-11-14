// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Horizon cube chunks (09_contrato_datos.md §10.2) and the mask of a mesh point (08_mapa_polar.md §7).
import { CONTRACT_MAJOR, N_AZ } from './constants';
import { latLonOfCell } from './grid';
import { makeMask, pointAt, type Mask } from './horizon';
import { DataError } from './loaders';

export const CUBE_MAGIC = 'LLSNCUB1';
export const POINTS_PER_CHUNK = 256;
export const CHUNK_BYTES = 32 + 2 * POINTS_PER_CHUNK + 3 * POINTS_PER_CHUNK * N_AZ; // 553,504
export const HEIGHT_NODATA = -32768;
const DIST_BASE_M = 20;
const DIST_RATIO = 1.04;

export interface Chunk {
  row: number;
  col: number;
  lawId: number;
  observerHeightM: number;
  elScaleDeg: number;
  nComputed: number;
  heightM: Int16Array;
  /** int16[256][720]: first value q[0], then differences (cyclic int16 arithmetic). */
  elDelta: Int16Array;
  distCode: Uint8Array;
}

/** Decodes a decompressed chunk, checking size, magic, version and dimensions. */
export function decodeChunk(url: string, bytes: Uint8Array): Chunk {
  if (bytes.byteLength !== CHUNK_BYTES) throw new DataError('format', url, `Chunk of ${bytes.byteLength} B, expected ${CHUNK_BYTES} B`);
  const magic = String.fromCharCode(...bytes.subarray(0, 8));
  if (magic !== CUBE_MAGIC) throw new DataError('format', url, `Header ${magic}`);
  const b = bytes.byteOffset % 2 === 0 ? bytes : bytes.slice();
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const u16 = (o: number) => dv.getUint16(o, true);
  if (u16(8) !== CONTRACT_MAJOR) throw new DataError('contract', url, `Chunk contract version ${u16(8)}`);
  if (u16(16) !== 16 || u16(18) !== N_AZ) throw new DataError('format', url, `n_side ${u16(16)}, n_az ${u16(18)}`);
  return {
    row: u16(12),
    col: u16(14),
    lawId: u16(20),
    observerHeightM: u16(22) / 100,
    elScaleDeg: dv.getFloat32(24, true),
    nComputed: dv.getUint32(28, true),
    heightM: new Int16Array(b.buffer, b.byteOffset + 32, POINTS_PER_CHUNK),
    elDelta: new Int16Array(b.buffer, b.byteOffset + 32 + 2 * POINTS_PER_CHUNK, POINTS_PER_CHUNK * N_AZ),
    distCode: new Uint8Array(b.buffer, b.byteOffset + 32 + 2 * POINTS_PER_CHUNK + 2 * POINTS_PER_CHUNK * N_AZ, POINTS_PER_CHUNK * N_AZ),
  };
}

/** Elevations of point p: cumulative sum of the differences in Int16 (wraps like int16), × 0.01. */
export function pointElevations(c: Chunk, p: number): Float64Array {
  const q = new Int16Array(N_AZ);
  const base = p * N_AZ;
  q[0] = c.elDelta[base];
  for (let j = 1; j < N_AZ; j++) q[j] = q[j - 1] + c.elDelta[base + j]; // Int16Array wraps on store
  const el = new Float64Array(N_AZ);
  for (let j = 0; j < N_AZ; j++) el[j] = q[j] * 0.01;
  return el;
}

export function pointComputed(c: Chunk, p: number): boolean {
  return c.heightM[p] !== HEIGHT_NODATA;
}

/**
 * Mask of mesh cell (i, j) from its chunk (08 §7): elevations, distances `20 × 1.04^code`, blocking
 * points walked from the cell centre, blocking heights unknown (NaN), site height from the chunk.
 */
export function maskOfCell(c: Chunk, i: number, j: number): Mask | null {
  const p = 16 * (j % 16) + (i % 16);
  if (!pointComputed(c, p)) return null;
  const { latDeg, lonDeg } = latLonOfCell(i, j);
  const el = pointElevations(c, p);
  const dist = new Float64Array(N_AZ);
  const lat = new Float64Array(N_AZ);
  const lon = new Float64Array(N_AZ);
  for (let k = 0; k < N_AZ; k++) {
    dist[k] = DIST_BASE_M * DIST_RATIO ** c.distCode[p * N_AZ + k];
    const b = pointAt(latDeg, lonDeg, 0.5 * k, dist[k]);
    lat[k] = b.latDeg;
    lon[k] = b.lonDeg;
  }
  return makeMask(c.observerHeightM, c.heightM[p], {
    elDeg: el,
    distM: dist,
    blkLatDeg: lat,
    blkLonDeg: lon,
    blkHeightM: new Float64Array(N_AZ).fill(Number.NaN),
  });
}
