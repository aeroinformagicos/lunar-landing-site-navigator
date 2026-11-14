// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Requirement evaluation of a scenario (07_visibilidad.md §8.1, §8.2): `go`, `marginal` or `no_go`
// with the checks and the reason codes for the plain summary (10_interfaz.md §8).
// T-17 added `assess`; T-27 adds the matrix row and the next valid window (ranking: core/ranking.ts).
import { findSegment, type EphemerisTable } from './ephemeris';
import type { SiteFrame } from './frames';
import type { Mask } from './horizon';
import type { Metrics } from './metrics';
import { evaluate, margins, type SkyState } from './visibility';

export interface Requirements {
  needSunAtLanding: boolean;
  needEarthAtLanding: boolean;
  maxNightHours: number;
  marginalEarthMarginDeg: number;
  marginalSunFraction: number;
}

export type Status = 'go' | 'marginal' | 'no_go';

export type ReasonCode =
  | 'no_sun_at_landing'
  | 'no_earth_at_landing'
  | 'night_too_long'
  | 'sun_partly_hidden'
  | 'earth_low'
  | 'night_near_limit';

export interface Assessment {
  status: Status;
  checks: { sunAtLanding: boolean; earthAtLanding: boolean; nightOk: boolean };
  longestNightH: number;
  bothPct: number;
  reasons: ReasonCode[];
}

/** Share of the night limit above which a night counts as close to it (07 §8.2). */
export const NIGHT_NEAR_LIMIT = 0.75;

/**
 * 07 §8.2 with the state at landing (`evaluate(…, landing)`) and the mission metrics. Reasons: the
 * failed checks for `no_go`, otherwise the low-margin conditions for `marginal`.
 */
export function assess(atLanding: SkyState, m: Metrics, req: Requirements): Assessment {
  const checks = {
    sunAtLanding: !req.needSunAtLanding || atLanding.sun.visible,
    earthAtLanding: !req.needEarthAtLanding || atLanding.earth.visible,
    nightOk: m.longestNightH <= req.maxNightHours,
  };
  const reasons: ReasonCode[] = [];
  let status: Status;
  if (!(checks.sunAtLanding && checks.earthAtLanding && checks.nightOk)) {
    status = 'no_go';
    if (!checks.sunAtLanding) reasons.push('no_sun_at_landing');
    if (!checks.earthAtLanding) reasons.push('no_earth_at_landing');
    if (!checks.nightOk) reasons.push('night_too_long');
  } else {
    if (req.needSunAtLanding && atLanding.sun.discFraction < req.marginalSunFraction - 1e-9) reasons.push('sun_partly_hidden');
    if (req.needEarthAtLanding && atLanding.earth.marginDeg < req.marginalEarthMarginDeg) reasons.push('earth_low');
    if (m.longestNightH > NIGHT_NEAR_LIMIT * req.maxNightHours) reasons.push('night_near_limit');
    status = reasons.length ? 'marginal' : 'go';
  }
  return { status, checks, longestNightH: m.longestNightH, bothPct: m.bothPct, reasons };
}

// ---- Replanning matrix and next window (07 §8.3, §8.4), on the 10-min grid without bisection ----


/** Grid step of the matrix (07 §8.3). */
export const GRID_S = 600;
/** Columns of the matrix: delays k·Δ for k = 0…30. */
export const MATRIX_COLUMNS = 31;
/** `next_valid_landing` looks 90 days ahead, landing every hour (07 §8.4). */
export const NEXT_WINDOW_DAYS = 90;
const HOUR_STEPS = 3600 / GRID_S;

export interface Cell {
  landingUnix: number;
  /** Null when part of the mission falls outside the ephemeris table. */
  status: Status | null;
  sunAtLanding: boolean;
  earthAtLanding: boolean;
  longestNightH: number;
  reasons: ReasonCode[];
}

/** Sun and Earth visibility (07 §3) on the 10-min grid from `t0`; null outside the table. */
export interface Grid {
  t0: number;
  sun: (boolean | null)[];
  earth: (boolean | null)[];
  /** Runs of `sun === false`: [first, last] sample indices (inclusive). */
  nights: [number, number][];
}

export function visibilityGrid(table: EphemerisTable, frame: SiteFrame, mask: Mask, t0: number, spanS: number): Grid {
  const n = Math.floor(spanS / GRID_S) + 1;
  const sun: (boolean | null)[] = new Array(n);
  const earth: (boolean | null)[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = t0 + i * GRID_S;
    if (!findSegment(table, t)) {
      sun[i] = earth[i] = null;
      continue;
    }
    const m = margins(table, frame, mask, t);
    sun[i] = m.sun > 0;
    earth[i] = m.earth > 0;
  }
  const nights: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    if (sun[i] !== false) continue;
    const start = i;
    while (i + 1 < n && sun[i + 1] === false) i++;
    nights.push([start, i]);
  }
  return { t0, sun, earth, nights };
}

/**
 * Longest night inside samples [i0, i1], in hours. A run of k night samples counts as k × 10 min
 * (D-82): the matrix resolution; the exact figure comes from `missionMetrics` when a cell is chosen.
 */
export function longestNightIn(g: Grid, i0: number, i1: number): number {
  let best = 0;
  for (const [a, b] of g.nights) {
    if (b < i0 || a > i1) continue;
    best = Math.max(best, Math.min(b, i1) - Math.max(a, i0) + 1);
  }
  return (best * GRID_S) / 3600;
}

/** 07 §8.2 status of a landing at sample i0 with `missionSteps` samples of mission, from the grid. */
export function cellAt(
  g: Grid,
  i0: number,
  missionSteps: number,
  req: Requirements,
  table: EphemerisTable,
  frame: SiteFrame,
  mask: Mask,
): Cell {
  const landingUnix = g.t0 + i0 * GRID_S;
  const i1 = i0 + missionSteps;
  let complete = i1 < g.sun.length;
  for (let i = i0; complete && i <= i1; i++) if (g.sun[i] === null) complete = false;
  if (!complete) return { landingUnix, status: null, sunAtLanding: false, earthAtLanding: false, longestNightH: 0, reasons: [] };
  const sunAtLanding = g.sun[i0] === true;
  const earthAtLanding = g.earth[i0] === true;
  const longestNightH = longestNightIn(g, i0, i1);
  // Margins for `marginal` with evaluate() only at T[i0] (07 §8.3); visibility from the grid.
  const s = evaluate(table, frame, mask, landingUnix);
  const atLanding = {
    ...s,
    sun: { ...s.sun, visible: sunAtLanding },
    earth: { ...s.earth, visible: earthAtLanding },
  };
  const a = assess(atLanding, { longestNightH, bothPct: 0 } as Metrics, req);
  return { landingUnix, status: a.status, sunAtLanding, earthAtLanding, longestNightH, reasons: a.reasons };
}

/** One matrix row: 31 landings t0 + k·Δ, each with the mission length D (07 §8.3). */
export function replanRow(
  table: EphemerisTable,
  frame: SiteFrame,
  mask: Mask,
  t0: number,
  deltaS: number,
  missionDays: number,
  req: Requirements,
): Cell[] {
  const missionSteps = Math.round((missionDays * 86_400) / GRID_S);
  const stepK = Math.round(deltaS / GRID_S);
  const g = visibilityGrid(table, frame, mask, t0, (MATRIX_COLUMNS - 1) * deltaS + missionDays * 86_400);
  const row: Cell[] = [];
  for (let k = 0; k < MATRIX_COLUMNS; k++) row.push(cellAt(g, k * stepK, missionSteps, req, table, frame, mask));
  return row;
}

export interface LandingWindow {
  startUnix: number;
  endUnix: number;
  statusAtStart: Status;
}

/** First run of hourly landings that are not `no_go`, within 90 days of t0 (07 §8.4). */
export function nextValidLanding(
  table: EphemerisTable,
  frame: SiteFrame,
  mask: Mask,
  t0: number,
  missionDays: number,
  req: Requirements,
  horizonDays = NEXT_WINDOW_DAYS,
): LandingWindow | null {
  const missionSteps = Math.round((missionDays * 86_400) / GRID_S);
  const g = visibilityGrid(table, frame, mask, t0, (horizonDays + missionDays) * 86_400);
  const last = Math.floor((horizonDays * 86_400) / GRID_S);
  let i = 0;
  let first: Cell | null = null;
  for (; i <= last; i += HOUR_STEPS) {
    const c = cellAt(g, i, missionSteps, req, table, frame, mask);
    if (c.status !== null && c.status !== 'no_go') {
      first = c;
      break;
    }
  }
  if (!first) return null;
  let end = first.landingUnix;
  for (i += HOUR_STEPS; i <= last; i += HOUR_STEPS) {
    const c = cellAt(g, i, missionSteps, req, table, frame, mask);
    if (c.status === null || c.status === 'no_go') break;
    end = c.landingUnix;
  }
  return { startUnix: first.landingUnix, endUnix: end, statusAtStart: first.status! };
}
