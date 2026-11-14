// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Texts and series of the panorama (10_interfaz.md §6.1, F3, F4): `Terrain effect` lines, the ridge
// label, the pointer readout and the trace of the focus body. Pure.
import { findSegment, type EphemerisTable } from '../../core/ephemeris';
import { skyAt, type SiteFrame } from '../../core/frames';
import type { EventKind } from '../../core/events';
import type { TerrainEffect } from '../../core/metrics';
import { HOUR_S } from '../../core/time';
import { formatDeg } from '../common/format';
import { eventWord } from '../metrics/derive';

/** `−2.1 h`, `+0.5 h`, `0 h` (§6.1). */
export function signedHours(h: number): string {
  const r = Math.round(h * 10) / 10;
  if (r === 0) return '0 h';
  return `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(1)} h`;
}

/** `2 h 05 min earlier`, `12 min later`, `no change` (shift = real − smooth, seconds). */
export function shiftText(shiftS: number): string {
  const m = Math.round(Math.abs(shiftS) / 60);
  if (m === 0) return 'no change';
  const h = Math.floor(m / 60);
  const body = h > 0 ? `${h} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`;
  return `${body} ${shiftS < 0 ? 'earlier' : 'later'}`;
}

export interface TerrainEffectLines {
  sunlight: string;
  earthLink: string;
  /** `Sunset: 2 h 05 min earlier` / `later` / `no change`, or which run has no such event. */
  firstEvent: string;
}

/**
 * The three lines of the `Terrain effect` box (F4). `realKind` and `smoothKind` are the first solar
 * event of each run (null if the run has none); the shift is only comparable when they match.
 */
export function terrainEffectLines(fx: TerrainEffect, realKind: EventKind | null, smoothKind: EventKind | null): TerrainEffectLines {
  let firstEvent: string;
  if (realKind && smoothKind && realKind === smoothKind && fx.firstSunEventShiftS !== null) {
    firstEvent = `${eventWord(realKind)}: ${shiftText(fx.firstSunEventShiftS)}`;
  } else if (realKind && !smoothKind) {
    firstEvent = `${eventWord(realKind)}: only with terrain`;
  } else if (!realKind && smoothKind) {
    firstEvent = `${eventWord(smoothKind)}: only on a smooth Moon`;
  } else if (!realKind && !smoothKind) {
    firstEvent = 'Sunset: no change';
  } else {
    firstEvent = `${eventWord(realKind!)} with terrain, ${eventWord(smoothKind!).toLowerCase()} on a smooth Moon`;
  }
  return {
    sunlight: `Sunlight: ${signedHours(fx.dSunHours)}`,
    earthLink: `Earth contact: ${signedHours(fx.dEarthHours)}`,
    firstEvent,
  };
}

/** `Ridge 41 km away` / `Ridge 800 m away` (10 §8: below 1 km in metres). */
export function ridgeLabel(distM: number): string | null {
  if (!Number.isFinite(distM) || distM <= 0) return null;
  return distM < 1000 ? `Ridge ${Math.round(distM / 10) * 10} m away` : `Ridge ${Math.round(distM / 1000)} km away`;
}

/** `Az 271.5° · El 0.92° · Horizon 0.88°` */
export function pointerReadout(az: number, el: number, horizon: number): string {
  return `Az ${az.toFixed(1)}° · El ${formatDeg(el)} · Horizon ${formatDeg(horizon)}`;
}

export interface TracePoint {
  t: number;
  azDeg: number;
  elDeg: number;
  /** Daily mark (every 24 h from the landing). */
  daily: boolean;
}

/** Hourly positions of the focus body along the mission (skips instants outside the table). */
export function bodyTrace(table: EphemerisTable, frame: SiteFrame, body: 'sun' | 'earth', t0: number, t1: number): TracePoint[] {
  const out: TracePoint[] = [];
  for (let t = t0, k = 0; t <= t1; t += HOUR_S, k++) {
    if (!findSegment(table, t)) continue;
    const b = skyAt(table, frame, t)[body];
    out.push({ t, azDeg: b.azDeg, elDeg: b.elDeg, daily: k % 24 === 0 });
  }
  return out;
}
