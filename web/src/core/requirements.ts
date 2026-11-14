// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Requirement evaluation of a scenario (07_visibilidad.md §8.1, §8.2): `go`, `marginal` or `no_go`
// with the checks and the reason codes for the plain summary (10_interfaz.md §8).
// T-17 adds `assess`; the replanning card adds the matrix row, the next window and the ranking.
import type { Metrics } from './metrics';
import type { SkyState } from './visibility';

export interface Requirements {
  needSunAtLanding: boolean;
  needEarthAtLanding: boolean;
  maxNightHours: number;
  marginalEarthMarginDeg: number;
  marginalSunFraction: number;
}

export type Status = 'go' | 'marginal' | 'no_go';

export type ReasonCode =
  | 'no_sun_at_landing'
  | 'no_earth_at_landing'
  | 'night_too_long'
  | 'sun_partly_hidden'
  | 'earth_low'
  | 'night_near_limit';

export interface Assessment {
  status: Status;
  checks: { sunAtLanding: boolean; earthAtLanding: boolean; nightOk: boolean };
  longestNightH: number;
  bothPct: number;
  reasons: ReasonCode[];
}

/** Share of the night limit above which a night counts as close to it (07 §8.2). */
export const NIGHT_NEAR_LIMIT = 0.75;

/**
 * 07 §8.2 with the state at landing (`evaluate(…, landing)`) and the mission metrics. Reasons: the
 * failed checks for `no_go`, otherwise the low-margin conditions for `marginal`.
 */
export function assess(atLanding: SkyState, m: Metrics, req: Requirements): Assessment {
  const checks = {
    sunAtLanding: !req.needSunAtLanding || atLanding.sun.visible,
    earthAtLanding: !req.needEarthAtLanding || atLanding.earth.visible,
    nightOk: m.longestNightH <= req.maxNightHours,
  };
  const reasons: ReasonCode[] = [];
  let status: Status;
  if (!(checks.sunAtLanding && checks.earthAtLanding && checks.nightOk)) {
    status = 'no_go';
    if (!checks.sunAtLanding) reasons.push('no_sun_at_landing');
    if (!checks.earthAtLanding) reasons.push('no_earth_at_landing');
    if (!checks.nightOk) reasons.push('night_too_long');
  } else {
    if (req.needSunAtLanding && atLanding.sun.discFraction < req.marginalSunFraction - 1e-9) reasons.push('sun_partly_hidden');
    if (req.needEarthAtLanding && atLanding.earth.marginDeg < req.marginalEarthMarginDeg) reasons.push('earth_low');
    if (m.longestNightH > NIGHT_NEAR_LIMIT * req.maxNightHours) reasons.push('night_near_limit');
    status = reasons.length ? 'marginal' : 'go';
  }
  return { status, checks, longestNightH: m.longestNightH, bothPct: m.bothPct, reasons };
}
