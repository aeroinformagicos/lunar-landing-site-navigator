// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Display formats of 10_interfaz.md §7: coordinates `84.79° S, 29.20° E`, dates `2027-08-04 14:20 UTC`,
// durations `4d 12h 52m`, numbers with English thousands separators.
import { formatUtc } from '../../core/time';

export { formatUtc };

/** `84.79° S, 29.20° E` (2 decimals on cards, 3 on mesh points). Longitude in (−180, 180]. */
export function formatLatLon(latDeg: number, lonDeg: number, decimals = 2): string {
  const lat = `${Math.abs(latDeg).toFixed(decimals)}° ${latDeg < 0 ? 'S' : 'N'}`;
  const lon = `${Math.abs(lonDeg).toFixed(decimals)}° ${lonDeg < 0 ? 'W' : 'E'}`;
  return `${lat}, ${lon}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Elapsed time of the cursor in the mission: `Day 3, 14:20` (day 0 is the landing day). */
export function formatMissionDay(elapsedS: number): string {
  const totalMin = Math.floor(Math.max(0, elapsedS) / 60);
  const day = Math.floor(totalMin / 1440);
  const rest = totalMin - day * 1440;
  return `Day ${day}, ${pad2(Math.floor(rest / 60))}:${pad2(rest % 60)}`;
}

/** Countdown `4d 12h 52m`; under one hour `MMm SSs` (07_visibilidad.md §7). */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 3600) return `${pad2(Math.floor(s / 60))}m ${pad2(s % 60)}s`;
  const m = Math.floor(s / 60);
  return `${Math.floor(m / 1440)}d ${pad2(Math.floor((m % 1440) / 60))}h ${pad2(m % 60)}m`;
}

/** `1,930` (English thousands separator). */
export function formatInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** Unix seconds → value of an `<input type="datetime-local">` read as UTC (`YYYY-MM-DDTHH:MM`). */
export function toDateTimeLocal(unix: number): string {
  const d = new Date(Math.round(unix / 60) * 60_000);
  return (
    `${String(d.getUTCFullYear()).padStart(4, '0')}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`
  );
}

// ---- Presentation rules (07_visibilidad.md §12.6), same in the UI and validation_report.json ----

/** Elevations and margins: 2 decimals, `1.21°`. */
export function formatDeg(deg: number): string {
  return `${deg.toFixed(2)}°`;
}

/** Signed margin: `+0.33°` / `−0.21°`. */
export function formatMargin(deg: number): string {
  const r = Math.abs(deg) < 0.005 ? 0 : deg;
  return `${r >= 0 ? '+' : '−'}${Math.abs(r).toFixed(2)}°`;
}

/** Percentages: integers; `<1 %` if 0 < v < 0.5 and `>99 %` if 99.5 ≤ v < 100. */
export function formatPct(pct: number): string {
  if (pct > 0 && pct < 0.5) return '<1 %';
  if (pct >= 99.5 && pct < 100) return '>99 %';
  return `${Math.round(pct)} %`;
}

/** Hours: 1 decimal below 100 h, integer from 100 h. */
export function formatHours(h: number): string {
  return h < 100 ? `${(Math.round(h * 10) / 10).toFixed(1)} h` : `${Math.round(h)} h`;
}
