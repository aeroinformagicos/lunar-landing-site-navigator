// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-19: comparison columns (10_interfaz.md §5, F8): same metrics per scenario with 2, 3 and 4 columns,
// best figure of each numeric row, common time axis.
import { describe, expect, it } from 'vitest';
import { exampleJson, exampleTable } from '../../core/__tests__/fixtures';
import { formulaMask, maskFromFile, smoothMask, type Mask } from '../../core/horizon';
import { DAY_S, isoToUnix } from '../../core/time';
import type { HorizonFile } from '../../core/types';
import { frameFor } from '../../core/visibility';
import { DEFAULT_REQUIREMENTS, type Scenario, type ScenarioId } from '../../state/store';
import type { ScenarioModel } from '../common/model';
import { computeMission } from '../metrics/useMission';
import { bestColumns, commonRange, computeColumn, NUMERIC_ROWS } from './columns';

const table = exampleTable();
const LANDING = isoToUnix('2027-08-01T00:00:00Z');
const demoA = maskFromFile(exampleJson<HorizonFile>('horizon/demo-a.json'), 2)!;

function model(mask: Mask, lat = -88.8, lon = 123.4, smooth = false): ScenarioModel {
  return { table, mask, frame: frameFor(lat, lon, mask), site: undefined, latDeg: lat, lonDeg: lon, reliefLabel: smooth ? 'Smooth Moon (no terrain)' : 'LOLA polar 40 m + 120 m', smooth };
}
const scenario = (id: ScenarioId, landingUnix = LANDING, missionDays = 14): Scenario => ({ id, siteRef: 'demo-a', landingUnix, missionDays, observerHeightM: 2 });

describe('best figure of a row', () => {
  it('max and min, ties all marked', () => {
    expect([...bestColumns([3, 7, 5], 'max')]).toEqual([1]);
    expect([...bestColumns([3, 7, 5], 'min')]).toEqual([0]);
    expect([...bestColumns([7, 7, 5], 'max')].sort()).toEqual([0, 1]);
  });

  it('no mark when every value is equal, or with fewer than two values', () => {
    expect(bestColumns([4, 4, 4], 'max').size).toBe(0);
    expect(bestColumns([4, null], 'max').size).toBe(0);
    expect([...bestColumns([null, 2, 9, null], 'max')]).toEqual([2]);
  });
});

describe('columns with 2, 3 and 4 scenarios (F8)', () => {
  const sets: [ScenarioModel, Scenario][][] = [
    [
      [model(demoA), scenario('A')],
      [model(formulaMask('flat:5')), scenario('B')],
    ],
    [
      [model(demoA), scenario('A')],
      [model(formulaMask('flat:5')), scenario('B')],
      [model(smoothMask(2, 18.56, 61.81), 18.56, 61.81, true), scenario('C', LANDING + 3 * DAY_S, 7)],
    ],
    [
      [model(demoA), scenario('A')],
      [model(formulaMask('flat:5')), scenario('B')],
      [model(smoothMask(2, 18.56, 61.81), 18.56, 61.81, true), scenario('C', LANDING + 3 * DAY_S, 7)],
      [model(formulaMask('flat:-90')), scenario('D', LANDING, 3.5)],
    ],
  ];

  it.each(sets.map((s) => [s.length, s] as const))('%i scenarios: same metrics in every column', (_n, set) => {
    const cols = set.map(([m, sc]) => computeColumn(m, sc, sc.id, LANDING + DAY_S, DEFAULT_REQUIREMENTS));
    for (const [c, [m, sc]] of cols.map((c, i) => [c, set[i]] as const)) {
      // The column holds exactly the mission metrics of that scenario (same functions as the panel).
      const mission = computeMission(m, sc);
      expect(c.sunHours).toBe(mission.metrics.sunHours);
      expect(c.earthPct).toBe(mission.metrics.earthPct);
      expect(c.longestNightH).toBe(mission.metrics.longestNightH);
      expect(c.verdict).toMatch(/^(For a|This site works for a|This site does not work for a) [\d.]+-day mission/);
      expect(['go', 'marginal', 'no_go']).toContain(c.status);
      for (const r of NUMERIC_ROWS) expect(r.value(c) === null || Number.isFinite(r.value(c))).toBe(true);
    }
    // At most one best set per numeric row, never every column (unless all differ but one).
    for (const r of NUMERIC_ROWS) {
      const best = bestColumns(cols.map((c) => r.value(c)), r.dir);
      expect(best.size).toBeLessThan(cols.length);
    }
  });

  it('a Sun that never sets wins Sunlight and Longest night', () => {
    const cols = sets[2].map(([m, sc]) => computeColumn(m, sc, sc.id, LANDING + DAY_S, DEFAULT_REQUIREMENTS));
    const sun = NUMERIC_ROWS.find((r) => r.key === 'longest_night')!;
    expect([...bestColumns(cols.map((c) => sun.value(c)), sun.dir)]).toContain(3); // flat:-90: no night
    expect(cols[3].sunPct).toBe(100);
    expect(cols[3].nextSun).toBe('No sunset in the next 60 days');
  });

  it('the mini timelines share one time axis', () => {
    const cols = sets[1].map(([m, sc]) => computeColumn(m, sc, sc.id, LANDING, DEFAULT_REQUIREMENTS));
    expect(commonRange(cols)).toEqual({ t0: LANDING, t1: LANDING + 14 * DAY_S });
  });

  it('T-92: Sun and Earth now against the real horizon (margin = elevation − horizon, 07 §5)', () => {
    const low = computeColumn(model(formulaMask('flat:-90')), scenario('A'), 'A', LANDING + DAY_S, DEFAULT_REQUIREMENTS);
    expect(low.sunNow!.visible).toBe(true);
    expect(low.earthNow!.visible).toBe(true);
    expect(low.sunNow!.marginDeg).toBeCloseTo(low.sunElNow! + 90, 6);
    const high = computeColumn(model(formulaMask('flat:45')), scenario('B'), 'B', LANDING + DAY_S, DEFAULT_REQUIREMENTS);
    expect(high.sunNow!.visible).toBe(false);
    expect(high.earthNow!.visible).toBe(false);
    expect(high.sunNow!.marginDeg).toBeCloseTo(high.sunElNow! - 45, 6);
  });

  it('the cursor outside a scenario’s table gives dashes, not errors', () => {
    const c = computeColumn(model(demoA), scenario('A'), 'A', isoToUnix('1990-01-01T00:00:00Z'), DEFAULT_REQUIREMENTS);
    expect(c.sunElNow).toBeNull();
    expect(c.sunNow).toBeNull();
    expect(c.nextSun).toBe('—');
  });
});
