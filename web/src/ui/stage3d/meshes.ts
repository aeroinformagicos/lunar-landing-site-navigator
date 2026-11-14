// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Terrain meshes of the 3D view (16_vista_3d.md §4): the polar DEM on the lunar curvature, cut into
// tiles with local coordinates, and the radial cap around a site. Pure: the mesh worker runs it and
// the tests check it in Node.
import { GRID } from '../../core/grid';
import { POLAR_FRAME, R_M, add, cross, dot, mapToMe, rotToScene, scale, sub, toScene, unit, type SceneFrame, type V3 } from './frame';

export const DEM_NODATA = -32768;
/** Skirt depth below the outer edge of the mesh (§4.1). */
export const SKIRT_M = 3000;
export const TILES = 8;

export interface TileMesh {
  /** Scene position of the tile origin; vertex positions are relative to it (§3.3). */
  offset: V3;
  position: Float32Array;
  normal: Float32Array;
  uv: Float32Array;
  index: Uint32Array;
}

export interface FilledDem {
  heights: Float32Array;
  /** 1 where the value was filled (−32768 in the file). */
  holes: Uint8Array;
  filled: number;
}

/**
 * Fills no-data cells with the mean of their valid 8-neighbours, up to 8 passes; what is still empty
 * after that takes 0 m (the reference sphere). §2.2.
 */
export function fillHoles(dem: Int16Array, nx: number, ny: number): FilledDem {
  const heights = new Float32Array(nx * ny);
  const holes = new Uint8Array(nx * ny);
  const valid = new Uint8Array(nx * ny);
  let pending = 0;
  for (let k = 0; k < nx * ny; k++) {
    if (dem[k] === DEM_NODATA) {
      holes[k] = 1;
      pending++;
    } else {
      heights[k] = dem[k];
      valid[k] = 1;
    }
  }
  const filled = pending;
  for (let pass = 0; pass < 8 && pending > 0; pass++) {
    const next = valid.slice();
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (valid[k]) continue;
        let sum = 0;
        let n = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = i + di;
            const jj = j + dj;
            if ((di || dj) && ii >= 0 && jj >= 0 && ii < nx && jj < ny && valid[jj * nx + ii]) {
              sum += heights[jj * nx + ii];
              n++;
            }
          }
        }
        if (n) {
          heights[k] = sum / n;
          next[k] = 1;
          pending--;
        }
      }
    }
    valid.set(next);
  }
  return { heights, holes, filled };
}

/** Mean of each 2 × 2 block: the 1 km level of detail (§4.1). */
export function downsample2(h: Float32Array, nx: number, ny: number): { heights: Float32Array; nx: number; ny: number } {
  const mx = Math.floor(nx / 2);
  const my = Math.floor(ny / 2);
  const out = new Float32Array(mx * my);
  for (let j = 0; j < my; j++) {
    for (let i = 0; i < mx; i++) {
      const a = 2 * j * nx + 2 * i;
      out[j * mx + i] = (h[a] + h[a + 1] + h[a + nx] + h[a + nx + 1]) / 4;
    }
  }
  return { heights: out, nx: mx, ny: my };
}

/** Bilinear height (m) at map (x, y) on a grid of cell centres; null outside the centres. */
export function bilinear(h: Float32Array, nx: number, ny: number, cellM: number, xMin: number, yMax: number, x: number, y: number): number | null {
  const s = (x - xMin) / cellM - 0.5;
  const l = (yMax - y) / cellM - 0.5;
  if (!(s >= 0 && l >= 0 && s <= nx - 1 && l <= ny - 1)) return null;
  const i0 = Math.min(Math.floor(s), nx - 2);
  const j0 = Math.min(Math.floor(l), ny - 2);
  const fs = s - i0;
  const fl = l - j0;
  const k = j0 * nx + i0;
  return (1 - fl) * ((1 - fs) * h[k] + fs * h[k + 1]) + fl * ((1 - fs) * h[k + nx] + fs * h[k + nx + 1]);
}

export interface PolarGrid {
  heights: Float32Array;
  nx: number;
  ny: number;
  cellM: number;
}

/** The fine DEM grid of 08 §1.2 with its heights. */
export function fineGrid(heights: Float32Array): PolarGrid {
  return { heights, nx: GRID.nx, ny: GRID.ny, cellM: GRID.cellM };
}

/**
 * Polar terrain (§4.1): one vertex per cell centre on the lunar curvature, tiles × tiles pieces with
 * one vertex of overlap, normals from the 3D neighbours, a 3 km skirt on the outer edge. `uv` spans
 * the mesh extent (0…1 across, 0 at the top row j = 0), the same for every level of detail.
 */
export function buildPolarTiles(g: PolarGrid, tiles = TILES): TileMesh[] {
  const { heights: h, nx, ny, cellM } = g;
  const xMin = GRID.xMinM;
  const yMax = GRID.yMaxM;
  const W = GRID.nx * GRID.cellM;
  const H = GRID.ny * GRID.cellM;
  // Scene position of every vertex once (float64); the normals read their neighbours from here.
  const all = new Float64Array(nx * ny * 3);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const p = toScene(POLAR_FRAME, mapToMe(xMin + (i + 0.5) * cellM, yMax - (j + 0.5) * cellM, h[j * nx + i]));
      all.set(p, 3 * (j * nx + i));
    }
  }
  const P = (i: number, j: number, dh = 0): V3 => {
    const ic = Math.min(Math.max(i, 0), nx - 1);
    const jc = Math.min(Math.max(j, 0), ny - 1);
    if (dh !== 0) {
      return toScene(POLAR_FRAME, mapToMe(xMin + (ic + 0.5) * cellM, yMax - (jc + 0.5) * cellM, h[jc * nx + ic] + dh));
    }
    const k = 3 * (jc * nx + ic);
    return [all[k], all[k + 1], all[k + 2]];
  };
  const out: TileMesh[] = [];
  const stepI = Math.ceil((nx - 1) / tiles);
  const stepJ = Math.ceil((ny - 1) / tiles);
  for (let tj = 0; tj < tiles; tj++) {
    for (let ti = 0; ti < tiles; ti++) {
      const i0 = ti * stepI;
      const j0 = tj * stepJ;
      const i1 = Math.min(i0 + stepI, nx - 1);
      const j1 = Math.min(j0 + stepJ, ny - 1);
      if (i0 >= i1 || j0 >= j1) continue;
      const ni = i1 - i0 + 1;
      const nj = j1 - j0 + 1;
      const edges = { left: i0 === 0, right: i1 === nx - 1, top: j0 === 0, bottom: j1 === ny - 1 };
      const skirtVerts = (edges.left ? nj : 0) + (edges.right ? nj : 0) + (edges.top ? ni : 0) + (edges.bottom ? ni : 0);
      const nv = ni * nj + skirtVerts;
      const position = new Float32Array(nv * 3);
      const normal = new Float32Array(nv * 3);
      const uv = new Float32Array(nv * 2);
      const offset = P(Math.round((i0 + i1) / 2), Math.round((j0 + j1) / 2));
      const put = (v: number, p: V3, n: V3, i: number, j: number) => {
        position[3 * v] = p[0] - offset[0];
        position[3 * v + 1] = p[1] - offset[1];
        position[3 * v + 2] = p[2] - offset[2];
        normal.set(n, 3 * v);
        uv[2 * v] = (i + 0.5) * cellM / W;
        uv[2 * v + 1] = (j + 0.5) * cellM / H;
      };
      const normalAt = (i: number, j: number): V3 => unit(cross(sub(P(i + 1, j), P(i - 1, j)), sub(P(i, j - 1), P(i, j + 1))));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) put((j - j0) * ni + (i - i0), P(i, j), normalAt(i, j), i, j);
      }
      const idx: number[] = [];
      for (let j = 0; j < nj - 1; j++) {
        for (let i = 0; i < ni - 1; i++) {
          const a = j * ni + i;
          const b = a + 1;
          const c = a + ni;
          const d = c + 1;
          idx.push(a, c, b, b, c, d); // counter-clockwise seen from above (+Y)
        }
      }
      // Skirt: each outer edge gets a copy of its vertices 3 km lower, both windings (seen from both sides).
      let v = ni * nj;
      const skirt = (cells: [number, number][]) => {
        const first = v;
        for (const [i, j] of cells) put(v++, P(i, j, -SKIRT_M), normalAt(i, j), i, j);
        for (let k = 0; k < cells.length - 1; k++) {
          const [i, j] = cells[k];
          const [i2, j2] = cells[k + 1];
          const a = (j - j0) * ni + (i - i0);
          const b = (j2 - j0) * ni + (i2 - i0);
          const c = first + k;
          const d = first + k + 1;
          idx.push(a, c, b, b, c, d, a, b, c, b, d, c);
        }
      };
      const col = (i: number) => Array.from({ length: nj }, (_, k) => [i, j0 + k] as [number, number]);
      const row = (j: number) => Array.from({ length: ni }, (_, k) => [i0 + k, j] as [number, number]);
      if (edges.left) skirt(col(0));
      if (edges.right) skirt(col(nx - 1));
      if (edges.top) skirt(row(0));
      if (edges.bottom) skirt(row(ny - 1));
      out.push({ offset, position, normal, uv, index: Uint32Array.from(idx) });
    }
  }
  return out;
}

/** Ring distances (m) of the radial cap: geometric from `d0` to `dMax` (§4.4). */
export function ringDistances(d0 = 50, dMax = 300_000, ratio = 1.075): number[] {
  const out: number[] = [];
  for (let d = d0; d < dMax; d *= ratio) out.push(d);
  out.push(dMax);
  return out;
}

/**
 * Radial mesh around the anchor of `f` (§4.2, §4.4): a regular grid of (`nAz` + 1) azimuth columns
 * (the last one repeats the first, so a texture indexed by azimuth wraps without a seam) × (1 +
 * `dist.length`) rings, ring 0 being the anchor itself at `centreH`. Heights from
 * `heightAt(azIndex, ringIndex)` (m above the sphere). `uv` = ((b + 0.5)/nb, (j + 0.5)/nAz): the
 * texel of bin b and azimuth j of a radial texture (the shadow pass of the profile scene, §6.3).
 * With `sphereNormals`, normals are radial (a smooth Moon); otherwise from the neighbours.
 */
export function buildRadialMesh(
  f: SceneFrame,
  nAz: number,
  dist: ArrayLike<number>,
  heightAt: (j: number, b: number) => number,
  centreH: number,
  sphereNormals: boolean,
): TileMesh {
  const nb = dist.length;
  const nr = nb + 1;
  const nv = (nAz + 1) * nr;
  const position = new Float32Array(nv * 3);
  const normal = new Float32Array(nv * 3);
  const uv = new Float32Array(nv * 2);
  const centre = scale(f.u, R_M + centreH);
  const me: V3[] = new Array(nAz * nr);
  for (let j = 0; j < nAz; j++) {
    const a = (2 * Math.PI * j) / nAz;
    const T = add(scale(f.n, Math.cos(a)), scale(f.e, Math.sin(a)));
    me[j * nr] = centre;
    for (let b = 0; b < nb; b++) {
      const th = dist[b] / R_M;
      me[j * nr + 1 + b] = scale(add(scale(f.u, Math.cos(th)), scale(T, Math.sin(th))), R_M + heightAt(j, b));
    }
  }
  const at = (j: number, r: number) => me[(((j % nAz) + nAz) % nAz) * nr + r];
  const offset = toScene(f, centre);
  const vid = (j: number, r: number) => j * nr + r;
  for (let j = 0; j <= nAz; j++) {
    for (let r = 0; r < nr; r++) {
      const v = vid(j, r);
      const p = at(j, r);
      const s = toScene(f, p);
      position.set([s[0] - offset[0], s[1] - offset[1], s[2] - offset[2]], 3 * v);
      let n: V3;
      if (sphereNormals || r === 0) n = rotToScene(f, unit(p));
      else {
        const along = sub(at(j, Math.min(r + 1, nr - 1)), at(j, r - 1));
        const across = sub(at(j + 1, r), at(j - 1, r));
        n = rotToScene(f, unit(cross(across, along)));
        if (dot(n, rotToScene(f, unit(p))) < 0) n = scale(n, -1); // always the outward side
      }
      normal.set(n, 3 * v);
      uv[2 * v] = (Math.max(r - 1, 0) + 0.5) / nb;
      uv[2 * v + 1] = (j + 0.5) / nAz;
    }
  }
  const idx: number[] = [];
  const up = rotToScene(f, f.u);
  const ccw = (a: number, b: number, c: number) => {
    const pa = position.subarray(3 * a, 3 * a + 3);
    const ab: V3 = [position[3 * b] - pa[0], position[3 * b + 1] - pa[1], position[3 * b + 2] - pa[2]];
    const ac: V3 = [position[3 * c] - pa[0], position[3 * c + 1] - pa[1], position[3 * c + 2] - pa[2]];
    const n = cross(ab, ac);
    if (n[0] * up[0] + n[1] * up[1] + n[2] * up[2] >= 0) idx.push(a, b, c);
    else idx.push(a, c, b);
  };
  for (let j = 0; j < nAz; j++) {
    // Ring 0 is the anchor in every column: the first band is a fan of single triangles.
    ccw(vid(j, 0), vid(j, 1), vid(j + 1, 1));
    for (let r = 1; r < nr - 1; r++) {
      ccw(vid(j, r), vid(j, r + 1), vid(j + 1, r));
      ccw(vid(j + 1, r), vid(j, r + 1), vid(j + 1, r + 1));
    }
  }
  return { offset, position, normal, uv, index: Uint32Array.from(idx) };
}
