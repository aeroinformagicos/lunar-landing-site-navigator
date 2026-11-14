// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-61: interface version from the query (15_interfaz_v2.md §10) and the initial 3D / 2D mode (§4.1).
import { describe, expect, it } from 'vitest';
import { can3d, defaultViewMode } from '../../state/viewMode';
import { uiVersionOf } from './uiVersion';

describe('interface version', () => {
  it('defaults to v2 since T-63; ?ui=v1 keeps the previous interface', () => {
    expect(uiVersionOf('')).toBe('v2');
    expect(uiVersionOf('?ui=v2')).toBe('v2');
    expect(uiVersionOf('?vm=3d&ui=v1')).toBe('v1');
    expect(uiVersionOf('?ui=v9')).toBe('v2');
    expect(uiVersionOf('?ui=v9', 'v1')).toBe('v1');
  });
});

describe('initial view mode', () => {
  const env = (module: boolean, gl: boolean, wide: boolean) => ({ module, webgl2: () => gl, wide: () => wide });
  it('3D needs the 3D module, WebGL 2 and 768 px', () => {
    expect(can3d(env(true, true, true))).toBe(true);
    expect(can3d(env(false, true, true))).toBe(false);
    expect(can3d(env(true, false, true))).toBe(false);
    expect(can3d(env(true, true, false))).toBe(false);
  });
  it('3D when possible, else 2D; ?vm=2d forces 2D and ?vm=3d cannot force 3D', () => {
    expect(defaultViewMode('', () => true)).toBe('3d');
    expect(defaultViewMode('', () => false)).toBe('2d');
    expect(defaultViewMode('?vm=2d', () => true)).toBe('2d');
    expect(defaultViewMode('?ui=v2&vm=3d', () => false)).toBe('2d');
  });
});
