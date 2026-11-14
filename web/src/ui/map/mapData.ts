// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Map data and pure helpers (10_interfaz.md §6.4, 08_mapa_polar.md §7, 09_contrato_datos.md §8–§10):
// heavy-origin loading, layer colouring, cell readout, view transform and click → mesh point.
import { decodeChunk, maskOfCell, type Chunk } from '../../core/cube';
import { chunkFileName, chunkOfCell, gridMatches, GRID, latLonOfCell } from '../../core/grid';
import { DataError, joinUrl, type Loader } from '../../core/loaders';
import type { Mask } from '../../core/horizon';
import { UI_VERSION } from '../shell/uiVersion';
import { oklabRamp } from '../shell/horizon2d';

export const LAYER_BYTES = 3 * GRID.nx * GRID.ny; // 1,516,032
export const DEM_BYTES = 2 * GRID.nx * GRID.ny; // 1,010,688
export const DONE_BYTES = GRID.nChunkRows * GRID.nChunkCols; // 1,974
export const LAYER_NODATA = 255;
export const PCT_PER_UNIT = 0.4;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 16;

export type Band = 'sun' | 'earth' | 'both';

export interface Region {
  id: string;
  name: string;
  box_m: [number, number, number, number];
  site_id: string | null;
}

export interface LayerPeriod {
  id: string;
  label: string;
  file: string;
}

export interface LayersInfo {
  source: 'computed' | 'nasa_avgvisib';
  periods: LayerPeriod[];
  bands: Band[];
}

export interface MapData {
  base: string;
  regions: Region[];
  layers: LayersInfo;
  done: Uint8Array;
  dem: Int16Array;
  hillshadeUrl: string;
}

/** Everything the map needs from the heavy origin; any failure means «no map in this build». */
export async function loadMapData(ld: Loader, base: string): Promise<MapData> {
  await ld.json(joinUrl(base, 'map/grid.json'), (url, j) => {
    if (!gridMatches(j as Record<string, unknown>)) throw new DataError('format', url, 'Unexpected mesh');
    return j;
  });
  const [regions, layers, done, demGz] = await Promise.all([
    ld.json(joinUrl(base, 'map/regions.json'), (_u, j) => (j as { regions: Region[] }).regions),
    ld.json(joinUrl(base, 'layers/layers.json'), (url, j) => {
      const l = j as { source: LayersInfo['source']; periods: LayerPeriod[]; encoding: { bands: Band[] } };
      if (!Array.isArray(l.periods) || l.periods.length === 0) throw new DataError('format', url, 'No layer periods');
      return { source: l.source, periods: l.periods, bands: l.encoding.bands };
    }),
    ld.binary(joinUrl(base, 'cube/done.bin'), { bytes: DONE_BYTES }),
    ld.binary(joinUrl(base, 'map/dem_500m.bin.gz'), { bytes: DEM_BYTES, gzip: true }),
  ]);
  const demBytes = demGz.byteOffset % 2 === 0 ? demGz : demGz.slice();
  return {
    base,
    regions,
    layers,
    done,
    dem: new Int16Array(demBytes.buffer, demBytes.byteOffset, GRID.nx * GRID.ny),
    hillshadeUrl: joinUrl(base, 'map/hillshade_250m.png'),
  };
}

export async function loadLayer(ld: Loader, base: string, period: LayerPeriod): Promise<Uint8Array> {
  return ld.binary(joinUrl(base, period.file), { bytes: LAYER_BYTES, gzip: true });
}

export async function loadChunk(ld: Loader, base: string, row: number, col: number): Promise<Chunk> {
  const url = joinUrl(base, chunkFileName(row, col));
  const bytes = await ld.binary(url, { bytes: 553_504, gzip: true });
  return decodeChunk(url, bytes);
}

/** Mask of a mesh cell from the cube, or why there is none (08 §7). */
export async function loadCellMask(ld: Loader, base: string, done: Uint8Array | null, i: number, j: number): Promise<Mask> {
  const { row, col } = chunkOfCell(i, j);
  if (done && done[row * GRID.nChunkCols + col] === 0) throw new NotComputed();
  const mask = maskOfCell(await loadChunk(ld, base, row, col), i, j);
  if (!mask) throw new NotComputed();
  return mask;
}

/** `This area has not been computed yet.` */
export class NotComputed extends Error {
  constructor() {
    super('This area has not been computed yet.');
    this.name = 'NotComputed';
  }
}

// ---- Layers: colour ramp from #161B22 to the concept colour in 11 steps (10 §6.4) ------------

const RAMP_FROM = [0x16, 0x1b, 0x22];
export const BAND_COLOUR: Record<Band, [number, number, number]> = {
  sun: [0xe6, 0x9f, 0x00],
  earth: [0x56, 0xb4, 0xe9],
  both: [0x00, 0x9e, 0x73],
};

/** Step 0…10 of a stored value (pct = v × 0.4); null for «no data» (255). */
export function rampStep(v: number): number | null {
  if (v === LAYER_NODATA || v > 250) return null;
  return Math.min(10, Math.floor((v * PCT_PER_UNIT) / 10 + 0.5));
}

/** v2 ramps (15_interfaz_v2.md §7.5, D-103): from --c-bg-1 to the v2 concept colours, in OKLab. */
const RAMP_FROM_V2: [number, number, number] = [0x16, 0x20, 0x32];
export const BAND_COLOUR_V2: Record<Band, [number, number, number]> = {
  sun: [0xf5, 0x9e, 0x0b],
  earth: [0x38, 0xbd, 0xf8],
  both: [0x2d, 0xd4, 0xbf],
};

export function rampColour(step: number, band: Band, palette: 'v1' | 'v2' = UI_VERSION): [number, number, number] {
  if (palette === 'v2') return oklabRamp(RAMP_FROM_V2, BAND_COLOUR_V2[band], step);
  const to = BAND_COLOUR[band];
  return [0, 1, 2].map((k) => Math.round(RAMP_FROM[k] + ((to[k] - RAMP_FROM[k]) * step) / 10)) as [number, number, number];
}

/** RGBA pixels (752 × 672) of one band; «no data» is transparent. */
export function layerPixels(bands: Uint8Array, band: Band, bandIndex: number): Uint8ClampedArray<ArrayBuffer> {
  const n = GRID.nx * GRID.ny;
  const out = new Uint8ClampedArray(4 * n);
  const lut = Array.from({ length: 11 }, (_, s) => rampColour(s, band));
  for (let k = 0; k < n; k++) {
    const step = rampStep(bands[bandIndex * n + k]);
    if (step === null) continue;
    const c = lut[step];
    out[4 * k] = c[0];
    out[4 * k + 1] = c[1];
    out[4 * k + 2] = c[2];
    out[4 * k + 3] = 255;
  }
  return out;
}

/** Percentage stored for a cell and band, or null without data. */
export function cellPct(bands: Uint8Array | null, bandIndex: number, i: number, j: number): number | null {
  if (!bands || bandIndex < 0) return null;
  const v = bands[bandIndex * GRID.nx * GRID.ny + j * GRID.nx + i];
  return v === LAYER_NODATA ? null : v * PCT_PER_UNIT;
}

/** `87.21° S, 125.48° E · +1,204 m · Sun 71 % · Earth 55 % · Both 48 %` (10 §6.4). */
export function cellReadout(i: number, j: number, dem: Int16Array, bands: Uint8Array | null, bandNames: Band[]): string {
  const { latDeg, lonDeg } = latLonOfCell(i, j);
  const ll = `${Math.abs(latDeg).toFixed(2)}° ${latDeg < 0 ? 'S' : 'N'}, ${Math.abs(lonDeg).toFixed(2)}° ${lonDeg < 0 ? 'W' : 'E'}`;
  const h = dem[j * GRID.nx + i];
  const height = h === -32768 ? '—' : `${h >= 0 ? '+' : '−'}${Math.abs(h).toLocaleString('en-US')} m`;
  const pct = (name: Band, label: string) => {
    const v = cellPct(bands, bandNames.indexOf(name), i, j);
    return `${label} ${v === null ? '—' : `${Math.round(v)} %`}`;
  };
  return `${ll} · ${height} · ${pct('sun', 'Sun')} · ${pct('earth', 'Earth')} · ${pct('both', 'Both')}`;
}

// ---- View transform: world = mesh pixels (cell units), screen = canvas pixels ------------------

export interface ViewState {
  zoom: number;
  /** Screen position of world (0, 0). */
  tx: number;
  ty: number;
}

/** Fit the whole mesh in a canvas of w × h. */
export function fitView(w: number, h: number): ViewState & { base: number } {
  const base = Math.min(w / GRID.nx, h / GRID.ny);
  return { zoom: 1, base, tx: (w - GRID.nx * base) / 2, ty: (h - GRID.ny * base) / 2 };
}

/** Cell under a screen point. */
export function cellAtScreen(v: ViewState, base: number, sx: number, sy: number): { i: number; j: number } {
  const s = base * v.zoom;
  return { i: Math.floor((sx - v.tx) / s), j: Math.floor((sy - v.ty) / s) };
}

/** Zoom by `factor` keeping the screen point (sx, sy) fixed, within 1× … 16×. */
export function zoomAt(v: ViewState, factor: number, sx: number, sy: number): ViewState {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
  const k = zoom / v.zoom;
  return { zoom, tx: sx - (sx - v.tx) * k, ty: sy - (sy - v.ty) * k };
}

/** Map metres → world (cell) coordinates. */
export function worldOfXY(x: number, y: number): { wx: number; wy: number } {
  return { wx: (x - GRID.xMinM) / GRID.cellM, wy: (GRID.yMaxM - y) / GRID.cellM };
}

/** `Nearest mesh point: 89.123° S, 45.678° E (500 m grid)` (08 §7). */
export function meshPointLabel(i: number, j: number): string {
  const { latDeg, lonDeg } = latLonOfCell(i, j);
  return `Nearest mesh point: ${Math.abs(latDeg).toFixed(3)}° ${latDeg < 0 ? 'S' : 'N'}, ${Math.abs(lonDeg).toFixed(3)}° ${lonDeg < 0 ? 'W' : 'E'} (500 m grid)`;
}
