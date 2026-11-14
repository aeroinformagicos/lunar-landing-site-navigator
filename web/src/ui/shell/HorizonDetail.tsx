// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// `Horizon detail` in the Now at site panel (15_interfaz_v2.md §5.2): the ×10 horizon zoom, the
// visible share of the solar disc, the margin and the `Terrain effect` box (F4). Folded by default;
// the smooth-Moon mission is only computed while it is open.
import { useId, useMemo } from 'react';
import { findSegment } from '../../core/ephemeris';
import { horizonAt, smoothHorizon, smoothMask } from '../../core/horizon';
import { missionMetrics, terrainEffect } from '../../core/metrics';
import { evaluate } from '../../core/visibility';
import { t } from '../../i18n/t';
import { useAppStore } from '../../state/store';
import { formatMargin, formatPct } from '../common/format';
import { CHART_DESCRIBEDBY } from '../metrics/ChartData';
import { discOf, flatLine, gridLines, horizonLine, pathOf, skyPath, terrainPath, zoomView } from '../panorama/geometry';
import { terrainEffectLines } from '../panorama/texts';
import { useActive, type ActiveReady } from './useActive';

const ZOOM_W = 254;

export function HorizonDetail({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const { resource } = useActive();
  const id = useId();
  return (
    <section className="v2-detail" aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`} className="v2-detail__h">
        <button type="button" className="v2-detail__toggle" aria-expanded={open} aria-controls={`${id}-b`} onClick={() => setOpen(!open)}>
          <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
            <path d={open ? 'M2 5l5 5 5-5' : 'M5 2l5 5-5 5'} fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          {t('panel.horizon_detail')}
        </button>
      </h3>
      {open && (
        <div id={`${id}-b`}>
          {resource.status === 'ready' ? <Detail data={resource.data} /> : <p className="v2-note">{t('common.loading')}</p>}
        </div>
      )}
    </section>
  );
}

function Detail({ data }: { data: ActiveReady }) {
  const { scenario } = useActive();
  const { model, mission } = data;
  const cursor = useAppStore((s) => s.cursorUnix);
  const focus = useAppStore((s) => s.focusBody);
  const showSmooth = useAppStore((s) => s.showSmooth);
  const idp = useId().replace(/:/g, '');
  const sky = useMemo(() => (findSegment(model.table, cursor) ? evaluate(model.table, model.frame, model.mask, cursor) : null), [model, cursor]);
  const lines = useMemo(() => {
    const m = smoothMask(model.mask.observerHeightM, model.latDeg, model.lonDeg);
    const smooth = missionMetrics(model.table, model.frame, m, { landingUnix: scenario.landingUnix, missionDays: scenario.missionDays }, scenario.landingUnix);
    const first = (es: typeof smooth.events) => es.find((e) => e.kind === 'sunrise' || e.kind === 'sunset')?.kind ?? null;
    return terrainEffectLines(terrainEffect(mission.metrics, smooth), first(mission.metrics.events), first(smooth.events));
  }, [model, mission, scenario.landingUnix, scenario.missionDays]);
  if (!sky) return <p className="v2-note">{t('error.range')}</p>;

  const body = sky[focus];
  const zoom = zoomView(body, horizonAt(model.mask.elDeg, body.azDeg), ZOOM_W);
  const zv = zoom.view;
  const line = horizonLine(zv, model.mask.elDeg);
  const zgrid = gridLines(zv, zoom.gridDeg);
  const caption =
    zoom.factor === 10 ? t('pano.zoom_caption') : t('pano.zoom_caption_scaled', { x: zoom.factor >= 2 ? Math.round(zoom.factor) : zoom.factor.toFixed(1), g: zoom.gridDeg });

  return (
    <>
      <figure className="v2-zoom">
        <svg width={zv.w} height={zv.h} role="img" aria-label={t('pano.zoom_label')} aria-describedby={CHART_DESCRIBEDBY}>
          <defs>
            <clipPath id={`${idp}-sky`}>
              <path d={skyPath(line)} />
            </clipPath>
          </defs>
          <rect width={zv.w} height={zv.h} fill="#05080f" />
          {zgrid.az.map((g) => (
            <line key={`a${g.label}`} x1={g.x} x2={g.x} y1={0} y2={zv.h} className="v2-zoom__grid" />
          ))}
          {zgrid.el.map((g) => (
            <line key={`e${g.label}`} x1={0} x2={zv.w} y1={g.y} y2={g.y} className="v2-zoom__grid" />
          ))}
          {(['earth', 'sun'] as const).map((b) => {
            const d = discOf(zv, sky[b]);
            return <circle key={b} cx={d.cx} cy={d.cy} r={d.r} fill={b === 'sun' ? 'var(--c-sun)' : 'var(--c-earth)'} clipPath={`url(#${idp}-sky)`} />;
          })}
          <path d={terrainPath(zv, line)} fill="#1e293b" />
          <path d={pathOf(line)} fill="none" stroke="var(--c-text)" strokeWidth={1.4} />
          {showSmooth && <path d={pathOf(flatLine(zv, smoothHorizon(model.mask.observerHeightM).elDeg))} className="v2-scene__smooth" />}
          {(['earth', 'sun'] as const).map((b) => {
            const d = discOf(zv, sky[b]);
            return <circle key={`o${b}`} cx={d.cx} cy={d.cy} r={d.r} fill="none" stroke={b === 'sun' ? 'var(--c-sun)' : 'var(--c-earth)'} strokeWidth={1} />;
          })}
        </svg>
        <figcaption className="v2-zoom__caption">{caption}</figcaption>
      </figure>
      <dl className="v2-dl v2-dl--tight">
        {focus === 'sun' && (
          <div className="v2-dl__row" data-testid="disc-visible">
            <dt>{t('now.disc')}</dt>
            <dd className="v2-dl__v v2-dl__v--sun">{formatPct(sky.sun.discFraction * 100)}</dd>
          </div>
        )}
        <div className="v2-dl__row" data-testid="margin">
          <dt>{t('pano.margin', { margin: '' }).replace(/:\s*$/, '')}</dt>
          <dd className={`v2-dl__v v2-dl__v--${focus}`}>{formatMargin(body.marginDeg)}</dd>
        </div>
      </dl>
      <section className="v2-effect" aria-label={t('pano.terrain_effect')}>
        <h4 className="v2-effect__h">{t('pano.terrain_effect')}</h4>
        <p>{lines.sunlight}</p>
        <p>{lines.earthLink}</p>
        <p data-testid="first-event-shift">{lines.firstEvent}</p>
      </section>
    </>
  );
}
