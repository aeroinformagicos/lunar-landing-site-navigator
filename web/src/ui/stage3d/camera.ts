// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Orbit camera of the 3D view (16_vista_3d.md §7.1, §7.6): a heading, a pitch and a distance around a
// target in the target's local frame, and the clamp that keeps the camera above the terrain. Pure.
import { add, scale, sub, type Basis, type V3 } from './frame';

export interface OrbitState {
  /** Target in scene coordinates (surface point of the active site). */
  target: V3;
  /** Direction the camera looks toward, clockwise from local north (deg). */
  headingDeg: number;
  /** Angle of the camera above the target's local horizontal (deg). */
  pitchDeg: number;
  distM: number;
}

export const ORBIT = Object.freeze({
  minDistM: 300,
  maxDistM: 800_000,
  minPitchDeg: 3,
  maxPitchDeg: 89,
  clearanceM: 50,
  /** Initial framing (§7.1). */
  startDistM: 18_000,
  startPitchDeg: 14,
  /** Scenario B also framed if it is closer than this to A. */
  pairM: 25_000,
});

const DEG = Math.PI / 180;

/** Camera position: behind the target, opposite to the heading, raised by the pitch. */
export function orbitPosition(s: OrbitState, b: Basis): V3 {
  const h = s.headingDeg * DEG;
  const p = s.pitchDeg * DEG;
  const look: V3 = add(scale(b.e, Math.sin(h) * Math.cos(p)), scale(b.n, Math.cos(h) * Math.cos(p)));
  return add(s.target, add(scale(look, -s.distM), scale(b.u, s.distM * Math.sin(p))));
}

export function wrapDeg(a: number): number {
  return ((a % 360) + 360) % 360;
}

export function limitOrbit(s: OrbitState): OrbitState {
  return {
    target: s.target,
    headingDeg: wrapDeg(s.headingDeg),
    pitchDeg: Math.min(ORBIT.maxPitchDeg, Math.max(ORBIT.minPitchDeg, s.pitchDeg)),
    distM: Math.min(ORBIT.maxDistM, Math.max(ORBIT.minDistM, s.distM)),
  };
}

/**
 * Keeps the camera at least `ORBIT.clearanceM` above the ground and the line of sight to the target
 * clear (§7.6): raise the pitch first, then shorten the distance. `clearance(p)` = height of scene
 * point p above the terrain under it (negative below).
 */
export function clampOrbit(s0: OrbitState, b: Basis, clearance: (p: V3) => number): OrbitState {
  let s = limitOrbit(s0);
  for (let k = 0; k < 90 && clearance(orbitPosition(s, b)) < ORBIT.clearanceM && s.pitchDeg < ORBIT.maxPitchDeg; k++) {
    s = { ...s, pitchDeg: Math.min(ORBIT.maxPitchDeg, s.pitchDeg + 1) };
  }
  const blocked = (st: OrbitState) => {
    const cam = orbitPosition(st, b);
    const d = sub(cam, st.target);
    for (let i = 1; i <= 8; i++) if (clearance(add(st.target, scale(d, i / 9))) < 0) return true;
    return clearance(cam) < ORBIT.clearanceM;
  };
  // Still blocked (terrain between camera and target): steeper first, then closer.
  for (let k = 0; k < 200 && blocked(s); k++) {
    if (s.pitchDeg < ORBIT.maxPitchDeg) s = { ...s, pitchDeg: Math.min(ORBIT.maxPitchDeg, s.pitchDeg + 2) };
    else if (s.distM > ORBIT.minDistM) s = { ...s, distM: Math.max(ORBIT.minDistM, s.distM * 0.9) };
    else break;
  }
  return s;
}

/** Initial framing (§7.1): looking toward the focus body; wider when B is close to A. */
export function startOrbit(target: V3, focusAzDeg: number, pairSeparationM: number | null): OrbitState {
  const pair = pairSeparationM !== null && pairSeparationM < ORBIT.pairM ? pairSeparationM * 1.8 : 0;
  return { target, headingDeg: wrapDeg(focusAzDeg), pitchDeg: ORBIT.startPitchDeg, distM: Math.max(ORBIT.startDistM, pair) };
}

/** One smoothing step toward `goal` (`k` = 1 jumps). Headings take the short way round. */
export function easeOrbit(cur: OrbitState, goal: OrbitState, k: number): OrbitState {
  const dh = ((goal.headingDeg - cur.headingDeg + 540) % 360) - 180;
  return {
    target: add(cur.target, scale(sub(goal.target, cur.target), k)),
    headingDeg: wrapDeg(cur.headingDeg + dh * k),
    pitchDeg: cur.pitchDeg + (goal.pitchDeg - cur.pitchDeg) * k,
    distM: Math.exp(Math.log(cur.distM) + (Math.log(goal.distM) - Math.log(cur.distM)) * k),
  };
}

export function orbitsClose(a: OrbitState, b: OrbitState): boolean {
  const dt = sub(a.target, b.target);
  const dh = Math.abs(((a.headingDeg - b.headingDeg + 540) % 360) - 180);
  return Math.hypot(...dt) < 0.05 * Math.max(1, a.distM / 1000) && dh < 0.01 && Math.abs(a.pitchDeg - b.pitchDeg) < 0.01 && Math.abs(a.distM / b.distM - 1) < 1e-4;
}
