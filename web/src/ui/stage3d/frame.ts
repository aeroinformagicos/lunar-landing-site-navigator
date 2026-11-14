// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Scene frame of the 3D view (16_vista_3d.md §3): an anchor (the pole, or the site) and its E, N, U
// basis map MOON_ME metres to three.js coordinates (+Y up, +X east, −Z north of the anchor). Pure
// float64 maths, no three.js: the worker and the tests use it too.
import { R_MOON_KM } from '../../core/constants';
import { enuBasis } from '../../core/frames';

export type V3 = [number, number, number];

/** Lunar radius in metres (CLAUDE.md §2). */
export const R_M = R_MOON_KM * 1000;
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export interface Basis {
  e: V3;
  n: V3;
  u: V3;
}

export interface SceneFrame extends Basis {
  latDeg: number;
  lonDeg: number;
  /** Height of the anchor above the reference sphere (m). */
  hM: number;
  /** Anchor position in MOON_ME (m). */
  o: V3;
  /** The polar scene (anchor at the south pole, map-aligned). */
  polar: boolean;
}

export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const norm = (a: V3): number => Math.sqrt(dot(a, a));
export const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const unit = (a: V3): V3 => scale(a, 1 / norm(a));
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** MOON_ME position (m) of latitude, longitude and height above the sphere. */
export function latLonHToMe(latDeg: number, lonDeg: number, hM: number): V3 {
  const r = R_M + hM;
  const p = latDeg * DEG;
  const l = lonDeg * DEG;
  return [r * Math.cos(p) * Math.cos(l), r * Math.cos(p) * Math.sin(l), r * Math.sin(p)];
}

export function meToLatLonH(p: V3): { latDeg: number; lonDeg: number; hM: number } {
  const r = norm(p);
  const lon = Math.atan2(p[1], p[0]) * RAD;
  return { latDeg: Math.asin(p[2] / r) * RAD, lonDeg: lon === -180 ? 180 : lon, hM: r - R_M };
}

export function makeSceneFrame(latDeg: number, lonDeg: number, hM: number, polar = false): SceneFrame {
  const { e, n, u } = enuBasis(latDeg, lonDeg);
  return { latDeg, lonDeg, hM, e, n, u, o: scale(u, R_M + hM), polar };
}

/** The polar scene: anchor at the south pole with longitude 0, so +X = map +x and −Z = map +y. */
export const POLAR_FRAME: Readonly<SceneFrame> = Object.freeze(makeSceneFrame(-90, 0, 0, true));

/** Rotation only (directions). */
export function rotToScene(f: Basis, d: V3): V3 {
  return [dot(d, f.e), dot(d, f.u), -dot(d, f.n)];
}

export function rotFromScene(f: Basis, s: V3): V3 {
  return [
    s[0] * f.e[0] + s[1] * f.u[0] - s[2] * f.n[0],
    s[0] * f.e[1] + s[1] * f.u[1] - s[2] * f.n[1],
    s[0] * f.e[2] + s[1] * f.u[2] - s[2] * f.n[2],
  ];
}

export function toScene(f: SceneFrame, p: V3): V3 {
  return rotToScene(f, sub(p, f.o));
}

export function fromScene(f: SceneFrame, s: V3): V3 {
  return add(f.o, rotFromScene(f, s));
}

/** Map metres (08_mapa_polar.md §1.2) and height → MOON_ME (m). */
export function mapToMe(x: number, y: number, hM: number): V3 {
  const r = R_M + hM;
  const rho = Math.hypot(x, y);
  if (rho === 0) return [0, 0, -r];
  const c = 2 * Math.atan(rho / (2 * R_M));
  const s = Math.sin(c) / rho;
  return [r * s * y, r * s * x, -r * Math.cos(c)];
}

/** MOON_ME (m) → map metres and height (stereographic, 08 §3.2). */
export function meToMap(p: V3): { x: number; y: number; hM: number } {
  const r = norm(p);
  const k = (2 * R_M) / (1 - p[2] / r);
  return { x: (k * p[1]) / r, y: (k * p[0]) / r, hM: r - R_M };
}

export function mapToScene(x: number, y: number, hM: number): V3 {
  return toScene(POLAR_FRAME, mapToMe(x, y, hM));
}

export function sceneToMap(s: V3): { x: number; y: number; hM: number } {
  return meToMap(fromScene(POLAR_FRAME, s));
}

/** Direction of (azimuth, elevation) in a local basis, in MOON_ME. */
export function azElToMe(azDeg: number, elDeg: number, b: Basis): V3 {
  const a = azDeg * DEG;
  const el = elDeg * DEG;
  const de = Math.cos(el) * Math.sin(a);
  const dn = Math.cos(el) * Math.cos(a);
  const du = Math.sin(el);
  return [
    de * b.e[0] + dn * b.n[0] + du * b.u[0],
    de * b.e[1] + dn * b.n[1] + du * b.u[1],
    de * b.e[2] + dn * b.n[2] + du * b.u[2],
  ];
}

/** Azimuth [0, 360) and elevation of a MOON_ME direction in a local basis. */
export function meToAzEl(d: V3, b: Basis): { azDeg: number; elDeg: number } {
  const de = dot(d, b.e);
  const dn = dot(d, b.n);
  const du = dot(d, b.u);
  let az = Math.atan2(de, dn) * RAD;
  if (az < 0) az += 360;
  if (az >= 360) az -= 360;
  return { azDeg: az, elDeg: Math.atan2(du, Math.hypot(de, dn)) * RAD };
}

/**
 * Direction of a body in the scene from its azimuth and elevation at the site (16 §5.1): the core's
 * `skyAt` numbers are the input, so the 3D and the 2D agree to the last bit.
 */
export function dirToScene(f: Basis, azDeg: number, elDeg: number, siteLatDeg: number, siteLonDeg: number): V3 {
  return rotToScene(f, azElToMe(azDeg, elDeg, enuBasis(siteLatDeg, siteLonDeg)));
}

/** Local E, N, U at a scene point, expressed in scene coordinates. */
export function localBasisAt(f: SceneFrame, s: V3): Basis {
  const { latDeg, lonDeg } = meToLatLonH(fromScene(f, s));
  const b = enuBasis(latDeg, lonDeg);
  return { e: rotToScene(f, b.e), n: rotToScene(f, b.n), u: rotToScene(f, b.u) };
}

/** Height of a scene point above the reference sphere (m). */
export function heightOf(f: SceneFrame, s: V3): number {
  return norm(fromScene(f, s)) - R_M;
}

/** Great-circle distance (m) between two latitude/longitude points. */
export function surfaceDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const a = latLonHToMe(lat1, lon1, 0);
  const b = latLonHToMe(lat2, lon2, 0);
  return R_M * Math.acos(Math.min(1, Math.max(-1, dot(a, b) / (R_M * R_M))));
}
