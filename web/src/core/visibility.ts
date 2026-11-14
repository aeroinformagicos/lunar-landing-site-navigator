// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Visibility criteria, disc fraction and sky state at one instant (07_visibilidad.md §1, §3–§5).
// Same algorithm and order of operations as pipeline/vis (07 §12).
import { AZ_STEP_DEG, N_AZ } from './constants';
import type { EphemerisTable } from './ephemeris';
import { siteFrame, skyAt, type BodySky, type SiteFrame } from './frames';
import { horizonAt, type Mask } from './horizon';
import { eclipseState } from './eclipse';

const DEG = Math.PI / 180;

/** Number of vertical strips of the disc (07 §4.1). */
export const DISC_STRIPS = 32;
/** Floor of cos(el) when converting horizontal arc to azimuth difference (07 §4.1, §4.2). */
export const MIN_COS_EL = 0.05;

export interface BodyState extends BodySky {
  horizonDeg: number;
  marginDeg: number;
  visible: boolean;
}

export type EclipseKind = 'none' | 'partial' | 'total';

export interface EclipseState {
  kind: EclipseKind;
  covered: number;
}

export interface SkyState {
  tUnix: number;
  sun: BodyState & { discFraction: number; litFraction: number };
  earth: BodyState;
  both: boolean;
  eclipse: EclipseState;
}

/**
 * Visible fraction of a disc of angular radius `rho` centred at (azC, elC) above the mask
 * (07 §4.1): 32 vertical strips, each against the horizon at its centre azimuth.
 */
export function discFraction(mask: Mask, azC: number, elC: number, rho: number, K = DISC_STRIPS): number {
  if (elC - rho >= mask.maxElDeg) return 1.0;
  if (elC + rho <= mask.minElDeg) return 0.0;
  const cosEl = Math.max(Math.cos(elC * DEG), MIN_COS_EL);
  const el = mask.elDeg;
  let vis = 0;
  let tot = 0;
  for (let k = 0; k < K; k++) {
    const x = rho * (-1 + (2 * k + 1) / K);
    const c = Math.sqrt(rho * rho - x * x);
    // horizonAt(el, azC + x / cosEl) inlined (same operations; j is already in 0…719).
    const az = azC + x / cosEl;
    const xa = (((az % 360) + 360) % 360) / AZ_STEP_DEG;
    const j = Math.floor(xa);
    const f = xa - j;
    const H = (1 - f) * el[j] + f * el[j === N_AZ - 1 ? 0 : j + 1];
    vis += Math.min(Math.max(elC + c - Math.max(elC - c, H), 0), 2 * c);
    tot += 2 * c;
  }
  return vis / tot;
}

const ANY_COLUMNS = [-0.8, -0.4, 0, 0.4, 0.8];

/** «Any part of the disc» criterion with five columns (07 §4.2); only for comparisons with NASA. */
export function discAny(elHor: (azDeg: number) => number, azC: number, elC: number, rho: number): boolean {
  const cosEl = Math.max(Math.cos(elC * DEG), MIN_COS_EL);
  for (const q of ANY_COLUMNS) {
    if (elC + rho * Math.sqrt(1 - q * q) > elHor(azC + (q * rho) / cosEl)) return true;
  }
  return false;
}

/** No eclipse (for callers that do not want one, e.g. comparisons against references without it). */
export const NO_ECLIPSE: Readonly<EclipseState> = Object.freeze({ kind: 'none', covered: 0 });


/**
 * Sky state at `tUnix` (07 §5). `frame = siteFrame(lat, lon, mask.siteHeightM + observer height)`.
 * The eclipse state is that of 07 §9 (`core/eclipse.ts`); `eclipseOf` can replace it.
 * Objects are written out field by field (no spread): this runs in tight loops (07 §11: < 3 µs).
 */
export function evaluate(
  table: EphemerisTable,
  frame: SiteFrame,
  mask: Mask,
  tUnix: number,
  eclipseOf: (sun: BodySky, earth: BodySky) => EclipseState = eclipseState,
): SkyState {
  const sky = skyAt(table, frame, tUnix);
  const s = sky.sun;
  const e = sky.earth;
  const sunHorizon = horizonAt(mask.elDeg, s.azDeg);
  const sunMargin = s.elDeg - sunHorizon;
  const earthHorizon = horizonAt(mask.elDeg, e.azDeg);
  const earthMargin = e.elDeg - earthHorizon;
  const disc = discFraction(mask, s.azDeg, s.elDeg, s.radiusDeg);
  const eclipse = eclipseOf(s, e);
  return {
    tUnix,
    sun: {
      azDeg: s.azDeg,
      elDeg: s.elDeg,
      rangeKm: s.rangeKm,
      radiusDeg: s.radiusDeg,
      horizonDeg: sunHorizon,
      marginDeg: sunMargin,
      visible: sunMargin > 0,
      discFraction: disc,
      litFraction: disc * (1 - eclipse.covered),
    },
    earth: {
      azDeg: e.azDeg,
      elDeg: e.elDeg,
      rangeKm: e.rangeKm,
      radiusDeg: e.radiusDeg,
      horizonDeg: earthHorizon,
      marginDeg: earthMargin,
      visible: earthMargin > 0,
    },
    both: sunMargin > 0 && earthMargin > 0,
    eclipse,
  };
}

/** Margins only (no disc fraction): the cheap function the event search evaluates. */
export function margins(table: EphemerisTable, frame: SiteFrame, mask: Mask, tUnix: number): { sun: number; earth: number; sunEl: number } {
  const s = skyAt(table, frame, tUnix);
  return {
    sun: s.sun.elDeg - horizonAt(mask.elDeg, s.sun.azDeg),
    earth: s.earth.elDeg - horizonAt(mask.elDeg, s.earth.azDeg),
    sunEl: s.sun.elDeg,
  };
}

/** Frame of a site for a mask: height = terrain at the site + observer height (07 §5). */
export function frameFor(latDeg: number, lonDeg: number, mask: Mask): SiteFrame {
  return siteFrame(latDeg, lonDeg, mask.siteHeightM + mask.observerHeightM);
}
