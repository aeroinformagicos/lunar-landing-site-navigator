// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Texts of the replanning view (10_interfaz.md §6.5, F10). Pure.
import type { RankRow } from '../../core/ranking';
import type { Cell, LandingWindow, Status } from '../../core/requirements';
import { formatUtc } from '../../core/time';
import { formatPct } from '../common/format';

/** Delay steps of the `Delay step` control (§6.5). */
export const DELAY_STEPS = [
  { label: '6 h', s: 6 * 3600 },
  { label: '12 h', s: 12 * 3600 },
  { label: '1 day', s: 86_400 },
  { label: '2 days', s: 2 * 86_400 },
] as const;

export const STATUS_TEXT: Record<Status, string> = { go: 'Works', marginal: 'Tight', no_go: 'Not suitable' };
export const STATUS_ICON: Record<Status, string> = { go: '✓', marginal: '!', no_go: '⊗' };

/** `12 d 7 h`, `6 h`, `3 d` (durations in sentences, 10 §7). */
export function durationWords(seconds: number): string {
  const h = Math.round(seconds / 3600);
  const d = Math.floor(h / 24);
  const r = h % 24;
  if (d === 0) return `${r} h`;
  return r ? `${d} d ${r} h` : `${d} d`;
}

/** Column header for delay k·Δ: `+0`, `+1 d`, `+12 h`, `+1 d 6 h`. */
export function offsetLabel(seconds: number): string {
  return seconds === 0 ? '+0' : `+${durationWords(seconds)}`;
}

/** `Next valid landing window: 2027-08-20 00:00 – 2027-08-24 06:00 UTC (4 d 6 h)` (§6.5). */
export function windowText(w: LandingWindow | null): string {
  if (!w) return 'No valid landing window in the next 90 days.';
  return `Next valid landing window: ${formatUtc(w.startUnix).replace(' UTC', '')} – ${formatUtc(w.endUnix)} (${durationWords(w.endUnix - w.startUnix)})`;
}

/** `Landing 2027-08-13 06:00 UTC · Sun ✓ · Earth ✓ · Longest night 31 h ✕` (§6.5). */
export function cellDetail(c: Cell, maxNightHours: number): string {
  if (c.status === null) return `Landing ${formatUtc(c.landingUnix)} · outside the ephemeris table`;
  const mark = (ok: boolean) => (ok ? '✓' : '⊗');
  const night = Math.round(c.longestNightH * 10) / 10;
  return `Landing ${formatUtc(c.landingUnix)} · Sun ${mark(c.sunAtLanding)} · Earth ${mark(c.earthAtLanding)} · Longest night ${night} h ${mark(c.longestNightH <= maxNightHours)}`;
}

/** Accessible name of a matrix cell: `Demo A, landing 2027-08-02 00:00 UTC: Works`. */
export function cellLabel(siteName: string, c: Cell): string {
  return `${siteName}, landing ${formatUtc(c.landingUnix)}: ${c.status ? STATUS_TEXT[c.status] : 'no data'}`;
}

/** `Best alternative: Malapert Massif — Works, 88 % Sun + Earth.` */
export function alternativeText(r: RankRow | null): string {
  if (!r) return 'No candidate region works for this landing.';
  return `Best alternative: ${r.name} — ${STATUS_TEXT[r.assessment.status]}, ${formatPct(r.assessment.bothPct)} Sun + Earth.`;
}
