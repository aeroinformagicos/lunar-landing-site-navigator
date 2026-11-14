// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// 3D / 2D view mode of the central stage (15_interfaz_v2.md §0, §4.1; 16_vista_3d.md §10.3).
// The 3D view needs WebGL 2, a window of 768 px or more and the 3D module (lane I3) in this build.

export type ViewMode = '3d' | '2d';
export const VIEW_MODES: readonly ViewMode[] = ['3d', '2d'];

/**
 * The 3D module, found at build time: an empty object while lane I3 has not added
 * `ui/stage3d/index.tsx`, so this build still compiles (D-102).
 */
export const STAGE3D_MODULES = import.meta.glob('../ui/stage3d/index.tsx');
export const HAS_STAGE3D = Object.keys(STAGE3D_MODULES).length > 0;

let webgl2: boolean | null = null;

/** Whether a WebGL 2 context can be created (three.js needs WebGL 2). Checked once. */
export function hasWebGL2(): boolean {
  if (webgl2 !== null) return webgl2;
  try {
    webgl2 = typeof document !== 'undefined' && document.createElement('canvas').getContext('webgl2') !== null;
  } catch {
    webgl2 = false;
  }
  return webgl2;
}

function wideEnough(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(min-width: 768px)').matches;
}

/** Whether this device and build can show the 3D view. */
export function can3d(env: { module: boolean; webgl2: () => boolean; wide: () => boolean } = { module: HAS_STAGE3D, webgl2: hasWebGL2, wide: wideEnough }): boolean {
  return env.module && env.wide() && env.webgl2();
}

/**
 * Initial view mode: `?vm=3d|2d` in the query if it can be honoured (lane I3 opens `?ui=v2&vm=3d`),
 * else 3D when the device can show it and 2D otherwise.
 */
export function defaultViewMode(search: string = typeof location === 'undefined' ? '' : location.search, possible: () => boolean = can3d): ViewMode {
  const vm = new URLSearchParams(search).get('vm');
  if (vm === '2d') return '2d';
  return possible() ? '3d' : '2d';
}
