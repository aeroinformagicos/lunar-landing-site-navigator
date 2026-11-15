// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Visual parameters of the 3D view (16_vista_3d.md §5, §6; decision D-97 h). Visual only: they have
// no physical meaning and none of them changes a figure of the app. The only physical model, the
// lunar-Lambert phase polynomial, lives in the terrain shader with its source (docs/constants.md).

export const LOOK = Object.freeze({
  /** Directional sunlight before tone mapping. */
  sunIntensity: 8.0,
  /** Earthshine relative to sunlight (about 1/750), times the Earth's lit fraction. */
  earthshine: 0.004,
  earthshineColour: [0.686, 0.776, 0.91] as [number, number, number], // #AFC6E8
  ambient: 0.002,
  /** Grey regolith albedo and its low-frequency variation. */
  albedo: 0.12,
  albedoVariation: 0.15,
  /** Close-up procedural detail (fades in between these camera distances, m). */
  detailNearM: 1500,
  detailFarM: 6000,
  detailAmount: 0.1,
  /** Lighting while the ephemeris is not ready: a neutral light from above, so the view is never empty. */
  neutralIntensity: 0.6,
  stars: 4000,
  starSeed: 20261114,
  /** Star brightness when the Sun is in the field of view (glare). */
  starGlareDim: 0.3,
  sunDiscColour: [1.0, 0.973, 0.906] as [number, number, number], // #FFF8E7
  sunDiscIntensity: 24,
  haloRadiusDeg: 8,
  haloScaleDeg: 1.2,
  haloStrength: 0.6,
  /** Earth: ocean, night side, cloud cover. No images (CLAUDE.md §10 bis). */
  earthOcean: [0.118, 0.306, 0.549] as [number, number, number], // #1E4E8C
  earthNight: [0.02, 0.027, 0.047] as [number, number, number], // #05070C
  earthClouds: 0.35,
  earthIntensity: 2.2,
  /** Sky objects live on a sphere of this radius around the sky camera. */
  skyRadius: 1000,
  /** Profile scene: near-site smoothing across azimuth (D-134): arc of the window (m) and its cap (azimuths each side). */
  profileSmoothArcM: 150,
  profileSmoothMaxHalf: 24,
  /** Scenario pin mast (m). */
  mastM: 300,
  exposure: 1.0,
});
