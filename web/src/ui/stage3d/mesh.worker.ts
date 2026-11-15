// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Mesh worker of the 3D view (16_vista_3d.md §4): fills the DEM holes and builds the polar tiles, or
// fills a horizon profile and builds its radial mesh (§4.2), off the main thread; the buffers come
// back transferred.
import { GRID } from '../../core/grid';
import type { LawName } from '../../core/law';
import { makeSceneFrame } from './frame';
import { buildPolarTiles, buildRadialMesh, downsample2, fillHoles, type TileMesh } from './meshes';
import { everyNthAzimuth, profileTerrain, type RadialTerrain } from './radial';

export interface PolarRequest {
  id: number;
  kind?: 'polar';
  /** Raw DEM (−32768 = no data), or already filled heights from an earlier answer. */
  dem?: Int16Array;
  heights?: Float32Array;
  holes?: Uint8Array;
  lod: 1 | 2;
}

export interface ProfileRequest {
  id: number;
  kind: 'profile';
  /** int16[720][512] of the profile file (09 §6). */
  raw: Int16Array;
  law: LawName;
  latDeg: number;
  lonDeg: number;
  siteHeightM: number;
  lod: 1 | 2;
}

export type MeshRequest = PolarRequest | ProfileRequest;

export interface MeshAnswer {
  id: number;
  heights: Float32Array;
  holes: Uint8Array;
  filled: number;
  tiles: TileMesh[];
  ms: number;
}

export interface ProfileAnswer {
  id: number;
  kind: 'profile';
  /** The full profile terrain (720 azimuths), for the ground, the readout and the shadow pass. */
  terrain: RadialTerrain;
  /** The azimuths drawn at this level of detail (all, or one of every two). */
  drawn: RadialTerrain;
  mesh: TileMesh;
  filled: number;
  ms: number;
}

/** The polar work itself, also used on the main thread when a worker cannot start. */
export function buildPolar(req: PolarRequest): MeshAnswer {
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

/** The profile scene (§4.2): holes filled, one of every two azimuths below `alto`, radial mesh. */
export function buildProfile(req: ProfileRequest): ProfileAnswer {
  const t0 = performance.now();
  const terrain = profileTerrain(req.raw, req.law, req.siteHeightM);
  const drawn = everyNthAzimuth(terrain, req.lod === 1 ? 1 : 2);
  const f = makeSceneFrame(req.latDeg, req.lonDeg, req.siteHeightM);
  const nb = drawn.dist.length;
  const mesh = buildRadialMesh(f, drawn.nAz, drawn.dist, (j, b) => drawn.heights[j * nb + b], terrain.centreH, false);
  const { filled, ...plain } = terrain;
  return { id: req.id, kind: 'profile', terrain: plain, drawn, mesh, filled, ms: performance.now() - t0 };
}

export function build(req: MeshRequest): MeshAnswer | ProfileAnswer {
  return req.kind === 'profile' ? buildProfile(req) : buildPolar(req);
}

function meshBuffers(t: TileMesh): Transferable[] {
  return [t.position.buffer, t.normal.buffer, t.uv.buffer, t.index.buffer];
}

export function transferables(a: MeshAnswer | ProfileAnswer): Transferable[] {
  if ('kind' in a) return meshBuffers(a.mesh);
  return a.tiles.flatMap(meshBuffers);
}

// Worker entry (absent when imported by the tests or the main-thread fallback).
const scope = globalThis as unknown as { onmessage: unknown; postMessage: (m: unknown, t: Transferable[]) => void; WorkerGlobalScope?: unknown };
if (typeof scope.WorkerGlobalScope !== 'undefined') {
  scope.onmessage = (e: MessageEvent<MeshRequest>) => {
    const answer = build(e.data);
    // Heights, holes and terrains stay copyable: the main thread keeps them for collisions and later LODs.
    scope.postMessage(answer, transferables(answer));
  };
}
