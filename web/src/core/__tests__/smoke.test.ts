// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
import { describe, expect, it } from 'vitest';
import { APP_TITLE } from '../constants';

describe('T-01 smoke', () => {
  it('has the app title', () => {
    expect(APP_TITLE).toBe('Lunar Sightline');
  });
});
