// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-27: replanning texts (10_interfaz.md §6.5).
import { describe, expect, it } from 'vitest';
import type { Cell } from '../../core/requirements';
import { isoToUnix } from '../../core/time';
import { alternativeText, cellDetail, cellLabel, durationWords, offsetLabel, windowText } from './texts';

const cell = (over: Partial<Cell> = {}): Cell => ({
  landingUnix: isoToUnix('2027-08-13T06:00:00Z'),
  status: 'no_go',
  sunAtLanding: true,
  earthAtLanding: true,
  longestNightH: 31,
  reasons: ['night_too_long'],
  ...over,
});

describe('replan texts', () => {
  it('column offsets and durations', () => {
    expect(offsetLabel(0)).toBe('+0');
    expect(offsetLabel(86_400)).toBe('+1 d');
    expect(offsetLabel(12 * 3600)).toBe('+12 h');
    expect(offsetLabel(30 * 3600)).toBe('+1 d 6 h');
    expect(durationWords(4 * 86_400 + 6 * 3600)).toBe('4 d 6 h');
  });

  it('next valid window and its absence', () => {
    const w = { startUnix: isoToUnix('2027-08-20T00:00:00Z'), endUnix: isoToUnix('2027-08-24T06:00:00Z'), statusAtStart: 'go' as const };
    expect(windowText(w)).toBe('Next valid landing window: 2027-08-20 00:00 – 2027-08-24 06:00 UTC (4 d 6 h)');
    expect(windowText(null)).toBe('No valid landing window in the next 90 days.');
  });

  it('cell detail and accessible name', () => {
    expect(cellDetail(cell(), 24)).toBe('Landing 2027-08-13 06:00 UTC · Sun ✓ · Earth ✓ · Longest night 31 h ⊗');
    expect(cellDetail(cell({ earthAtLanding: false, longestNightH: 7.46 }), 24)).toBe('Landing 2027-08-13 06:00 UTC · Sun ✓ · Earth ⊗ · Longest night 7.5 h ✓');
    expect(cellLabel('Demo A', cell({ status: 'go' }))).toBe('Demo A, landing 2027-08-13 06:00 UTC: Works');
    expect(cellLabel('Demo A', cell({ status: null }))).toBe('Demo A, landing 2027-08-13 06:00 UTC: no data');
  });

  it('best alternative sentence', () => {
    const r = { siteId: 'm', name: 'Malapert Massif', sunPct: 90, earthPct: 90, assessment: { status: 'go' as const, checks: { sunAtLanding: true, earthAtLanding: true, nightOk: true }, longestNightH: 3, bothPct: 88.2, reasons: [] } };
    expect(alternativeText(r)).toBe('Best alternative: Malapert Massif — Works, 88 % Sun + Earth.');
  });
});
