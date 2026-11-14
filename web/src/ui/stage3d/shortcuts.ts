// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Keys of the 3D view (16_vista_3d.md §7, §10.4), for its own help and the shell's shortcut help.
// No three.js here: the shell can import it without loading the 3D chunk.
import type { TextKey } from '../../i18n/t';
import type { CameraMode } from './navigation';

export interface Stage3DShortcut {
  keys: TextKey;
  action: TextKey;
  modes: readonly CameraMode[];
}

const ALL: readonly CameraMode[] = ['orbit', 'fly', 'ground'];

/** Keys act only with the focus on the 3D view (click it or Tab to it first). */
export const STAGE3D_SHORTCUTS: readonly Stage3DShortcut[] = [
  { keys: 'stage3d.keys.drag', action: 'stage3d.keys.drag_action', modes: ['orbit'] },
  { keys: 'stage3d.keys.pan', action: 'stage3d.keys.pan_action', modes: ['orbit'] },
  { keys: 'stage3d.keys.zoom', action: 'stage3d.keys.zoom_action', modes: ['orbit'] },
  { keys: 'stage3d.keys.arrows', action: 'stage3d.keys.arrows_action', modes: ['orbit'] },
  { keys: 'stage3d.keys.plusminus', action: 'stage3d.keys.zoom_action', modes: ['orbit'] },
  { keys: 'stage3d.keys.touch', action: 'stage3d.keys.touch_action', modes: ['orbit'] },
  { keys: 'stage3d.keys.wasd', action: 'stage3d.keys.wasd_action', modes: ['fly'] },
  { keys: 'stage3d.keys.qe', action: 'stage3d.keys.qe_action', modes: ['fly'] },
  { keys: 'stage3d.keys.shift', action: 'stage3d.keys.shift_action', modes: ['fly'] },
  { keys: 'stage3d.keys.look', action: 'stage3d.keys.look_action', modes: ['fly', 'ground'] },
  { keys: 'stage3d.keys.fly_touch', action: 'stage3d.keys.fly_touch_action', modes: ['fly'] },
  { keys: 'stage3d.keys.ground_arrows', action: 'stage3d.keys.ground_arrows_action', modes: ['ground'] },
  { keys: 'stage3d.keys.fov', action: 'stage3d.keys.fov_action', modes: ['ground'] },
  { keys: 'stage3d.keys.enter', action: 'stage3d.keys.enter_action', modes: ['orbit', 'fly'] },
  { keys: 'stage3d.keys.home', action: 'stage3d.keys.home_action', modes: ALL },
];
