// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Terrain data of the 3D view: loading the polar DEM (16_vista_3d.md §2.2), the mesh job (worker,
// or the main thread if a worker cannot start) and the ground functions of each scene (§7.6).
import { GRID, gridMatches, xyOfLatLon } from '../../core/grid';
import { DataError, joinUrl, type Loader } from '../../core/loaders';
import { R_M, fromScene, heightOf, latLonHToMe, mapToScene, norm, scale, sceneToMap, toScene, type SceneFrame, type V3, POLAR_FRAME } from './frame';
import { bilinear } from './meshes';
import { buildPolar, type MeshAnswer, type MeshRequest } from './mesh.worker';
import type { Ground } from './scene/engine';

export const DEM_BYTES = 2 * GRID.nx * GRID.ny; // 1,010,688 (09 §8.3)

/** `map/grid.json` must describe the mesh; then `map/dem_500m.bin.gz`, size-checked by the loader. */
export async function loadPolarDem(ld: Loader, heavyBase: string): Promise<Int16Array> {
  await ld.json(joinUrl(heavyBase, 'map/grid.json'), (url, j) => {
    if (!gridMatches(j as Record<string, unknown>)) throw new DataError('format', url, 'Unexpected mesh');
    return j;
  });
  const bytes = await ld.binary(joinUrl(heavyBase, 'map/dem_500m.bin.gz'), { bytes: DEM_BYTES, gzip: true });
  // A copy: the loader's cache keeps its own bytes, and this one is transferred to the worker.
  const copy = bytes.slice();
  return new Int16Array(copy.buffer, 0, GRID.nx * GRID.ny);
}

let seq = 0;

/** Runs the mesh job in a module worker; falls back to the main thread if the worker fails. */
export function meshJob(req: Omit<MeshRequest, 'id'>): Promise<MeshAnswer> {
  const id = ++seq;
  return new Promise((resolve) => {
    let worker: Worker | null = null;
    const local = () => resolve(buildPolar({ ...req, id }));
    try {
      worker = new Worker(new URL('./mesh.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      local();
      return;
    }
    worker.onmessage = (e: MessageEvent<MeshAnswer>) => {
      worker?.terminate();
      resolve(e.data);
    };
    worker.onerror = (e) => {
      e.preventDefault();
      worker?.terminate();
      local();
    };
    const transfer: Transferable[] = [];
    if (req.dem) transfer.push(req.dem.buffer);
    // Heights and holes are sent as copies: the main thread keeps using them.
    worker.postMessage({ ...req, id, heights: req.heights?.slice(), holes: req.holes?.slice() }, transfer);
  });
}

/** Height (m) of the polar terrain at a map point; the reference sphere outside the mesh. */
export function polarHeightAt(h: Float32Array, x: number, y: number): number {
  return bilinear(h, GRID.nx, GRID.ny, GRID.cellM, GRID.xMinM, GRID.yMaxM, x, y) ?? 0;
}

export function polarGround(h: Float32Array): Ground {
  return {
    clearance(p) {
      const m = sceneToMap(p);
      return m.hM - polarHeightAt(h, m.x, m.y);
    },
    surface(p) {
      const m = sceneToMap(p);
      return mapToScene(m.x, m.y, polarHeightAt(h, m.x, m.y));
    },
  };
}

/** The bare sphere of a scene (smooth Moon, or the polar anchor while the DEM loads). */
export function sphereGround(f: SceneFrame): Ground {
  return {
    clearance: (p) => heightOf(f, p),
    surface(p) {
      const me = fromScene(f, p);
      return toScene(f, scale(me, R_M / norm(me)));
    },
  };
}

/** Surface point of a latitude and longitude in a scene (polar heights when given). */
export function surfacePoint(f: SceneFrame, latDeg: number, lonDeg: number, h: Float32Array | null): V3 {
  if (f.polar) {
    const { x, y } = xyOfLatLon(latDeg, lonDeg);
    return mapToScene(x, y, h ? polarHeightAt(h, x, y) : 0);
  }
  return toScene(f, latLonHToMe(latDeg, lonDeg, 0));
}

export { POLAR_FRAME };
