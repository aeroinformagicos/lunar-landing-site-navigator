// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Map layers projected on the polar terrain (16_vista_3d.md §9): which layers the Overlay control
// offers, the colour table (the 2D map's ramps, so both views match) and the band bytes that become
// the R8 texture. Pure: no three.js.
import { GRID } from '../../core/grid';
import type { MapLayer } from '../../state/store';
import { LAYER_NODATA, rampColour, rampStep, type Band } from '../map/mapData';

/** Overlay choices in the order of the control (§9). */
export const OVERLAY_CHOICES: readonly MapLayer[] = ['none', 'sun', 'earth', 'both'];
/** Steps of the map ramp (0 … 10, 10 % each; 10 §6.4). */
export const RAMP_STEPS = 11;

/** Plan B (`source = nasa_avgvisib`): only Sunlight, with the fixed NASA band (§9). */
export function overlayChoices(source: 'computed' | 'nasa_avgvisib'): readonly MapLayer[] {
  return source === 'nasa_avgvisib' ? ['none', 'sun'] : OVERLAY_CHOICES;
}

/**
 * The layer drawn on the terrain: the store's map layer once the viewer has turned the overlay on in
 * the 3D view (it starts at `None`, §9), if the data offers that band; `none` otherwise.
 */
export function shownLayer(on: boolean, storeLayer: MapLayer, source: 'computed' | 'nasa_avgvisib', bands: readonly Band[]): Band | null {
  if (!on || storeLayer === 'none') return null;
  if (!overlayChoices(source).includes(storeLayer) || !bands.includes(storeLayer)) return null;
  return storeLayer;
}

const toLinear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** sRGB colour of each ramp step, as the 2D map paints it (`rampColour`). */
export function overlayRamp(band: Band): [number, number, number][] {
  return Array.from({ length: RAMP_STEPS }, (_, s) => rampColour(s, band));
}

/** The same table in linear RGB (the shader mixes in linear light and converts on output). */
export function overlayLutLinear(band: Band): Float32Array {
  const out = new Float32Array(RAMP_STEPS * 3);
  overlayRamp(band).forEach((c, s) => out.set(c.map(toLinear), 3 * s));
  return out;
}

/** Bytes of one band of a layer file (`band,row,col`, 09 §9.2): the 752 × 672 R8 texture. */
export function bandBytes(layer: Uint8Array, bandIndex: number): Uint8Array {
  const n = GRID.nx * GRID.ny;
  return layer.subarray(bandIndex * n, (bandIndex + 1) * n);
}

/** Ramp step the shader picks for a stored value, or null for «no data» (same rule as the map). */
export function overlayStep(v: number): number | null {
  return v === LAYER_NODATA ? null : rampStep(v);
}
