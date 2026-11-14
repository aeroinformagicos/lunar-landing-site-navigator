// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-35: optimal site (08_mapa_polar.md §10.3, F32).
import { describe, expect, it } from 'vitest';
import { skyAt, siteFrame } from '../frames';
import { cellCentreXY, GRID, latLonOfCell } from '../grid';
import { gunzip } from '../gz';
import { makeMask } from '../horizon';
import { bestByPeriod, COMPACT_N_AZ, decodeCompact, hourlyVectors, longestBothFrom, type Box, type Compact } from '../optimal';
import { isoToUnix } from '../time';
import { exactBothHours } from '../../ui/optimal/refine';
import { exampleBytes, exampleTable } from './fixtures';

const table = exampleTable();
const N = GRID.nx * GRID.ny;
const T = isoToUnix('2027-08-01T00:00:00Z');

/** A layer with every band at `base`, plus some cells set by hand. */
function layer(base: number, cells: [number, number, number][] = []): Uint8Array {
  const l = new Uint8Array(3 * N).fill(base);
  for (const [i, j, v] of cells) for (let b = 0; b < 3; b++) l[b * N + j * GRID.nx + i] = v;
  return l;
}

function compactOf(points: { i: number; j: number; el: (b: number) => number; height?: number; region?: number }[]): Compact {
  const n = points.length;
  const c: Compact = {
    nPoints: n,
    i: Uint16Array.from(points.map((p) => p.i)),
    j: Uint16Array.from(points.map((p) => p.j)),
    heightM: Int16Array.from(points.map((p) => p.height ?? 0)),
    region: Uint8Array.from(points.map((p) => p.region ?? 0)),
    elQ: new Int16Array(n * COMPACT_N_AZ),
  };
  points.forEach((p, q) => {
    for (let b = 0; b < COMPACT_N_AZ; b++) c.elQ[q * COMPACT_N_AZ + b] = Math.round(p.el(b) / 0.01);
  });
  return c;
}

const binOf = (az: number) => Math.floor(az / 2 + 0.5) % COMPACT_N_AZ;

describe('best by period (08 §10.1)', () => {
  it('a known maximum at (100, 200) wins and its contiguous second maximum is skipped', () => {
    const hits = bestByPeriod(layer(10, [[100, 200, 250], [101, 200, 249], [300, 300, 200]]), ['sun', 'earth', 'both'], null);
    expect(hits[0]).toMatchObject({ i: 100, j: 200, bothPct: 100 });
    expect(hits.some((h) => h.i === 101 && h.j === 200)).toBe(false);
    expect(hits[1]).toMatchObject({ i: 300, j: 300 });
    expect(hits).toHaveLength(10);
    for (let a = 0; a < hits.length; a++) for (let b = 0; b < a; b++) expect(500 * Math.hypot(hits[a].i - hits[b].i, hits[a].j - hits[b].j)).toBeGreaterThan(1000);
  });

  it('region filter: every cell returned is inside the box', () => {
    const box: Box = [-20_000, 0, 0, 20_000];
    const hits = bestByPeriod(layer(50, [[100, 200, 250]]), ['sun', 'earth', 'both'], [box]);
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      const { x, y } = cellCentreXY(h.i, h.j);
      expect(x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3]).toBe(true);
    }
  });

  it('cells without data and layers without a `both` band (plan B) give nothing', () => {
    expect(bestByPeriod(layer(255), ['sun', 'earth', 'both'], null)).toEqual([]);
    expect(bestByPeriod(layer(100), ['sun', 'earth'], null)).toEqual([]);
  });
});

describe('longest continuous Sun + Earth from a date (08 §10.2)', () => {
  // A always visible, B never, C blocked only in the Sun's azimuth bin of hour 5.
  const A = { i: 200, j: 200 };
  const B = { i: 500, j: 500 };
  const C = { i: 451, j: 407 };

  /** First hourly t0 where the Sun's bin at hour 5 differs from hours 0–4 and from the Earth's bins 0–5. */
  function setup() {
    const { latDeg, lonDeg } = latLonOfCell(C.i, C.j);
    const f = siteFrame(latDeg, lonDeg, 2);
    for (let h = 0; h < 500; h++) {
      const t0 = T + 3600 * h;
      const sun = [0, 1, 2, 3, 4, 5].map((k) => binOf(skyAt(table, f, t0 + 3600 * k).sun.azDeg));
      const earth = [0, 1, 2, 3, 4, 5].map((k) => binOf(skyAt(table, f, t0 + 3600 * k).earth.azDeg));
      if (!sun.slice(0, 5).includes(sun[5]) && !earth.includes(sun[5])) return { t0, bin: sun[5] };
    }
    throw new Error('no suitable t0');
  }

  it('A = K (capped), B = 0, C = 5; order A, C, B', () => {
    const { t0, bin } = setup();
    const c = compactOf([
      { ...A, el: () => -90 },
      { ...B, el: () => 90 },
      { ...C, el: (b) => (b === bin ? 90 : -90) },
    ]);
    const r = longestBothFrom(c, table, t0, 2, null);
    expect(r.maxHours).toBe(48);
    expect(r.top.map((h) => [h.i, h.j, h.hours, h.capped])).toEqual([
      [A.i, A.j, 48, true],
      [C.i, C.j, 5, false],
      [B.i, B.j, 0, false],
    ]);
  });

  it('region filter and progress every 256 points', () => {
    const pts = Array.from({ length: 600 }, (_, k) => ({ i: 10 + (k % 30) * 5, j: 10 + Math.floor(k / 30) * 5, el: () => -90, region: k < 300 ? 1 : 2 }));
    const calls: number[] = [];
    const r = longestBothFrom(compactOf(pts), table, T, 1, 2, (done) => calls.push(done));
    expect(r.evaluated).toBe(300);
    expect(r.top.every((h) => h.regionIndex === 2)).toBe(true);
    expect(calls).toEqual([256, 300]);
  });

  it('a date outside the table is the range error', () => {
    expect(() => hourlyVectors(table, isoToUnix('1990-01-01T00:00:00Z'), 90)).toThrow('Date outside the supported range (1969–1972 and 2024–2044).');
    expect(hourlyVectors(table, isoToUnix('2044-12-30T00:00:00Z'), 90).K).toBe(48); // the table ends first
  });

  it('decodes the example compact file (09 §11)', async () => {
    const c = decodeCompact(await gunzip(exampleBytes('compact/regions.bin.gz')));
    expect(c.nPoints).toBe(64);
    expect([c.i[0], c.j[0]]).toEqual([297, 317]);
    expect(() => decodeCompact(new Uint8Array(40))).toThrow(/header/);
  });

  it('coherence with the core: the full-mask duration ≥ the worker’s − 1 h (5 points)', () => {
    let positive = 0;
    for (let k = 0; k < 5; k++) {
      const cell = { i: 440 + 3 * k, j: 400 + 2 * k };
      // Full mask: −2° + 1.5°·sin(3·az + k); compact: its maximum over ±1° around 2·b (09 §11).
      const el = Float64Array.from({ length: 720 }, (_, jj) => -2 + 1.5 * Math.sin((3 * jj * 0.5 + 40 * k) * (Math.PI / 180)));
      const full = makeMask(0, 0, { elDeg: el, distM: new Float64Array(720), blkLatDeg: new Float64Array(720), blkLonDeg: new Float64Array(720), blkHeightM: new Float64Array(720) });
      const c = compactOf([{ ...cell, height: -2, el: (b) => Math.max(...[-2, -1, 0, 1, 2].map((m) => el[(4 * b + m + 720) % 720])) }]);
      const t0 = T + k * 86_400;
      const w = longestBothFrom(c, table, t0, 10, null).top[0];
      const { latDeg, lonDeg } = latLonOfCell(cell.i, cell.j);
      const exact = exactBothHours(table, full, latDeg, lonDeg, t0, 240);
      expect(exact.hours, `point ${k}`).toBeGreaterThanOrEqual(w.hours - 1);
      if (w.hours > 0) positive++;
    }
    expect(positive).toBeGreaterThan(0);
  });
});
