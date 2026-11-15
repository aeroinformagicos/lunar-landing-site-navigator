// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// D-183: while the mission plays the 3D camera turns with the focus body by the same azimuth step.
import { describe, expect, it } from 'vitest';
import { followTurn } from '../camera';

describe('followTurn', () => {
  it('is the signed azimuth step of the body', () => {
    expect(followTurn(100, 100)).toBe(0);
    expect(followTurn(100, 101.5)).toBeCloseTo(1.5, 9);
    expect(followTurn(100, 98)).toBeCloseTo(-2, 9);
  });

  it('takes the short way across north', () => {
    expect(followTurn(359, 1)).toBeCloseTo(2, 9);
    expect(followTurn(1, 359)).toBeCloseTo(-2, 9);
  });

  it('half a turn is +180, never −180', () => {
    expect(followTurn(0, 180)).toBe(180);
    expect(followTurn(180, 0)).toBe(180);
  });
});
