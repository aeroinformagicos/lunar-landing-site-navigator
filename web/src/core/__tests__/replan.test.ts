// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-27: replanning matrix, next valid window and ranking (07_visibilidad.md §8.3–§8.5, §11; F10).
import { describe, expect, it } from 'vitest';
import { formulaMask, maskFromFile, type Mask } from '../horizon';
import { missionMetrics } from '../metrics';
import { bestAlternative, rankCandidates, type RankRow } from '../ranking';
import {
  assess,
  cellAt,
  longestNightIn,
  MATRIX_COLUMNS,
  nextValidLanding,
  replanRow,
  visibilityGrid,
  type Assessment,
  type Requirements,
} from '../requirements';
import { DAY_S, isoToUnix } from '../time';
import type { HorizonFile } from '../types';
import { evaluate, frameFor } from '../visibility';
import { exampleJson, exampleTable } from './fixtures';

const table = exampleTable();
const REQ: Requirements = { needSunAtLanding: true, needEarthAtLanding: true, maxNightHours: 24, marginalEarthMarginDeg: 1, marginalSunFraction: 1 };
const T0 = isoToUnix('2027-08-01T00:00:00Z');
const demoA = maskFromFile(exampleJson<HorizonFile>('horizon/demo-a.json'), 2)!;
const at = (mask: Mask) => ({ mask, frame: frameFor(-88.8, 123.4, mask) });

describe('replan_row (07 §8.3)', () => {
  it('31 landings t0 + k·Δ for each delay step', () => {
    const { mask, frame } = at(demoA);
    for (const delta of [6 * 3600, 12 * 3600, DAY_S, 2 * DAY_S]) {
      const row = replanRow(table, frame, mask, T0, delta, 14, REQ);
      expect(row).toHaveLength(MATRIX_COLUMNS);
      row.forEach((c, k) => expect(c.landingUnix).toBe(T0 + k * delta));
    }
  });

  it('a site that always sees both: every cell `go`; one that never does: every cell `no_go` with reasons', () => {
    const up = at(formulaMask('flat:-90'));
    expect(replanRow(table, up.frame, up.mask, T0, DAY_S, 14, REQ).every((c) => c.status === 'go' && c.longestNightH === 0)).toBe(true);
    const down = at(formulaMask('flat:90'));
    const row = replanRow(table, down.frame, down.mask, T0, DAY_S, 3.5, REQ);
    expect(row.every((c) => c.status === 'no_go')).toBe(true);
    expect(row[0].reasons).toEqual(['no_sun_at_landing', 'no_earth_at_landing', 'night_too_long']);
    expect(row[0].longestNightH).toBe(3.5 * 24 + 1 / 6); // 3.5 d of samples, both ends included
  });

  it('cells whose mission leaves the ephemeris table have no status', () => {
    const { mask, frame } = at(demoA);
    const row = replanRow(table, frame, mask, isoToUnix('2044-12-10T00:00:00Z'), DAY_S, 14, REQ);
    expect(row[0].status).not.toBeNull();
    expect(row[30].status).toBeNull();
  });

  it('the grid status agrees with the exact assessment of that landing (away from the night limit)', () => {
    const { mask, frame } = at(demoA);
    const row = replanRow(table, frame, mask, T0, DAY_S, 14, REQ);
    let compared = 0;
    for (const c of row.filter((c) => c.status !== null)) {
      const m = missionMetrics(table, frame, mask, { landingUnix: c.landingUnix, missionDays: 14 }, c.landingUnix);
      if (Math.abs(m.longestNightH - REQ.maxNightHours) < 0.5) continue;
      expect(Math.abs(c.longestNightH - m.longestNightH)).toBeLessThanOrEqual(0.34); // 10-min grid
      expect(c.status).toBe(assess(evaluate(table, frame, mask, c.landingUnix), m, REQ).status);
      compared++;
    }
    expect(compared).toBeGreaterThan(20);
  });

  it('longest night inside a window, clipped to it', () => {
    const g = { t0: 0, sun: [], earth: [], nights: [[2, 10], [20, 21]] as [number, number][] };
    expect(longestNightIn(g, 0, 30)).toBeCloseTo((9 * 600) / 3600, 12);
    expect(longestNightIn(g, 5, 30)).toBeCloseTo((6 * 600) / 3600, 12);
    expect(longestNightIn(g, 11, 19)).toBe(0);
  });
});

describe('next_valid_landing (07 §8.4)', () => {
  it('always valid: the window is the whole 90 days; never valid: none', () => {
    const up = at(formulaMask('flat:-90'));
    expect(nextValidLanding(table, up.frame, up.mask, T0, 14, REQ)).toEqual({ startUnix: T0, endUnix: T0 + 90 * DAY_S, statusAtStart: 'go' });
    const down = at(formulaMask('flat:90'));
    expect(nextValidLanding(table, down.frame, down.mask, T0, 14, REQ)).toBeNull();
  });

  it('starts at the first hourly landing that works and ends at the last one before it fails', () => {
    const { mask, frame } = at(demoA);
    const lax = { ...REQ, maxNightHours: 400 };
    const w = nextValidLanding(table, frame, mask, T0, 3, lax)!;
    expect(w).not.toBeNull();
    const g = visibilityGrid(table, frame, mask, T0, 93 * DAY_S);
    const idx = (t: number) => Math.round((t - T0) / 600);
    expect(cellAt(g, idx(w.startUnix), 432, lax, table, frame, mask).status).not.toBe('no_go');
    if (w.startUnix > T0) expect(cellAt(g, idx(w.startUnix) - 6, 432, lax, table, frame, mask).status).toBe('no_go');
    expect(cellAt(g, idx(w.endUnix) + 6, 432, lax, table, frame, mask).status).toBe('no_go');
  });
});

describe('rank_candidates (07 §8.5)', () => {
  const a = (status: Assessment['status'], bothPct: number, night: number): Assessment => ({
    status,
    checks: { sunAtLanding: true, earthAtLanding: true, nightOk: true },
    longestNightH: night,
    bothPct,
    reasons: [],
  });
  const row = (siteId: string, as: Assessment, sunPct = 50): RankRow => ({ siteId, name: siteId, assessment: as, sunPct, earthPct: 50 });

  it('status, then Sun + Earth, then shortest night, then Sun, then id', () => {
    const rows = [
      row('e', a('no_go', 99, 0)),
      row('d', a('marginal', 80, 5)),
      row('c', a('go', 70, 10)),
      row('b', a('go', 70.04, 9.96), 60), // same as c to 0.1: night ties too, Sun decides
      row('a', a('go', 85, 30)),
      row('f', a('go', 70.04, 9.96), 60), // full tie with b: id decides
    ];
    expect(rankCandidates(rows).map((r) => r.siteId)).toEqual(['a', 'b', 'f', 'c', 'd', 'e']);
  });

  it('the alternative is the first other site with go, else marginal', () => {
    const ranked = rankCandidates([row('x', a('go', 90, 1)), row('y', a('marginal', 80, 1)), row('z', a('no_go', 10, 1))]);
    expect(bestAlternative(ranked, 'x')?.siteId).toBe('y');
    expect(bestAlternative(ranked, 'q')?.siteId).toBe('x');
    expect(bestAlternative(ranked.filter((r) => r.siteId === 'z'), 'q')).toBeNull();
  });
});
