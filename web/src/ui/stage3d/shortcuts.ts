// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Keys of the 3D view (16_vista_3d.md §7, §10.4), for its own help and the shell's shortcut help.
// No three.js here: the shell can import it without loading the 3D chunk.
import type { TextKey } from '../../i18n/t';

export interface Stage3DShortcut {
  keys: TextKey;
  action: TextKey;
}

/** Orbit mode (T-71). Fly and Ground arrive with T-72. */
export const STAGE3D_SHORTCUTS: readonly Stage3DShortcut[] = [
  { keys: 'stage3d.keys.drag', action: 'stage3d.keys.drag_action' },
  { keys: 'stage3d.keys.pan', action: 'stage3d.keys.pan_action' },
  { keys: 'stage3d.keys.zoom', action: 'stage3d.keys.zoom_action' },
  { keys: 'stage3d.keys.arrows', action: 'stage3d.keys.arrows_action' },
  { keys: 'stage3d.keys.plusminus', action: 'stage3d.keys.zoom_action' },
  { keys: 'stage3d.keys.home', action: 'stage3d.keys.home_action' },
  { keys: 'stage3d.keys.touch', action: 'stage3d.keys.touch_action' },
];
