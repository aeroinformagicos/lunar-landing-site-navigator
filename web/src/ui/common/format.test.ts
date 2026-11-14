// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-14: display formats of 10_interfaz.md §4 and §7.
import { describe, expect, it } from 'vitest';
import { isoToUnix } from '../../core/time';
import {
  formatCountdown,
  formatDeg,
  formatHours,
  formatInt,
  formatLatLon,
  formatMargin,
  formatMissionDay,
  formatPct,
  toDateTimeLocal,
} from './format';

describe('formats', () => {
  it('coordinates: `84.79° S, 29.20° E`, 3 decimals for mesh points', () => {
    expect(formatLatLon(-84.79, 29.2)).toBe('84.79° S, 29.20° E');
    expect(formatLatLon(18.562, -153.9852)).toBe('18.56° N, 153.99° W');
    expect(formatLatLon(-89.123, 45.678, 3)).toBe('89.123° S, 45.678° E');
  });

  it('slider readout: `Day 3, 14:20`', () => {
    expect(formatMissionDay(3 * 86_400 + 14 * 3600 + 20 * 60)).toBe('Day 3, 14:20');
    expect(formatMissionDay(0)).toBe('Day 0, 00:00');
    expect(formatMissionDay(-5)).toBe('Day 0, 00:00');
  });

  it('countdowns: `4d 12h 52m`, under one hour `MMm SSs`', () => {
    expect(formatCountdown(4 * 86_400 + 12 * 3600 + 52 * 60)).toBe('4d 12h 52m');
    expect(formatCountdown(59 * 60 + 5)).toBe('59m 05s');
  });

  it('thousands separator and datetime-local value in UTC', () => {
    expect(formatInt(1930.4)).toBe('1,930');
    expect(toDateTimeLocal(isoToUnix('2027-08-04T14:20:00Z'))).toBe('2027-08-04T14:20');
    expect(toDateTimeLocal(isoToUnix('1969-07-20T20:17:40Z'))).toBe('1969-07-20T20:18');
  });
});

describe('presentation rules (07 §12.6)', () => {
  it('elevations and margins with 2 decimals', () => {
    expect(formatDeg(1.2149)).toBe('1.21°');
    expect(formatMargin(0.333)).toBe('+0.33°');
    expect(formatMargin(-0.21)).toBe('−0.21°');
    expect(formatMargin(-0.001)).toBe('+0.00°');
  });

  it('percentages: integers, <1 % and >99 %', () => {
    expect(formatPct(0)).toBe('0 %');
    expect(formatPct(0.3)).toBe('<1 %');
    expect(formatPct(0.5)).toBe('1 %');
    expect(formatPct(93.4)).toBe('93 %');
    expect(formatPct(99.4)).toBe('99 %');
    expect(formatPct(99.5)).toBe('>99 %');
    expect(formatPct(100)).toBe('100 %');
  });

  it('hours: 1 decimal below 100 h, integer above', () => {
    expect(formatHours(7.46)).toBe('7.5 h');
    expect(formatHours(0)).toBe('0.0 h');
    expect(formatHours(99.94)).toBe('99.9 h');
    expect(formatHours(312.4)).toBe('312 h');
  });
});
