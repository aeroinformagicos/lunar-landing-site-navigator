// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Replanning (10_interfaz.md §6.5, F10, `Replan` tab in Plan): controls (delay step, rows, editable
// requirements), the site × date matrix with the next valid window per row, and the ranking of the
// candidate regions for the base landing with the best alternative.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MAX_SCENARIOS } from '../../core/constants';
import { bestAlternative, rankCandidates, type RankRow } from '../../core/ranking';
import { assess, MATRIX_COLUMNS, nextValidLanding, replanRow, type Cell } from '../../core/requirements';
import type { Site } from '../../core/types';
import { t } from '../../i18n/t';
import { activeScenario, parseSiteRef } from '../../state/selectors';
import { DEFAULT_REQUIREMENTS, useAppStore, type Scenario, type ScenarioId } from '../../state/store';
import { useBoot } from '../common/data';
import { formatHours, formatPct, formatUtc } from '../common/format';
import { useScenarioModel } from '../common/model';
import { computeMission } from '../metrics/useMission';
import './replanExtras.css';
import { alternativeText, cellDetail, cellLabel, DELAY_STEPS, offsetLabel, STATUS_ICON, STATUS_TEXT, windowText } from './texts';

interface RowSpec {
  key: string;
  name: string;
  siteRef: string;
  /** Scenario of the row (clicking a cell sets its landing); null for candidate regions. */
  scenarioId: ScenarioId | null;
}

/** A model needs a scenario shape: same observer height, landing and length as the base. */
function asScenario(siteRef: string, base: Scenario): Scenario {
  return { ...base, siteRef };
}

/** Base column and, in the guided story, the active column (10 §11, step 4). */
function colClass(c: number, active: number | null): string {
  // Every day column gets `replan__day` so all columns share one width (mentor feedback, D-173).
  return ['replan__day', c === 0 ? 'replan__base' : '', c === active ? 'replan__active' : ''].filter(Boolean).join(' ');
}

/** Mentor feedback (D-179): landable days (works or tight) next to each other join into one bar, like the
 *  available nights of a booking calendar; the bar is rounded only where the run starts and ends. */
function runClass(row: Cell[], c: number): string {
  const ok = (k: number) => k >= 0 && k < row.length && (row[k].status === 'go' || row[k].status === 'marginal');
  if (!ok(c)) return '';
  return `${ok(c - 1) ? '' : ' replan__cell--run-start'}${ok(c + 1) ? '' : ' replan__cell--run-end'}`;
}

/** The story's reduced matrix (§6.5: 2 rows, 13 columns). */
const COMPACT_ROWS = 2;
const COMPACT_COLUMNS = 13;

function MatrixRow(props: {
  r: number;
  spec: RowSpec;
  base: Scenario;
  deltaS: number;
  focus: { r: number; c: number };
  columns: number;
  activeColumn: number | null;
  onPick: (r: number, c: number, cell: Cell, spec: RowSpec) => void;
}) {
  const { r, spec, base, deltaS, focus, columns, activeColumn, onPick } = props;
  const req = useAppStore((s) => s.requirements);
  const [model] = useScenarioModel(asScenario(spec.siteRef, base));
  const result = useMemo(() => {
    if (model.status !== 'ready') return null;
    const { table, frame, mask } = model.data;
    return {
      cells: replanRow(table, frame, mask, base.landingUnix, deltaS, base.missionDays, req),
      window: nextValidLanding(table, frame, mask, base.landingUnix, base.missionDays, req),
    };
  }, [model, base.landingUnix, base.missionDays, deltaS, req]);

  return (
    <tr>
      <th scope="row" className="replan__site">
        {spec.name}
      </th>
      {result
        ? result.cells.slice(0, columns).map((cell, c, row) => (
            <td key={c} className={colClass(c, activeColumn)}>
              <button
                type="button"
                className={`replan__cell replan__cell--${cell.status ?? 'none'}${runClass(row, c)}`}
                data-cell={`${r}-${c}`}
                tabIndex={focus.r === r && focus.c === c ? 0 : -1}
                aria-label={cellLabel(spec.name, cell)}
                onClick={() => onPick(r, c, cell, spec)}
              >
                <span aria-hidden="true">{cell.status ? STATUS_ICON[cell.status] : '–'}</span>
              </button>
            </td>
          ))
        : Array.from({ length: columns }, (_, c) => (
            <td key={c} className="replan__day replan__cell--loading" aria-hidden="true" />
          ))}
      {/* T-90 (proposal 5): the answer column stays visible (sticky) while the matrix scrolls. */}
      <td className="replan__window" data-testid="next-window">
        {result ? windowText(result.window) : model.status === 'error' ? t('scenario.error') : t('common.loading')}
      </td>
    </tr>
  );
}

/** Assessment of one candidate region for the base landing; reports a ranking row. */
function CandidateRank({ site, base, onRow }: { site: Site; base: Scenario; onRow: (id: string, row: RankRow | null) => void }) {
  const req = useAppStore((s) => s.requirements);
  const [model] = useScenarioModel(asScenario(site.id, base));
  const row = useMemo((): RankRow | null => {
    if (model.status !== 'ready') return null;
    try {
      const mission = computeMission(model.data, asScenario(site.id, base));
      if (!mission.landing) return null;
      return {
        siteId: site.id,
        name: site.short_name,
        assessment: assess(mission.landing, mission.metrics, req),
        sunPct: mission.metrics.sunPct,
        earthPct: mission.metrics.earthPct,
      };
    } catch {
      return null;
    }
  }, [model, site, base, req]);
  useEffect(() => onRow(site.id, row), [site.id, row, onRow]);
  return null;
}

export interface ReplanStoryProps {
  compact: true;
  columnFrom: number;
  columnTo: number;
  highlightRank: boolean;
}

/** Steps `columnFrom` → `columnTo` over 1 s; immediately with reduced motion (10 §11). */
function useAnimatedColumn(story: ReplanStoryProps | undefined): number | null {
  const [col, setCol] = useState<number | null>(story ? story.columnFrom : null);
  useEffect(() => {
    if (!story) {
      setCol(null);
      return;
    }
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const steps = story.columnTo - story.columnFrom;
    if (reduced || steps === 0) {
      setCol(story.columnTo);
      return;
    }
    setCol(story.columnFrom);
    let k = 0;
    const id = setInterval(() => {
      k++;
      setCol(story.columnFrom + k);
      if (k >= steps) clearInterval(id);
    }, 1000 / steps);
    return () => clearInterval(id);
    // Primitive dependencies only: the story object is rebuilt on every render.
  }, [story?.columnFrom, story?.columnTo, story !== undefined]);
  return col;
}

export function Replan({ story }: { story?: ReplanStoryProps } = {}) {
  const { sites } = useBoot();
  const base = useAppStore(activeScenario);
  const scenarios = useAppStore((s) => s.scenarios);
  const req = useAppStore((s) => s.requirements);
  const setRequirements = useAppStore((s) => s.setRequirements);
  const setMissionDays = useAppStore((s) => s.setMissionDays);
  const updateScenario = useAppStore((s) => s.updateScenario);
  const setActive = useAppStore((s) => s.setActiveScenario);
  const addScenario = useAppStore((s) => s.addScenario);
  const [deltaS, setDeltaS] = useState(86_400);
  const [withCandidates, setWithCandidates] = useState(false);
  const [focus, setFocus] = useState({ r: 0, c: 0 });
  const [detail, setDetail] = useState<string | null>(null);
  const [ranked, setRanked] = useState<Record<string, RankRow | null>>({});
  const onRow = useCallback((id: string, row: RankRow | null) => setRanked((p) => (p[id] === row ? p : { ...p, [id]: row })), []);

  const candidates = sites.sites.filter((s) => s.replan_candidate);
  const columns = story ? COMPACT_COLUMNS : MATRIX_COLUMNS;
  const activeColumn = useAnimatedColumn(story);
  const nameOf = (ref: string) => {
    const p = parseSiteRef(ref);
    return p.kind === 'catalogue' ? (sites.sites.find((s) => s.id === p.id)?.short_name ?? p.id) : t('scenario.custom');
  };
  const allRows: RowSpec[] = [
    ...scenarios.map((sc) => ({ key: `s-${sc.id}`, name: `${sc.id} · ${nameOf(sc.siteRef)}`, siteRef: sc.siteRef, scenarioId: sc.id })),
    ...(withCandidates && !story ? candidates.map((s) => ({ key: `c-${s.id}`, name: s.short_name, siteRef: s.id, scenarioId: null })) : []),
  ];

  const rows = story ? allRows.slice(0, COMPACT_ROWS) : allRows;

  function onPick(r: number, c: number, cell: Cell, spec: RowSpec) {
    setFocus({ r, c });
    setDetail(`${spec.name} · ${cellDetail(cell, req.maxNightHours)}`);
    if (spec.scenarioId && cell.status !== null) {
      updateScenario(spec.scenarioId, { landingUnix: cell.landingUnix });
      setActive(spec.scenarioId);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const d = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] }[e.key];
    if (!d) return;
    e.preventDefault();
    const r = Math.min(Math.max(focus.r + d[0], 0), rows.length - 1);
    const c = Math.min(Math.max(focus.c + d[1], 0), columns - 1);
    setFocus({ r, c });
    document.querySelector<HTMLElement>(`[data-cell="${r}-${c}"]`)?.focus();
  }

  const rankRows = rankCandidates(Object.values(ranked).filter((r): r is RankRow => r !== null));
  const currentSite = parseSiteRef(base.siteRef);
  const alternative = bestAlternative(rankRows, currentSite.kind === 'catalogue' ? currentSite.id : '');

  return (
    <div className="replan">
      {candidates.map((s) => (
        <CandidateRank key={s.id} site={s} base={base} onRow={onRow} />
      ))}
      {!story && (
        // T-90 (proposal 5): what to set, what the columns and icons mean, before the controls.
        <p className="replan__intro">{t('replan.intro', { date: formatUtc(base.landingUnix) })}</p>
      )}
      {!story && (
      <div className="replan__controls">
        <div className="segmented" role="group" aria-label={t('replan.delay')}>
          <span className="replan__label">{t('replan.delay')}</span>
          {DELAY_STEPS.map((d) => (
            <button key={d.s} type="button" aria-pressed={deltaS === d.s} onClick={() => setDeltaS(d.s)}>
              {d.label}
            </button>
          ))}
        </div>
        <label className="field__check">
          <input type="checkbox" checked={withCandidates} onChange={(e) => setWithCandidates(e.target.checked)} disabled={candidates.length === 0} />
          {t('replan.include')}
        </label>
        <label className="field">
          <span>{t('replan.mission')}</span>
          <input type="number" min={0.5} max={60} step={0.5} value={base.missionDays} onChange={(e) => Number(e.target.value) >= 0.5 && Number(e.target.value) <= 60 && setMissionDays(Number(e.target.value))} />
        </label>
        <label className="field">
          <span>{t('replan.night')}</span>
          <input type="number" min={0} max={400} step={1} value={req.maxNightHours} onChange={(e) => Number(e.target.value) >= 0 && Number(e.target.value) <= 400 && setRequirements({ maxNightHours: Number(e.target.value) })} />
        </label>
        <label className="field__check">
          <input type="checkbox" checked={req.needSunAtLanding} onChange={(e) => setRequirements({ needSunAtLanding: e.target.checked })} />
          {t('req.sun')}
        </label>
        <label className="field__check">
          <input type="checkbox" checked={req.needEarthAtLanding} onChange={(e) => setRequirements({ needEarthAtLanding: e.target.checked })} />
          {t('req.earth')}
        </label>
        <button type="button" onClick={() => setRequirements({ ...DEFAULT_REQUIREMENTS })}>
          {t('replan.reset')}
        </button>
      </div>
      )}

      <div className="table-scroll">
        <table className="replan__matrix" onKeyDown={onKeyDown} aria-label={t('replan.matrix', { date: formatUtc(base.landingUnix) })}>
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">{t('compare.site')}</span>
              </th>
              {Array.from({ length: columns }, (_, k) => (
                <th key={k} scope="col" className={colClass(k, activeColumn)}>
                  {offsetLabel(k * deltaS)}
                </th>
              ))}
              <th scope="col" className="replan__window-head" title={t('replan.window_help')}>
                {t('replan.window')}
                <span className="visually-hidden"> — {t('replan.window_help')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((spec, r) => (
              <MatrixRow key={spec.key} r={r} spec={spec} base={base} deltaS={deltaS} focus={focus} columns={columns} activeColumn={activeColumn} onPick={onPick} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="replan__legend muted">
        {t('replan.legend')} · {t('replan.window_help')}.
      </p>
      <p className="replan__detail" role="status" data-testid="cell-detail">
        {detail ?? t('replan.pick')}
      </p>

      <section className="replan__ranking" aria-labelledby="ranking-title">
        <h3 id="ranking-title">{t('replan.ranking', { date: formatUtc(base.landingUnix) })}</h3>
        {candidates.length === 0 ? (
          <p className="muted">{t('replan.no_candidates')}</p>
        ) : (
          <>
            <table className="compare__table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">{t('compare.site')}</th>
                  <th scope="col">{t('compare.status')}</th>
                  <th scope="col">{t('replan.both_pct')}</th>
                  <th scope="col">{t('metrics.longest_night')}</th>
                  <th scope="col">
                    <span className="visually-hidden">{t('replan.add')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rankRows.map((row, i) => (
                  <tr key={row.siteId} className={story?.highlightRank && i === 0 ? 'replan__highlight' : undefined}>
                    <td>{i + 1}</td>
                    <td>{row.name}</td>
                    <td className={`compare__status--${row.assessment.status}`}>
                      <span aria-hidden="true">{STATUS_ICON[row.assessment.status]}</span> {STATUS_TEXT[row.assessment.status]}
                    </td>
                    <td>{formatPct(row.assessment.bothPct)}</td>
                    <td>{formatHours(row.assessment.longestNightH)}</td>
                    <td>
                      <button type="button" disabled={scenarios.length >= MAX_SCENARIOS} onClick={() => addScenario(row.siteId)}>
                        {t('replan.add')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p data-testid="alternative">{alternativeText(alternative)}</p>
          </>
        )}
      </section>
    </div>
  );
}
