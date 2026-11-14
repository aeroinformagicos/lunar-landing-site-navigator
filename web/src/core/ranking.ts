// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Ranking of candidate sites for a landing date and duration (07_visibilidad.md §8.5).
import type { Assessment, Status } from './requirements';

export interface RankRow {
  siteId: string;
  name: string;
  assessment: Assessment;
  sunPct: number;
  earthPct: number;
}

const STATUS_ORDER: Record<Status, number> = { go: 0, marginal: 1, no_go: 2 };

/** Round to 0.1 so Python and TypeScript give the same order (07 §8.5). */
const tenth = (x: number) => Math.floor(x * 10 + 0.5) / 10;

/**
 * Order: status (go, marginal, no_go), both_pct desc, longest_night_h asc, sun_pct desc, site_id asc.
 * `both_pct` and `longest_night_h` compare rounded to 0.1.
 */
export function rankCandidates(rows: RankRow[]): RankRow[] {
  return [...rows].sort(
    (a, b) =>
      STATUS_ORDER[a.assessment.status] - STATUS_ORDER[b.assessment.status] ||
      tenth(b.assessment.bothPct) - tenth(a.assessment.bothPct) ||
      tenth(a.assessment.longestNightH) - tenth(b.assessment.longestNightH) ||
      b.sunPct - a.sunPct ||
      (a.siteId < b.siteId ? -1 : a.siteId > b.siteId ? 1 : 0),
  );
}

/** The alternative the UI proposes: first row other than the current site with `go`, else `marginal`. */
export function bestAlternative(ranked: RankRow[], currentSiteId: string): RankRow | null {
  const others = ranked.filter((r) => r.siteId !== currentSiteId);
  return others.find((r) => r.assessment.status === 'go') ?? others.find((r) => r.assessment.status === 'marginal') ?? null;
}
