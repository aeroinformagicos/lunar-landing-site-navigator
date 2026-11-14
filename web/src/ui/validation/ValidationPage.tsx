// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Validation page (10_interfaz.md §6.7, F9), route `#/validation`, built only from
// `validation_report.json`: three headline cards (prediction vs fact), the Horizons summary line, the
// full table of checks one click away (each row expands with its details) and the commit footer.
// A mismatch is shown with its difference and note, never hidden.
import { Fragment, useState } from 'react';
import { loader } from '../../core/loaders';
import { t, type TextKey } from '../../i18n/t';
import { useBoot } from '../common/data';
import { DataState, useResource } from '../common/DataState';
import { buttonClass } from '../common/Button';
import {
  checkCount,
  detailValue,
  figureUrl,
  headlineState,
  loadReport,
  orderedHeadlines,
  summaryLine,
  type Headline,
  type ReportCase,
  type ReportSource,
  type ValidationReport,
} from './report';

const STATE_ICON = { match: '✓', mismatch: '✕', pending: '…' } as const;
const CASE_ICON = { pass: '✓', fail: '✕', manual: '✎', skipped: '–' } as const;

function Source({ source }: { source: ReportSource }) {
  if (!source.label) return <>—</>;
  return source.url ? (
    <a href={source.url} target="_blank" rel="noreferrer">
      {source.label}
    </a>
  ) : (
    <>{source.label}</>
  );
}

function HeadlineCard({ h, baseUrl }: { h: Headline; baseUrl: string }) {
  const state = headlineState(h.status);
  return (
    <article className={`headline headline--${state}`} aria-labelledby={`headline-${h.id}`}>
      <header className="headline__head">
        <h2 id={`headline-${h.id}`}>{h.title}</h2>
        <p className={`status-chip status-chip--${state}`}>
          <span aria-hidden="true">{STATE_ICON[state]}</span> {t(`validation.${state}` as TextKey)}
        </p>
      </header>
      {h.rows.length > 0 && (
        <table className="headline__table">
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">{t('validation.event')}</span>
              </th>
              <th scope="col">{t('validation.predicted')}</th>
              <th scope="col">{t('validation.observed')}</th>
            </tr>
          </thead>
          <tbody>
            {h.rows.map((r) => (
              <tr key={r.label} className={r.ok === false ? 'row--fail' : undefined}>
                <th scope="row">{r.label}</th>
                <td>{r.predicted}</td>
                <td>
                  {r.observed}
                  {r.ok !== null && (
                    <span className="row__ok" aria-label={r.ok ? t('validation.within') : t('validation.outside')}>
                      {' '}
                      {r.ok ? '✓' : '✕'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {h.id === 'A7B7' && (
        <>
          {h.figures?.map((f) => (
            <img key={f.file} className="headline__figure" src={figureUrl(baseUrl, f.file)} alt={f.alt} loading="lazy" />
          ))}
          <p className="headline__rule">{t('validation.a7b7_rule')}</p>
        </>
      )}
      <dl className="headline__meta">
        <dt>{t('validation.tolerance')}</dt>
        <dd>{h.tolerance}</dd>
        <dt>{t('validation.source')}</dt>
        <dd>
          <Source source={h.source} />
        </dd>
      </dl>
      {h.note && <p className="headline__note">{h.note}</p>}
    </article>
  );
}

function CaseRows({ c }: { c: ReportCase }) {
  const [open, setOpen] = useState(false);
  return (
    <Fragment>
      <tr className={c.status === 'fail' ? 'row--fail' : undefined}>
        <td>
          <button
            type="button"
            className="case__toggle"
            aria-expanded={open}
            aria-controls={`case-${c.id}`}
            aria-label={t('validation.details_for', { id: c.id })}
            onClick={() => setOpen(!open)}
          >
            {open ? '▾' : '▸'} {c.id}
          </button>
        </td>
        <td>{c.title}</td>
        <td>{c.expected}</td>
        <td>{c.obtained}</td>
        <td>{c.tolerance}</td>
        <td>
          <Source source={c.source} />
        </td>
        <td className={`case__status case__status--${c.status}`}>
          <span aria-hidden="true">{CASE_ICON[c.status]}</span> {t(`validation.status.${c.status}` as TextKey)}
        </td>
      </tr>
      {open && (
        <tr id={`case-${c.id}`} className="case__details">
          <td colSpan={7}>
            {c.note && <p className="case__note">{c.note}</p>}
            {c.details.length === 0 ? (
              <p className="muted">{t('validation.no_details')}</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t('validation.detail')}</th>
                    <th scope="col">{t('validation.col.expected')}</th>
                    <th scope="col">{t('validation.col.obtained')}</th>
                    <th scope="col">{t('validation.abs_err')}</th>
                    <th scope="col">{t('validation.ok')}</th>
                  </tr>
                </thead>
                <tbody>
                  {c.details.map((d) => (
                    <tr key={d.label} className={d.ok === false ? 'row--fail' : undefined}>
                      <th scope="row">{d.label}</th>
                      <td>{detailValue(d.expected)}</td>
                      <td>{detailValue(d.obtained)}</td>
                      <td>
                        {detailValue(d.abs_err)} {d.unit}
                      </td>
                      <td>{d.ok === null ? '—' : d.ok ? '✓' : '✕'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function Report({ report, baseUrl }: { report: ValidationReport; baseUrl: string }) {
  const [all, setAll] = useState(false);
  const summary = summaryLine(report);
  return (
    <>
      <div className="headlines">
        {orderedHeadlines(report).map((h) => (
          <HeadlineCard key={h.id} h={h} baseUrl={baseUrl} />
        ))}
      </div>
      {summary && <p className="validation__summary">{summary}</p>}
      <button type="button" aria-expanded={all} aria-controls="all-checks" onClick={() => setAll(!all)}>
        {all ? t('validation.hide_all') : t('validation.show_all', { n: checkCount(report) })}
      </button>
      {all && (
        <div className="table-scroll">
          <table id="all-checks" className="checks-table">
            <thead>
              <tr>
                {(['id', 'check', 'expected', 'obtained', 'tolerance', 'source', 'status'] as const).map((k) => (
                  <th key={k} scope="col">
                    {t(`validation.col.${k}` as TextKey)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.cases.map((c) => (
                <CaseRows key={c.id} c={c} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <footer className="validation__footer">{t('validation.footer', { commit: report.git_commit })}</footer>
    </>
  );
}

export function ValidationPage() {
  const { config, manifest } = useBoot();
  const [report, retry] = useResource(`report:${config.data_base_url}`, () =>
    loadReport(loader, config.data_base_url, manifest.has_validation_report),
  );
  return (
    <main className="validation" aria-labelledby="validation-title">
      <p>
        <a href="#" className={buttonClass('secondary', 'button-link')}>
          <span aria-hidden="true">←</span> {t('validation.back')}
        </a>
      </p>
      <h1 id="validation-title">{t('validation.title')}</h1>
      <DataState
        resource={report}
        loadingText={t('validation.loading')}
        errorText={t('validation.none')}
        onRetry={retry}
        isEmpty={(r) => r === null}
        emptyText={t('validation.none')}
      >
        {(r) => <Report report={r!} baseUrl={config.data_base_url} />}
      </DataState>
    </main>
  );
}
