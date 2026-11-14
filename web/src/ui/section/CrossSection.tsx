// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Cross-section (10_interfaz.md §6.3, F12): terrain profile in the azimuth of the chosen body (512 bins
// of the nearest mask azimuth), smooth sphere, observer and mast, horizon line to the blocking point,
// line of sight to the body centre and a faint fan between the disc edges. Follows the cursor.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { findSegment } from '../../core/ephemeris';
import { blockerAt } from '../../core/horizon';
import { loader } from '../../core/loaders';
import { evaluate } from '../../core/visibility';
import { t } from '../../i18n/t';
import { parseSiteRef } from '../../state/selectors';
import { useAppStore, type FocusBody, type Scenario } from '../../state/store';
import { useBoot } from '../common/data';
import { DataState, useResource } from '../common/DataState';
import type { ScenarioModel } from '../common/model';
import {
  blockerPoint,
  blockerText,
  centreText,
  plotFrame,
  profilePoints,
  profileRow,
  rangeFor,
  sightLine,
  smoothText,
  sphereCurve,
  ticks,
  type XY,
} from './geometry';

const H = 300;
const COLOR = { sun: 'var(--c-sun)', earth: 'var(--c-earth)' } as const;

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(300, el.clientWidth)));
    ro.observe(el);
    setW(Math.max(300, el.clientWidth));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const path = (pts: XY[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('');

export function CrossSection({ model, scenario }: { model: ScenarioModel; scenario: Scenario }) {
  const { config } = useBoot();
  const focus = useAppStore((s) => s.focusBody);
  const setFocus = useAppStore((s) => s.setFocusBody);
  const ref = parseSiteRef(scenario.siteRef);
  const site = model.site;
  const profileFile = !model.smooth && site?.has_profile ? `profile/${site.id}.bin.gz` : null;
  const [profile, retry] = useResource(profileFile, () => loader.loadProfile(config.data_base_url, profileFile ?? ''));

  const toggle = (
    <div className="segmented" role="group" aria-label={t('section.toward')}>
      {(['sun', 'earth'] as FocusBody[]).map((b) => (
        <button key={b} type="button" aria-pressed={focus === b} onClick={() => setFocus(b)}>
          {t(b === 'sun' ? 'section.toward_sun' : 'section.toward_earth')}
        </button>
      ))}
    </div>
  );

  if (ref.kind === 'grid') return <p className="data-state data-state--empty">{t('section.mesh_only')}</p>;
  if (model.smooth) {
    return (
      <div className="section">
        <div className="section__toolbar">{toggle}</div>
        <SectionPlot model={model} scenario={scenario} profileHeights={null} />
        <p className="section__text">{smoothText(model.mask.observerHeightM)}</p>
      </div>
    );
  }
  if (!profileFile) return <p className="data-state data-state--error">{t('section.unavailable')}</p>;
  return (
    <div className="section">
      <div className="section__toolbar">{toggle}</div>
      <DataState resource={profile} loadingText={t('section.loading')} errorText={t('section.unavailable')} onRetry={retry}>
        {(p) => <SectionPlot model={model} scenario={scenario} profileHeights={p} />}
      </DataState>
    </div>
  );
}

function SectionPlot({
  model,
  profileHeights,
}: {
  model: ScenarioModel;
  scenario: Scenario;
  profileHeights: Awaited<ReturnType<typeof loader.loadProfile>> | null;
}) {
  const cursor = useAppStore((s) => s.cursorUnix);
  const focus = useAppStore((s) => s.focusBody);
  const [mode, setMode] = useState<'fit' | 'full'>('fit');
  const [box, w] = useWidth();
  const sky = useMemo(() => (findSegment(model.table, cursor) ? evaluate(model.table, model.frame, model.mask, cursor) : null), [model, cursor]);
  if (!sky) return <p className="data-state data-state--empty">{t('error.range')}</p>;

  const body = sky[focus];
  const hObs = model.mask.observerHeightM;
  const siteH = model.mask.siteHeightM;
  const blocker = blockerAt(model.mask, body.azDeg);
  const range = rangeFor(mode, model.smooth ? Number.NaN : blocker.distM);
  const terrain = profileHeights ? profilePoints(profileHeights, profileRow(body.azDeg), hObs).filter((p) => p.d <= range * 1.02) : [];
  const sphere = sphereCurve(siteH, hObs, range);
  const blk = model.smooth ? null : blockerPoint(blocker, siteH, hObs);
  const f = plotFrame([...terrain, ...sphere, { x: 0, y: 0 }, { x: 0, y: -hObs }, ...(blk ? [blk] : [])], range, w, H);
  const eye = f.px({ x: 0, y: 0 });
  const foot = f.px({ x: 0, y: -hObs });
  const ground = terrain.length ? [f.px({ x: 0, y: -hObs }), ...terrain.map(f.px)] : [];
  const terrainArea = ground.length ? `${path(ground)}L${ground[ground.length - 1].x} ${H}L0 ${H}Z` : '';
  const los = sightLine(body.elDeg, range).map(f.px);
  const lo = sightLine(body.elDeg - body.radiusDeg, range).map(f.px);
  const hi = sightLine(body.elDeg + body.radiusDeg, range).map(f.px);
  const horizonEnd = blk ?? { x: range, y: range * Math.tan((body.horizonDeg * Math.PI) / 180) };
  const bp = blk ? f.px(blk) : null;
  const name = focus === 'sun' ? 'Sun' : 'Earth';
  const xt = ticks(0, range / 1000, Math.max(3, Math.floor(w / 90)));

  return (
    <figure className="section__figure" ref={box}>
      <div className="section__toolbar">
        <button type="button" aria-pressed={mode === 'fit'} onClick={() => setMode('fit')}>
          {t('section.fit')}
        </button>
        <button type="button" aria-pressed={mode === 'full'} onClick={() => setMode('full')}>
          {t('section.full')}
        </button>
        <span className="section__exag" data-testid="exaggeration">
          {t('section.exaggeration', { x: f.exaggeration })}
        </span>
      </div>
      <svg width={w} height={H} role="img" aria-label={t('section.label', { body: name })} aria-describedby="plain-summary" className="section__svg">
        <defs>
          <clipPath id="section-clip">
            <rect width={w} height={H} />
          </clipPath>
        </defs>
        <rect width={w} height={H} className="pano__sky" />
        <g clipPath="url(#section-clip)">
          <path d={`M${eye.x} ${eye.y}L${lo[1].x} ${lo[1].y}L${hi[1].x} ${hi[1].y}Z`} fill={COLOR[focus]} opacity={0.15} data-testid="disc-fan" />
          {terrainArea && <path d={terrainArea} className="pano__terrain" data-testid="terrain" />}
          {terrain.length > 0 && <path d={path(terrain.map(f.px))} className="pano__horizon" />}
          <path d={path(sphere.map(f.px))} className="pano__smooth" data-testid="sphere" />
          <path d={path([eye, f.px(horizonEnd)])} className="section__horizon-line" data-testid="horizon-line" />
          <path d={path(los)} stroke={COLOR[focus]} strokeWidth={2} fill="none" data-testid="sight-line" />
          <line x1={foot.x + 2} y1={foot.y} x2={eye.x + 2} y2={eye.y} className="section__mast" />
          <circle cx={eye.x + 2} cy={eye.y} r={4} className="section__eye" />
          {bp && <circle cx={bp.x} cy={bp.y} r={5} className="section__blocker" data-testid="blocker" />}
        </g>
        <text x={eye.x + 10} y={Math.min(H - 6, eye.y + 16)} className="pano__label">
          {t('section.observer', { h: hObs })}
        </text>
        <text x={w - 6} y={14} textAnchor="end" className="pano__label">
          {t('section.smooth')}
        </text>
        {bp && (
          <text x={Math.min(bp.x, w - 6)} y={Math.max(14, bp.y - 10)} textAnchor={bp.x > w * 0.6 ? 'end' : 'start'} className="pano__label pano__label--ridge" data-testid="blocker-label">
            {blockerText(blocker.distM, blocker.heightM - siteH)}
          </text>
        )}
        {xt.map((km) => (
          <text key={km} x={Math.min(w - 4, (km * 1000 * w) / range)} y={H - 4} textAnchor={km === 0 ? 'start' : 'middle'} className="pano__label">
            {km} km
          </text>
        ))}
      </svg>
      {!model.smooth && <p className="section__text" data-testid="centre-text">{centreText(name, body.marginDeg)}</p>}
    </figure>
  );
}
