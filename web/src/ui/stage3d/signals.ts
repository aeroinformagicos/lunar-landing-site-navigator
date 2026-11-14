// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Geometry of the signals in the scene (16_vista_3d.md §8): region outlines on the terrain, the Sun
// and Earth paths on a dome around the site, the horizon crest and the blocking point. Pure.
import { horizonAt, type Mask } from '../../core/horizon';
import { add, scale, type V3 } from './frame';
import type { TracePoint } from '../panorama/texts';

/** Outline of a map box `[x0, y0, x1, y1]` sampled every `stepM`, `liftM` above the terrain (§8.2). */
export function regionOutline(box: readonly [number, number, number, number], toScene: (x: number, y: number, liftM: number) => V3, stepM = 250, liftM = 15): V3[] {
  const [x0, y0, x1, y1] = box;
  const corners: [number, number][] = [
    [x0, y1],
    [x1, y1],
    [x1, y0],
    [x0, y0],
    [x0, y1],
  ];
  const out: V3[] = [];
  for (let k = 0; k < 4; k++) {
    const [ax, ay] = corners[k];
    const [bx, by] = corners[k + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / stepM));
    for (let i = 0; i < n; i++) out.push(toScene(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n, liftM));
  }
  out.push(out[0]);
  return out;
}

export interface PathRun {
  /** The body's centre is above the computed horizon along this run. */
  visible: boolean;
  points: V3[];
}

export interface PathOnDome {
  runs: PathRun[];
  /** Daily marks (every 24 h from the landing) with their day number. */
  ticks: { pos: V3; day: number }[];
  /** First and last points, for the end label. */
  end: V3 | null;
}

/**
 * A body's path along the mission on a dome of `radiusM` around the eye (§8.3), split into runs
 * above and below the computed horizon (`el > horizonAt`, the project's centre rule).
 */
export function pathOnDome(trace: readonly TracePoint[], mask: Mask, eye: V3, radiusM: number, dirOf: (azDeg: number, elDeg: number) => V3): PathOnDome {
  const runs: PathRun[] = [];
  const ticks: { pos: V3; day: number }[] = [];
  let cur: PathRun | null = null;
  trace.forEach((p, k) => {
    const pos = add(eye, scale(dirOf(p.azDeg, p.elDeg), radiusM));
    const visible = p.elDeg > horizonAt(mask.elDeg, p.azDeg);
    if (!cur || cur.visible !== visible) {
      // Runs share their joining point, so the line has no gap.
      const prev: V3 | undefined = cur?.points[cur.points.length - 1];
      cur = { visible, points: prev ? [prev] : [] };
      runs.push(cur);
    }
    cur.points.push(pos);
    if (p.daily) ticks.push({ pos, day: Math.round(k / 24) });
  });
  const last = runs.length ? runs[runs.length - 1].points : [];
  return { runs, ticks, end: last.length ? last[last.length - 1] : null };
}

/** The 720 blocking points of the mask as a closed line; `at(j)` gives the scene point of sample j. */
export function crestLine(at: (j: number) => V3 | null, nAz = 720): V3[] {
  const out: V3[] = [];
  for (let j = 0; j <= nAz; j++) {
    const p = at(j % nAz);
    if (p) out.push(p);
  }
  return out;
}

/** Indices of the crest samples within ±halfDeg of an azimuth (0.5° per sample), in order. */
export function crestIndices(azDeg: number, halfDeg = 3, step = 0.5, nAz = 720): number[] {
  const c = Math.round((((azDeg % 360) + 360) % 360) / step);
  const h = Math.round(halfDeg / step);
  const out: number[] = [];
  for (let k = -h; k <= h; k++) out.push((((c + k) % nAz) + nAz) % nAz);
  return out;
}

/** «Nice» scale-bar length (1, 2 or 5 × 10ⁿ m) between 60 and 120 px at `mPerPx` (§8.6). */
export function scaleBar(mPerPx: number): { metres: number; px: number } | null {
  if (!(mPerPx > 0) || !Number.isFinite(mPerPx)) return null;
  for (let e = -1; e < 8; e++) {
    for (const m of [1, 2, 5]) {
      const metres = m * 10 ** e;
      const px = metres / mPerPx;
      if (px >= 60 && px <= 150) return { metres, px };
    }
  }
  return null;
}
