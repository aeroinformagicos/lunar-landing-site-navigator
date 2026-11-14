// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Geometry of the timeline (10_interfaz.md §6.2): time axis from landing − 10 % to landing + mission
// + 10 %, day ticks, automatic elevation scale, bars from windows and the pointer → cursor mapping
// (same 10-min grid as the slider). Pure, tested without a DOM.
import type { SkyEvent, Window } from '../../core/events';
import type { Curves } from '../../core/metrics';
import { DAY_S } from '../../core/time';
import { SLIDER_STEP_S } from '../../state/selectors';
import { formatUtc } from '../common/format';
import { eventWord } from '../metrics/derive';

/** Displayed interval: the mission with 10 % on each side. */
export function displayRange(landingUnix: number, missionDays: number): { t0: number; t1: number } {
  const d = missionDays * DAY_S;
  return { t0: landingUnix - 0.1 * d, t1: landingUnix + 1.1 * d };
}

export interface TimeScale {
  t0: number;
  t1: number;
  x0: number;
  x1: number;
  x(t: number): number;
  t(x: number): number;
}

export function timeScale(t0: number, t1: number, x0: number, x1: number): TimeScale {
  const k = (x1 - x0) / (t1 - t0);
  return { t0, t1, x0, x1, x: (t) => x0 + (t - t0) * k, t: (x) => t0 + (x - x0) / k };
}

/**
 * Cursor for a pointer at `x`: the time under the pointer snapped to the slider grid
 * (landing + k·10 min) and clamped to the mission, so dragging the line equals moving the slider.
 */
export function cursorFromX(x: number, scale: TimeScale, landingUnix: number, endUnix: number): number {
  const raw = scale.t(x);
  const snapped = landingUnix + Math.round((raw - landingUnix) / SLIDER_STEP_S) * SLIDER_STEP_S;
  return Math.min(Math.max(snapped, landingUnix), endUnix);
}

/** `Day k` ticks at landing + k days inside the displayed range. */
export function dayTicks(landingUnix: number, t0: number, t1: number): { t: number; day: number; date: string }[] {
  const out = [];
  for (let k = Math.ceil((t0 - landingUnix) / DAY_S); landingUnix + k * DAY_S <= t1; k++) {
    const t = landingUnix + k * DAY_S;
    out.push({ t, day: k, date: formatUtc(t).slice(0, 10) });
  }
  return out;
}

/** Elevation range covering both curves, both horizons and 0°, with 10 % padding (ignores NaN). */
export function elevationDomain(c: Curves): { min: number; max: number } {
  let lo = 0;
  let hi = 0;
  for (const a of [c.sunElDeg, c.earthElDeg, c.sunHorizonDeg, c.earthHorizonDeg]) {
    for (let i = 0; i < a.length; i++) {
      const v = a[i];
      if (Number.isNaN(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  const pad = Math.max(0.1 * (hi - lo), 0.5);
  return { min: lo - pad, max: hi + pad };
}

/** One rectangle per window, in pixels. */
export function barSegments(ws: Window[], scale: TimeScale): { x: number; w: number; openStart: boolean; openEnd: boolean }[] {
  return ws.map((w) => ({ x: scale.x(w.startUnix), w: scale.x(w.endUnix) - scale.x(w.startUnix), openStart: w.openStart, openEnd: w.openEnd }));
}

/** Accessible name of an event marker: `Sunset, 2027-08-09 03:12 UTC`. */
export function eventLabel(e: SkyEvent): string {
  return `${eventWord(e.kind)}, ${formatUtc(e.tUnix)}`;
}
