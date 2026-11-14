// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Local frame of a site and azimuth/elevation of the Sun and the Earth (05_efemerides.md §3, §4.6, §5).
// Same algorithm as pipeline/ephem/interp.py (02_arquitectura.md §1).
import { R_EARTH_KM, R_MOON_KM, R_SUN_KM } from './constants';
import { bodyVectorsInto, type EphemerisTable, type Vec3 } from './ephemeris';

export type { Vec3 };

/** Site frame: position in MOON_ME (km) and the East, North, Up unit vectors. */
export interface SiteFrame {
  p: Vec3;
  e: Vec3;
  n: Vec3;
  u: Vec3;
}

export interface BodySky {
  azDeg: number;
  elDeg: number;
  rangeKm: number;
  radiusDeg: number;
}

export interface Sky {
  sun: BodySky;
  earth: BodySky;
}

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export function sitePositionKm(latDeg: number, lonDeg: number, heightM: number): Vec3 {
  const r = R_MOON_KM + heightM / 1000;
  const phi = latDeg * DEG;
  const lam = lonDeg * DEG;
  return [r * Math.cos(phi) * Math.cos(lam), r * Math.cos(phi) * Math.sin(lam), r * Math.sin(phi)];
}

/** E, N, U at (lat, lon). At the exact pole the basis follows the given longitude (05 §3). */
export function enuBasis(latDeg: number, lonDeg: number): { e: Vec3; n: Vec3; u: Vec3 } {
  const phi = latDeg * DEG;
  const lam = lonDeg * DEG;
  const sp = Math.sin(phi);
  const cp = Math.cos(phi);
  const sl = Math.sin(lam);
  const cl = Math.cos(lam);
  return {
    e: [-sl, cl, 0],
    n: [-sp * cl, -sp * sl, cp],
    u: [cp * cl, cp * sl, sp],
  };
}

/** `h_m` = terrain height at the site (`site_height_m`; 0 on a smooth Moon) + observer height. */
export function siteFrame(latDeg: number, lonDeg: number, heightM: number): SiteFrame {
  return { p: sitePositionKm(latDeg, lonDeg, heightM), ...enuBasis(latDeg, lonDeg) };
}

/** Azimuth in [0, 360) clockwise from north. */
export function normAz(deg: number): number {
  const a = deg % 360;
  const r = a < 0 ? a + 360 : a;
  return r >= 360 || r === 0 ? 0 : r;
}

/** Horizontal part below this fraction of the vector length counts as zenith/nadir (D-62). */
const ZENITH_REL = 1e-12;

/**
 * Azimuth, elevation and length of the vector (vx, vy, vz) in the site frame. At the zenith or
 * nadir (e = n = 0) az = 0° by convention (05 §3); rounding residues of cos(±90°) ≈ 6·10⁻¹⁷ count
 * as zero, otherwise atan2(0, −1e-13) would give 180° (D-62).
 */
export function azelFromVector(
  vx: number,
  vy: number,
  vz: number,
  f: Pick<SiteFrame, 'e' | 'n' | 'u'>,
): { azDeg: number; elDeg: number; rangeKm: number } {
  const e = vx * f.e[0] + vy * f.e[1] + vz * f.e[2];
  const n = vx * f.n[0] + vy * f.n[1] + vz * f.n[2];
  const u = vx * f.u[0] + vy * f.u[1] + vz * f.u[2];
  const range = Math.sqrt(vx * vx + vy * vy + vz * vz);
  const horiz = Math.sqrt(e * e + n * n);
  return {
    azDeg: horiz <= ZENITH_REL * range ? 0 : normAz(Math.atan2(e, n) * RAD),
    elDeg: Math.atan2(u, horiz) * RAD,
    rangeKm: range,
  };
}

/** Apparent angular radius of a body of radius `radiusKm` at `rangeKm` (05 §5). */
export function angularRadiusDeg(radiusKm: number, rangeKm: number): number {
  return Math.asin(radiusKm / rangeKm) * RAD;
}

function bodySky(vx: number, vy: number, vz: number, f: SiteFrame, radiusKm: number): BodySky {
  const a = azelFromVector(vx - f.p[0], vy - f.p[1], vz - f.p[2], f);
  return { azDeg: a.azDeg, elDeg: a.elDeg, rangeKm: a.rangeKm, radiusDeg: angularRadiusDeg(radiusKm, a.rangeKm) };
}

const scratch = new Float64Array(6);

/** Sun and Earth as seen from the site at `tUnix`. Throws RangeError outside the table. */
export function skyAt(table: EphemerisTable, frame: SiteFrame, tUnix: number): Sky {
  const v = bodyVectorsInto(table, tUnix, scratch);
  return {
    sun: bodySky(v[0], v[1], v[2], frame, R_SUN_KM),
    earth: bodySky(v[3], v[4], v[5], frame, R_EARTH_KM),
  };
}
