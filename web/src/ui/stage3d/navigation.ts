// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Fly and ground modes, "Go to" flights and the ray against the terrain (16_vista_3d.md §7.2–§7.6,
// §8.6, §10.2). Pure: the engine calls these with the scene's ground functions; the tests check them.
import { easeOrbit, wrapDeg, type OrbitState } from './camera';
import { add, cross, dot, fromScene, norm, scale, sub, toScene, unit, type Basis, type SceneFrame, type V3 } from './frame';

export type CameraMode = 'orbit' | 'fly' | 'ground';
export const CAMERA_MODES: readonly CameraMode[] = ['orbit', 'fly', 'ground'];

/** A free camera: position, heading (clockwise from local north), pitch above the local horizontal. */
export interface LookState {
  pos: V3;
  yawDeg: number;
  pitchDeg: number;
  fovDeg: number;
}

export const FLY = Object.freeze({
  /** Never closer than this to the terrain (§7.6). */
  clearanceM: 5,
  maxAltitudeM: 2_000_000,
  /** v = clamp(0.8 · AGL /s, 20 m/s, 80 km/s), × 5 with Shift (§7.2). */
  perAgl: 0.8,
  minSpeed: 20,
  maxSpeed: 80_000,
  fast: 5,
  /** Longest frame step integrated at once (s): no jumps through the terrain after a stall. */
  maxDtS: 0.1,
});

export const GROUND = Object.freeze({ clearanceM: 2, minFov: 20, maxFov: 90, startFov: 60, fov: 50 });

const DEG = Math.PI / 180;

export function lookDir(yawDeg: number, pitchDeg: number, b: Basis): V3 {
  const y = yawDeg * DEG;
  const p = pitchDeg * DEG;
  return add(scale(add(scale(b.e, Math.sin(y)), scale(b.n, Math.cos(y))), Math.cos(p)), scale(b.u, Math.sin(p)));
}

/** Horizontal right-hand direction for a heading. */
export function rightDir(yawDeg: number, b: Basis): V3 {
  const y = yawDeg * DEG;
  return add(scale(b.e, Math.cos(y)), scale(b.n, -Math.sin(y)));
}

export function flySpeed(aglM: number, fast: boolean): number {
  const v = Math.min(FLY.maxSpeed, Math.max(FLY.minSpeed, FLY.perAgl * Math.max(0, aglM)));
  return fast ? v * FLY.fast : v;
}

export interface FlyInput {
  /** −1…1 each. */
  forward: number;
  right: number;
  up: number;
  fast: boolean;
}

export interface GroundFns {
  /** Height of a scene point above the terrain under it (m). */
  clearance(p: V3): number;
  /** Local E, N, U at a scene point. */
  basisAt(p: V3): Basis;
}

/** Lifts a point along its local vertical until it is `minM` above the terrain (§7.6). */
export function liftAbove(p: V3, g: GroundFns, minM: number): V3 {
  let q = p;
  for (let k = 0; k < 4; k++) {
    const c = g.clearance(q);
    if (c >= minM) return q;
    q = add(q, scale(g.basisAt(q).u, minM - c + 0.01));
  }
  return q;
}

/** One fly step (§7.2): along the view, sideways and vertically, never under the terrain. */
export function flyStep(s: LookState, input: FlyInput, dtS: number, g: GroundFns): LookState {
  const dt = Math.min(Math.max(dtS, 0), FLY.maxDtS);
  const b = g.basisAt(s.pos);
  const v = flySpeed(g.clearance(s.pos), input.fast);
  const move = add(add(scale(lookDir(s.yawDeg, s.pitchDeg, b), input.forward), scale(rightDir(s.yawDeg, b), input.right)), scale(b.u, input.up));
  let pos = add(s.pos, scale(move, v * dt));
  const c = g.clearance(pos);
  if (c > FLY.maxAltitudeM) pos = add(pos, scale(b.u, FLY.maxAltitudeM - c));
  pos = liftAbove(pos, g, FLY.clearanceM);
  return { ...s, pos };
}

/** Turns a free camera; pitch limited to ±89° and the field of view to 20–90° (§7.2, §7.3). */
export function turn(s: LookState, dYawDeg: number, dPitchDeg: number, fovFactor = 1): LookState {
  return {
    pos: s.pos,
    yawDeg: wrapDeg(s.yawDeg + dYawDeg),
    pitchDeg: Math.max(-89, Math.min(89, s.pitchDeg + dPitchDeg)),
    fovDeg: Math.max(GROUND.minFov, Math.min(GROUND.maxFov, s.fovDeg * fovFactor)),
  };
}

/** The orbit camera seen as a free camera (switching Orbit → Fly keeps the view). */
export function orbitToLook(o: OrbitState, camPos: V3, fovDeg: number): LookState {
  return { pos: camPos, yawDeg: o.headingDeg, pitchDeg: -o.pitchDeg, fovDeg };
}

// ---- Go to flights (§7.4) -----------------------------------------------------------------

export interface Flight {
  from: OrbitState;
  to: OrbitState;
  fromMe: V3;
  toMe: V3;
  startMs: number;
  durMs: number;
  peakM: number;
}

/** Duration: clamp(0.8 + 0.4·log10(separation km + 1), 0.8, 3) s. */
export function flightDurationMs(sepM: number): number {
  return 1000 * Math.min(3, Math.max(0.8, 0.8 + 0.4 * Math.log10(sepM / 1000 + 1)));
}

export function makeFlight(f: SceneFrame, from: OrbitState, to: OrbitState, nowMs: number): Flight {
  const fromMe = fromScene(f, from.target);
  const toMe = fromScene(f, to.target);
  const sep = norm(sub(fromMe, toMe));
  return { from, to, fromMe, toMe, startMs: nowMs, durMs: flightDurationMs(sep), peakM: Math.max(from.distM, to.distM, 0.6 * sep) };
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * Orbit state of a flight at `nowMs` (§7.4): the target travels along the great circle and sits on
 * the terrain (`surface`); the distance rises toward `peakM` half way.
 */
export function flightAt(fl: Flight, f: SceneFrame, nowMs: number, surface: (p: V3) => V3): { state: OrbitState; done: boolean } {
  const t = Math.min(1, Math.max(0, (nowMs - fl.startMs) / fl.durMs));
  if (t >= 1) return { state: fl.to, done: true };
  const s = smooth(t);
  const a = unit(fl.fromMe);
  const b = unit(fl.toMe);
  const om = Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
  const dir: V3 = om < 1e-9 ? a : add(scale(a, Math.sin((1 - s) * om) / Math.sin(om)), scale(b, Math.sin(s * om) / Math.sin(om)));
  const r = norm(fl.fromMe) * (1 - s) + norm(fl.toMe) * s;
  const target = surface(toScene(f, scale(dir, r)));
  const base = easeOrbit(fl.from, fl.to, s);
  const lin = fl.from.distM + (fl.to.distM - fl.from.distM) * s;
  const mid = (fl.from.distM + fl.to.distM) / 2;
  const distM = lin + Math.max(0, fl.peakM - mid) * Math.sin(Math.PI * s);
  return { state: { ...base, target, distM }, done: false };
}

// ---- Ray against the terrain (§8.6 readout, §10.2 click) -----------------------------------------

/**
 * First point where the ray from `o` along unit `d` meets the terrain, or null. Steps of half the
 * height above the ground (at least 1 m, so a 1 km/km slope cannot be skipped), then bisection.
 */
export function raycastGround(o: V3, d: V3, clearance: (p: V3) => number, maxT = 2_500_000): V3 | null {
  let t = 0;
  let prev = 0;
  let c = clearance(o);
  if (c < 0) return o;
  for (let k = 0; k < 4000 && t < maxT; k++) {
    prev = t;
    t += Math.max(1, 0.5 * c);
    c = clearance(add(o, scale(d, t)));
    if (c < 0) {
      let lo = prev;
      let hi = t;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if (clearance(add(o, scale(d, mid))) < 0) hi = mid;
        else lo = mid;
      }
      return add(o, scale(d, hi));
    }
  }
  return null;
}

/** Whether the straight segment a → b passes under the terrain (label occlusion, §8). */
export function segmentBlocked(a: V3, b: V3, clearance: (p: V3) => number, samples = 16): boolean {
  const ab = sub(b, a);
  for (let i = 1; i < samples; i++) if (clearance(add(a, scale(ab, i / samples))) < 0) return true;
  return false;
}

/** Unit vector perpendicular to both (helper for billboards). */
export function perpendicular(a: V3, b: V3): V3 {
  return unit(cross(a, b));
}
