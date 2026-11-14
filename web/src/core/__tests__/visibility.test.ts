// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-13: disc fraction against the exact circular segment (07 §13.2), evaluate, invariants (§13.8).
import { describe, expect, it } from 'vitest';
import { formulaMask, horizonAt, maskFromFile, smoothMask } from '../horizon';
import { isoToUnix } from '../time';
import { discAny, discFraction, evaluate, frameFor } from '../visibility';
import type { HorizonFile } from '../types';
import { bestTimeMs, exampleJson, exampleTable } from './fixtures';

/** Exact visible fraction of a disc cut by a flat horizon: δ = (H − el_c)/ρ. */
function segment(delta: number): number {
  return (Math.acos(delta) - delta * Math.sqrt(1 - delta * delta)) / Math.PI;
}

describe('disc_fraction (07 §13.2)', () => {
  const flat0 = formulaMask('flat:0');

  it.each([
    [0, 0, 0.5, 1e-12],
    [0.265, -1, 1, 1e-12],
    [-0.265, 1, 0, 1e-12],
    [-0.1325, 0.5, 0.195501, 0.003],
    [0.1325, -0.5, 0.804499, 0.003],
  ])('flat:0, el_c = %f (δ = %f) → %f', (elC, delta, expected, tol) => {
    const f = discFraction(flat0, 123, elC, 0.265);
    expect(Math.abs(f - expected)).toBeLessThan(tol);
    expect(Math.abs(segment(delta) - expected)).toBeLessThan(1e-6);
  });

  it('tilt:0.3 at az 180 is symmetric: 0.5', () => {
    expect(Math.abs(discFraction(formulaMask('tilt:0.3'), 180, 0, 0.95) - 0.5)).toBeLessThan(1e-9);
  });

  it('follows the exact segment within 0.003 for any δ', () => {
    for (let d = -0.99; d < 1; d += 0.03) {
      expect(Math.abs(discFraction(flat0, 45, -d * 0.265, 0.265) - segment(d))).toBeLessThan(0.003);
    }
  });

  it('disc_any: any part of the disc above the horizon', () => {
    const h = (az: number) => horizonAt(flat0.elDeg, az);
    expect(discAny(h, 0, -0.2, 0.265)).toBe(true);
    expect(discAny(h, 0, -0.27, 0.265)).toBe(false);
  });
});

describe('evaluate', () => {
  const table = exampleTable();
  const mask = smoothMask(2, -89.9, 0);
  const frame = frameFor(-89.9, 0, mask);

  it('follows the centre criterion and the invariants of A9 (1,000 random instants)', () => {
    const t0 = isoToUnix('2024-01-02T00:00:00Z');
    const span = isoToUnix('2044-12-30T00:00:00Z') - t0;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 1000; i++) {
      const s = evaluate(table, frame, mask, t0 + rnd() * span);
      expect(s.sun.discFraction).toBeGreaterThanOrEqual(0);
      expect(s.sun.discFraction).toBeLessThanOrEqual(1);
      expect(s.sun.litFraction).toBeCloseTo(s.sun.discFraction * (1 - s.eclipse.covered), 12);
      expect(s.sun.visible).toBe(s.sun.marginDeg > 0);
      expect(s.earth.visible).toBe(s.earth.marginDeg > 0);
      expect(s.both).toBe(s.sun.visible && s.earth.visible);
      expect(s.sun.horizonDeg).toBeCloseTo(-0.0869, 4);
    }
  });

  it('runs in under 3 µs per call (demo-a: Sun near the horizon, the 32-strip path)', () => {
    const demoA = maskFromFile(exampleJson<HorizonFile>('horizon/demo-a.json'), 2)!;
    const f = frameFor(-88.8, 123.4, demoA);
    const t0 = isoToUnix('2027-08-01T00:00:00Z');
    for (let i = 0; i < 50_000; i++) evaluate(table, f, demoA, t0 + i * 61); // warm-up
    const n = 100_000;
    const ms = bestTimeMs(() => {
      for (let i = 0; i < n; i++) evaluate(table, f, demoA, t0 + i * 61);
    });
    expect((ms * 1000) / n).toBeLessThan(3);
  });
});
