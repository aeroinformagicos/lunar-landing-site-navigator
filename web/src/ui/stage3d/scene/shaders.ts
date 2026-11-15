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

/**
 * Procedural surface detail of the regolith (T-74, D-133): fields of small craters at four scales and
 * a fine regolith roughness, as a slope (dh/dx, dh/dz) that bends the normal plus a small albedo change.
 * Hash cells, a rotation and an offset per scale: no texture, no visible repetition. Each scale fades
 * out when its craters would be smaller than a few pixels (\`foot\` = metres per pixel). Invented
 * texture, not relief: the illustrative-shading notice covers it (§6.7).
 */
const DETAIL = /* glsl */ `
vec2 hash22(vec2 p) { return vec2(hash12(p), hash12(p + 19.19)); }
// Slope (xy) and albedo change (z) of one crater field with cells of \`cell\` metres.
vec3 craters(vec2 p, float cell, float seed) {
  vec2 q = p / cell;
  vec2 g = floor(q);
  vec2 f = q - g;
  vec3 acc = vec3(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = g + vec2(float(i), float(j)) + seed;
      vec2 h = hash22(c);
      if (h.x > 0.55) continue;                                  // about half the cells hold a crater
      vec2 ctr = vec2(float(i), float(j)) + hash22(c + 7.7) * 0.8 + 0.1;
      float rad = mix(0.12, 0.48, h.y * h.y);                    // radius in cells, small ones commoner
      vec2 d = f - ctr;
      float dl = length(d);
      float r = dl / rad;
      if (r > 1.7 || dl < 1e-5) continue;
      float fresh = hash12(c + 3.3);                             // degraded … fresh
      float depth = mix(0.08, 0.38, fresh);                      // depth / radius (fresh bowls about 0.2 of the diameter)
      float rim = mix(0.01, 0.07, fresh);
      // h(r) = depth·(r² − 1) + rim inside; the rim falls off smoothly outside. dh/dr below.
      float dhdr = r < 1.0 ? 2.0 * depth * r : -rim * 6.0 * ((r - 1.0) / 0.7) * (1.0 - (r - 1.0) / 0.7) / 0.7;
      acc.xy += dhdr * (d / dl);
      acc.z += (r < 1.0 ? -0.04 : 0.06 * (1.0 - smoothstep(1.0, 1.7, r))) * fresh;
    }
  }
  return acc;
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 surfaceDetail(vec2 p, float foot, float amount) {
  vec3 acc = vec3(0.0);
  float cells[4] = float[4](640.0, 170.0, 46.0, 12.0);
  for (int k = 0; k < 4; k++) {
    float w = smoothstep(5.0, 14.0, cells[k] / foot);
    if (w < 0.01) continue;
    vec2 pk = rot(float(k) * 1.9 + 0.4) * p + vec2(float(k) * 913.7, float(k) * -517.3);
    vec3 c = craters(pk, cells[k], float(k) * 41.0);
    c.xy = c.xy * rot(float(k) * 1.9 + 0.4);                   // slope back to the scene's axes
    acc += w * c;
  }
  // Regolith roughness: value noise at 3 m and 0.8 m, its slope by finite differences.
  for (int k = 0; k < 2; k++) {
    float l = k == 0 ? 3.0 : 0.8;
    float w = smoothstep(4.0, 12.0, l / foot);
    if (w < 0.01) continue;
    vec2 q = p / l + float(k) * 37.0;
    float e = 0.25;
    float n0 = vnoise(q);
    acc.xy += w * 0.18 * vec2(vnoise(q + vec2(e, 0.0)) - n0, vnoise(q + vec2(0.0, e)) - n0) / e;
    acc.z += w * 0.03 * (n0 - 0.5);
  }
  return acc * amount;
}
`;

export const TERRAIN_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vUv;
uniform float exag;      // vertical exaggeration (T-74, D-131); 1 = true scale
uniform float exagRefH;  // the anchor's height above the sphere (m): it stays put
uniform vec3 moonC;      // centre of the Moon in the scene, (0, −(R + hA), 0)
uniform float R;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 nrm = normalize(mat3(modelMatrix) * normal);
  if (exag != 1.0) {
    // h → hA + k·(h − hA) along the local vertical; the normal's tangential part grows by k.
    vec3 rv = wp.xyz - moonC;
    float r = length(rv);
    vec3 up = rv / r;
    wp.xyz = moonC + up * (R + exagRefH + exag * (r - R - exagRefH));
    float nu = dot(nrm, up);
    nrm = normalize((nrm - up * nu) * exag + up * nu);
  }
  vWorld = wp.xyz;
  vNormal = nrm;
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
uniform vec2 detailRange;   // (unused since T-74: the detail fades by pixel size)
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
${DETAIL}
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
  float A = albedo * (1.0 + albedoVar * (2.0 * fbm3(vWorld.xz / 6000.0) - 1.0));
  if (detail > 0.5) {
    // Small craters and regolith roughness bend the normal (T-74, D-133): metres per pixel from the derivatives.
    float foot = max(length(fwidth(vWorld)), 0.05);
    vec3 sd = surfaceDetail(vWorld.xz, foot, 1.0);
    vec3 G = vec3(sd.x, 0.0, sd.y);
    n = normalize(n - (G - n * dot(G, n)));
    A *= 1.0 + sd.z;
  }
  float ci = dot(n, sunDir);
  float ce = max(dot(n, v), 0.0);
  float a = degrees(acos(clamp(dot(sunDir, v), -1.0, 1.0)));
  float L = clamp(1.0 - 0.019 * a + 0.000242 * a * a - 0.00000146 * a * a * a, 0.0, 1.0);
  float ll = ci > 0.0 ? (2.0 * L * ci / (ci + ce + 1e-4) + (1.0 - L) * ci) : 0.0;
  float lit = useShadow > 0.5 ? texture2D(shadowTex, vUv).r : 1.0;
  vec3 col = vec3(A) * (sunI * lit * ll + ambient) + A * earthI * max(dot(n, earthDir), 0.0) * earthColour;
  if (useHoles > 0.5 && texture2D(holeTex, vUv).r > 0.5 && dots()) col = mix(col, vec3(0.35), 0.6);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  // The map layer is mixed after tone mapping, so its colours stay those of the 2D map's ramp;
  // «no data» is transparent with the dot pattern.
  if (useOverlay > 0.5) {
    float v = floor(texture2D(overlayTex, vUv).r * 255.0 + 0.5);
    if (v > 250.5) {
      if (dots()) gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.5), 0.6);
    } else {
      int k = int(min(10.0, floor(v * 0.4 / 10.0 + 0.5)));
      // T-74 (D-135): the layer is shaded by a fixed oblique light from the north-west (a map hillshade,
      // independent of the grazing Sun) and darkened in cast shadow, so the relief reads under it.
      float hs = clamp(dot(n, normalize(vec3(-0.5, 0.71, -0.5))), 0.0, 1.0);
      float shade = (0.35 + 0.75 * hs) * mix(0.7, 1.0, lit);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, overlayLut[k] * shade, 0.68);
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

/**
 * Sun disc at its true angular radius with limb darkening and an additive halo (§5.2). T-74 (D-136):
 * a white core glow and faint camera-like glare spikes; the tinted halo stays the outer glow.
 */
export const SUN_FRAG = /* glsl */ `
uniform float halfAngle;   // half-size of the quad (rad)
uniform float rho;         // disc angular radius (rad)
uniform vec3 discColour;
uniform float discI;
uniform vec3 haloColour;
uniform float haloScale;   // rad
uniform float haloStrength;
uniform float dim;         // eclipse: fraction not covered
uniform float spikes;      // glare spikes (0 on the low tier)
varying vec2 vUv;
void main() {
  float r = length(vUv * 2.0 - 1.0) * halfAngle;
  float edge = fwidth(r) + 1e-6;
  float disc = 1.0 - smoothstep(rho - edge, rho + edge, r);
  float mu = sqrt(max(0.0, 1.0 - (r / rho) * (r / rho)));
  vec3 c = disc * discColour * discI * (0.4 + 0.6 * mu);
  float fade = 1.0 - smoothstep(0.85 * halfAngle, halfAngle, r);
  c += haloColour * haloStrength * exp(-r / haloScale) * fade;
  // White core glow just outside the disc, and four thin glare spikes (lens-like, decorative).
  c += discColour * 1.6 * exp(-max(r - rho, 0.0) / (rho * 0.9)) * (1.0 - disc);
  vec2 q = abs(vUv * 2.0 - 1.0) * halfAngle;
  float spike = exp(-min(q.x, q.y) / (rho * 0.08)) * exp(-max(q.x, q.y) / (halfAngle * 0.35));
  c += discColour * spikes * spike * fade;
  gl_FragColor = vec4(c * dim, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const EARTH_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vObj;
void main() {
  vObj = normal;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * The Earth lit by the same Sun direction, so its phase follows from the geometry (§5.2). T-74 (D-136):
 * invented continents, polar ice and swirling clouds from 3D noise on the sphere (no images, no
 * seams), a thin blue atmosphere at the limb and a soft terminator. Decorative, not a map of the Earth.
 */
export const EARTH_FRAG = /* glsl */ `
uniform vec3 sunDir;
uniform vec3 ocean;
uniform vec3 night;
uniform float clouds;
uniform float intensity;
uniform vec3 toCam;
varying vec3 vNormal;
varying vec3 vObj;
float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float n3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h13(i), h13(i + vec3(1, 0, 0)), f.x), mix(h13(i + vec3(0, 1, 0)), h13(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h13(i + vec3(0, 0, 1)), h13(i + vec3(1, 0, 1)), f.x), mix(h13(i + vec3(0, 1, 1)), h13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int k = 0; k < 5; k++) { s += a * n3(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
void main() {
  vec3 n = normalize(vNormal);
  vec3 o = normalize(vObj);
  float mu = dot(n, sunDir);
  float day = smoothstep(-0.08, 0.15, mu);
  float land = smoothstep(0.52, 0.56, fbm(o * 2.2 + 3.0));
  vec3 ground = mix(vec3(0.36, 0.31, 0.2), vec3(0.17, 0.27, 0.13), smoothstep(0.4, 0.7, fbm(o * 6.0)));
  vec3 surf = mix(ocean, ground, land);
  surf = mix(surf, vec3(0.92), smoothstep(0.78, 0.86, abs(o.y)));
  vec3 w = o + 0.35 * vec3(fbm(o * 3.0), fbm(o * 3.0 + 5.2), fbm(o * 3.0 + 9.4));
  float cl = smoothstep(0.52, 0.74, fbm(w * 4.5)) * clouds * 1.5;
  surf = mix(surf, vec3(1.0), clamp(cl, 0.0, 0.85));
  vec3 lit = surf * intensity * max(mu, 0.0);
  float limb = 1.0 - max(dot(n, toCam), 0.0);
  vec3 c = mix(night, lit, day) + vec3(0.25, 0.55, 1.0) * pow(limb, 2.5) * 0.6 * smoothstep(-0.2, 0.3, mu);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const STAR_VERT = /* glsl */ `
attribute float size;
attribute float bright;
attribute vec3 tint;
uniform float pixelRatio;
varying float vBright;
varying vec3 vTint;
void main() {
  vBright = bright;
  vTint = tint;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * pixelRatio;
}
`;

export const STAR_FRAG = /* glsl */ `
uniform float dim;
varying float vBright;
varying vec3 vTint;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = 1.0 - smoothstep(0.15, 0.5, length(c));
  gl_FragColor = vec4(vTint * vBright * dim * a, 1.0);
}
`;
