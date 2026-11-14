// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Shaders of the 3D view (16_vista_3d.md §5, §6). three.js `ShaderMaterial` chunks give logarithmic
// depth, tone mapping and the output colour space.
import { RAMP_STEPS } from '../overlay';

/** Hash noise shared by the regolith and the Earth's clouds (decorative). */
const NOISE = /* glsl */ `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm3(vec2 p) { return 0.5 * vnoise(p) + 0.3 * vnoise(p * 3.3 + 7.1) + 0.2 * vnoise(p * 12.7 + 3.9); }
`;

export const TERRAIN_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vUv;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;

/**
 * Regolith (§6.2): lunar-Lambert reflectance with McEwen's phase polynomial
 * L(α) = 1 − 0.019 α + 0.000242 α² − 0.00000146 α³ (α in degrees; USGS ISIS `LunarLambertMcEwen`,
 * docs/constants.md), cast shadows from the shadow texture (§6.3), earthshine and a faint ambient
 * (§6.4), decorative albedo noise. `clipMode` discards the smooth sphere under the terrain (§4.1).
 */
export const TERRAIN_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 sunDir;
uniform vec3 earthDir;
uniform float sunI;
uniform float earthI;
uniform vec3 earthColour;
uniform float ambient;
uniform float albedo;
uniform float albedoVar;
uniform float useShadow;
uniform sampler2D shadowTex;
uniform float useHoles;
uniform sampler2D holeTex;
uniform float detail;
uniform vec2 detailRange;
uniform int clipMode;        // 0 none, 1 polar mesh rectangle, 2 spherical cap around the anchor
uniform vec4 clipRect;       // xMin, yMin, xMax, yMax (map metres)
uniform vec3 frameO;         // anchor in MOON_ME (m)
uniform vec3 frameE;
uniform vec3 frameN;
uniform vec3 frameU;
uniform float clipCos;
uniform float R;
uniform float useOverlay;    // projected map layer (§9), polar scene only
uniform sampler2D overlayTex; // R8 stored values (pct / 0.4; 255 = no data), the polar grid
uniform vec3 overlayLut[${RAMP_STEPS}]; // the map's ramp, linear RGB
varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vUv;
${NOISE}
bool dots() { vec2 g = fract(gl_FragCoord.xy / 6.0) - 0.5; return dot(g, g) < 0.04; }
void main() {
  #include <logdepthbuf_fragment>
  if (clipMode > 0) {
    vec3 pMe = frameO + vWorld.x * frameE + vWorld.y * frameU - vWorld.z * frameN;
    vec3 P = normalize(pMe);
    if (clipMode == 1) {
      float k = 2.0 * R / (1.0 - P.z);
      vec2 m = vec2(k * P.y, k * P.x);
      if (P.z < 0.0 && m.x > clipRect.x && m.x < clipRect.z && m.y > clipRect.y && m.y < clipRect.w) discard;
    } else if (dot(P, frameU) > clipCos) discard;
  }
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(cameraPosition - vWorld);
  float ci = dot(n, sunDir);
  float ce = max(dot(n, v), 0.0);
  float a = degrees(acos(clamp(dot(sunDir, v), -1.0, 1.0)));
  float L = clamp(1.0 - 0.019 * a + 0.000242 * a * a - 0.00000146 * a * a * a, 0.0, 1.0);
  float ll = ci > 0.0 ? (2.0 * L * ci / (ci + ce + 1e-4) + (1.0 - L) * ci) : 0.0;
  float lit = useShadow > 0.5 ? texture2D(shadowTex, vUv).r : 1.0;
  float A = albedo * (1.0 + albedoVar * (2.0 * fbm3(vWorld.xz / 6000.0) - 1.0));
  if (detail > 0.5) {
    float f = 1.0 - smoothstep(detailRange.x, detailRange.y, length(cameraPosition - vWorld));
    if (f > 0.0) A *= 1.0 + f * 0.1 * (2.0 * (0.5 * vnoise(vWorld.xz / 40.0) + 0.3 * vnoise(vWorld.xz / 12.0) + 0.2 * vnoise(vWorld.xz / 3.0)) - 1.0);
  }
  vec3 col = vec3(A) * (sunI * lit * ll + ambient) + A * earthI * max(dot(n, earthDir), 0.0) * earthColour;
  if (useHoles > 0.5 && texture2D(holeTex, vUv).r > 0.5 && dots()) col = mix(col, vec3(0.35), 0.6);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  // The map layer is mixed after tone mapping, so its colours stay those of the 2D map's ramp:
  // mix(lit regolith, ramp × (0.55 + 0.45·cos i), 0.7); «no data» is transparent with the dot pattern.
  if (useOverlay > 0.5) {
    float v = floor(texture2D(overlayTex, vUv).r * 255.0 + 0.5);
    if (v > 250.5) {
      if (dots()) gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.5), 0.6);
    } else {
      int k = int(min(10.0, floor(v * 0.4 / 10.0 + 0.5)));
      gl_FragColor.rgb = mix(gl_FragColor.rgb, overlayLut[k] * (0.55 + 0.45 * max(ci, 0.0)), 0.7);
    }
  }
  #include <colorspace_fragment>
}
`;

export const SKY_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
void main() {
  vUv = uv;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Sun disc at its true angular radius with limb darkening and an additive halo (§5.2). */
export const SUN_FRAG = /* glsl */ `
uniform float halfAngle;   // half-size of the quad (rad)
uniform float rho;         // disc angular radius (rad)
uniform vec3 discColour;
uniform float discI;
uniform vec3 haloColour;
uniform float haloScale;   // rad
uniform float haloStrength;
uniform float dim;         // eclipse: fraction not covered
varying vec2 vUv;
void main() {
  float r = length(vUv * 2.0 - 1.0) * halfAngle;
  float edge = fwidth(r) + 1e-6;
  float disc = 1.0 - smoothstep(rho - edge, rho + edge, r);
  float mu = sqrt(max(0.0, 1.0 - (r / rho) * (r / rho)));
  vec3 c = disc * discColour * discI * (0.4 + 0.6 * mu);
  c += haloColour * haloStrength * exp(-r / haloScale) * (1.0 - smoothstep(0.85 * halfAngle, halfAngle, r));
  gl_FragColor = vec4(c * dim, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** The Earth lit by the same Sun direction, so its phase follows from the geometry (§5.2). */
export const EARTH_FRAG = /* glsl */ `
uniform vec3 sunDir;
uniform vec3 ocean;
uniform vec3 night;
uniform float clouds;
uniform float intensity;
uniform vec3 toCam;
varying vec2 vUv;
varying vec3 vNormal;
${NOISE}
void main() {
  vec3 n = normalize(vNormal);
  float day = smoothstep(-0.05, 0.12, dot(n, sunDir));
  float cl = smoothstep(0.45, 0.75, fbm3(vUv * vec2(24.0, 12.0)));
  vec3 lit = mix(ocean, vec3(1.0), cl * clouds) * intensity * max(dot(n, sunDir), 0.0);
  float rim = pow(1.0 - max(dot(n, toCam), 0.0), 3.0) * day;
  vec3 c = mix(night, lit, day) + vec3(0.22, 0.74, 0.97) * rim * 0.25;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const STAR_VERT = /* glsl */ `
attribute float size;
attribute float bright;
uniform float pixelRatio;
varying float vBright;
void main() {
  vBright = bright;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * pixelRatio;
}
`;

export const STAR_FRAG = /* glsl */ `
uniform float dim;
varying float vBright;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = 1.0 - smoothstep(0.2, 0.5, length(c));
  gl_FragColor = vec4(vec3(0.92, 0.95, 1.0) * vBright * dim * a, 1.0);
}
`;
