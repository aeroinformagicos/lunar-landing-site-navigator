// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-17: assess (07_visibilidad.md §8.2): go, marginal and no_go with their reason codes.
import { describe, expect, it } from 'vitest';
import type { Metrics } from '../metrics';
import { assess, type Requirements } from '../requirements';
import type { SkyState } from '../visibility';

const REQ: Requirements = { needSunAtLanding: true, needEarthAtLanding: true, maxNightHours: 24, marginalEarthMarginDeg: 1, marginalSunFraction: 1 };

function landing(sun: boolean, earth: boolean, disc = sun ? 1 : 0, earthMargin = earth ? 3 : -2): SkyState {
  const b = { azDeg: 0, elDeg: 0, rangeKm: 1, radiusDeg: 0.27, horizonDeg: 0 };
  return {
    tUnix: 0,
    sun: { ...b, marginDeg: sun ? 1 : -1, visible: sun, discFraction: disc, litFraction: disc },
    earth: { ...b, marginDeg: earthMargin, visible: earth },
    both: sun && earth,
    eclipse: { kind: 'none', covered: 0 },
  };
}

const metrics = (night: number) => ({ longestNightH: night, bothPct: 40 }) as Metrics;

describe('assess', () => {
  it('go: all three with margin', () => {
    expect(assess(landing(true, true), metrics(5), REQ)).toMatchObject({ status: 'go', reasons: [], checks: { sunAtLanding: true, earthAtLanding: true, nightOk: true } });
  });

  it('no_go with every failed check as a reason', () => {
    expect(assess(landing(false, true), metrics(5), REQ)).toMatchObject({ status: 'no_go', reasons: ['no_sun_at_landing'] });
    expect(assess(landing(true, false), metrics(5), REQ)).toMatchObject({ status: 'no_go', reasons: ['no_earth_at_landing'] });
    expect(assess(landing(true, true), metrics(24.01), REQ)).toMatchObject({ status: 'no_go', reasons: ['night_too_long'] });
    expect(assess(landing(false, false), metrics(30), REQ).reasons).toEqual(['no_sun_at_landing', 'no_earth_at_landing', 'night_too_long']);
  });

  it('marginal: partly hidden Sun, Earth under 1°, night over 75 % of the limit', () => {
    expect(assess(landing(true, true, 0.6), metrics(5), REQ)).toMatchObject({ status: 'marginal', reasons: ['sun_partly_hidden'] });
    expect(assess(landing(true, true, 1, 0.5), metrics(5), REQ)).toMatchObject({ status: 'marginal', reasons: ['earth_low'] });
    expect(assess(landing(true, true), metrics(18.5), REQ)).toMatchObject({ status: 'marginal', reasons: ['night_near_limit'] });
    expect(assess(landing(true, true), metrics(18), REQ).status).toBe('go'); // exactly 75 % is not «over»
  });

  it('a requirement switched off is not checked', () => {
    const r = { ...REQ, needSunAtLanding: false, needEarthAtLanding: false };
    expect(assess(landing(false, false), metrics(5), r)).toMatchObject({ status: 'go', reasons: [] });
  });
});
