// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Time helpers (05_efemerides.md §2): Unix seconds everywhere, no leap seconds, every day 86,400 s.
// Calendar arithmetic only through Date in UTC, never by counting days by hand.

export const HOUR_S = 3600;
export const DAY_S = 86_400;

const ISO_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?Z$/;

/**
 * `YYYY-MM-DDTHH:MM[:SS[.sss]]Z` → Unix seconds. Rejects other formats, impossible dates
 * (2027-02-29) and second 60 (not representable in Unix time).
 */
export function isoToUnix(iso: string): number {
  const m = ISO_UTC.exec(iso);
  if (!m) throw new RangeError(`Invalid UTC instant: ${iso}`);
  const [y, mo, d, h, mi, s] = [1, 2, 3, 4, 5, 6].map((i) => Number(m[i] ?? 0));
  const frac = m[7] ? Number(m[7]) : 0;
  const ms = Date.UTC(y, mo - 1, d, h, mi, s);
  const back = new Date(ms);
  if (
    back.getUTCFullYear() !== y ||
    back.getUTCMonth() !== mo - 1 ||
    back.getUTCDate() !== d ||
    back.getUTCHours() !== h ||
    back.getUTCMinutes() !== mi ||
    back.getUTCSeconds() !== s
  ) {
    throw new RangeError(`Invalid UTC instant: ${iso}`);
  }
  return ms / 1000 + frac;
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

/** Unix seconds → `YYYY-MM-DDTHH:MM:SSZ` (whole seconds, rounded). */
export function unixToIso(t: number): string {
  const d = new Date(Math.round(t) * 1000);
  return (
    `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`
  );
}

/** Unix seconds → `2027-08-04 14:20 UTC` (10_interfaz.md §7), to the nearest minute. */
export function formatUtc(t: number): string {
  const d = new Date(Math.round(t / 60) * 60_000);
  return (
    `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
  );
}
