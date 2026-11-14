// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Pure helpers of the full-width 2D view (15_interfaz_v2.md §4.2, §4.3, §7.5): the view that puts
// the horizon at 58 % of the height, the Earth's phase seen from the site, label placement without
// overlaps and the OKLab colour ramps of the v2 map. No new physics: only the sky directions the
// core already gives.
import { angularSep } from '../../core/eclipse';
import { horizonAt } from '../../core/horizon';
import { pxPerDeg, viewCentre, VIEW_WIDTH_DEG, type View } from '../panorama/geometry';

/**
 * Horizon line at this share of the stage height. The mockup has it at 51–59 %; our bottom strip is
 * taller (summary, tabs, two credit lines), so it sits at 50 % to stay clear of the verdict (D-111).
 */
export const HORIZON_AT = 0.5;

/**
 * Full-stage view: 40° of azimuth across the width and the same scale vertically (D-103). The centre
 * follows `viewCentre` (body or panned azimuth, recentre beyond 8°); when centred on the horizon it is
 * shifted so the horizon sits at `HORIZON_AT` of the height.
 */
export function stageView(
  w: number,
  h: number,
  maskEl: ArrayLike<number>,
  body: { azDeg: number; elDeg: number },
  panAz: number | null,
  horizonFrac: number = HORIZON_AT,
): { view: View; arrow: { dir: 'below' | 'above'; deg: number } | null } {
  const c = viewCentre(maskEl, body, panAz);
  const widthDeg = VIEW_WIDTH_DEG;
  const heightDeg = (h * widthDeg) / Math.max(1, w);
  const base: View = { az: c.az, el: c.el, widthDeg, heightDeg, w, h };
  if (c.arrow) return { view: base, arrow: c.arrow };
  const k = pxPerDeg(base);
  // y(horizon) = h/2 + (el − horizon)·k = frac·h  ⇒  el = horizon + (frac − 0.5)·h / k.
  const hor = horizonAt(maskEl, c.az);
  return { view: { ...base, el: hor + ((horizonFrac - 0.5) * h) / k }, arrow: null };
}

/** Horizon height that keeps the line above the bottom strip: at most `HORIZON_AT`, at least 30 %. */
export function horizonFracFor(h: number, bottomStripPx: number): number {
  return Math.min(HORIZON_AT, Math.max(0.3, (h - bottomStripPx - 24) / h));
}

/**
 * The Earth's phase seen from the site: lit fraction of the disc and the screen direction of its lit
 * limb. With the Sun far away, the Earth's phase angle is 180° minus the Sun–Earth elongation in the
 * site's sky, so the lit fraction is (1 − cos elongation) / 2. The lit limb faces the Sun on screen.
 */
export function earthPhase(
  sun: { azDeg: number; elDeg: number },
  earth: { azDeg: number; elDeg: number },
): { lit: number; towardSunRad: number } {
  const elong = (angularSep(sun.azDeg, sun.elDeg, earth.azDeg, earth.elDeg) * Math.PI) / 180;
  const lit = (1 - Math.cos(elong)) / 2;
  let dAz = sun.azDeg - earth.azDeg;
  dAz = ((dAz + 540) % 360) - 180;
  const dx = dAz * Math.cos((earth.elDeg * Math.PI) / 180);
  const dy = -(sun.elDeg - earth.elDeg); // screen y grows downwards
  return { lit, towardSunRad: Math.atan2(dy, dx) };
}

/**
 * SVG path of the lit part of a disc of radius `r` at (cx, cy): a half circle on the Sun's side and
 * the terminator as a half ellipse of semi-axis r·|2·lit − 1|, rotated toward the Sun.
 */
export function phasePath(cx: number, cy: number, r: number, lit: number, towardSunRad: number): string {
  if (lit <= 0.001) return '';
  const f = (x: number, y: number) => {
    const c = Math.cos(towardSunRad);
    const s = Math.sin(towardSunRad);
    return `${(cx + x * c - y * s).toFixed(2)} ${(cy + x * s + y * c).toFixed(2)}`;
  };
  if (lit >= 0.999) return `M${f(0, -r)}A${r} ${r} 0 1 1 ${f(0, r)}A${r} ${r} 0 1 1 ${f(0, -r)}Z`;
  const t = r * Math.abs(2 * lit - 1);
  // Limb: from the top (0, −r) round the Sun side (+x) to the bottom (0, r).
  // Terminator back to the top: bulges toward the Sun when less than half is lit (crescent), away
  // from it when more (gibbous).
  const sweep = lit < 0.5 ? 0 : 1;
  return `M${f(0, -r)}A${r} ${r} 0 0 1 ${f(0, r)}A${t.toFixed(2)} ${r} ${((towardSunRad * 180) / Math.PI).toFixed(2)} 0 ${sweep} ${f(0, -r)}Z`;
}

export interface LabelBox {
  id: string;
  /** Anchor (top-left of the text block). */
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Moves labels down until none overlaps another (in the order given, the first keeps its place), so
 * «Sun · behind the ridge», «Earth» and the ridge never print on top of each other.
 */
export function placeLabels(boxes: LabelBox[], gap = 6): LabelBox[] {
  const placed: LabelBox[] = [];
  for (const b of boxes) {
    const box = { ...b };
    for (let guard = 0; guard < 20; guard++) {
      const hit = placed.find((p) => box.x < p.x + p.w && p.x < box.x + box.w && box.y < p.y + p.h + gap && p.y < box.y + box.h + gap);
      if (!hit) break;
      box.y = hit.y + hit.h + gap;
    }
    placed.push(box);
  }
  return placed;
}

// ---- OKLab ramps (D-103) ---------------------------------------------------------------------

type Rgb = [number, number, number];

const toLin = (c: number) => {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (x: number) => {
  const v = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
};

export function rgbToOklab([r, g, b]: Rgb): Rgb {
  const R = toLin(r);
  const G = toLin(g);
  const B = toLin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

export function oklabToRgb([L, a, b]: Rgb): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** Step `step` (0…10) of the ramp from `from` to `to`, interpolated in OKLab. */
export function oklabRamp(from: Rgb, to: Rgb, step: number, steps = 10): Rgb {
  const a = rgbToOklab(from);
  const b = rgbToOklab(to);
  const t = Math.min(1, Math.max(0, step / steps));
  return oklabToRgb([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}
