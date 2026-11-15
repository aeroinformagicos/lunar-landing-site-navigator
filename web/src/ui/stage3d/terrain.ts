// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Terrain data of the 3D view: loading the polar DEM (16_vista_3d.md §2.2), the mesh jobs (worker,
// or the main thread if a worker cannot start) and the ground functions of each scene (§7.6): polar
// DEM, profile mesh (§4.2), horizon ring (§4.3) and smooth Moon (§4.4).
import { GRID, gridMatches, xyOfLatLon } from '../../core/grid';
import { DataError, joinUrl, type Loader } from '../../core/loaders';
import { R_M, fromScene, heightOf, latLonHToMe, mapToScene, norm, scale, sceneToMap, toScene, type SceneFrame, type V3, POLAR_FRAME } from './frame';
import { polarOfMe, radialHeightAt, ringGroundAt, type RadialTerrain } from './radial';
import { bilinear } from './meshes';
import { build, type MeshAnswer, type PolarRequest, type ProfileAnswer, type ProfileRequest } from './mesh.worker';
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

type Req = Omit<PolarRequest, 'id'> | Omit<ProfileRequest, 'id'>;

/** Runs a mesh job in a module worker; falls back to the main thread if the worker fails. */
export function meshJob(req: Omit<PolarRequest, 'id'>): Promise<MeshAnswer>;
export function meshJob(req: Omit<ProfileRequest, 'id'>): Promise<ProfileAnswer>;
export function meshJob(req: Req): Promise<MeshAnswer | ProfileAnswer> {
  const id = ++seq;
  return new Promise((resolve) => {
    let worker: Worker | null = null;
    const local = () => resolve(build({ ...req, id } as PolarRequest | ProfileRequest));
    try {
      worker = new Worker(new URL('./mesh.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      local();
      return;
    }
    worker.onmessage = (e: MessageEvent<MeshAnswer | ProfileAnswer>) => {
      worker?.terminate();
      resolve(e.data);
    };
    worker.onerror = (e) => {
      e.preventDefault();
      worker?.terminate();
      local();
    };
    if (req.kind === 'profile') {
      // A copy: the loader's cache keeps the decoded profile.
      worker.postMessage({ ...req, id, raw: req.raw.slice() });
      return;
    }
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

/** Heights of a scene for the signals, pins and eye (m above the sphere at a latitude and longitude). */
export interface TerrainHeights {
  heightAt(latDeg: number, lonDeg: number): number;
}

export function polarHeights(h: Float32Array): TerrainHeights {
  return {
    heightAt(latDeg, lonDeg) {
      const { x, y } = xyOfLatLon(latDeg, lonDeg);
      return polarHeightAt(h, x, y);
    },
  };
}

/** Heights of a radial scene (profile or ring) around the anchor of `f`. */
export function radialHeights(f: SceneFrame, heightAtPolar: (d: number, azDeg: number) => number): TerrainHeights {
  return {
    heightAt(latDeg, lonDeg) {
      const { d, azDeg } = polarOfMe(f, latLonHToMe(latDeg, lonDeg, 0));
      return heightAtPolar(d, azDeg);
    },
  };
}

/** Ground of a radial scene (§7.6): the profile mesh, or the ring's flat ground. */
export function radialGround(f: SceneFrame, heightAtPolar: (d: number, azDeg: number) => number): Ground {
  const at = (p: V3) => {
    const me = fromScene(f, p);
    const { d, azDeg } = polarOfMe(f, me);
    return { me, r: norm(me), h: heightAtPolar(d, azDeg) };
  };
  return {
    clearance(p) {
      const a = at(p);
      return a.r - R_M - a.h;
    },
    surface(p) {
      const a = at(p);
      return toScene(f, scale(a.me, (R_M + a.h) / a.r));
    },
  };
}

export const profileHeightFn = (t: RadialTerrain) => (d: number, azDeg: number) => radialHeightAt(t, d, azDeg);
export const ringHeightFn = (siteHeightM: number) => (d: number) => ringGroundAt(siteHeightM, d);

export { POLAR_FRAME };
