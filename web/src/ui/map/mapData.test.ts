// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-29: map helpers (10_interfaz.md §6.4, 08_mapa_polar.md §7): colour ramp, readout, zoom and drag
// transform, click → mesh point (not computed, plan B), loading from the example heavy origin.
import { describe, expect, it } from 'vitest';
import { exampleBytes, exampleJson, fakeFetch } from '../../core/__tests__/fixtures';
import { GRID } from '../../core/grid';
import { createLoader } from '../../core/loaders';
import {
  BAND_COLOUR,
  cellAtScreen,
  cellPct,
  cellReadout,
  fitView,
  layerPixels,
  loadCellMask,
  loadMapData,
  meshPointLabel,
  NotComputed,
  rampColour,
  rampStep,
  zoomAt,
} from './mapData';

/** The example heavy origin (09 §13), served from `data`. */
function heavyServer(overrides: Record<string, unknown> = {}) {
  const files = ['map/grid.json', 'map/regions.json', 'layers/layers.json'];
  const routes: Record<string, { json?: unknown; bytes?: Uint8Array }> = {};
  for (const f of files) routes[`data/${f}`] = { json: exampleJson(f) };
  for (const f of ['cube/done.bin', 'map/dem_500m.bin.gz', 'layers/mean186.bin.gz', 'cube/c_25_28.bin.gz']) routes[`data/${f}`] = { bytes: exampleBytes(f) };
  for (const [k, v] of Object.entries(overrides)) routes[`data/${k}`] = { json: v };
  return createLoader({ fetch: fakeFetch(routes).fetch, sleep: async () => {} });
}

describe('layers: ramp of 11 steps from #161B22 to the concept colour', () => {
  it('steps, ends and no data', () => {
    expect(rampStep(0)).toBe(0);
    expect(rampStep(250)).toBe(10);
    expect(rampStep(125)).toBe(5); // 50 %
    expect(rampStep(255)).toBeNull();
    expect(rampColour(0, 'sun')).toEqual([0x16, 0x1b, 0x22]);
    expect(rampColour(10, 'earth')).toEqual(BAND_COLOUR.earth);
  });

  it('pixels: no data is transparent', () => {
    const n = GRID.nx * GRID.ny;
    const bands = new Uint8Array(3 * n).fill(250);
    bands[n + 5] = 255;
    const px = layerPixels(bands, 'earth', 1);
    expect([...px.subarray(0, 4)]).toEqual([...BAND_COLOUR.earth, 255]);
    expect(px[4 * 5 + 3]).toBe(0);
    expect(cellPct(bands, 1, 5, 0)).toBeNull();
    expect(cellPct(bands, 0, 5, 0)).toBe(100);
  });
});

describe('readout, zoom and drag', () => {
  it('`87.21° S, 125.48° E · +1,204 m · Sun 71 % · Earth 55 % · Both 48 %` format', () => {
    const n = GRID.nx * GRID.ny;
    const dem = new Int16Array(n).fill(1204);
    const bands = new Uint8Array(3 * n);
    bands.fill(178, 0, n); // 71.2 %
    bands.fill(138, n, 2 * n); // 55.2 %
    bands.fill(120, 2 * n); // 48 %
    expect(cellReadout(415, 380, dem, bands, ['sun', 'earth', 'both'])).toMatch(/^89\.6\d° S, 128\.\d\d° E · \+1,204 m · Sun 71 % · Earth 55 % · Both 48 %$/);
    dem[380 * GRID.nx + 415] = -32768;
    expect(cellReadout(415, 380, dem, null, ['sun', 'earth', 'both'])).toMatch(/· — · Sun — · Earth — · Both —$/);
  });

  it('zoom from 1× to 16× around the pointer; the cell under it stays put', () => {
    const f = fitView(752, 672);
    expect(f.base).toBe(1);
    let v = { zoom: 1, tx: f.tx, ty: f.ty };
    const before = cellAtScreen(v, f.base, 300, 200);
    v = zoomAt(v, 4, 300, 200);
    expect(v.zoom).toBe(4);
    expect(cellAtScreen(v, f.base, 300, 200)).toEqual(before);
    expect(zoomAt(v, 100, 0, 0).zoom).toBe(16);
    expect(zoomAt(v, 0.001, 0, 0).zoom).toBe(1);
  });

  it('mesh point label', () => {
    expect(meshPointLabel(415, 380)).toMatch(/^Nearest mesh point: 89\.6\d\d° S, 128\.\d{3}° E \(500 m grid\)$/);
  });
});

describe('click → mesh point (08 §7)', () => {
  it('a computed cell gives its mask; a chunk not done or a point not computed: «not computed»', async () => {
    const ld = heavyServer();
    const data = await loadMapData(ld, 'data');
    const mask = await loadCellMask(ld, 'data', data.done, 28 * 16 + 5, 25 * 16);
    expect(mask.siteHeightM).toBe(5);
    await expect(loadCellMask(ld, 'data', data.done, 10, 10)).rejects.toBeInstanceOf(NotComputed);
    expect(new NotComputed().message).toBe('This area has not been computed yet.');
  });

  it('loads grid, regions, layers, done and DEM from the heavy origin', async () => {
    const data = await loadMapData(heavyServer(), 'data');
    expect(data.regions).toHaveLength(9);
    expect(data.layers).toMatchObject({ source: 'computed', bands: ['sun', 'earth', 'both'] });
    expect(data.layers.periods).toHaveLength(61);
    expect(data.dem).toHaveLength(GRID.nx * GRID.ny);
    expect(data.done.reduce((a, b) => a + b, 0)).toBe(4);
  });

  it('plan B: NASA layers are reported as such; no heavy origin is an error (the view says so)', async () => {
    const nasa = { ...exampleJson<Record<string, unknown>>('layers/layers.json'), source: 'nasa_avgvisib' };
    expect((await loadMapData(heavyServer({ 'layers/layers.json': nasa }), 'data')).layers.source).toBe('nasa_avgvisib');
    await expect(loadMapData(createLoader({ fetch: fakeFetch({}).fetch, sleep: async () => {} }), 'data')).rejects.toThrow();
  });
});
