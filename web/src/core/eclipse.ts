// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Solar eclipses seen from the Moon (07_visibilidad.md §9, F13): the Earth covers the Sun when the
// angular separation of their centres is below the sum of their radii. Independent of the terrain;
// the Earth has no atmosphere here (disc of 6,378.137 km), like the reference figures of the plan.
import type { EphemerisTable } from './ephemeris';
import { skyAt, type BodySky, type SiteFrame } from './frames';
import type { EclipseState } from './visibility';

const DEG = Math.PI / 180;

/** Angular separation of two directions (haversine), degrees. */
export function angularSep(az1: number, el1: number, az2: number, el2: number): number {
  const dAz = (az2 - az1) * DEG;
  const a1 = el1 * DEG;
  const a2 = el2 * DEG;
  const h = Math.sin((a2 - a1) / 2) ** 2 + Math.cos(a1) * Math.cos(a2) * Math.sin(dAz / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(h)))) / DEG;
}

/** Overlap of two discs of radii a (Sun) and b (Earth) at separation s, as a share of the Sun. */
export function coveredShare(s: number, a: number, b: number): { kind: EclipseState['kind']; covered: number } {
  if (s >= a + b) return { kind: 'none', covered: 0 };
  if (s <= b - a) return { kind: 'total', covered: 1 };
  const A =
    a * a * Math.acos((s * s + a * a - b * b) / (2 * s * a)) +
    b * b * Math.acos((s * s + b * b - a * a) / (2 * s * b)) -
    0.5 * Math.sqrt((-s + a + b) * (s + a - b) * (s - a + b) * (s + a + b));
  return { kind: 'partial', covered: A / (Math.PI * a * a) };
}

export interface EclipseFull extends EclipseState {
  sepDeg: number;
}

/** `eclipse_state(sky)` of 07 §9. */
export function eclipseState(sun: BodySky, earth: BodySky): EclipseFull {
  const s = angularSep(sun.azDeg, sun.elDeg, earth.azDeg, earth.elDeg);
  return { ...coveredShare(s, sun.radiusDeg, earth.radiusDeg), sepDeg: s };
}

/** Margins of the eclipse events (07 §6.2): positive while the condition holds. */
export function eclipseMarginFns(table: EphemerisTable, frame: SiteFrame) {
  const sep = (t: number) => {
    const s = skyAt(table, frame, t);
    return { s: angularSep(s.sun.azDeg, s.sun.elDeg, s.earth.azDeg, s.earth.elDeg), a: s.sun.radiusDeg, b: s.earth.radiusDeg };
  };
  return {
    eclipse: (t: number) => {
      const x = sep(t);
      return x.a + x.b - x.s;
    },
    totality: (t: number) => {
      const x = sep(t);
      return x.b - x.a - x.s;
    },
  };
}
