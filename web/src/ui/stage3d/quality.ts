// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Quality tiers and adaptive quality of the 3D view (16_vista_3d.md §12.2). Pure.

export type Tier = 'alto' | 'medio' | 'bajo';
export const TIERS: readonly Tier[] = ['alto', 'medio', 'bajo'];

export interface TierSettings {
  /** 1 = 500 m mesh; 2 = 1 km. */
  lod: 1 | 2;
  /** Shadow texture: fine grid divided by this. */
  shadowDiv: 1 | 2;
  /** Minimum time between shadow passes while the scene animates (ms); 0 = every change. */
  shadowEveryMs: number;
  halo: boolean;
  detail: boolean;
  maxPixelRatio: number;
}

export const TIER_SETTINGS: Readonly<Record<Tier, TierSettings>> = Object.freeze({
  alto: { lod: 1, shadowDiv: 1, shadowEveryMs: 0, halo: true, detail: true, maxPixelRatio: 2 },
  medio: { lod: 2, shadowDiv: 2, shadowEveryMs: 100, halo: true, detail: true, maxPixelRatio: 1 },
  bajo: { lod: 2, shadowDiv: 2, shadowEveryMs: 250, halo: false, detail: false, maxPixelRatio: 0.75 },
});

export interface Device {
  coarsePointer: boolean;
  widthPx: number;
  /** `UNMASKED_RENDERER_WEBGL`, or '' when the extension is missing. */
  renderer: string;
  cores: number;
  /** `?q=` from the URL, if any. */
  override: string | null;
}

const SOFTWARE = /swiftshader|llvmpipe|software|basic render/i;

export function pickTier(d: Device): Tier {
  if (d.override && (TIERS as readonly string[]).includes(d.override)) return d.override as Tier;
  if (d.coarsePointer || d.widthPx < 768 || SOFTWARE.test(d.renderer)) return 'bajo';
  if (d.cores > 0 && d.cores <= 4) return 'medio';
  return 'alto';
}

export function lowerTier(t: Tier): Tier {
  return t === 'alto' ? 'medio' : 'bajo';
}

/**
 * Adaptive quality: while the scene renders continuously, the mean of the last 90 frame times; below
 * 45 fps for 2 s in a row → one tier lower, at most once every 10 s. Never goes up by itself.
 */
export class FpsMonitor {
  private times: number[] = [];
  private slowSince: number | null = null;
  private lastDrop = -Infinity;
  constructor(private readonly locked: boolean) {}

  /** `dtMs` between two continuous frames at time `nowMs`; returns true when the tier must drop. */
  frame(dtMs: number, nowMs: number): boolean {
    if (this.locked || dtMs <= 0 || dtMs > 1000) return false;
    this.times.push(dtMs);
    if (this.times.length > 90) this.times.shift();
    if (this.times.length < 30) return false;
    const fps = 1000 / (this.times.reduce((a, b) => a + b, 0) / this.times.length);
    if (fps >= 45) {
      this.slowSince = null;
      return false;
    }
    if (this.slowSince === null) this.slowSince = nowMs;
    if (nowMs - this.slowSince >= 2000 && nowMs - this.lastDrop >= 10_000) {
      this.lastDrop = nowMs;
      this.slowSince = null;
      this.times = [];
      return true;
    }
    return false;
  }

  /** Mean frames per second of the window (for `?fps=1`). */
  fps(): number | null {
    if (this.times.length < 5) return null;
    return 1000 / (this.times.reduce((a, b) => a + b, 0) / this.times.length);
  }

  /** Continuous rendering stopped: the next frame time is not a frame interval. */
  pause(): void {
    this.slowSince = null;
  }
}
