// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-32: eclipses (07_visibilidad.md §9, §13.4, §13.5; 11_validacion.md B3; F13).
import { describe, expect, it } from 'vitest';
import { angularSep, coveredShare, eclipseState } from '../eclipse';
import { eclipseTimeline, findEvents } from '../events';
import { siteFrame } from '../frames';
import { formulaMask } from '../horizon';
import { isoToUnix, unixToIso } from '../time';
import { evaluate } from '../visibility';
import { exampleTable, realTable } from './fixtures';

describe('overlap geometry (07 §13.5)', () => {
  const a = 0.265;
  const b = 0.95;

  it('none, total and the two limits', () => {
    expect(coveredShare(1.3, a, b)).toEqual({ kind: 'none', covered: 0 });
    expect(coveredShare(0.5, a, b)).toEqual({ kind: 'total', covered: 1 });
    expect(coveredShare(a + b, a, b).covered).toBe(0);
    expect(coveredShare(b - a, a, b).covered).toBe(1);
  });

  it('partial at s = 0.95 is between 0 and 0.5, and covered decreases with s', () => {
    const c = coveredShare(0.95, a, b).covered;
    expect(c).toBeGreaterThan(0);
    expect(c).toBeLessThan(0.5);
    let prev = 1;
    for (let s = b - a + 1e-6; s < a + b; s += 0.01) {
      const v = coveredShare(s, a, b).covered;
      expect(v).toBeLessThanOrEqual(prev + 1e-12);
      expect(v).toBeGreaterThanOrEqual(0);
      prev = v;
    }
  });

  it('angular separation (haversine)', () => {
    expect(angularSep(10, 20, 10, 20)).toBe(0);
    expect(angularSep(0, 0, 90, 0)).toBeCloseTo(90, 12);
    expect(angularSep(359.5, 0, 0.5, 0)).toBeCloseTo(1, 12);
    expect(angularSep(0, 89, 180, 89)).toBeCloseTo(2, 9);
  });

  it('eclipse_state carries the separation', () => {
    const s = eclipseState({ azDeg: 100, elDeg: 10, rangeKm: 1, radiusDeg: a }, { azDeg: 100, elDeg: 10.5, rangeKm: 1, radiusDeg: b });
    expect(s).toEqual({ kind: 'total', covered: 1, sepDeg: expect.closeTo(0.5, 9) });
  });
});

describe('evaluate includes the eclipse (07 §5)', () => {
  it('lit fraction = disc fraction × (1 − covered) on 500 random instants of the example table', () => {
    const table = exampleTable();
    const mask = formulaMask('flat:-90');
    const frame = siteFrame(-89.9, 0, 2);
    const t0 = isoToUnix('2024-01-02T00:00:00Z');
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 500; i++) {
      const s = evaluate(table, frame, mask, t0 + rnd() * 20 * 365 * 86_400);
      expect(s.sun.litFraction).toBeCloseTo(s.sun.discFraction * (1 - s.eclipse.covered), 12);
      expect(s.eclipse.covered).toBeGreaterThanOrEqual(0);
      expect(s.eclipse.covered).toBeLessThanOrEqual(1);
    }
  });
});

// ---- 07 §13.4, case B3: Blue Ghost 1, 14 March 2025, with the real table (T-06) ----

const REAL = realTable();

describe.skipIf(!REAL)('eclipse of 14 March 2025 seen by Blue Ghost 1 (B3)', () => {
  const frame = siteFrame(18.562, 61.81, 0);
  const t = (iso: string) => isoToUnix(iso);
  const tl = () => eclipseTimeline(REAL!, frame, t('2025-03-14T00:00:00Z'), t('2025-03-14T14:00:00Z'));

  it('starts 05:01, totality 06:17:30–08:34:00, ends 09:51 UTC (± 60 s, plan figures from SPICE)', () => {
    const events = tl().events;
    const at = (kind: string) => events.find((e) => e.kind === kind)!.tUnix;
    const close = (kind: string, iso: string) =>
      expect(Math.abs(at(kind) - t(iso)), `${kind} ${unixToIso(at(kind))}`).toBeLessThanOrEqual(60);
    expect(events.map((e) => e.kind)).toEqual(['eclipse_start', 'totality_start', 'totality_end', 'eclipse_end']);
    close('eclipse_start', '2025-03-14T05:01:00Z');
    close('totality_start', '2025-03-14T06:17:30Z');
    close('totality_end', '2025-03-14T08:34:00Z');
    close('eclipse_end', '2025-03-14T09:51:00Z');
  });

  it('… and within 5 min of Firefly (05:00, 06:18, 08:34, 09:52 UTC)', () => {
    const e = tl().events;
    const firefly = ['2025-03-14T05:00:00Z', '2025-03-14T06:18:00Z', '2025-03-14T08:34:00Z', '2025-03-14T09:52:00Z'];
    e.forEach((x, k) => expect(Math.abs(x.tUnix - t(firefly[k]))).toBeLessThanOrEqual(300));
  });

  it('covered = 1 and lit fraction 0 at 07:30 UTC; the windows match the events', () => {
    const s = evaluate(REAL!, frame, formulaMask('flat:0'), t('2025-03-14T07:30:00Z'));
    expect(s.eclipse).toMatchObject({ kind: 'total', covered: 1 });
    expect(s.sun.litFraction).toBe(0);
    const w = tl();
    expect(w.windows).toHaveLength(1);
    expect(w.totality).toHaveLength(1);
    expect(w.windows[0].startUnix).toBe(w.events[0].tUnix);
    expect(w.totality[0].endUnix).toBe(w.events[2].tUnix);
  });

  it('findEvents lists the eclipse with the sunrise and sunset events', () => {
    const ev = findEvents(REAL!, frame, formulaMask('flat:0'), t('2025-03-14T00:00:00Z'), t('2025-03-14T14:00:00Z'));
    expect(ev.filter((e) => e.kind.startsWith('eclipse') || e.kind.startsWith('totality'))).toHaveLength(4);
  });
});
