// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Crossings, events and windows (07_visibilidad.md §6). Times in Unix seconds.
import type { EphemerisTable } from './ephemeris';
import type { SiteFrame } from './frames';
import type { Mask } from './horizon';
import { margins } from './visibility';

/** Scan step of the crossing search (07 §6.1): windows shorter than 10 min are ignored on purpose. */
export const SCAN_STEP_S = 600;

export type EventKind =
  | 'sunrise'
  | 'sunset'
  | 'earthrise'
  | 'earthset'
  | 'eclipse_start'
  | 'eclipse_end'
  | 'totality_start'
  | 'totality_end';

export interface SkyEvent {
  tUnix: number;
  kind: EventKind;
}

export interface Crossing {
  t: number;
  /** The condition starts to hold (margin goes from ≤ 0 to > 0). */
  rising: boolean;
}

export interface Window {
  startUnix: number;
  endUnix: number;
  /** The window continues before / after the analysed interval. */
  openStart: boolean;
  openEnd: boolean;
}

/** Round half up (07 §12.7). */
const roundHalfUp = (x: number) => Math.floor(x + 0.5);

function bisect(f: (t: number) => number, lo: number, hi: number, up: boolean): number {
  while (hi - lo > 1) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0 === up) hi = mid;
    else lo = mid;
  }
  return roundHalfUp((lo + hi) / 2);
}

/**
 * Sign changes of `f` (positive = the condition holds) in [tA, tB], scanning every `step` seconds
 * and bisecting each change to 1 s (07 §6.1). `first = true` stops at the first crossing.
 */
export function findCrossings(
  f: (t: number) => number,
  tA: number,
  tB: number,
  step = SCAN_STEP_S,
  first = false,
): { crossings: Crossing[]; initialState: boolean } {
  const out: Crossing[] = [];
  let t0 = tA;
  let m0 = f(t0);
  const initialState = m0 > 0;
  while (t0 < tB) {
    const t1 = Math.min(t0 + step, tB);
    const m1 = f(t1);
    if (m0 > 0 !== m1 > 0) {
      const up = m1 > 0;
      out.push({ t: bisect(f, t0, t1, up), rising: up });
      if (first) break;
    }
    t0 = t1;
    m0 = m1;
  }
  return { crossings: out, initialState };
}

/** Windows where the condition holds, from its crossings (07 §6.3). */
export function windowsFrom(crossings: Crossing[], initialState: boolean, tA: number, tB: number): Window[] {
  const ws: Window[] = [];
  let open: number | null = initialState ? tA : null;
  let openStart = initialState;
  for (const c of crossings) {
    if (c.rising && open === null) {
      open = c.t;
      openStart = false;
    }
    if (!c.rising && open !== null) {
      ws.push({ startUnix: open, endUnix: c.t, openStart, openEnd: false });
      open = null;
    }
  }
  if (open !== null) ws.push({ startUnix: open, endUnix: tB, openStart, openEnd: true });
  return ws;
}

/** Intersection of two sorted, non-overlapping window lists (Sun and Earth → both). */
export function intersectWindows(a: Window[], b: Window[]): Window[] {
  const out: Window[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const s = Math.max(a[i].startUnix, b[j].startUnix);
    const e = Math.min(a[i].endUnix, b[j].endUnix);
    if (s < e) {
      // Open at an end only if every window that sets that end is open there.
      out.push({
        startUnix: s,
        endUnix: e,
        openStart: (s === a[i].startUnix ? a[i].openStart : true) && (s === b[j].startUnix ? b[j].openStart : true),
        openEnd: (e === a[i].endUnix ? a[i].openEnd : true) && (e === b[j].endUnix ? b[j].openEnd : true),
      });
    }
    if (a[i].endUnix < b[j].endUnix) i++;
    else j++;
  }
  return out;
}

/** Complement of sorted windows inside [tA, tB] (nights = complement of Sun windows, 07 §6.3). */
export function complementWindows(ws: Window[], tA: number, tB: number): Window[] {
  const out: Window[] = [];
  let cursor = tA;
  let cursorOpen = true;
  for (const w of ws) {
    if (w.startUnix > cursor) {
      out.push({ startUnix: cursor, endUnix: w.startUnix, openStart: cursorOpen, openEnd: false });
    }
    cursor = Math.max(cursor, w.endUnix);
    cursorOpen = false;
  }
  if (cursor < tB) out.push({ startUnix: cursor, endUnix: tB, openStart: cursorOpen, openEnd: true });
  return out;
}

/** Total length of windows in hours. */
export function windowHours(ws: Window[]): number {
  let s = 0;
  for (const w of ws) s += w.endUnix - w.startUnix;
  return s / 3600;
}

/** Longest window in hours (0 if none). */
export function longestHours(ws: Window[]): number {
  let m = 0;
  for (const w of ws) m = Math.max(m, w.endUnix - w.startUnix);
  return m / 3600;
}

export function sunMarginFn(table: EphemerisTable, frame: SiteFrame, mask: Mask): (t: number) => number {
  return (t) => margins(table, frame, mask, t).sun;
}

export function earthMarginFn(table: EphemerisTable, frame: SiteFrame, mask: Mask): (t: number) => number {
  return (t) => margins(table, frame, mask, t).earth;
}

/** Sunrise/sunset and Earthrise/Earthset in [tA, tB], sorted by time (07 §6.2). Eclipses: F13. */
export function findEvents(table: EphemerisTable, frame: SiteFrame, mask: Mask, tA: number, tB: number): SkyEvent[] {
  const sun = findCrossings(sunMarginFn(table, frame, mask), tA, tB).crossings;
  const earth = findCrossings(earthMarginFn(table, frame, mask), tA, tB).crossings;
  const events: SkyEvent[] = [
    ...sun.map((c): SkyEvent => ({ tUnix: c.t, kind: c.rising ? 'sunrise' : 'sunset' })),
    ...earth.map((c): SkyEvent => ({ tUnix: c.t, kind: c.rising ? 'earthrise' : 'earthset' })),
  ];
  return events.sort((x, y) => x.tUnix - y.tUnix);
}
