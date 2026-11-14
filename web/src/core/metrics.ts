// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Metrics of a scenario (07_visibilidad.md §7, §10): hours of Sun, Earth and both, longest night
// and link gap, elevation extremes, next events (F6), curves (F5) and the smooth-Moon effect (F4).
import { findSegment, type EphemerisTable } from './ephemeris';
import {
  complementWindows,
  earthMarginFn,
  findCrossings,
  intersectWindows,
  longestHours,
  SCAN_STEP_S,
  sunMarginFn,
  windowHours,
  windowsFrom,
  type EventKind,
  type SkyEvent,
  type Window,
} from './events';
import { skyAt, type SiteFrame } from './frames';
import { horizonAt, type Mask } from './horizon';
import { DAY_S } from './time';
import { evaluate, type SkyState } from './visibility';

/** Countdown search horizon (07 §7, F6): 60 days after the cursor, even past the mission end. */
export const NEXT_EVENT_HORIZON_S = 60 * DAY_S;

/** Text of the truncation warning (07 §7). */
export const TRUNCATED_WARNING = 'Mission extends beyond available ephemeris; results truncated.';

export interface MissionInterval {
  landingUnix: number;
  missionDays: number;
}

export interface NextEvent {
  /** Expected event kind, also when none is found (`No sunset in the next 60 days`). */
  kind: EventKind;
  /** Null when there is none within 60 days (or before the end of the table). */
  tUnix: number | null;
}

export interface Metrics {
  /** Analysed interval; `tB` is clipped to the end of the table segment (`truncated`). */
  tA: number;
  tB: number;
  truncated: boolean;
  /** State at the cursor, or null if the cursor is outside the table. */
  now: SkyState | null;
  sunHours: number;
  earthHours: number;
  bothHours: number;
  sunPct: number;
  earthPct: number;
  bothPct: number;
  longestNightH: number;
  longestLinkGapH: number;
  sunElMaxDeg: number;
  sunElMinDeg: number;
  nextSunEvent: NextEvent | null;
  nextEarthEvent: NextEvent | null;
  windows: { sun: Window[]; earth: Window[]; both: Window[]; nights: Window[]; linkGaps: Window[] };
  events: SkyEvent[];
}

/** Mission interval clipped to the table segment of the landing (throws RangeError if outside). */
export function missionInterval(table: EphemerisTable, m: MissionInterval): { tA: number; tB: number; truncated: boolean } {
  const tA = m.landingUnix;
  const seg = findSegment(table, tA);
  if (!seg) throw new RangeError('Date outside the supported range (1969–1972 and 2024–2044).');
  const end = tA + m.missionDays * DAY_S;
  return end > seg.validToUnix ? { tA, tB: seg.validToUnix, truncated: true } : { tA, tB: end, truncated: false };
}

/** Next sunset (if the Sun is up at `t`) or sunrise, within 60 days and the table segment. */
export function nextEvent(
  f: (t: number) => number,
  table: EphemerisTable,
  t: number,
  kinds: [EventKind, EventKind],
): NextEvent | null {
  const seg = findSegment(table, t);
  if (!seg) return null;
  const tB = Math.min(t + NEXT_EVENT_HORIZON_S, seg.validToUnix);
  const { crossings, initialState } = findCrossings(f, t, tB, SCAN_STEP_S, true);
  const kind = initialState ? kinds[1] : kinds[0];
  return { kind, tUnix: crossings.length ? crossings[0].t : null };
}

/** All §7 metrics of a mission with a mask; `cursorUnix` drives the state and the countdowns. */
export function missionMetrics(
  table: EphemerisTable,
  frame: SiteFrame,
  mask: Mask,
  mission: MissionInterval,
  cursorUnix: number,
): Metrics {
  const { tA, tB, truncated } = missionInterval(table, mission);
  const sunF = sunMarginFn(table, frame, mask);
  const earthF = earthMarginFn(table, frame, mask);
  const sunC = findCrossings(sunF, tA, tB);
  const earthC = findCrossings(earthF, tA, tB);
  const sun = windowsFrom(sunC.crossings, sunC.initialState, tA, tB);
  const earth = windowsFrom(earthC.crossings, earthC.initialState, tA, tB);
  const both = intersectWindows(sun, earth);
  const nights = complementWindows(sun, tA, tB);
  const linkGaps = complementWindows(earth, tA, tB);

  // Elevation extremes on the 10-min grid: tA, tA + 600, …, and tB (the scan grid of 07 §6.1).
  let elMax = -Infinity;
  let elMin = Infinity;
  for (let t = tA; ; t = Math.min(t + SCAN_STEP_S, tB)) {
    const el = skyAt(table, frame, t).sun.elDeg;
    if (el > elMax) elMax = el;
    if (el < elMin) elMin = el;
    if (t >= tB) break;
  }

  const hours = (tB - tA) / 3600;
  const pct = (h: number) => (hours > 0 ? (h / hours) * 100 : 0);
  const sunHours = windowHours(sun);
  const earthHours = windowHours(earth);
  const bothHours = windowHours(both);
  const inTable = findSegment(table, cursorUnix) !== undefined;

  const events: SkyEvent[] = [
    ...sunC.crossings.map((c): SkyEvent => ({ tUnix: c.t, kind: c.rising ? 'sunrise' : 'sunset' })),
    ...earthC.crossings.map((c): SkyEvent => ({ tUnix: c.t, kind: c.rising ? 'earthrise' : 'earthset' })),
  ].sort((x, y) => x.tUnix - y.tUnix);

  return {
    tA,
    tB,
    truncated,
    now: inTable ? evaluate(table, frame, mask, cursorUnix) : null,
    sunHours,
    earthHours,
    bothHours,
    sunPct: pct(sunHours),
    earthPct: pct(earthHours),
    bothPct: pct(bothHours),
    longestNightH: longestHours(nights),
    longestLinkGapH: longestHours(linkGaps),
    sunElMaxDeg: elMax,
    sunElMinDeg: elMin,
    nextSunEvent: nextEvent(sunF, table, cursorUnix, ['sunrise', 'sunset']),
    nextEarthEvent: nextEvent(earthF, table, cursorUnix, ['earthrise', 'earthset']),
    windows: { sun, earth, both, nights, linkGaps },
    events,
  };
}

export interface Curves {
  t: Float64Array;
  sunElDeg: Float64Array;
  sunHorizonDeg: Float64Array;
  earthElDeg: Float64Array;
  earthHorizonDeg: Float64Array;
}

/**
 * Elevation of the Sun and the Earth and the horizon at their azimuth on the 10-min grid of
 * [tA, tB] (F5). Instants outside the table are NaN (the chart leaves a gap).
 */
export function curves(table: EphemerisTable, frame: SiteFrame, mask: Mask, tA: number, tB: number, step = SCAN_STEP_S): Curves {
  const n = Math.max(1, Math.ceil((tB - tA) / step) + 1);
  const c: Curves = {
    t: new Float64Array(n),
    sunElDeg: new Float64Array(n),
    sunHorizonDeg: new Float64Array(n),
    earthElDeg: new Float64Array(n),
    earthHorizonDeg: new Float64Array(n),
  };
  for (let i = 0; i < n; i++) {
    const t = Math.min(tA + i * step, tB);
    c.t[i] = t;
    if (!findSegment(table, t)) {
      c.sunElDeg[i] = c.sunHorizonDeg[i] = c.earthElDeg[i] = c.earthHorizonDeg[i] = Number.NaN;
      continue;
    }
    const s = skyAt(table, frame, t);
    c.sunElDeg[i] = s.sun.elDeg;
    c.sunHorizonDeg[i] = horizonAt(mask.elDeg, s.sun.azDeg);
    c.earthElDeg[i] = s.earth.elDeg;
    c.earthHorizonDeg[i] = horizonAt(mask.elDeg, s.earth.azDeg);
  }
  return c;
}

export interface TerrainEffect {
  /** real − smooth, hours. */
  dSunHours: number;
  dEarthHours: number;
  /** real − smooth time of the first solar event of the mission, seconds; null if not comparable. */
  firstSunEventShiftS: number | null;
}

/**
 * F4: the same metrics with the real mask and with the smooth mask, same frame (07 §7). The first
 * solar event is comparable only when both runs have one and it is of the same kind.
 */
export function terrainEffect(real: Metrics, smooth: Metrics): TerrainEffect {
  const first = (m: Metrics) => m.events.find((e) => e.kind === 'sunrise' || e.kind === 'sunset');
  const r = first(real);
  const s = first(smooth);
  return {
    dSunHours: real.sunHours - smooth.sunHours,
    dEarthHours: real.earthHours - smooth.earthHours,
    firstSunEventShiftS: r && s && r.kind === s.kind ? r.tUnix - s.tUnix : null,
  };
}

