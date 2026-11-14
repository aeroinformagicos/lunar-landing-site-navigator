// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Map mesh of the south pole (08_mapa_polar.md §1.2; 09_contrato_datos.md §8.1): LOLA south polar
// stereographic projection, R = 1,737,400 m, 0° E up, 90° E right; 752 × 672 cells of 500 m.
// Same formulas as pipeline/horizon/cube.py.
import { R_MOON_KM } from './constants';

const R_M = R_MOON_KM * 1000;
const DEG = Math.PI / 180;

export interface GridSpec {
  cellM: number;
  nx: number;
  ny: number;
  xMinM: number;
  yMaxM: number;
  chunk: number;
  nChunkCols: number;
  nChunkRows: number;
}

/** The mesh of 08 §1.2 (also `map/grid.json`, checked on load). */
export const GRID: Readonly<GridSpec> = Object.freeze({
  cellM: 500,
  nx: 752,
  ny: 672,
  xMinM: -200_000,
  yMaxM: 184_000,
  chunk: 16,
  nChunkCols: 47,
  nChunkRows: 42,
});

/** `map/grid.json` must describe exactly this mesh (09 §8.1). */
export function gridMatches(json: Record<string, unknown>): boolean {
  return (
    json.projection === 'polar_stereographic_south' &&
    json.radius_m === R_M &&
    json.cell_m === GRID.cellM &&
    json.nx === GRID.nx &&
    json.ny === GRID.ny &&
    json.x_min_m === GRID.xMinM &&
    json.y_max_m === GRID.yMaxM &&
    json.chunk === GRID.chunk &&
    json.n_chunk_cols === GRID.nChunkCols &&
    json.n_chunk_rows === GRID.nChunkRows
  );
}

export function cellCentreXY(i: number, j: number): { x: number; y: number } {
  return { x: GRID.xMinM + (i + 0.5) * GRID.cellM, y: GRID.yMaxM - (j + 0.5) * GRID.cellM };
}

/** Cell containing a map point; may fall outside the mesh (check with `inGrid`). */
export function cellOfXY(x: number, y: number): { i: number; j: number } {
  return { i: Math.floor((x - GRID.xMinM) / GRID.cellM), j: Math.floor((GRID.yMaxM - y) / GRID.cellM) };
}

export function inGrid(i: number, j: number): boolean {
  return i >= 0 && i < GRID.nx && j >= 0 && j < GRID.ny;
}

/** Map metres → latitude and longitude (08 §1.2: lat = −90° + c, lon = atan2(x, y)), lon in (−180, 180]. */
export function latLonOfXY(x: number, y: number): { latDeg: number; lonDeg: number } {
  const rho = Math.hypot(x, y);
  const c = 2 * Math.atan(rho / (2 * R_M));
  const lon = Math.atan2(x, y) / DEG;
  return { latDeg: -90 + c / DEG, lonDeg: lon <= -180 ? 180 : lon };
}

/** Latitude and longitude → map metres (inverse of `latLonOfXY`). */
export function xyOfLatLon(latDeg: number, lonDeg: number): { x: number; y: number } {
  const c = (latDeg + 90) * DEG;
  const rho = 2 * R_M * Math.tan(c / 2);
  return { x: rho * Math.sin(lonDeg * DEG), y: rho * Math.cos(lonDeg * DEG) };
}

export function latLonOfCell(i: number, j: number): { latDeg: number; lonDeg: number } {
  const { x, y } = cellCentreXY(i, j);
  return latLonOfXY(x, y);
}

/** Chunk of a cell (09 §8.1): row, col and the index p = 16·r + c inside it. */
export function chunkOfCell(i: number, j: number): { row: number; col: number; p: number } {
  return {
    row: Math.floor(j / GRID.chunk),
    col: Math.floor(i / GRID.chunk),
    p: GRID.chunk * (j % GRID.chunk) + (i % GRID.chunk),
  };
}

/** `c_07_31.bin.gz` (09 §10.2). */
export function chunkFileName(row: number, col: number): string {
  return `cube/c_${String(row).padStart(2, '0')}_${String(col).padStart(2, '0')}.bin.gz`;
}

/** `grid:<i>,<j>` scenario reference (10 §10). */
export function gridRef(i: number, j: number): string {
  return `grid:${i},${j}`;
}
