// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Comparison view (10_interfaz.md §5, F8): replaces the main view with a table, one column per
// scenario, the best figure of each numeric row in bold with ▲, and a mini timeline per scenario
// (the three bars) on a common time axis. `Close comparison` returns to the previous tab.
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { t, type TextKey } from '../../i18n/t';
import { parseSiteRef } from '../../state/selectors';
import { useAppStore, type Scenario, type ScenarioId } from '../../state/store';
import { useBoot } from '../common/data';
import { formatDeg, formatHours, formatPct } from '../common/format';
import { useScenarioModel } from '../common/model';
import { ScenarioMarker } from '../scenario/ScenarioMarker';
import { barSegments, timeScale } from '../timeline/scale';
import { bestColumns, commonRange, computeColumn, landingText, NUMERIC_ROWS, type ColumnResult } from './columns';

type SlotState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: ColumnResult };

const STATUS_ICON = { go: '✓', marginal: '!', no_go: '✕' } as const;
const STATUS_KEY = { go: 'status.go', marginal: 'status.marginal', no_go: 'status.no_go' } as const;

/** Loads one scenario and reports its column (hooks need a fixed component per scenario). */
function Slot({ scenario, onResult }: { scenario: Scenario; onResult: (id: ScenarioId, s: SlotState) => void }) {
  const { sites } = useBoot();
  const cursor = useAppStore((s) => s.cursorUnix);
  const req = useAppStore((s) => s.requirements);
  const [model] = useScenarioModel(scenario);
  const ref = parseSiteRef(scenario.siteRef);
  const siteName =
    ref.kind === 'catalogue' ? (sites.sites.find((x) => x.id === ref.id)?.short_name ?? ref.id) : t('scenario.custom');
  const state = useMemo((): SlotState => {
    if (model.status === 'error') return { status: 'error' };
    if (model.status !== 'ready') return { status: 'loading' };
    try {
      return { status: 'ready', data: computeColumn(model.data, scenario, siteName, cursor, req) };
    } catch {
      return { status: 'error' };
    }
  }, [model, scenario, siteName, cursor, req]);
  useEffect(() => onResult(scenario.id, state), [scenario.id, state, onResult]);
  return null;
}

function MiniTimeline({ c, t0, t1 }: { c: ColumnResult; t0: number; t1: number }) {
  const W = 600;
  const x = timeScale(t0, t1, 0, W);
  const rows = [
    { ws: c.windows.sun, fill: 'url(#pat-sun-c)', label: t('timeline.sun') },
    { ws: c.windows.earth, fill: 'url(#pat-earth-c)', label: t('timeline.earth') },
    { ws: c.windows.both, fill: 'url(#pat-both-c)', label: t('timeline.both') },
  ];
  return (
    <svg className="compare__mini" viewBox={`0 0 ${W} 36`} preserveAspectRatio="none" role="img" aria-label={t('compare.mini', { id: c.id })}>
      {rows.map((r, i) => (
        <g key={i}>
          <rect x={x.x(c.tA)} y={i * 12} width={x.x(c.tB) - x.x(c.tA)} height={10} className="timeline__bar-bg" />
          {barSegments(r.ws, x).map((s, k) => (
            <rect key={k} x={s.x} y={i * 12} width={Math.max(1, s.w)} height={10} fill={r.fill} />
          ))}
        </g>
      ))}
    </svg>
  );
}

/** `✓ In view · 1.31° above the real horizon` or `✕ Hidden · 2.10° below the real horizon`. */
function NowCell({ now }: { now: ColumnResult['sunNow'] }) {
  if (!now) return <td>—</td>;
  const margin = formatDeg(Math.abs(now.marginDeg));
  return (
    <td className={now.visible ? 'compare__now compare__now--in' : 'compare__now compare__now--out'}>
      <span aria-hidden="true">{now.visible ? '✓' : '✕'}</span> {t(now.visible ? 'compare.in_view' : 'compare.hidden', { margin })}
    </td>
  );
}

export function Compare({ onClose }: { onClose: () => void }) {
  const scenarios = useAppStore((s) => s.scenarios);
  const [slots, setSlots] = useState<Partial<Record<ScenarioId, SlotState>>>({});
  const onResult = useCallback((id: ScenarioId, s: SlotState) => setSlots((prev) => (prev[id] === s ? prev : { ...prev, [id]: s })), []);

  const loaders = scenarios.map((sc) => <Slot key={sc.id} scenario={sc} onResult={onResult} />);
  const header = (
    <div className="compare__head">
      <h2>{t('compare.title')}</h2>
      <button type="button" onClick={onClose}>
        {t('compare.close')}
      </button>
    </div>
  );

  if (scenarios.length < 2) {
    return (
      <div className="compare">
        {header}
        <p className="data-state data-state--empty">{t('compare.need_two')}</p>
      </div>
    );
  }

  const states = scenarios.map((sc) => slots[sc.id] ?? ({ status: 'loading' } as const));
  if (states.some((s) => s.status === 'loading')) {
    return (
      <div className="compare">
        {loaders}
        {header}
        <div className="data-state data-state--loading" role="status" aria-busy="true">
          <div className="skeleton" aria-hidden="true" />
          <p>{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  const cols = states.map((s) => (s.status === 'ready' ? s.data : null));
  const ready = cols.filter((c): c is ColumnResult => c !== null);
  const best = Object.fromEntries(NUMERIC_ROWS.map((r) => [r.key, bestColumns(cols.map((c) => (c ? r.value(c) : null)), r.dir)]));
  const range = commonRange(ready);
  const cell = (i: number, key: string, text: string) =>
    best[key]?.has(i) ? (
      <td className="compare__best">
        <strong>
          {text} <span aria-label={t('compare.best')}>▲</span>
        </strong>
      </td>
    ) : (
      <td>{text}</td>
    );
  const row = (label: TextKey, render: (c: ColumnResult, i: number) => React.ReactNode) => (
    <tr>
      <th scope="row">{t(label)}</th>
      {cols.map((c, i) => (c ? <Fragment key={i}>{render(c, i)}</Fragment> : <td key={i}>{t('compare.error')}</td>))}
    </tr>
  );

  return (
    <div className="compare">
      {loaders}
      {header}
      <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
        <defs>
          <pattern id="pat-sun-c" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="var(--c-sun)" />
          </pattern>
          <pattern id="pat-earth-c" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--c-surface)" />
            <rect width="3" height="6" fill="var(--c-earth)" />
          </pattern>
          <pattern id="pat-both-c" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="var(--c-both)" />
            <path d="M0 0H6M0 0V6" stroke="var(--c-surface)" strokeWidth="1.5" />
          </pattern>
        </defs>
      </svg>
      <div className="table-scroll">
        <table className="compare__table">
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">{t('compare.metric')}</span>
              </th>
              {scenarios.map((sc) => (
                <th key={sc.id} scope="col">
                  <ScenarioMarker id={sc.id} /> {sc.id}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {row('compare.site', (c) => <td>{c.siteName}</td>)}
            {row('header.landing', (c) => <td>{landingText(c)}</td>)}
            {row('compare.status', (c) => (
              <td className={c.status ? `compare__status--${c.status}` : undefined}>
                {c.status ? (
                  <>
                    <span aria-hidden="true">{STATUS_ICON[c.status]}</span> {t(STATUS_KEY[c.status])}
                  </>
                ) : (
                  '—'
                )}
              </td>
            ))}
            {/* The state now against the real horizon, next to the mission verdict (T-92): a negative
                elevation can still be in view when the horizon dips below 0°. */}
            {row('compare.sun_now', (c) => <NowCell now={c.sunNow} />)}
            {row('compare.earth_now', (c) => <NowCell now={c.earthNow} />)}
            {row('metrics.sunlight', (c, i) => cell(i, 'sunlight', `${formatHours(c.sunHours)} · ${formatPct(c.sunPct)}`))}
            {row('metrics.earth_link', (c, i) => cell(i, 'earth_link', `${formatHours(c.earthHours)} · ${formatPct(c.earthPct)}`))}
            {row('timeline.both', (c, i) => cell(i, 'both', `${formatHours(c.bothHours)} · ${formatPct(c.bothPct)}`))}
            {row('metrics.longest_night', (c, i) => cell(i, 'longest_night', formatHours(c.longestNightH)))}
            {row('compare.sun_el_now', (c, i) => cell(i, 'sun_el_now', c.sunElNow === null ? '—' : formatDeg(c.sunElNow)))}
            {row('compare.disc_now', (c, i) => cell(i, 'disc_now', c.discNowPct === null ? '—' : formatPct(c.discNowPct)))}
            {row('compare.next_sun', (c) => <td>{c.nextSun}</td>)}
            {row('compare.next_earth', (c) => <td>{c.nextEarth}</td>)}
            {row('compare.terrain', (c) => <td className={c.smooth ? 'warn' : undefined}>{c.terrain}</td>)}
            {row('compare.verdict', (c) => <td className="compare__verdict">{c.verdict}</td>)}
          </tbody>
        </table>
      </div>
      <div className="compare__minis">
        {ready.map((c) => (
          <div key={c.id} className="compare__mini-row">
            <span className="compare__mini-label">
              <ScenarioMarker id={c.id} size={12} /> {c.id}
            </span>
            <MiniTimeline c={c} t0={range.t0} t1={range.t1} />
          </div>
        ))}
      </div>
    </div>
  );
}

