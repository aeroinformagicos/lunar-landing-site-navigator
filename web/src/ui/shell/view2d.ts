// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Direction of the full-width 2D view, shared by the scene (Stage2D) and the heading indicator next to
// the time bar (T-64, D-120 c). The scene publishes where it looks and where the Sun and the Earth are;
// the indicator asks the scene to turn. Presentation only: nothing here enters the store or the URL.
import { create } from 'zustand';

export interface View2dState {
  /** Azimuth at the centre of the 40° view (degrees, from north to east), or null with no 2D scene. */
  viewAz: number | null;
  sunAz: number | null;
  earthAz: number | null;
  /** Last turn request: the scene follows it when `seq` changes; `az` null centres on the body again. */
  turn: { az: number | null; seq: number } | null;
  publish(v: { viewAz: number | null; sunAz: number | null; earthAz: number | null }): void;
  turnTo(az: number): void;
  recentre(): void;
}

export const useView2d = create<View2dState>((set, get) => ({
  viewAz: null,
  sunAz: null,
  earthAz: null,
  turn: null,
  publish: (v) => {
    const s = get();
    if (s.viewAz === v.viewAz && s.sunAz === v.sunAz && s.earthAz === v.earthAz) return;
    set(v);
  },
  turnTo: (az) => set((s) => ({ turn: { az: ((az % 360) + 360) % 360, seq: (s.turn?.seq ?? 0) + 1 } })),
  recentre: () => set((s) => ({ turn: { az: null, seq: (s.turn?.seq ?? 0) + 1 } })),
}));

/** Compass point of an azimuth in eight sectors (N, NE, E…), for the indicator's text. */
export function compassPoint(az: number): string {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const a = ((az % 360) + 360) % 360;
  return names[Math.round(a / 45) % 8];
}
