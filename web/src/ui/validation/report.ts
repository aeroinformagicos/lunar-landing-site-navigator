// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// `validation_report.json` (09_contrato_datos.md §7) and the rules of the validation page
// (10_interfaz.md §6.7, F9). Pure: tested without a DOM.
import { contractMajor, DataError, joinUrl, type Loader } from '../../core/loaders';
import { CONTRACT_MAJOR } from '../../core/constants';

export type CaseStatus = 'pass' | 'fail' | 'manual' | 'skipped';
export type HeadlineId = 'A1' | 'B3' | 'A7B7';

export interface ReportSource {
  label: string;
  url: string;
}

export interface HeadlineRow {
  label: string;
  predicted: string;
  observed: string;
  ok: boolean | null;
}

export interface Headline {
  id: HeadlineId;
  title: string;
  rows: HeadlineRow[];
  tolerance: string;
  source: ReportSource;
  note: string;
  status: CaseStatus;
  figures?: { file: string; alt: string }[];
}

export interface CaseDetail {
  label: string;
  expected: number | string | null;
  obtained: number | string | null;
  abs_err: number | null;
  unit: string;
  ok: boolean | null;
}

export interface ReportCase {
  id: string;
  group: 'A' | 'B';
  title: string;
  status: CaseStatus;
  expected: string;
  obtained: string;
  tolerance: string;
  source: ReportSource;
  details: CaseDetail[];
  note: string;
}

export interface ValidationReport {
  contract_version: string;
  generated_utc: string;
  git_commit: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    manual: number;
    skipped: number;
    horizons_comparisons: number;
    horizons_max_abs_err_deg: number | null;
  };
  headline: Headline[];
  cases: ReportCase[];
}

export function validateReport(url: string, json: unknown): ValidationReport {
  const r = json as ValidationReport | null;
  if (contractMajor(r?.contract_version) !== CONTRACT_MAJOR) {
    throw new DataError('contract', url, `Unsupported contract version ${String(r?.contract_version)}`);
  }
  if (!r || typeof r.summary !== 'object' || !Array.isArray(r.headline) || !Array.isArray(r.cases)) {
    throw new DataError('format', url, 'Malformed validation report');
  }
  return r;
}

/** Loads the report; `null` when the build has none (manifest says so, or the file is missing). */
export async function loadReport(ld: Loader, baseUrl: string, hasReport: boolean): Promise<ValidationReport | null> {
  if (!hasReport) return null;
  try {
    return await ld.json(joinUrl(baseUrl, 'validation_report.json'), validateReport);
  } catch (e) {
    if (e instanceof DataError && e.kind === 'not_found') return null;
    throw e;
  }
}

export type HeadlineState = 'match' | 'mismatch' | 'pending';

/**
 * Headline card state (10 §6.7): `pass` → Match, `fail` → Mismatch, `skipped` → Pending (09 §7).
 * `manual` is also Pending: the report does not say whether the person signed it as a match (D-73).
 */
export function headlineState(status: CaseStatus): HeadlineState {
  return status === 'pass' ? 'match' : status === 'fail' ? 'mismatch' : 'pending';
}

/** Headlines in the order of 09 §7 (A1, B3, A7B7; decision D-95), whatever the order of the file. */
export function orderedHeadlines(report: ValidationReport): Headline[] {
  const order: HeadlineId[] = ['A1', 'B3', 'A7B7'];
  return [...report.headline].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

/** `256 values checked against JPL Horizons · largest difference 0.00004°`, or null without data. */
export function summaryLine(report: ValidationReport): string | null {
  const s = report.summary;
  if (!s.horizons_comparisons || s.horizons_max_abs_err_deg === null) return null;
  return `${s.horizons_comparisons.toLocaleString('en-US')} values checked against JPL Horizons · largest difference ${formatSmallDeg(s.horizons_max_abs_err_deg)}°`;
}

/** Small angles without exponent notation: 4e-05 → `0.00004`. */
export function formatSmallDeg(deg: number): string {
  if (deg === 0) return '0';
  const digits = Math.min(12, Math.max(2, Math.ceil(-Math.log10(Math.abs(deg))) + 1));
  return deg.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
}

/** Number of checks shown in `Show all checks (N)`. */
export function checkCount(report: ValidationReport): number {
  return report.cases.length;
}

/** A detail value as text: numbers keep their precision, null is a dash. */
export function detailValue(v: number | string | null): string {
  if (v === null) return '—';
  return typeof v === 'number' ? (Math.abs(v) > 0 && Math.abs(v) < 0.001 ? formatSmallDeg(v) : String(v)) : v;
}

/** Figure URL: relative to `data_base_url` (09 §7.1). */
export function figureUrl(baseUrl: string, file: string): string {
  return joinUrl(baseUrl, file);
}

/** `validation` on `#/validation` (10_interfaz.md §6.7); anything else is the navigator. */
export function routeOf(hash: string): 'validation' | 'main' {
  return /^#\/validation\/?$/.test(hash) ? 'validation' : 'main';
}
