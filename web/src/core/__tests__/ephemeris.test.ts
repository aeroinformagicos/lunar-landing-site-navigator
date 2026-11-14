// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-12: ephemeris table reader and Lagrange interpolation (05_efemerides.md §4.5, §8.3).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EPHEMERIS_BYTES, R_EARTH_KM, R_SUN_KM } from '../constants';
import {
  bodyVectorsAt,
  bodyVectorsInto,
  buildTable,
  lagrangeWeights,
  loadEphemeris,
  OUT_OF_RANGE,
  type EphemerisMeta,
  type EphemerisTable,
} from '../ephemeris';
import { angularRadiusDeg, siteFrame, skyAt } from '../frames';
import { createLoader } from '../loaders';
import { isoToUnix } from '../time';
import { exampleBytes, exampleJson, fakeFetch } from './fixtures';

const DEG = Math.PI / 180;
const ROOT = new URL('../../../../', import.meta.url);

/** Angle between two vectors in degrees. */
function angleDeg(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return Math.atan2(Math.hypot(cross[0], cross[1], cross[2]), dot) / DEG;
}

/** In-memory table with one segment whose six components follow `f(t)`. */
function syntheticTable(t0: number, n: number, f: (t: number) => number[]): EphemerisTable {
  const meta: EphemerisMeta = {
    contract_version: '1.0.0',
    frame: 'MOON_ME',
    abcorr: 'LT+S',
    record_bytes: 24,
    step_s: 3600,
    segments: [{ id: 'main', t0_unix: t0, n, byte_offset: 0 }],
    synthetic: true,
  };
  const data = new Float32Array(n * 6);
  for (let k = 0; k < n; k++) data.set(f(t0 + 3600 * k), 6 * k);
  return buildTable(meta, new Uint8Array(data.buffer));
}

describe('lagrangeWeights', () => {
  it('sum to 1 for any u', () => {
    for (let i = 0; i <= 100; i++) {
      const w = lagrangeWeights(i / 100);
      expect(w[0] + w[1] + w[2] + w[3]).toBeCloseTo(1, 14);
    }
  });

  it('are (0, 1, 0, 0) at u = 0 and (0, 0, 1, 0) at u = 1', () => {
    expect(lagrangeWeights(0).map((x) => x + 0)).toEqual([0, 1, 0, 0]);
    expect(lagrangeWeights(1).map((x) => x + 0)).toEqual([0, 0, 1, 0]);
  });

  it('match the inline weights of bodyVectorsInto', () => {
    // One-hot samples: the interpolated value is the weight of that sample.
    for (const u of [0.1, 0.37, 0.5, 0.93]) {
      const w = lagrangeWeights(u);
      for (let j = 0; j < 4; j++) {
        const table = syntheticTable(0, 8, (t) => Array(6).fill(t === 3600 * (j + 1) ? 1 : 0));
        expect(bodyVectorsInto(table, 3600 * (2 + u), new Float64Array(6))[0]).toBeCloseTo(w[j], 14);
      }
    }
  });
});

describe('bodyVectorsAt on a synthetic table', () => {
  // A cubic is reproduced exactly by 4-point Lagrange (small integer coefficients: exact in float32).
  const cubic = (t: number) => {
    const h = t / 3600;
    return [h, h * h, h * h * h - 2 * h, 7, -h, 3 * h * h];
  };
  const table = syntheticTable(0, 50, cubic);

  it('reproduces a cubic anywhere inside the valid range', () => {
    for (const h of [1, 1.25, 2.5, 17.123, 33.999, 48]) {
      const o = bodyVectorsInto(table, 3600 * h, new Float64Array(6));
      cubic(3600 * h).forEach((v, c) => expect(o[c]).toBeCloseTo(v, 6));
    }
  });

  it('returns the stored sample at sample times', () => {
    const { sun, earth } = bodyVectorsAt(table, 3600 * 10);
    expect([...sun, ...earth]).toEqual(cubic(3600 * 10));
  });

  it('valid range is [t0 + 1 h, t0 + (n − 2) h]; valid_to uses the last interval with u = 1', () => {
    const seg = table.segments[0];
    expect(seg.validFromUnix).toBe(3600);
    expect(seg.validToUnix).toBe(3600 * 48);
    expect(bodyVectorsAt(table, 3600 * 48).sun).toEqual(cubic(3600 * 48).slice(0, 3));
  });

  it('throws RangeError outside the table or for non-finite times', () => {
    for (const t of [3599, 3600 * 48 + 1, -1e12, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => bodyVectorsAt(table, t)).toThrow(RangeError);
    }
    expect(() => bodyVectorsAt(table, 0)).toThrow(OUT_OF_RANGE);
  });
});

describe('loadEphemeris (T-02 example data)', () => {
  const meta = exampleJson('ephemeris.meta.json');
  const bin = exampleBytes('ephemeris.bin');

  function load(metaBody: unknown, bytes = bin) {
    const server = fakeFetch({ 'data/ephemeris.meta.json': { json: metaBody }, 'data/ephemeris.bin': { bytes } });
    return loadEphemeris('data', createLoader({ fetch: server.fetch, sleep: async () => {} }));
  }

  it('builds both segments with their valid ranges', async () => {
    const table = await load(meta);
    expect(table.data.byteLength).toBe(EPHEMERIS_BYTES);
    expect(table.segments.map((s) => [s.id, s.validFromUnix, s.validToUnix])).toEqual([
      ['main', isoToUnix('2024-01-01T00:00:00Z'), isoToUnix('2045-01-01T00:00:00Z')],
      ['apollo', isoToUnix('1969-01-01T00:00:00Z'), isoToUnix('1973-01-01T00:00:00Z')],
    ]);
  });

  it('rejects another major version, a wrong record size and a wrong file size', async () => {
    await expect(load({ ...meta, contract_version: '2.0.0' })).rejects.toMatchObject({ kind: 'contract' });
    await expect(load({ ...meta, record_bytes: 28 })).rejects.toMatchObject({ kind: 'format' });
    await expect(load({ ...meta, frame: 'IAU_MOON' })).rejects.toMatchObject({ kind: 'format' });
    await expect(load(meta, bin.subarray(0, EPHEMERIS_BYTES - 24))).rejects.toMatchObject({ kind: 'format' });
  });

  it('follows the analytic synthetic Sun and Earth between samples (D-56)', async () => {
    const table = await load(meta);
    const unit = (latDeg: number, lonDeg: number) => [
      Math.cos(latDeg * DEG) * Math.cos(lonDeg * DEG),
      Math.cos(latDeg * DEG) * Math.sin(lonDeg * DEG),
      Math.sin(latDeg * DEG),
    ];
    for (const iso of ['1969-07-20T20:17:40Z', '2025-03-14T06:30:00Z', '2027-08-04T14:20:00Z', '2044-12-31T23:59:59Z']) {
      const t = isoToUnix(iso);
      const d = t / 86_400;
      const sun = unit(1.54 * Math.sin((2 * Math.PI * d) / 346.6), (-360 * d) / 29.53);
      const earth = unit(6.7 * Math.sin((2 * Math.PI * d) / 27.21), 7.9 * Math.sin((2 * Math.PI * d) / 27.55));
      const v = bodyVectorsAt(table, t);
      expect(angleDeg(v.sun, sun)).toBeLessThan(2e-5);
      expect(angleDeg(v.earth, earth)).toBeLessThan(2e-5);
      expect(Math.hypot(...v.sun)).toBeCloseTo(1.496e8, -2);
      expect(Math.hypot(...v.earth)).toBeCloseTo(384_400, 0);
    }
    expect(() => bodyVectorsAt(table, isoToUnix('1990-01-01T00:00:00Z'))).toThrow(RangeError);
  });

  it('skyAt runs 10⁶ times in under 1 s', async () => {
    const table = await load(meta);
    const frame = siteFrame(-89.9, 0, 2100);
    const t0 = isoToUnix('2027-08-01T00:00:00Z');
    let acc = 0;
    const start = performance.now();
    for (let i = 0; i < 1_000_000; i++) acc += skyAt(table, frame, t0 + i).sun.elDeg;
    const ms = performance.now() - start;
    expect(Number.isFinite(acc)).toBe(true);
    expect(ms).toBeLessThan(1000);
  });
});

// ---- With the real table (T-06) and tests/golden (T-03, T-06): skipped until they exist. ----

function realTable(): EphemerisTable | null {
  const dir = new URL('web/public/data/', ROOT);
  if (!existsSync(new URL('ephemeris.meta.json', dir))) return null;
  const meta = JSON.parse(new TextDecoder().decode(readFileSync(new URL('ephemeris.meta.json', dir))));
  if (meta.synthetic !== false) return null;
  return buildTable(meta as EphemerisMeta, new Uint8Array(readFileSync(new URL('ephemeris.bin', dir))));
}

const REAL = realTable();
const SMOOTH_CSV = new URL('tests/golden/horizons_smoke.csv', ROOT);
const SAMPLE_JSON = new URL('tests/golden/ephem_sample.json', ROOT);

describe('real table against JPL Horizons (05 §8.3)', () => {
  it.skipIf(!REAL || !existsSync(SMOOTH_CSV))('the 15 smoke rows agree within 0.001°', () => {
    const lines = new TextDecoder().decode(readFileSync(SMOOTH_CSV)).trim().split(/\r?\n/);
    const head = lines[0].split(',');
    const col = (row: string[], name: string) => row[head.indexOf(name)];
    expect(lines.length - 1).toBe(15);
    for (const line of lines.slice(1)) {
      const r = line.split(',');
      const frame = siteFrame(Number(col(r, 'lat_deg')), Number(col(r, 'lon_deg')), 1000 * Number(col(r, 'alt_km')));
      const body = skyAt(REAL!, frame, isoToUnix(col(r, 'utc')))[col(r, 'target') as 'sun' | 'earth'];
      const dAz = Math.abs(((body.azDeg - Number(col(r, 'az_deg')) + 540) % 360) - 180);
      expect(dAz, line).toBeLessThan(0.001);
      expect(Math.abs(body.elDeg - Number(col(r, 'el_deg'))), line).toBeLessThan(0.001);
      const diam = col(r, 'ang_diam_arcsec');
      if (diam) {
        const radius = col(r, 'target') === 'sun' ? R_SUN_KM : R_EARTH_KM;
        expect(Math.abs(2 * angularRadiusDeg(radius, body.rangeKm) * 3600 - Number(diam)), line).toBeLessThan(0.05);
      }
    }
  });

  it.skipIf(!REAL || !existsSync(SAMPLE_JSON))('reads the 50 samples of ephem_sample.json', () => {
    const samples = JSON.parse(new TextDecoder().decode(readFileSync(SAMPLE_JSON))) as {
      segment: string;
      k: number;
      values: number[];
    }[];
    for (const s of samples) {
      const seg = REAL!.segments.find((x) => x.id === s.segment)!;
      const t = seg.t0Unix + REAL!.stepS * s.k;
      if (t < seg.validFromUnix || t > seg.validToUnix) continue;
      const o = bodyVectorsInto(REAL!, t, new Float64Array(6));
      expect(angleDeg(o.subarray(0, 3), s.values.slice(0, 3))).toBeLessThan(1e-5);
      expect(angleDeg(o.subarray(3, 6), s.values.slice(3, 6))).toBeLessThan(1e-5);
    }
  });
});
