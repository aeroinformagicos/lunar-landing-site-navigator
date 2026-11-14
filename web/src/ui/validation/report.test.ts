// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-23: validation report rules (09_contrato_datos.md §7, 10_interfaz.md §6.7, F9).
import { describe, expect, it } from 'vitest';
import { exampleJson, fakeFetch } from '../../core/__tests__/fixtures';
import { createLoader } from '../../core/loaders';
import {
  checkCount,
  detailValue,
  formatSmallDeg,
  headlineState,
  loadReport,
  orderedHeadlines,
  routeOf,
  summaryLine,
  type ValidationReport,
} from './report';

const example = exampleJson<ValidationReport>('validation_report.json');

function loaderWith(reply: Parameters<typeof fakeFetch>[0]) {
  return createLoader({ fetch: fakeFetch(reply).fetch, sleep: async () => {} });
}

describe('headline states (Match, Mismatch, Pending)', () => {
  it('pass → Match, fail → Mismatch, skipped and manual → Pending', () => {
    expect(headlineState('pass')).toBe('match');
    expect(headlineState('fail')).toBe('mismatch');
    expect(headlineState('skipped')).toBe('pending');
    expect(headlineState('manual')).toBe('pending');
  });

  it('the example report opens with A1 and B3 (Match) and A7B7 (Pending, computed tonight)', () => {
    const hs = orderedHeadlines(example);
    expect(hs.map((h) => [h.id, headlineState(h.status)])).toEqual([
      ['A1', 'match'],
      ['B3', 'match'],
      ['A7B7', 'pending'],
    ]);
    expect(hs[2].note).toMatch(/^Computed tonight/);
  });

  it('keeps the order A1, B3, A7B7 whatever the file order (decision D-95: A3 retired)', () => {
    const shuffled = { ...example, headline: [...example.headline].reverse() };
    expect(orderedHeadlines(shuffled).map((h) => h.id)).toEqual(['A1', 'B3', 'A7B7']);
  });
});

describe('summary, counts and values', () => {
  it('Horizons line: `256 values checked against JPL Horizons · largest difference 0.00004°`', () => {
    expect(summaryLine(example)).toBe('256 values checked against JPL Horizons · largest difference 0.00004°');
    expect(summaryLine({ ...example, summary: { ...example.summary, horizons_max_abs_err_deg: null } })).toBeNull();
  });

  it('small numbers without exponent notation', () => {
    expect(formatSmallDeg(4e-5)).toBe('0.00004');
    expect(formatSmallDeg(7e-6)).toBe('0.000007');
    expect(formatSmallDeg(0.0123)).toBe('0.012');
    expect(detailValue(12.345678)).toBe('12.345678');
    expect(detailValue(7e-6)).toBe('0.000007');
    expect(detailValue(null)).toBe('—');
    expect(detailValue('n/a')).toBe('n/a');
  });

  it('`Show all checks (N)` counts every case', () => {
    expect(checkCount(example)).toBe(4);
  });
});

describe('loading', () => {
  it('loads the example report', async () => {
    const r = await loadReport(loaderWith({ 'data/validation_report.json': { json: example } }), 'data', true);
    expect(r?.cases.map((c) => c.id)).toEqual(['A1', 'A4', 'A5', 'B1']);
  });

  it('no report: the manifest says so, or the file is missing → null (message on the page)', async () => {
    expect(await loadReport(loaderWith({}), 'data', false)).toBeNull();
    expect(await loadReport(loaderWith({}), 'data', true)).toBeNull();
  });

  it('another major version is an error, not a silent empty page', async () => {
    const ld = loaderWith({ 'data/validation_report.json': { json: { ...example, contract_version: '2.0.0' } } });
    await expect(loadReport(ld, 'data', true)).rejects.toMatchObject({ kind: 'contract' });
  });
});

describe('route', () => {
  it('`#/validation` opens the page; anything else is the navigator', () => {
    expect(routeOf('#/validation')).toBe('validation');
    expect(routeOf('#/validation/')).toBe('validation');
    expect(routeOf('')).toBe('main');
    expect(routeOf('#s=abc')).toBe('main');
  });
});
