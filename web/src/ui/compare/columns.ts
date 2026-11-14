// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Scenario comparison (10_interfaz.md §5, F8): one column per scenario with the same metrics and the
// best figure of each numeric row marked. Pure; tested without a DOM.
import type { Window } from '../../core/events';
import { assess, type Requirements, type Status } from '../../core/requirements';
import { formatUtc } from '../../core/time';
import type { Scenario } from '../../state/store';
import { missionEnd } from '../../state/store';
import type { ScenarioModel } from '../common/model';
import { countdownText, cursorState } from '../metrics/derive';
import { computeMission } from '../metrics/useMission';
import { sentenceVerdict } from '../summary/summarize';

export interface ColumnResult {
  id: Scenario['id'];
  siteName: string;
  landingUnix: number;
  status: Status | null;
  sunHours: number;
  sunPct: number;
  earthHours: number;
  earthPct: number;
  bothHours: number;
  bothPct: number;
  longestNightH: number;
  /** At the cursor; null when the cursor is outside this scenario's table. */
  sunElNow: number | null;
  discNowPct: number | null;
  nextSun: string;
  nextEarth: string;
  terrain: string;
  smooth: boolean;
  verdict: string;
  windows: { sun: Window[]; earth: Window[]; both: Window[] };
  tA: number;
  tB: number;
}

/** Everything a column shows, for one scenario at the cursor (same functions as the other views). */
export function computeColumn(
  model: ScenarioModel,
  scenario: Scenario,
  siteName: string,
  cursorUnix: number,
  req: Requirements,
): ColumnResult {
  const mission = computeMission(model, scenario);
  const m = mission.metrics;
  const now = cursorState(model.table, model.frame, model.mask, cursorUnix);
  const assessment = mission.landing ? assess(mission.landing, m, req) : null;
  return {
    id: scenario.id,
    siteName,
    landingUnix: scenario.landingUnix,
    status: assessment?.status ?? null,
    sunHours: m.sunHours,
    sunPct: m.sunPct,
    earthHours: m.earthHours,
    earthPct: m.earthPct,
    bothHours: m.bothHours,
    bothPct: m.bothPct,
    longestNightH: m.longestNightH,
    sunElNow: now ? now.sky.sun.elDeg : null,
    discNowPct: now ? now.sky.sun.discFraction * 100 : null,
    nextSun: now?.nextSun ? countdownText(now.nextSun, cursorUnix) : '—',
    nextEarth: now?.nextEarth ? countdownText(now.nextEarth, cursorUnix) : '—',
    terrain: model.reliefLabel,
    smooth: model.smooth,
    verdict: assessment
      ? sentenceVerdict({
          assessment,
          missionDays: scenario.missionDays,
          sunPct: m.sunPct,
          earthPct: m.earthPct,
          maxNightHours: req.maxNightHours,
          marginalEarthMarginDeg: req.marginalEarthMarginDeg,
        })
      : '—',
    windows: { sun: m.windows.sun, earth: m.windows.earth, both: m.windows.both },
    tA: m.tA,
    tB: Math.max(m.tB, missionEnd(scenario)),
  };
}

/**
 * Columns holding the best value of a numeric row (`max` or `min`). Ties are all best. No mark when
 * fewer than two columns have a value or when every value is the same (there is no «best»).
 */
export function bestColumns(values: (number | null)[], dir: 'max' | 'min', eps = 1e-9): Set<number> {
  const idx = values.map((v, i) => [v, i] as const).filter((x): x is readonly [number, number] => x[0] !== null && Number.isFinite(x[0]));
  if (idx.length < 2) return new Set();
  const target = dir === 'max' ? Math.max(...idx.map((x) => x[0])) : Math.min(...idx.map((x) => x[0]));
  const best = idx.filter((x) => Math.abs(x[0] - target) <= eps).map((x) => x[1]);
  return best.length === idx.length ? new Set() : new Set(best);
}

/** Numeric rows and which way is better (10 §5: «la mejor cifra de cada fila numérica»). */
export const NUMERIC_ROWS = [
  { key: 'sunlight', value: (c: ColumnResult) => c.sunHours, dir: 'max' },
  { key: 'earth_link', value: (c: ColumnResult) => c.earthHours, dir: 'max' },
  { key: 'both', value: (c: ColumnResult) => c.bothHours, dir: 'max' },
  { key: 'longest_night', value: (c: ColumnResult) => c.longestNightH, dir: 'min' },
  { key: 'sun_el_now', value: (c: ColumnResult) => c.sunElNow, dir: 'max' },
  { key: 'disc_now', value: (c: ColumnResult) => c.discNowPct, dir: 'max' },
] as const;

/** Common time axis of the mini timelines: from the earliest landing to the latest mission end. */
export function commonRange(cols: ColumnResult[]): { t0: number; t1: number } {
  return { t0: Math.min(...cols.map((c) => c.tA)), t1: Math.max(...cols.map((c) => c.tB)) };
}

/** `2027-08-01 00:00 UTC`. */
export function landingText(c: ColumnResult): string {
  return formatUtc(c.landingUnix);
}
