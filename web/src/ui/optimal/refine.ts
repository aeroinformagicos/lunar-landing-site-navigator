// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Main-thread refinement of the worker's best points (08_mapa_polar.md §10.2): the exact window of
// «both» that starts at t0, with the full mask of the cube, the 10-min grid and bisection (07 §6).
import type { EphemerisTable } from '../../core/ephemeris';
import { findCrossings } from '../../core/events';
import type { Mask } from '../../core/horizon';
import { frameFor, margins } from '../../core/visibility';

/** Hours from t0 while Sun and Earth are both above the full mask (capped at `maxHours`). */
export function exactBothHours(table: EphemerisTable, mask: Mask, latDeg: number, lonDeg: number, t0: number, maxHours: number): { hours: number; capped: boolean } {
  const frame = frameFor(latDeg, lonDeg, mask);
  const f = (t: number) => {
    const m = margins(table, frame, mask, t);
    return Math.min(m.sun, m.earth);
  };
  const { crossings, initialState } = findCrossings(f, t0, t0 + maxHours * 3600, 600, true);
  if (!initialState) return { hours: 0, capped: false };
  if (crossings.length === 0) return { hours: maxHours, capped: true };
  return { hours: (crossings[0].t - t0) / 3600, capped: false };
}
