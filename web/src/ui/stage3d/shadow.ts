// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Cast shadows of the polar scene (16_vista_3d.md §6.3): for each cell, the horizon elevation toward
// the Sun with the geometry of the horizon cube (08 §3.2) and the lit fraction of the solar disc.
// `litFraction` is the TypeScript reference used by the tests; `SHADOW_FRAG` is the same algorithm on
// the GPU (one fragment per cell). Keep the two in step.
import { GRID } from '../../core/grid';
import { bilinear } from './meshes';
import { R_M, dot, type V3 } from './frame';

/** First sample distance (half a 500 m cell) and the geometric step, as the cube's distance code. */
export const SHADOW_D0_M = 250;
export const SHADOW_RATIO = 1.04;
export const SHADOW_MAX_M = 300_000;
/** Observer height used for the surface (CLAUDE.md §2): avoids self-shadowing by sampling. */
export const SHADOW_OBS_M = 2;

/**
 * Lit fraction (0…1) of the solar disc at map point (x, y) on the fine DEM `h`, for the Sun along the
 * unit MOON_ME vector `s` with angular radius `rhoRad`. Linear penumbra: 0.5 when the disc centre
 * grazes the horizon (the project's «centre above the horizon» rule).
 */
export function litFraction(h: Float32Array, x: number, y: number, s: V3, rhoRad: number): number {
  const { nx, ny, cellM, xMinM, yMaxM } = GRID;
  const h0 = bilinear(h, nx, ny, cellM, xMinM, yMaxM, x, y);
  if (h0 === null) return 1;
  const rho = Math.hypot(x, y);
  let u0: V3, E: V3, N: V3, Em: [number, number], Nm: [number, number];
  if (rho < 1) {
    u0 = [0, 0, -1];
    E = [0, 1, 0];
    N = [1, 0, 0];
    Em = [1, 0];
    Nm = [0, 1];
  } else {
    const c = 2 * Math.atan(rho / (2 * R_M));
    const sc = Math.sin(c);
    const cc = Math.cos(c);
    u0 = [(sc * y) / rho, (sc * x) / rho, -cc];
    E = [-x / rho, y / rho, 0];
    N = [(cc * y) / rho, (cc * x) / rho, sc];
    Em = [y / rho, -x / rho];
    Nm = [x / rho, y / rho];
  }
  const elSun = Math.asin(Math.max(-1, Math.min(1, dot(s, u0))));
  const se = dot(s, E);
  const sn = dot(s, N);
  const hl = Math.hypot(se, sn);
  if (hl < 1e-9) return 1;
  const dx = (se * Em[0] + sn * Nm[0]) / hl;
  const dy = (se * Em[1] + sn * Nm[1]) / hl;
  let H = -Math.PI / 2;
  for (let d = SHADOW_D0_M, k = 0; d <= SHADOW_MAX_M && k < 200; d *= SHADOW_RATIO, k++) {
    const hk = bilinear(h, nx, ny, cellM, xMinM, yMaxM, x + d * dx, y + d * dy);
    if (hk === null) break;
    const th = d / R_M;
    const s2 = Math.sin(th / 2) ** 2;
    const el = Math.atan2(hk - h0 - SHADOW_OBS_M - 2 * (R_M + hk) * s2, (R_M + hk) * Math.sin(th));
    if (el > H) H = el;
    if (H > elSun + rhoRad) break;
  }
  return Math.max(0, Math.min(1, (elSun - H) / (2 * rhoRad) + 0.5));
}

/** Full-screen pass: one fragment per output texel (GLSL ES 3.0, `RawShaderMaterial`). */
export const SHADOW_VERT = /* glsl */ `
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const SHADOW_FRAG = /* glsl */ `
precision highp float;
precision highp int;
uniform sampler2D dem;      // R32F, fine grid, row j = 0 first (texelFetch, no filtering)
uniform ivec2 demSize;      // 752, 672
uniform float cellM;        // 500
uniform vec2 gridOrigin;    // xMin, yMax (m)
uniform vec2 outSize;       // output texels
uniform vec3 sunMe;         // unit Sun direction, MOON_ME
uniform float rhoSun;       // Sun angular radius (rad)
uniform float R;            // lunar radius (m)
out vec4 fragColor;

bool demAt(vec2 xy, out float h) {
  float s = (xy.x - gridOrigin.x) / cellM - 0.5;
  float l = (gridOrigin.y - xy.y) / cellM - 0.5;
  if (s < 0.0 || l < 0.0 || s > float(demSize.x - 1) || l > float(demSize.y - 1)) return false;
  int i0 = min(int(floor(s)), demSize.x - 2);
  int j0 = min(int(floor(l)), demSize.y - 2);
  float fs = s - float(i0);
  float fl = l - float(j0);
  float a = texelFetch(dem, ivec2(i0, j0), 0).r;
  float b = texelFetch(dem, ivec2(i0 + 1, j0), 0).r;
  float c = texelFetch(dem, ivec2(i0, j0 + 1), 0).r;
  float d = texelFetch(dem, ivec2(i0 + 1, j0 + 1), 0).r;
  h = (1.0 - fl) * ((1.0 - fs) * a + fs * b) + fl * ((1.0 - fs) * c + fs * d);
  return true;
}

void main() {
  vec2 ext = vec2(float(demSize.x), float(demSize.y)) * cellM;
  vec2 xy = vec2(gridOrigin.x + gl_FragCoord.x / outSize.x * ext.x, gridOrigin.y - gl_FragCoord.y / outSize.y * ext.y);
  float h0;
  if (!demAt(xy, h0)) { fragColor = vec4(1.0); return; }
  float rho = length(xy);
  vec3 u0 = vec3(0.0, 0.0, -1.0); vec3 E = vec3(0.0, 1.0, 0.0); vec3 N = vec3(1.0, 0.0, 0.0);
  vec2 Em = vec2(1.0, 0.0); vec2 Nm = vec2(0.0, 1.0);
  if (rho >= 1.0) {
    float c = 2.0 * atan(rho / (2.0 * R));
    float sc = sin(c); float cc = cos(c);
    u0 = vec3(sc * xy.y / rho, sc * xy.x / rho, -cc);
    E = vec3(-xy.x / rho, xy.y / rho, 0.0);
    N = vec3(cc * xy.y / rho, cc * xy.x / rho, sc);
    Em = vec2(xy.y / rho, -xy.x / rho);
    Nm = vec2(xy.x / rho, xy.y / rho);
  }
  float elSun = asin(clamp(dot(sunMe, u0), -1.0, 1.0));
  float se = dot(sunMe, E); float sn = dot(sunMe, N);
  float hl = length(vec2(se, sn));
  if (hl < 1e-9) { fragColor = vec4(1.0); return; }
  vec2 dir = (se * Em + sn * Nm) / hl;
  float H = -1.5707963;
  float d = ${SHADOW_D0_M.toFixed(1)};
  for (int k = 0; k < 200; k++) {
    if (d > ${SHADOW_MAX_M.toFixed(1)}) break;
    float hk;
    if (!demAt(xy + d * dir, hk)) break;
    float th = d / R;
    float s2 = sin(0.5 * th); s2 *= s2;
    float el = atan((hk - h0 - ${SHADOW_OBS_M.toFixed(1)}) - 2.0 * (R + hk) * s2, (R + hk) * sin(th));
    H = max(H, el);
    if (H > elSun + rhoSun) break;
    d *= ${SHADOW_RATIO.toFixed(2)};
  }
  float lit = clamp((elSun - H) / (2.0 * rhoSun) + 0.5, 0.0, 1.0);
  fragColor = vec4(lit, lit, lit, 1.0);
}
`;
