// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Pure derivations of the right panel (10_interfaz.md §6.6; 07_visibilidad.md §7, §8.1):
// state at the cursor, countdowns (F6) and the basic requirement checks.
import type { EphemerisTable } from '../../core/ephemeris';
import { earthMarginFn, sunMarginFn, type EventKind } from '../../core/events';
import type { SiteFrame } from '../../core/frames';
import type { Mask } from '../../core/horizon';
import { findSegment } from '../../core/ephemeris';
import { nextEvent, type Metrics, type NextEvent } from '../../core/metrics';
import { evaluate, type SkyState } from '../../core/visibility';
import type { Requirements } from '../../state/store';
import { formatCountdown } from '../common/format';

export interface CursorState {
  sky: SkyState;
  nextSun: NextEvent | null;
  nextEarth: NextEvent | null;
}

/** Sky state and next events at the cursor (countdowns search 60 days, 07 §7). Null outside the table. */
export function cursorState(table: EphemerisTable, frame: SiteFrame, mask: Mask, cursorUnix: number): CursorState | null {
  if (!findSegment(table, cursorUnix)) return null;
  return {
    sky: evaluate(table, frame, mask, cursorUnix),
    nextSun: nextEvent(sunMarginFn(table, frame, mask), table, cursorUnix, ['sunrise', 'sunset']),
    nextEarth: nextEvent(earthMarginFn(table, frame, mask), table, cursorUnix, ['earthrise', 'earthset']),
  };
}

const EVENT_WORD: Record<EventKind, string> = {
  sunrise: 'Sunrise',
  sunset: 'Sunset',
  earthrise: 'Earthrise',
  earthset: 'Earthset',
  eclipse_start: 'Eclipse starts',
  eclipse_end: 'Eclipse ends',
  totality_start: 'Totality starts',
  totality_end: 'Totality ends',
};

export function eventWord(kind: EventKind): string {
  return EVENT_WORD[kind];
}

/** `Sunset in 4d 12h 52m` or `No sunset in the next 60 days` (10 §6.2, 07 §7). */
export function countdownText(next: NextEvent, cursorUnix: number): string {
  const word = EVENT_WORD[next.kind];
  if (next.tUnix === null) return `No ${word.charAt(0).toLowerCase()}${word.slice(1)} in the next 60 days`;
  return `${word} in ${formatCountdown(next.tUnix - cursorUnix)}`;
}

export interface RequirementCheck {
  key: 'sun' | 'earth' | 'night';
  ok: boolean;
}

/**
 * Basic status chip (07 §8.1): Sun at landing, Earth at landing, no night over the limit. The full
 * evaluation with `marginal` and reasons arrives with core/requirements.ts.
 */
export function requirementChecks(landing: SkyState | null, metrics: Metrics, req: Requirements): RequirementCheck[] {
  const checks: RequirementCheck[] = [];
  if (req.needSunAtLanding) checks.push({ key: 'sun', ok: landing?.sun.visible ?? false });
  if (req.needEarthAtLanding) checks.push({ key: 'earth', ok: landing?.earth.visible ?? false });
  checks.push({ key: 'night', ok: metrics.longestNightH <= req.maxNightHours });
  return checks;
}
