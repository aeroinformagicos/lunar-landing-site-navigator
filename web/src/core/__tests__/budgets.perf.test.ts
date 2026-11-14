// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Timing budgets of the web core (05 §8, 07 §11, 08 §10.3), in one file that Vitest runs in its own
// group, after the other tests and one at a time (vite.config.ts, D-91): a budget in microseconds must
// not share the CPU with another test running in a parallel worker.
import { describe, expect, it } from 'vitest';
import { siteFrame, skyAt } from '../frames';
import { GRID } from '../grid';
import { maskFromFile } from '../horizon';
import { missionMetrics } from '../metrics';
import { COMPACT_N_AZ, longestBothFrom, type Compact } from '../optimal';
import { nextValidLanding, replanRow, type Requirements } from '../requirements';
import { DAY_S, isoToUnix } from '../time';
import type { HorizonFile } from '../types';
import { evaluate, frameFor } from '../visibility';
import { bestTimeMs, exampleJson, exampleTable } from './fixtures';

const table = exampleTable();
const T = isoToUnix('2027-08-01T00:00:00Z');
const demoA = maskFromFile(exampleJson<HorizonFile>('horizon/demo-a.json'), 2)!;
const frameA = frameFor(-88.8, 123.4, demoA);
const REQ: Requirements = { needSunAtLanding: true, needEarthAtLanding: true, maxNightHours: 24, marginalEarthMarginDeg: 1, marginalSunFraction: 1 };

describe('timing budgets', () => {
  it('skyAt runs 10⁶ times in under 1 s (T-12)', () => {
    const frame = siteFrame(-89.9, 0, 2100);
    let acc = 0;
    const ms = bestTimeMs(() => {
      for (let i = 0; i < 1_000_000; i++) acc += skyAt(table, frame, T + i).sun.elDeg;
    }, 3);
    expect(Number.isFinite(acc)).toBe(true);
    expect(ms).toBeLessThan(1000);
  });

  it('evaluate in under 3 µs per call — demo-a, Sun near the horizon, the 32-strip path (07 §11)', () => {
    for (let i = 0; i < 50_000; i++) evaluate(table, frameA, demoA, T + i * 61); // warm-up
    const n = 100_000;
    const ms = bestTimeMs(() => {
      for (let i = 0; i < n; i++) evaluate(table, frameA, demoA, T + i * 61);
    });
    expect((ms * 1000) / n).toBeLessThan(3);
  });

  it('metrics of a 14-day mission in under 10 ms (07 §11)', () => {
    const run = (k: number) => missionMetrics(table, frameA, demoA, { landingUnix: T + k * 7 * DAY_S, missionDays: 14 }, T + k * 7 * DAY_S);
    for (let i = 0; i < 5; i++) run(i); // warm-up
    const ms = bestTimeMs(() => {
      for (let i = 0; i < 10; i++) run(i);
    });
    expect(ms / 10).toBeLessThan(10);
  });

  it('13 rows of the matrix in under 300 ms; next valid landing in under 50 ms (07 §11)', () => {
    const matrix = bestTimeMs(() => {
      for (let r = 0; r < 13; r++) replanRow(table, frameA, demoA, T + r * 3600, DAY_S, 14, REQ);
    }, 3);
    expect(matrix).toBeLessThan(300);
    expect(bestTimeMs(() => nextValidLanding(table, frameA, demoA, T, 14, REQ), 3)).toBeLessThan(50);
  });

  it('10,252 always-visible points over 90 days in under 15 s — worst case (08 §10.3)', () => {
    const n = 10_252;
    const c: Compact = {
      nPoints: n,
      i: Uint16Array.from({ length: n }, (_, k) => k % GRID.nx),
      j: Uint16Array.from({ length: n }, (_, k) => Math.floor(k / GRID.nx) * 3),
      heightM: new Int16Array(n),
      region: new Uint8Array(n),
      elQ: new Int16Array(n * COMPACT_N_AZ).fill(-9000),
    };
    const ms = bestTimeMs(() => longestBothFrom(c, table, T, 90, null), 1);
    expect(ms).toBeLessThan(15_000);
  }, 30_000);
});
