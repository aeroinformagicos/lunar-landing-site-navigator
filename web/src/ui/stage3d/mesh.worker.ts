// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Mesh worker of the 3D view (16_vista_3d.md §4): fills the DEM holes and builds the polar tiles off
// the main thread; the buffers come back transferred.
import { GRID } from '../../core/grid';
import { buildPolarTiles, downsample2, fillHoles, type TileMesh } from './meshes';

export interface MeshRequest {
  id: number;
  /** Raw DEM (−32768 = no data), or already filled heights from an earlier answer. */
  dem?: Int16Array;
  heights?: Float32Array;
  holes?: Uint8Array;
  lod: 1 | 2;
}

export interface MeshAnswer {
  id: number;
  heights: Float32Array;
  holes: Uint8Array;
  filled: number;
  tiles: TileMesh[];
  ms: number;
}

/** The work itself, also used on the main thread when a worker cannot start. */
export function buildPolar(req: MeshRequest): MeshAnswer {
  const t0 = performance.now();
  let heights = req.heights;
  let holes = req.holes ?? new Uint8Array(GRID.nx * GRID.ny);
  let filled = 0;
  if (!heights) {
    const f = fillHoles(req.dem!, GRID.nx, GRID.ny);
    heights = f.heights;
    holes = f.holes;
    filled = f.filled;
  }
  const grid =
    req.lod === 1
      ? { heights, nx: GRID.nx, ny: GRID.ny, cellM: GRID.cellM }
      : { ...downsample2(heights, GRID.nx, GRID.ny), cellM: GRID.cellM * 2 };
  const tiles = buildPolarTiles(grid);
  return { id: req.id, heights, holes, filled, tiles, ms: performance.now() - t0 };
}

export function transferables(a: MeshAnswer): Transferable[] {
  const out: Transferable[] = [];
  for (const t of a.tiles) out.push(t.position.buffer, t.normal.buffer, t.uv.buffer, t.index.buffer);
  return out;
}

// Worker entry (absent when imported by the tests or the main-thread fallback).
const scope = globalThis as unknown as { onmessage: unknown; postMessage: (m: unknown, t: Transferable[]) => void; WorkerGlobalScope?: unknown };
if (typeof scope.WorkerGlobalScope !== 'undefined') {
  scope.onmessage = (e: MessageEvent<MeshRequest>) => {
    const answer = buildPolar(e.data);
    // Heights and holes stay copyable: the main thread keeps them for collisions and later LODs.
    scope.postMessage(answer, transferables(answer));
  };
}
