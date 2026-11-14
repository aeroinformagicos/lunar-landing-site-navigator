// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-29: map mesh (08_mapa_polar.md §1.2, §11) and horizon cube chunks (09_contrato_datos.md §10.2).
import { describe, expect, it } from 'vitest';
import { gunzip } from '../gz';
import { CHUNK_BYTES, decodeChunk, maskOfCell, pointElevations, POINTS_PER_CHUNK } from '../cube';
import { cellCentreXY, cellOfXY, chunkFileName, chunkOfCell, GRID, gridMatches, inGrid, latLonOfCell, latLonOfXY, xyOfLatLon } from '../grid';
import { DataError } from '../loaders';
import { exampleBytes, exampleJson } from './fixtures';

describe('mesh (08 §1.2)', () => {
  it('round trip (i, j) → (lat, lon) → (i, j) for all 505,344 cells', () => {
    let bad = 0;
    for (let j = 0; j < GRID.ny; j++) {
      for (let i = 0; i < GRID.nx; i++) {
        const { latDeg, lonDeg } = latLonOfCell(i, j);
        const { x, y } = xyOfLatLon(latDeg, lonDeg);
        const c = cellOfXY(x, y);
        if (c.i !== i || c.j !== j) bad++;
      }
    }
    expect(bad).toBe(0);
  });

  it('Shackleton centre (−89.67°, 129.78°) is cell (415, 380), chunk row 23, col 25 (08 §11)', () => {
    const { x, y } = xyOfLatLon(-89.67, 129.78);
    expect(x).toBeCloseTo(7690, -1);
    expect(y).toBeCloseTo(-6403, -1);
    expect(cellOfXY(x, y)).toEqual({ i: 415, j: 380 });
    expect(chunkOfCell(415, 380)).toMatchObject({ row: 23, col: 25 });
  });

  it('cell centres and coordinates equal pipeline/horizon/cube.py', () => {
    expect(cellCentreXY(415, 380)).toEqual({ x: 7750, y: -6250 });
    const a = latLonOfCell(451, 407);
    expect(a.latDeg).toBeCloseTo(-88.92983646047902, 10);
    expect(a.lonDeg).toBeCloseTo(127.48785589694725, 10);
    const b = latLonOfCell(0, 0); // lowest latitude, the corner (−81.05°)
    expect(b.latDeg).toBeCloseTo(-81.0675630798185, 10);
    expect(b.lonDeg).toBeCloseTo(-47.38905117678019, 10);
  });

  it('the pole is the common corner of cells (399, 367) … (400, 368)', () => {
    expect(cellOfXY(-1, 1)).toEqual({ i: 399, j: 367 });
    expect(cellOfXY(1, -1)).toEqual({ i: 400, j: 368 });
    expect(latLonOfXY(0, 1).lonDeg).toBe(0);
  });

  it('chunks, file names, bounds and grid.json', () => {
    expect(chunkOfCell(17, 33)).toEqual({ row: 2, col: 1, p: 16 * 1 + 1 });
    expect(chunkFileName(7, 31)).toBe('cube/c_07_31.bin.gz');
    expect(inGrid(751, 671)).toBe(true);
    expect(inGrid(752, 0)).toBe(false);
    expect(gridMatches(exampleJson('map/grid.json'))).toBe(true);
    expect(gridMatches({ ...exampleJson('map/grid.json'), cell_m: 1000 })).toBe(false);
  });

  it('every region centre falls in the cell of its table coordinates', () => {
    const { regions } = exampleJson<{ regions: { lat_deg: number; lon_deg: number; x_m: number; y_m: number }[] }>('map/regions.json');
    for (const r of regions) {
      const a = xyOfLatLon(r.lat_deg, r.lon_deg);
      expect(cellOfXY(a.x, a.y)).toEqual(cellOfXY(r.x_m, r.y_m));
    }
  });
});

describe('cube chunks (09 §10.2)', () => {
  async function example() {
    return decodeChunk('c_25_28', await gunzip(exampleBytes('cube/c_25_28.bin.gz')));
  }

  it('decodes the example chunk like Python decode_chunk', async () => {
    const c = await example();
    expect(c).toMatchObject({ row: 25, col: 28, lawId: 1, observerHeightM: 2 });
    const el0 = pointElevations(c, 0);
    expect(el0[0]).toBeCloseTo(0.5, 12);
    expect(el0[1]).toBeCloseTo(0.53, 12);
    expect(pointElevations(c, 5)[719]).toBeCloseTo(1.34, 12);
    const i = 28 * 16 + 5;
    const j = 25 * 16;
    const mask = maskOfCell(c, i, j)!;
    expect(mask.distM[10]).toBeCloseTo(20698.127199052964, 6);
    expect(mask.siteHeightM).toBe(5);
    expect(Number.isNaN(mask.blkHeightM[0])).toBe(true);
    expect(mask.observerHeightM).toBe(2);
  });

  it('cumulative sum with int16 wrap-around recovers the elevations', async () => {
    const c = await example();
    const q = new Int16Array(720);
    for (let k = 0; k < 720; k++) q[k] = [32_000, -32_000, 32_767, -32_767, 0, -1][k % 6];
    const delta = new Int16Array(720);
    delta[0] = q[0];
    for (let k = 1; k < 720; k++) delta[k] = q[k] - q[k - 1]; // wraps when stored in Int16Array
    expect(delta[1]).toBe(1536); // −64000 wrapped
    c.elDelta.set(delta, 3 * 720);
    const el = pointElevations(c, 3);
    for (let k = 0; k < 720; k++) expect(Math.round(el[k] / 0.01)).toBe(q[k]);
  });

  it('a point that was not computed has no mask; bad headers are rejected', async () => {
    const raw = await gunzip(exampleBytes('cube/c_25_28.bin.gz'));
    const b = raw.slice();
    new DataView(b.buffer).setInt16(32 + 2 * 7, -32768, true);
    expect(maskOfCell(decodeChunk('x', b), 28 * 16 + 7, 25 * 16)).toBeNull();
    expect(() => decodeChunk('x', raw.subarray(0, CHUNK_BYTES - 1))).toThrow(DataError);
    const m = raw.slice();
    m[0] = 0x58;
    expect(() => decodeChunk('x', m)).toThrow(/Header/);
    const v = raw.slice();
    new DataView(v.buffer).setUint16(8, 2, true);
    expect(() => decodeChunk('x', v)).toThrow(DataError);
    expect(POINTS_PER_CHUNK).toBe(256);
  });
});
