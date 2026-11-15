// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Power and communications estimate (T-93, D-123): a simplified, labelled reading of the visibility
// results, not a new visibility algorithm (07 §12 is untouched, so it has no Python twin). Pure.
//
// Power of a reference flat panel: P = S0 · (1 AU / r)² · lit · η · A · cos(i), where S0 is the solar
// constant, r the Sun's distance, lit the fraction of the solar disc above the real horizon and not
// covered by the Earth (07 §6, §9), η the efficiency, A the area and i the angle of incidence. A vertical
// panel that turns to face the Sun's azimuth has cos(i) = cos(el); a horizontal one, sin(el).
// Earth link: the Earth's centre at least `minElevationDeg` above the real horizon (margin ≥ min).
// Ignored on purpose (stated in the interface): dust, temperature, wiring and battery losses, limb
// darkening, earthshine, the panel's own shadow and terrain reflections.
import { evaluate } from './visibility';
import type { EphemerisTable } from './ephemeris';
import type { Mask } from './horizon';
import type { SiteFrame } from './frames';

/** Total solar irradiance at 1 AU, W/m²: 1360.8 ± 0.5 (Kopp & Lean 2011, GRL 38, L01706), rounded. */
export const SOLAR_CONSTANT_W_M2 = 1361;
/** Astronomical unit, km (IAU 2012 Resolution B2). */
export const AU_KM = 149_597_870.7;
/** Sampling step of the estimate (s): 10 min, the cursor step of the interface (10 §4). */
export const POWER_STEP_S = 600;

export type PanelOrientation = 'vertical_tracking' | 'horizontal';

export interface PowerAssumptions {
  /** Cell efficiency, 0–1. */
  efficiency: number;
  areaM2: number;
  orientation: PanelOrientation;
  /** Constant load during the night, W. */
  loadW: number;
  /** Minimum Earth elevation above the real horizon for a link, degrees. */
  minEarthDeg: number;
}

/**
 * Default assumptions: 30.7 % efficiency (triple-junction space cell, Spectrolab XTJ Prime datasheet:
 * production average at the beginning of life, AM0, 28 °C), 1 m² and 100 W are reference units (results scale linearly with them), a vertical
 * panel turned to the Sun (the Sun stays within a few degrees of the horizon at the poles) and a link
 * whenever the Earth's centre clears the real horizon (the app's definition, CLAUDE.md §2).
 */
export const DEFAULT_POWER: PowerAssumptions = {
  efficiency: 0.307,
  areaM2: 1,
  orientation: 'vertical_tracking',
  loadW: 100,
  minEarthDeg: 0,
};

/** Instant power of the reference panel (W) for the Sun's state. */
export function panelPowerW(sun: { elDeg: number; rangeKm: number; litFraction: number }, a: Pick<PowerAssumptions, 'efficiency' | 'areaM2' | 'orientation'>): number {
  if (sun.litFraction <= 0) return 0;
  const s = SOLAR_CONSTANT_W_M2 * (AU_KM / sun.rangeKm) ** 2;
  const el = (sun.elDeg * Math.PI) / 180;
  const cosI = a.orientation === 'vertical_tracking' ? Math.cos(el) : Math.sin(el);
  return Math.max(0, s * sun.litFraction * a.efficiency * a.areaM2 * cosI);
}

/** Trapezoidal integral of a power series (W) over its times (s), in Wh. */
export function energyWh(times: ArrayLike<number>, powerW: ArrayLike<number>): number {
  let e = 0;
  for (let i = 1; i < times.length; i++) e += ((powerW[i] + powerW[i - 1]) / 2) * (times[i] - times[i - 1]);
  return e / 3600;
}

/**
 * Hours with a link and the longest stretch without one, from link flags sampled at `times`. A sample
 * stands for the interval to the next one (the last one closes the series and adds nothing).
 */
export function linkStats(times: ArrayLike<number>, linked: ArrayLike<boolean>): { linkHours: number; longestGapH: number } {
  let on = 0;
  let gap = 0;
  let longest = 0;
  for (let i = 0; i + 1 < times.length; i++) {
    const dt = times[i + 1] - times[i];
    if (linked[i]) {
      on += dt;
      gap = 0;
    } else {
      gap += dt;
      longest = Math.max(longest, gap);
    }
  }
  return { linkHours: on / 3600, longestGapH: longest / 3600 };
}

/** Energy to carry the load through a night of `nightH` hours, Wh (no losses, no reserve). */
export function nightEnergyWh(loadW: number, nightH: number): number {
  return Math.max(0, loadW) * Math.max(0, nightH);
}

export interface PowerResult {
  energyWh: number;
  energyPerDayWh: number;
  /** Mean power over the mission, W. */
  meanW: number;
  peakW: number;
  batteryWh: number;
  linkHours: number;
  linkPct: number;
  longestGapH: number;
}

/**
 * The estimate over [t0, t1] for a site: the same sky states as the rest of the app (`evaluate`),
 * sampled every `step` seconds plus the end. `longestNightH` is the mission's longest night (07 §7), so
 * the battery and the figure on screen agree.
 */
export function powerComms(
  table: EphemerisTable,
  frame: SiteFrame,
  mask: Mask,
  t0: number,
  t1: number,
  longestNightH: number,
  a: PowerAssumptions,
  step = POWER_STEP_S,
): PowerResult {
  const times: number[] = [];
  for (let t = t0; t < t1; t += step) times.push(t);
  times.push(t1);
  const p: number[] = [];
  const linked: boolean[] = [];
  for (const t of times) {
    const s = evaluate(table, frame, mask, t);
    p.push(panelPowerW({ elDeg: s.sun.elDeg, rangeKm: s.sun.rangeKm, litFraction: s.sun.litFraction }, a));
    // 0° is the app's own «link» (CLAUDE.md §2: the centre above the real horizon); above it, the margin.
    linked.push(a.minEarthDeg > 0 ? s.earth.marginDeg >= a.minEarthDeg : s.earth.visible);
  }
  const e = energyWh(times, p);
  const hours = (t1 - t0) / 3600;
  const link = linkStats(times, linked);
  return {
    energyWh: e,
    energyPerDayWh: hours > 0 ? (e / hours) * 24 : 0,
    meanW: hours > 0 ? e / hours : 0,
    peakW: Math.max(0, ...p),
    batteryWh: nightEnergyWh(a.loadW, longestNightH),
    linkHours: link.linkHours,
    linkPct: hours > 0 ? (100 * link.linkHours) / hours : 0,
    longestGapH: link.longestGapH,
  };
}
