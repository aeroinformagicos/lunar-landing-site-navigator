// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Ephemeris table reader and 4-point Lagrange interpolation (05_efemerides.md §4.3, §4.5, §4.6).
// Same algorithm as pipeline/ephem/interp.py: float64 arithmetic over the float32 samples.
import { EPHEMERIS_BYTES } from './constants';
import { contractMajor, DataError, joinUrl, loader as defaultLoader, type Loader } from './loaders';

export interface Segment {
  id: string;
  t0Unix: number;
  n: number;
  byteOffset: number;
  validFromUnix: number;
  validToUnix: number;
}

export interface EphemerisTable {
  stepS: number;
  segments: Segment[];
  /** Records of 6 float32 (sun_x, sun_y, sun_z, earth_x, earth_y, earth_z), km, MOON_ME. */
  data: Float32Array;
}

/** `ephemeris.meta.json` (09_contrato_datos.md §3.2), only the fields the reader uses. */
export interface EphemerisMeta {
  contract_version: string;
  frame: string;
  abcorr: string;
  record_bytes: number;
  step_s: number;
  segments: { id: string; t0_unix: number; n: number; byte_offset: number }[];
  synthetic: boolean;
}

export const RECORD_FLOATS = 6;
export const RECORD_BYTES = 24;
export const STEP_S = 3600;

/** Text of `error.range` (10_interfaz.md §7); the UI shows it as is. */
export const OUT_OF_RANGE = 'Date outside the supported range (1969–1972 and 2024–2044).';

export function assertLittleEndian(): void {
  if (new Uint8Array(new Uint16Array([1]).buffer)[0] !== 1) throw new Error('Unsupported platform (big-endian).');
}

export function validateEphemerisMeta(url: string, json: unknown): EphemerisMeta {
  const m = json as EphemerisMeta;
  if (contractMajor(m?.contract_version) !== 1) {
    throw new DataError('contract', url, `Unsupported contract version ${String(m?.contract_version)}`);
  }
  const bad = (msg: string): never => {
    throw new DataError('format', url, msg);
  };
  if (m.frame !== 'MOON_ME') bad(`frame ${m.frame}, expected MOON_ME`);
  if (m.abcorr !== 'LT+S') bad(`abcorr ${m.abcorr}, expected LT+S`);
  if (m.record_bytes !== RECORD_BYTES) bad(`record_bytes ${m.record_bytes}, expected ${RECORD_BYTES}`);
  if (m.step_s !== STEP_S) bad(`step_s ${m.step_s}, expected ${STEP_S}`);
  if (!Array.isArray(m.segments) || m.segments.length === 0) bad('No segments');
  for (const s of m.segments) {
    if (!Number.isInteger(s.n) || s.n < 4) bad(`Segment ${s.id}: n = ${s.n}`);
    if (!Number.isInteger(s.byte_offset) || s.byte_offset % RECORD_BYTES !== 0) {
      bad(`Segment ${s.id}: byte_offset ${s.byte_offset}`);
    }
    if (!Number.isFinite(s.t0_unix)) bad(`Segment ${s.id}: t0_unix`);
  }
  return m;
}

/** Builds the table from the metadata and the raw bytes of `ephemeris.bin`. */
export function buildTable(meta: EphemerisMeta, bytes: Uint8Array): EphemerisTable {
  assertLittleEndian();
  const aligned = bytes.byteOffset % 4 === 0 ? bytes : bytes.slice();
  const data = new Float32Array(aligned.buffer, aligned.byteOffset, Math.floor(aligned.byteLength / 4));
  const segments = meta.segments.map((s): Segment => {
    if (s.byte_offset + s.n * RECORD_BYTES > bytes.byteLength) {
      throw new RangeError(`Segment ${s.id} runs past the end of the table`);
    }
    return {
      id: s.id,
      t0Unix: s.t0_unix,
      n: s.n,
      byteOffset: s.byte_offset,
      validFromUnix: s.t0_unix + meta.step_s,
      validToUnix: s.t0_unix + meta.step_s * (s.n - 2),
    };
  });
  return { stepS: meta.step_s, segments, data };
}

/** Downloads `ephemeris.meta.json` and `ephemeris.bin` (exact size 5,260,176 B) and builds the table. */
export async function loadEphemeris(baseUrl: string, ld: Loader = defaultLoader): Promise<EphemerisTable> {
  const [meta, bytes] = await Promise.all([
    ld.json(joinUrl(baseUrl, 'ephemeris.meta.json'), validateEphemerisMeta),
    ld.binary(joinUrl(baseUrl, 'ephemeris.bin'), { bytes: EPHEMERIS_BYTES }),
  ]);
  return buildTable(meta, bytes);
}

/** Lagrange weights of samples k−1, k, k+1, k+2 at fraction u ∈ [0, 1] (05 §4.5). */
export function lagrangeWeights(u: number): [number, number, number, number] {
  return [
    (-u * (u - 1) * (u - 2)) / 6,
    ((u + 1) * (u - 1) * (u - 2)) / 2,
    (-(u + 1) * u * (u - 2)) / 2,
    ((u + 1) * u * (u - 1)) / 6,
  ];
}

export function findSegment(table: EphemerisTable, tUnix: number): Segment | undefined {
  for (const s of table.segments) {
    if (tUnix >= s.validFromUnix && tUnix <= s.validToUnix) return s;
  }
  return undefined;
}

/**
 * Sun (out[0..2]) and Earth (out[3..5]) vectors from the Moon's centre in MOON_ME, km, at `tUnix`.
 * Writes into `out` without allocating (hot loops: events, metrics, map). Throws RangeError
 * outside every segment or if `tUnix` is not finite.
 */
export function bodyVectorsInto(table: EphemerisTable, tUnix: number, out: Float64Array): Float64Array {
  const seg = Number.isFinite(tUnix) ? findSegment(table, tUnix) : undefined;
  if (!seg) throw new RangeError(OUT_OF_RANGE);
  const x = (tUnix - seg.t0Unix) / table.stepS;
  let k = Math.floor(x);
  if (k < 1) k = 1;
  if (k > seg.n - 3) k = seg.n - 3; // only at t = valid_to
  const u = x - k;
  const w0 = (-u * (u - 1) * (u - 2)) / 6;
  const w1 = ((u + 1) * (u - 1) * (u - 2)) / 2;
  const w2 = (-(u + 1) * u * (u - 2)) / 2;
  const w3 = ((u + 1) * u * (u - 1)) / 6;
  const d = table.data;
  const i0 = seg.byteOffset / 4 + (k - 1) * RECORD_FLOATS;
  for (let c = 0; c < RECORD_FLOATS; c++) {
    out[c] =
      w0 * d[i0 + c] +
      w1 * d[i0 + RECORD_FLOATS + c] +
      w2 * d[i0 + 2 * RECORD_FLOATS + c] +
      w3 * d[i0 + 3 * RECORD_FLOATS + c];
  }
  return out;
}

export type Vec3 = [number, number, number];

/** Sun and Earth vectors at `tUnix` (05 §4.6 signature). Throws RangeError outside the table. */
export function bodyVectorsAt(table: EphemerisTable, tUnix: number): { sun: Vec3; earth: Vec3 } {
  const o = bodyVectorsInto(table, tUnix, new Float64Array(6));
  return { sun: [o[0], o[1], o[2]], earth: [o[3], o[4], o[5]] };
}
