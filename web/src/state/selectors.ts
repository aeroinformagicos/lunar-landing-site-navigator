// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Derived state and input rules of the shell (10_interfaz.md §4, §5, §12; 01_alcance.md F1, F2).
// Pure functions: the components call them and the tests check them without a DOM.
import { DAY_S, HOUR_S, isoToUnix } from '../core/time';
import type { Site, SiteType } from '../core/types';
import { missionEnd, type AppState, type Scenario, type Tab } from './store';

/**
 * Supported landing instants: the valid ranges of the two ephemeris segments
 * (`ephemeris.meta.json`, 09_contrato_datos.md §3.2; 05_efemerides.md §4.5).
 */
export const SUPPORTED_RANGES: readonly { from: number; to: number }[] = [
  { from: isoToUnix('1969-01-01T00:00:00Z'), to: isoToUnix('1973-01-01T00:00:00Z') },
  { from: isoToUnix('2024-01-01T00:00:00Z'), to: isoToUnix('2045-01-01T00:00:00Z') },
];

/** Mission length input (10 §4): 0.5–60 days in steps of 0.5. */
export const MISSION_MIN_DAYS = 0.5;
export const MISSION_MAX_DAYS = 60;
export const MISSION_STEP_DAYS = 0.5;

/** Slider (10 §4): step 10 min; arrows ±10 min, PageUp/PageDown ±1 day; time buttons ±1 h. */
export const SLIDER_STEP_S = 600;

export function activeScenario(s: Pick<AppState, 'scenarios' | 'activeScenarioId'>): Scenario {
  return s.scenarios.find((x) => x.id === s.activeScenarioId) ?? s.scenarios[0];
}

/** Cursor range of the active mission. */
export function cursorBounds(s: Pick<AppState, 'scenarios' | 'activeScenarioId'>): { min: number; max: number } {
  const a = activeScenario(s);
  return { min: a.landingUnix, max: missionEnd(a) };
}

// ---- Dates (10 §4) ---------------------------------------------------------------------------

export type LandingError = 'invalid' | 'range';

/** `datetime-local` value (`YYYY-MM-DDTHH:MM`, read as UTC) → Unix seconds, or why it is not valid. */
export function parseLanding(value: string): { unix: number } | { error: LandingError } {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return { error: 'invalid' };
  let unix: number;
  try {
    unix = isoToUnix(`${value}Z`);
  } catch {
    return { error: 'invalid' };
  }
  return SUPPORTED_RANGES.some((r) => unix >= r.from && unix <= r.to) ? { unix } : { error: 'range' };
}

/** True when the mission ends after the end of the ephemeris segment of its landing (07 §7). */
export function missionTruncated(landingUnix: number, missionDays: number): boolean {
  const r = SUPPORTED_RANGES.find((x) => landingUnix >= x.from && landingUnix <= x.to);
  return r !== undefined && landingUnix + missionDays * DAY_S > r.to;
}

/** Mission length from the input: NaN stays invalid; otherwise clamped to 0.5–60 and rounded to 0.5. */
export function normaliseMissionDays(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const clamped = Math.min(Math.max(value, MISSION_MIN_DAYS), MISSION_MAX_DAYS);
  return Math.round(clamped / MISSION_STEP_DAYS) * MISSION_STEP_DAYS;
}

// ---- Custom coordinates (10 §5) ------------------------------------------------------------

export type CoordError = 'lat' | 'lon';

/**
 * Latitude in [−90, 90] (north positive) and longitude in [−180, 360] (east positive); values above
 * 180 become negative. Returns the scenario site reference `custom:<lat>,<lon>`.
 */
export function parseCustomCoords(latText: string, lonText: string): { siteRef: string; latDeg: number; lonDeg: number } | { errors: CoordError[] } {
  const lat = latText.trim() === '' ? Number.NaN : Number(latText);
  const lon = lonText.trim() === '' ? Number.NaN : Number(lonText);
  const errors: CoordError[] = [];
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) errors.push('lat');
  if (!Number.isFinite(lon) || lon < -180 || lon > 360) errors.push('lon');
  if (errors.length) return { errors };
  const lonDeg = lon > 180 ? lon - 360 : lon === -180 ? 180 : lon;
  return { siteRef: `custom:${lat},${lonDeg}`, latDeg: lat, lonDeg };
}

export type SiteRef =
  | { kind: 'catalogue'; id: string }
  | { kind: 'custom'; latDeg: number; lonDeg: number }
  | { kind: 'grid'; i: number; j: number };

/** `blue-ghost-1`, `custom:<lat>,<lon>` or `grid:<i>,<j>` (10 §10). */
export function parseSiteRef(ref: string): SiteRef {
  const custom = /^custom:(-?[\d.]+),(-?[\d.]+)$/.exec(ref);
  if (custom) return { kind: 'custom', latDeg: Number(custom[1]), lonDeg: Number(custom[2]) };
  const grid = /^grid:(\d+),(\d+)$/.exec(ref);
  if (grid) return { kind: 'grid', i: Number(grid[1]), j: Number(grid[2]) };
  return { kind: 'catalogue', id: ref };
}

// ---- Site picker (10 §5) -------------------------------------------------------------------

export type SiteGroup = 'candidates' | 'candidates2022' | 'landed' | 'other';

const GROUP_OF: Record<SiteType, SiteGroup> = {
  landing: 'landed',
  candidate_region: 'candidates',
  validation: 'other',
  demo: 'other',
};

/** Group of a site: candidate regions without a box (`region_id` null) are the 2022 list (T-91, D-122). */
export function siteGroup(site: Pick<Site, 'type' | 'region_id'>): SiteGroup {
  if (site.type === 'candidate_region' && site.region_id === null) return 'candidates2022';
  return GROUP_OF[site.type];
}

/** Order of the picker groups (T-91): 2024 candidates, 2022 candidates, landed missions, other points. */
export const SITE_GROUPS: readonly SiteGroup[] = ['candidates', 'candidates2022', 'landed', 'other'];

/** Sites matching `query` (case- and accent-insensitive, on name, short name and mission), by group. */
export function groupSites(sites: readonly Site[], query: string): Record<SiteGroup, Site[]> {
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = fold(query.trim());
  const out: Record<SiteGroup, Site[]> = { candidates: [], candidates2022: [], landed: [], other: [] };
  for (const site of sites) {
    const text = fold(`${site.name} ${site.short_name} ${site.mission ?? ''} ${site.id}`);
    if (q === '' || text.includes(q)) out[siteGroup(site)].push(site);
  }
  return out;
}

/** Year shown in a picker row: landing year, or empty. */
export function siteYear(site: Site): string {
  return (site.landing_date ?? site.landing_utc ?? '').slice(0, 4);
}

// ---- Playback (10 §4) ----------------------------------------------------------------------

/**
 * One playback step: `dtMs` of real time at `speed` simulated seconds per second. Stops at the end
 * of the mission.
 */
export function advanceCursor(cursorUnix: number, speed: number, dtMs: number, endUnix: number): { cursorUnix: number; done: boolean } {
  const next = cursorUnix + (speed * dtMs) / 1000;
  return next >= endUnix ? { cursorUnix: endUnix, done: true } : { cursorUnix: next, done: false };
}

/** Speed labels in order of `PLAY_SPEEDS`. */
export function speedLabel(speed: number): string {
  return speed >= DAY_S ? '1 d/s' : `${speed / HOUR_S} h/s`;
}

// ---- Keyboard shortcuts (10 §12) -----------------------------------------------------------

export type Shortcut =
  | { kind: 'tab'; tab: Tab }
  | { kind: 'play' }
  | { kind: 'step'; seconds: number }
  | { kind: 'help' };

const TAB_KEYS: Record<string, Tab> = { '1': 'panorama', '2': 'timeline', '3': 'map', '4': 'section' };

/**
 * Global shortcuts: `1`–`4` tabs, `Space` play, `[` and `]` cursor ±1 h, `?` help. Ignored while
 * typing in a field, with modifier keys, or when a control already handles the key.
 */
export function shortcutFor(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; targetTag?: string; targetRole?: string | null }): Shortcut | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const tag = (e.targetTag ?? '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return null;
  if (e.key in TAB_KEYS) return { kind: 'tab', tab: TAB_KEYS[e.key] };
  if (e.key === ' ' && tag !== 'BUTTON' && tag !== 'A' && e.targetRole !== 'tab') return { kind: 'play' };
  if (e.key === '[') return { kind: 'step', seconds: -HOUR_S };
  if (e.key === ']') return { kind: 'step', seconds: HOUR_S };
  if (e.key === '?') return { kind: 'help' };
  return null;
}
