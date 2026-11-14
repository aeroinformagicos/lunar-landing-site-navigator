// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Geometry of the panorama (10_interfaz.md §6.1, F3): equirectangular azimuth–elevation views with
// the same scale on both axes. Pure: the component only renders what these functions return, and the
// tests check the drawing geometry without a DOM.
import { AZ_STEP_DEG } from '../../core/constants';
import { horizonAt } from '../../core/horizon';

/** 40° view: 40° wide, 20° high (§6.1). */
export const VIEW_WIDTH_DEG = 40;
export const VIEW_HEIGHT_DEG = 20;
/** Beyond 8° from the horizon the view centres on the body and shows an arrow (§6.1). */
export const RECENTRE_DEG = 8;
/** Horizon zoom: 4° × 2°, grid 0.5° (§6.1). */
export const ZOOM_WIDTH_DEG = 4;
export const ZOOM_HEIGHT_DEG = 2;
/** 360° strip: elevation range of the compressed strip (30°). */
export const STRIP_MIN_EL = -15;
export const STRIP_MAX_EL = 15;

/** Signed azimuth difference a − c in (−180, 180]. */
export function azDelta(a: number, c: number): number {
  const d = (((a - c) % 360) + 540) % 360 - 180;
  return d === -180 ? 180 : d;
}

export function wrap360(a: number): number {
  const r = ((a % 360) + 360) % 360;
  return r === 360 ? 0 : r;
}

export interface View {
  /** Centre of the view, degrees. */
  az: number;
  el: number;
  widthDeg: number;
  heightDeg: number;
  /** Pixels. */
  w: number;
  h: number;
}

/** Pixels per degree, the same on both axes (the view height follows from the width). */
export function pxPerDeg(v: View): number {
  return v.w / v.widthDeg;
}

export function project(v: View, az: number, el: number): { x: number; y: number } {
  const k = pxPerDeg(v);
  return { x: v.w / 2 + azDelta(az, v.az) * k, y: v.h / 2 - (el - v.el) * k };
}

export function unproject(v: View, x: number, y: number): { az: number; el: number } {
  const k = pxPerDeg(v);
  return { az: wrap360(v.az + (x - v.w / 2) / k), el: v.el + (v.h / 2 - y) / k };
}

/**
 * Centre of the 40° view (§6.1): azimuth of the focus body (or the panned azimuth); elevation of the
 * horizon there, unless the body is more than 8° away from it, then the body's elevation and an
 * arrow `Horizon 25° below` / `above`.
 */
export function viewCentre(
  el: ArrayLike<number>,
  body: { azDeg: number; elDeg: number },
  panAz: number | null,
): { az: number; el: number; arrow: { dir: 'below' | 'above'; deg: number } | null } {
  const az = panAz ?? body.azDeg;
  const hor = horizonAt(el, az);
  if (panAz === null && Math.abs(body.elDeg - hor) > RECENTRE_DEG) {
    return { az, el: body.elDeg, arrow: { dir: hor < body.elDeg ? 'below' : 'above', deg: Math.round(Math.abs(body.elDeg - hor)) } };
  }
  return { az, el: hor, arrow: null };
}

/** Horizon polyline across the view, one point per mask sample plus both edges. */
export function horizonLine(v: View, el: ArrayLike<number>): { x: number; y: number }[] {
  const half = v.widthDeg / 2;
  const pts: { x: number; y: number }[] = [];
  const start = v.az - half;
  // First mask sample strictly inside the view (the edge point is added separately).
  const first = Math.floor(start / AZ_STEP_DEG) * AZ_STEP_DEG + AZ_STEP_DEG;
  pts.push(project(v, start, horizonAt(el, start)));
  for (let a = first; a < v.az + half; a += AZ_STEP_DEG) pts.push(project(v, a, horizonAt(el, a)));
  pts.push(project(v, v.az + half, horizonAt(el, v.az + half)));
  // project() wraps the azimuth; inside one view the x order is monotonic.
  return pts.map((p, i) => ({ x: i === pts.length - 1 ? v.w : i === 0 ? 0 : p.x, y: p.y }));
}

/** Points of a polyline as an SVG path. */
export function pathOf(pts: { x: number; y: number }[]): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join('');
}

/** Terrain: the area under the horizon line (to fill). */
export function terrainPath(v: View, line: { x: number; y: number }[]): string {
  return `${pathOf(line)}L${v.w} ${v.h}L0 ${v.h}Z`;
}

/** Sky: the area above the horizon line (clip path for the visible part of the discs). */
export function skyPath(line: { x: number; y: number }[]): string {
  const last = line[line.length - 1];
  return `${pathOf(line)}L${last.x} -10000L${line[0].x} -10000Z`;
}

/** A flat line at constant elevation across the view (smooth-Moon horizon, F4). */
export function flatLine(v: View, elDeg: number): { x: number; y: number }[] {
  const y = project(v, v.az, elDeg).y;
  return [
    { x: 0, y },
    { x: v.w, y },
  ];
}

/** Disc of a body in pixels. */
export function discOf(v: View, body: { azDeg: number; elDeg: number; radiusDeg: number }): { cx: number; cy: number; r: number } {
  const p = project(v, body.azDeg, body.elDeg);
  return { cx: p.x, cy: p.y, r: body.radiusDeg * pxPerDeg(v) };
}

/**
 * Visible share of a drawn disc: the part of the circle above the drawn horizon line, measured on a
 * pixel grid. It checks the drawing itself (a disc centred on the horizon is cut in half), not the
 * physics of 07 §4 (that is `discFraction`).
 */
export function drawnVisibleShare(
  disc: { cx: number; cy: number; r: number },
  horizonY: (x: number) => number,
  samples = 200,
): number {
  let inside = 0;
  let visible = 0;
  const step = (2 * disc.r) / samples;
  for (let i = 0; i < samples; i++) {
    const x = disc.cx - disc.r + (i + 0.5) * step;
    for (let j = 0; j < samples; j++) {
      const y = disc.cy - disc.r + (j + 0.5) * step;
      if ((x - disc.cx) ** 2 + (y - disc.cy) ** 2 > disc.r * disc.r) continue;
      inside++;
      if (y < horizonY(x)) visible++;
    }
  }
  return inside ? visible / inside : 0;
}

/** Horizon height (pixel y) under pixel x in a view, from the mask. */
export function horizonYAt(v: View, el: ArrayLike<number>): (x: number) => number {
  return (x) => {
    const p = unproject(v, x, 0);
    return project(v, p.az, horizonAt(el, p.az)).y;
  };
}

/** Grid lines every `step` degrees inside the view, with labels (`270° W`, `5°`). */
export function gridLines(v: View, step: number): { az: { x: number; label: string }[]; el: { y: number; label: string }[] } {
  const halfW = v.widthDeg / 2;
  const halfH = v.heightDeg / 2;
  const az = [];
  for (let a = Math.ceil((v.az - halfW) / step) * step; a <= v.az + halfW; a += step) {
    az.push({ x: project(v, a, v.el).x, label: azLabel(a) });
  }
  const el = [];
  for (let e = Math.ceil((v.el - halfH) / step) * step; e <= v.el + halfH; e += step) {
    el.push({ y: project(v, v.az, e).y, label: `${fmtGrid(e)}°` });
  }
  return { az, el };
}

function fmtGrid(x: number): string {
  const r = Math.round(x * 100) / 100;
  return (Object.is(r, -0) ? 0 : r).toString().replace('-', '−');
}

/** Azimuth label: `0° N`, `90° E`, `180° S`, `270° W`, otherwise `275°`. */
export function azLabel(a: number): string {
  const w = Math.round(wrap360(a) * 100) / 100;
  const card: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
  return card[w] ? `${w}° ${card[w]}` : `${fmtGrid(w)}°`;
}

/** 360° strip: x from azimuth (0° at the left edge, N), y from the compressed elevation range. */
export function stripProject(w: number, h: number, az: number, el: number): { x: number; y: number } {
  const clamped = Math.min(Math.max(el, STRIP_MIN_EL), STRIP_MAX_EL);
  return { x: (wrap360(az) / 360) * w, y: h - ((clamped - STRIP_MIN_EL) / (STRIP_MAX_EL - STRIP_MIN_EL)) * h };
}

/** Horizon of the whole strip (720 samples + closing point). */
export function stripHorizon(w: number, h: number, el: ArrayLike<number>): { x: number; y: number }[] {
  const pts = [];
  for (let j = 0; j <= 720; j++) pts.push(stripProject(w, h, j * AZ_STEP_DEG, el[j % 720]));
  pts[pts.length - 1] = { x: w, y: pts[pts.length - 1].y };
  return pts;
}

/** Bracket of the 40° window on the strip; two pieces when it crosses north. */
export function stripBracket(w: number, centreAz: number, widthDeg = VIEW_WIDTH_DEG): { x: number; w: number }[] {
  const x0 = (wrap360(centreAz - widthDeg / 2) / 360) * w;
  const bw = (widthDeg / 360) * w;
  return x0 + bw <= w ? [{ x: x0, w: bw }] : [
    { x: x0, w: w - x0 },
    { x: 0, w: x0 + bw - w },
  ];
}

/** Azimuth under a click on the strip. */
export function stripAzAt(w: number, x: number): number {
  return wrap360((Math.min(Math.max(x, 0), w) / w) * 360);
}
