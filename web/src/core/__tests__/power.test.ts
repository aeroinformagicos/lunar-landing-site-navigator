// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-93 (D-123): power and communications estimate. Expected values are worked out by hand from the
// formulas in power.ts (S0 = 1361 W/m², 1 AU = 149 597 870.7 km), not taken from the code.
import { describe, expect, it } from 'vitest';
import { formulaMask } from '../horizon';
import { isoToUnix, DAY_S, HOUR_S } from '../time';
import { frameFor } from '../visibility';
import { missionMetrics } from '../metrics';
import { exampleTable } from './fixtures';
import { AU_KM, DEFAULT_POWER, energyWh, linkStats, nightEnergyWh, panelPowerW, powerComms } from '../power';

const panel = { efficiency: 0.3, areaM2: 1, orientation: 'vertical_tracking' as const };

describe('panel power (hand-computed)', () => {
  it('1 AU, Sun on the horizon, whole disc: 1361 × 0.3 × 1 = 408.3 W', () => {
    expect(panelPowerW({ elDeg: 0, rangeKm: AU_KM, litFraction: 1 }, panel)).toBeCloseTo(408.3, 9);
  });
  it('vertical panel: cos(el); 60° gives half, 204.15 W', () => {
    expect(panelPowerW({ elDeg: 60, rangeKm: AU_KM, litFraction: 1 }, panel)).toBeCloseTo(204.15, 9);
  });
  it('horizontal panel: sin(el); 30° gives half; below the plane, nothing', () => {
    const h = { ...panel, orientation: 'horizontal' as const };
    expect(panelPowerW({ elDeg: 30, rangeKm: AU_KM, litFraction: 1 }, h)).toBeCloseTo(204.15, 9);
    expect(panelPowerW({ elDeg: -2, rangeKm: AU_KM, litFraction: 1 }, h)).toBe(0);
  });
  it('inverse square of the distance and the visible part of the disc', () => {
    // 1.02 AU: 408.3 / 1.0404 = 392.445…; half the disc hidden: 204.15.
    expect(panelPowerW({ elDeg: 0, rangeKm: 1.02 * AU_KM, litFraction: 1 }, panel)).toBeCloseTo(408.3 / 1.0404, 9);
    expect(panelPowerW({ elDeg: 0, rangeKm: AU_KM, litFraction: 0.5 }, panel)).toBeCloseTo(204.15, 9);
    expect(panelPowerW({ elDeg: 0, rangeKm: AU_KM, litFraction: 0 }, panel)).toBe(0);
  });
  it('2 m² at 25 %: 1361 × 0.25 × 2 = 680.5 W', () => {
    expect(panelPowerW({ elDeg: 0, rangeKm: AU_KM, litFraction: 1 }, { ...panel, efficiency: 0.25, areaM2: 2 })).toBeCloseTo(680.5, 9);
  });
});

describe('energy, battery and link (hand-computed)', () => {
  it('constant 100 W for 24 h is 2400 Wh; a ramp 0 → 100 W over 1 h is 50 Wh', () => {
    const t = Array.from({ length: 25 }, (_, i) => i * HOUR_S);
    expect(energyWh(t, t.map(() => 100))).toBeCloseTo(2400, 9);
    expect(energyWh([0, HOUR_S], [0, 100])).toBeCloseTo(50, 9);
  });
  it('battery: 100 W through a 192 h night is 19 200 Wh', () => {
    expect(nightEnergyWh(100, 192)).toBe(19_200);
    expect(nightEnergyWh(100, 0)).toBe(0);
  });
  it('link hours and the longest gap, each sample standing for the next interval', () => {
    const t = [0, 1, 2, 3, 4, 5, 6].map((h) => h * HOUR_S);
    // on, on, off, off, off, on | end → 3 h on, longest gap 3 h.
    expect(linkStats(t, [true, true, false, false, false, true, false])).toEqual({ linkHours: 3, longestGapH: 3 });
    expect(linkStats(t, t.map(() => true))).toEqual({ linkHours: 6, longestGapH: 0 });
  });
});

describe('over a mission', () => {
  const table = exampleTable();
  const t0 = isoToUnix('2027-08-01T00:00:00Z');
  const t1 = t0 + 2 * DAY_S;
  it('with the horizon at −90° the Earth never sets: 48 h of link, no gap', () => {
    const mask = formulaMask('flat:-90');
    const frame = frameFor(-88.8, 123.4, mask);
    const m = missionMetrics(table, frame, mask, { landingUnix: t0, missionDays: 2 }, t0);
    const r = powerComms(table, frame, mask, t0, t1, m.longestNightH, DEFAULT_POWER);
    expect(r.linkHours).toBeCloseTo(48, 9);
    expect(r.linkPct).toBeCloseTo(100, 9);
    expect(r.longestGapH).toBe(0);
    // The Sun is always up too: the mean power lies between 1361 × 0.307 × (1 ± 3.5 %) × cos(el) bounds.
    expect(r.meanW).toBeGreaterThan(1361 * 0.307 * 0.96 * 0.99);
    expect(r.meanW).toBeLessThan(1361 * 0.307 * 1.04);
    expect(r.energyPerDayWh).toBeCloseTo(r.meanW * 24, 6);
    expect(r.batteryWh).toBe(0);
  });
  it('with the horizon at +45° nothing is ever in view: no energy, no link, one gap of 48 h', () => {
    const mask = formulaMask('flat:45');
    const frame = frameFor(-88.8, 123.4, mask);
    const r = powerComms(table, frame, mask, t0, t1, 48, DEFAULT_POWER);
    expect(r.energyWh).toBe(0);
    expect(r.linkHours).toBe(0);
    expect(r.longestGapH).toBeCloseTo(48, 9);
    expect(r.batteryWh).toBe(100 * 48);
  });
  it('with a 0° minimum the link hours equal the app’s Earth contact (same definition)', () => {
    const mask = formulaMask('flat:0.3');
    const frame = frameFor(-88.8, 123.4, mask);
    const m = missionMetrics(table, frame, mask, { landingUnix: t0, missionDays: 2 }, t0);
    const r = powerComms(table, frame, mask, t0, t1, m.longestNightH, DEFAULT_POWER);
    // Sampled every 10 min: within one step per window edge of the exact windows.
    expect(Math.abs(r.linkHours - m.earthHours)).toBeLessThanOrEqual((2 * 600 * Math.max(1, m.windows.earth.length)) / 3600);
  });
});
