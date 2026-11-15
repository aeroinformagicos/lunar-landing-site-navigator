// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// `Best site` panel of the map (10_interfaz.md §6.4, F32): «Most Sun + Earth in a period» from the
// layers (main thread) and «Longest continuous Sun + Earth from a date» in a Web Worker on the compact
// masks, with progress, `Cancel`, the 3 best recomputed with the full mask, and `Add as scenario`.
import { useEffect, useRef, useState } from 'react';
import { MAX_SCENARIOS } from '../../core/constants';
import { loadEphemeris } from '../../core/ephemeris';
import { gridRef } from '../../core/grid';
import { loader } from '../../core/loaders';
import { bestByPeriod, type Box, type DateHit, type PeriodHit } from '../../core/optimal';
import { t } from '../../i18n/t';
import { activeScenario } from '../../state/selectors';
import { useAppStore } from '../../state/store';
import type { OptimalMessage, OptimalRequest } from '../../workers/protocol';
import { useBoot } from '../common/data';
import { formatLatLon, formatPct } from '../common/format';
import { loadCellMask, type MapData } from '../map/mapData';
import { durationWords } from '../replan/texts';
import { exactBothHours } from './refine';
import { Button } from '../common/Button';
import { consumeBestSiteRequest, takeBestSiteRequest } from './request';

export interface BestSiteProps {
  data: MapData;
  /** Bytes of the period shown on the map (null while loading). */
  layer: Uint8Array | null;
  periodLabel: string;
  onFocus: (i: number, j: number) => void;
}

const abs = (u: string) => new URL(u.endsWith('/') ? u : `${u}/`, location.href).href;

function hoursText(h: { hours: number; capped: boolean }): string {
  return h.capped ? `≥ ${Math.floor(h.hours / 24)} d` : durationWords(h.hours * 3600);
}

export function BestSite({ data, layer, periodLabel, onFocus }: BestSiteProps) {
  const { config } = useBoot();
  const mode = useAppStore((s) => s.mode);
  const scenario = useAppStore(activeScenario);
  const count = useAppStore((s) => s.scenarios.length);
  const addScenario = useAppStore((s) => s.addScenario);
  // Opened from the Sites panel (T-90, proposal 9): unfolded, with the focus on its toggle.
  const [requested] = useState(takeBestSiteRequest);
  const [open, setOpen] = useState(requested);
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!requested) return;
    consumeBestSiteRequest();
    toggleRef.current?.focus();
  }, [requested]);
  const [region, setRegion] = useState<number | null>(null);
  const [periodHits, setPeriodHits] = useState<PeriodHit[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dateHits, setDateHits] = useState<(DateHit & { exact?: boolean })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);

  useEffect(() => () => worker.current?.terminate(), []);

  const boxes: Box[] | null = region === null ? data.regions.map((r) => r.box_m) : [data.regions[region].box_m];
  const full = count >= MAX_SCENARIOS;

  function findPeriod() {
    if (!layer) return;
    const hits = bestByPeriod(layer, data.layers.bands, boxes);
    setPeriodHits(hits);
    if (hits[0]) onFocus(hits[0].i, hits[0].j);
  }

  function cancel() {
    worker.current?.terminate();
    worker.current = null;
    setProgress(null);
  }

  function search() {
    cancel();
    setDateHits(null);
    setError(null);
    const w = new Worker(new URL('../../workers/optimal.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    const t0 = scenario.landingUnix;
    w.onmessage = async (e: MessageEvent<OptimalMessage>) => {
      const m = e.data;
      if (m.type === 'progress') setProgress({ done: m.done, total: m.total });
      else if (m.type === 'error') {
        setError(m.message);
        cancel();
      } else {
        cancel();
        setDateHits(m.top);
        if (m.top.length === 0 || m.top[0].hours === 0) return;
        // The 3 best, again with the full mask of the cube; reordered by the exact duration.
        try {
          const table = await loadEphemeris(config.data_base_url);
          const refined = await Promise.all(
            m.top.slice(0, 3).map(async (h) => {
              try {
                const mask = await loadCellMask(loader, data.base, data.done, h.i, h.j);
                return { ...h, ...exactBothHours(table, mask, h.latDeg, h.lonDeg, t0, m.maxHours), exact: true };
              } catch {
                return h; // chunk not computed: keep the compact estimate
              }
            }),
          );
          refined.sort((a, b) => b.hours - a.hours);
          setDateHits([...refined, ...m.top.slice(3)]);
          onFocus(refined[0].i, refined[0].j);
        } catch {
          /* keep the worker result */
        }
      }
    };
    const req: OptimalRequest = {
      type: 'run',
      t0Unix: t0,
      maxDays: 90,
      regionIndex: region,
      source: 'regions',
      heavyBaseUrl: abs(data.base),
      dataBaseUrl: abs(config.data_base_url),
    };
    w.postMessage(req);
    setProgress({ done: 0, total: 0 });
  }

  const regionSelect = (
    <label className="field">
      <span>{t('best.region')}</span>
      <select value={region ?? ''} onChange={(e) => setRegion(e.target.value === '' ? null : Number(e.target.value))}>
        <option value="">{t('best.all')}</option>
        {data.regions.map((r, k) => (
          <option key={r.id} value={k}>
            {r.name}
          </option>
        ))}
      </select>
    </label>
  );
  const addButton = (i: number, j: number) => (
    <button type="button" disabled={full} onClick={() => addScenario(gridRef(i, j))}>
      {t('best.add')}
    </button>
  );
  const noneFound = dateHits !== null && (dateHits.length === 0 || dateHits[0].hours === 0);

  return (
    <section className="best" aria-label={t('best.title')}>
      <button ref={toggleRef} type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {mode === 'plan' ? t('best.title') : t('best.find_best')}
      </button>
      {open && (
        <div className="best__body">
          {regionSelect}
          <h3>{t('best.period_title')}</h3>
          <p className="muted">{periodLabel}</p>
          <button type="button" onClick={findPeriod} disabled={!layer || !data.layers.bands.includes('both')}>
            {t('best.find')}
          </button>
          {periodHits && (
            <ol className="best__list" data-testid="period-hits">
              {periodHits.map((h, k) => (
                <li key={`${h.i},${h.j}`}>
                  <button type="button" className="best__row" onClick={() => onFocus(h.i, h.j)}>
                    {k + 1} · {formatLatLon(h.latDeg, h.lonDeg)} · Both {formatPct(h.bothPct)} · Sun {formatPct(h.sunPct)} · Earth {formatPct(h.earthPct)}
                  </button>
                  {addButton(h.i, h.j)}
                </li>
              ))}
            </ol>
          )}

          <h3>{t('best.date_title')}</h3>
          <div className="best__actions">
            <button type="button" onClick={search} disabled={progress !== null}>
              {t('best.search')}
            </button>
            {progress && (
              <>
                <span role="status" data-testid="best-progress">
                  {progress.total === 0
                    ? t('common.loading')
                    : t('best.progress', {
                        pct: Math.floor((100 * progress.done) / progress.total),
                        done: progress.done.toLocaleString('en-US'),
                        total: progress.total.toLocaleString('en-US'),
                      })}
                </span>
                <Button variant="secondary" onClick={cancel}>
                  {t('common.cancel')}
                </Button>
              </>
            )}
          </div>
          {error && <p className="field__error">{error}</p>}
          {noneFound && <p>{t('best.none')}</p>}
          {dateHits && !noneFound && (
            <>
              <p data-testid="best-result">
                {t('best.best', { coords: formatLatLon(dateHits[0].latDeg, dateHits[0].lonDeg), dur: hoursText(dateHits[0]) })}{' '}
                {addButton(dateHits[0].i, dateHits[0].j)}
              </p>
              <ol className="best__list" data-testid="date-hits">
                {dateHits.map((h) => (
                  <li key={`${h.i},${h.j}`}>
                    <button type="button" className="best__row" onClick={() => onFocus(h.i, h.j)}>
                      {formatLatLon(h.latDeg, h.lonDeg)} · {hoursText(h)}
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
    </section>
  );
}
