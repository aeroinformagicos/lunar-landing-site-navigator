// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Panorama (10_interfaz.md §6.1, F3, F4): 40° view centred on the focus body, horizon zoom ×10 and the
// 360° strip; `Compare with smooth Moon` and the `Terrain effect` box. Drag or arrow keys pan the view
// (it stops following the body until `Centre on …`); the strip jumps to another direction.
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { findSegment } from '../../core/ephemeris';
import { blockerAt, horizonAt, smoothHorizon, smoothMask } from '../../core/horizon';
import { missionMetrics, terrainEffect } from '../../core/metrics';
import { evaluate, type SkyState } from '../../core/visibility';
import { t } from '../../i18n/t';
import { missionEnd, useAppStore, type FocusBody, type Scenario } from '../../state/store';
import { formatMargin, formatPct } from '../common/format';
import type { ScenarioModel } from '../common/model';
import type { MissionResult } from '../metrics/useMission';
import {
  discOf,
  flatLine,
  gridLines,
  horizonLine,
  pathOf,
  project,
  pxPerDeg,
  skyPath,
  stripAzAt,
  stripBracket,
  stripHorizon,
  stripProject,
  terrainPath,
  unproject,
  VIEW_HEIGHT_DEG,
  VIEW_WIDTH_DEG,
  viewCentre,
  ZOOM_HEIGHT_DEG,
  ZOOM_WIDTH_DEG,
  type View,
} from './geometry';
import { bodyTrace, pointerReadout, ridgeLabel, terrainEffectLines } from './texts';

const BODIES: FocusBody[] = ['sun', 'earth'];
const COLOR = { sun: 'var(--c-sun)', earth: 'var(--c-earth)' } as const;
const ZOOM_W = 236;
const STRIP_H = 56;
/** The 40° view keeps the same scale on both axes; its height is capped so the page fits 1280 × 720. */
const VIEW_MAX_H = 200;
/** Zoom, readouts and `Terrain effect` sit beside the 40° view when there is room. */
const SIDE_W = 236;

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(280, el.clientWidth)));
    ro.observe(el);
    setW(Math.max(280, el.clientWidth));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Sky, terrain, optional smooth line and the two discs (visible part filled, outline always). */
function Scene({ v, model, sky, showSmooth, idp }: { v: View; model: ScenarioModel; sky: SkyState; showSmooth: boolean; idp: string }) {
  const line = horizonLine(v, model.mask.elDeg);
  const smoothY = smoothHorizon(model.mask.observerHeightM).elDeg;
  return (
    <>
      <defs>
        <clipPath id={`${idp}-sky`}>
          <path d={skyPath(line)} />
        </clipPath>
      </defs>
      <rect width={v.w} height={v.h} className="pano__sky" />
      {BODIES.map((b) => {
        const d = discOf(v, sky[b]);
        return (
          <g key={b} data-body={b}>
            {/* During an eclipse the Earth is in front of the Sun and shows its night side (F13). */}
            <circle cx={d.cx} cy={d.cy} r={d.r} fill={b === 'earth' && sky.eclipse.kind !== 'none' ? 'var(--c-bg)' : COLOR[b]} clipPath={`url(#${idp}-sky)`} data-testid={`disc-${b}`} />
          </g>
        );
      })}
      <path d={terrainPath(v, line)} className="pano__terrain" />
      <path d={pathOf(line)} className="pano__horizon" />
      {showSmooth && <path d={pathOf(flatLine(v, smoothY))} className="pano__smooth" data-testid="smooth-line" />}
      {BODIES.map((b) => {
        const d = discOf(v, sky[b]);
        return <circle key={b} cx={d.cx} cy={d.cy} r={d.r} fill="none" stroke={COLOR[b]} strokeWidth={1} />;
      })}
    </>
  );
}

export function Panorama({ model, mission, scenario }: { model: ScenarioModel; mission: MissionResult; scenario: Scenario }) {
  const cursor = useAppStore((s) => s.cursorUnix);
  const focus = useAppStore((s) => s.focusBody);
  const setFocus = useAppStore((s) => s.setFocusBody);
  const showSmooth = useAppStore((s) => s.showSmooth);
  const setShowSmooth = useAppStore((s) => s.setShowSmooth);
  const [panAz, setPanAz] = useState<number | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [box, width] = useWidth();
  const drag = useRef<{ x: number; az: number } | null>(null);
  const idp = useId().replace(/:/g, '');

  const sky = useMemo(
    () => (findSegment(model.table, cursor) ? evaluate(model.table, model.frame, model.mask, cursor) : null),
    [model, cursor],
  );
  const trace = useMemo(
    () => bodyTrace(model.table, model.frame, focus, scenario.landingUnix, missionEnd(scenario)),
    [model, focus, scenario],
  );
  const smoothMetrics = useMemo(() => {
    const m = smoothMask(model.mask.observerHeightM, model.latDeg, model.lonDeg);
    return missionMetrics(model.table, model.frame, m, { landingUnix: scenario.landingUnix, missionDays: scenario.missionDays }, scenario.landingUnix);
  }, [model, scenario.landingUnix, scenario.missionDays]);
  const fx = terrainEffect(mission.metrics, smoothMetrics);
  const firstSun = (es: typeof mission.metrics.events) => es.find((e) => e.kind === 'sunrise' || e.kind === 'sunset')?.kind ?? null;
  const lines = terrainEffectLines(fx, firstSun(mission.metrics.events), firstSun(smoothMetrics.events));

  if (!sky) return <p className="data-state data-state--empty">{t('error.range')}</p>;

  const body = sky[focus];
  const side = width >= 2 * VIEW_MAX_H + SIDE_W + 12;
  const viewW = Math.min(side ? width - SIDE_W - 12 : width, 2 * VIEW_MAX_H);
  const centre = viewCentre(model.mask.elDeg, body, panAz);
  const v: View = { az: centre.az, el: centre.el, widthDeg: VIEW_WIDTH_DEG, heightDeg: VIEW_HEIGHT_DEG, w: viewW, h: viewW / 2 };
  const grid = gridLines(v, 5);
  const blocker = blockerAt(model.mask, body.azDeg);
  const ridge = model.smooth ? null : ridgeLabel(blocker.distM);
  const ridgeAt = project(v, blocker.azDeg, blocker.elDeg);
  const k = pxPerDeg(v);
  const zv: View = { az: body.azDeg, el: body.elDeg, widthDeg: ZOOM_WIDTH_DEG, heightDeg: ZOOM_HEIGHT_DEG, w: ZOOM_W, h: ZOOM_W / 2 };
  const zgrid = gridLines(zv, 0.5);
  const sw = width;
  const bodyName = focus === 'sun' ? 'Sun' : 'Earth';

  function onPointerDown(e: React.PointerEvent) {
    drag.current = { x: e.clientX, az: centre.az };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const p = unproject(v, e.clientX - r.left, e.clientY - r.top);
    setHover(pointerReadout(p.az, p.el, horizonAt(model.mask.elDeg, p.az)));
    if (drag.current) setPanAz(drag.current.az - (e.clientX - drag.current.x) / k);
  }
  function onKeyDown(e: React.KeyboardEvent) {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    setPanAz(centre.az + d);
  }
  function onStrip(e: React.PointerEvent<SVGSVGElement>) {
    if (e.type === 'pointermove' && e.buttons === 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    setPanAz(stripAzAt(sw, e.clientX - r.left));
  }
  function centreOn(b: FocusBody) {
    setFocus(b);
    setPanAz(null);
  }

  return (
    <div className="pano" ref={box}>
      <div className="pano__toolbar">
        <div className="segmented" role="group" aria-label={t('pano.centre_on')}>
          {BODIES.map((b) => (
            <button key={b} type="button" aria-pressed={focus === b && panAz === null} onClick={() => centreOn(b)}>
              {t(b === 'sun' ? 'pano.centre_sun' : 'pano.centre_earth')}
            </button>
          ))}
        </div>
        <label className="field__check">
          <input type="checkbox" checked={showSmooth} onChange={(e) => setShowSmooth(e.target.checked)} />
          {t('pano.compare_smooth')}
        </label>
      </div>

      <div className="pano__main">
      <div className="pano__left">
      {/* 1. 40° view */}
      <svg
        className="pano__view"
        width={v.w}
        height={v.h}
        role="img"
        tabIndex={0}
        aria-label={t('pano.view_label', { body: bodyName })}
        aria-describedby={`${idp}-desc`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKeyDown}
      >
        <Scene v={v} model={model} sky={sky} showSmooth={showSmooth} idp={`${idp}-v`} />
        {grid.az.map((g) => (
          <g key={`a${g.label}`}>
            <line x1={g.x} x2={g.x} y1={0} y2={v.h} className="pano__grid" />
            <text x={g.x + 3} y={v.h - 4} className="pano__label">
              {g.label}
            </text>
          </g>
        ))}
        {grid.el.map((g) => (
          <g key={`e${g.label}`}>
            <line x1={0} x2={v.w} y1={g.y} y2={g.y} className="pano__grid" />
            <text x={4} y={g.y - 3} className="pano__label">
              {g.label}
            </text>
          </g>
        ))}
        <path
          d={pathOf(trace.filter((p) => Math.abs(((p.azDeg - v.az + 540) % 360) - 180) < VIEW_WIDTH_DEG / 2 + 2).map((p) => project(v, p.azDeg, p.elDeg)))}
          className="pano__trace"
          stroke={COLOR[focus]}
        />
        {trace
          .filter((p) => p.daily && Math.abs(((p.azDeg - v.az + 540) % 360) - 180) < VIEW_WIDTH_DEG / 2)
          .map((p) => {
            const q = project(v, p.azDeg, p.elDeg);
            return <circle key={p.t} cx={q.x} cy={q.y} r={2.5} fill={COLOR[focus]} className="pano__daily" />;
          })}
        {ridge && ridgeAt.x > 0 && ridgeAt.x < v.w && (
          <g>
            <circle cx={ridgeAt.x} cy={ridgeAt.y} r={3} className="pano__ridge" />
            <text x={ridgeAt.x + 6} y={ridgeAt.y - 6} className="pano__label pano__label--ridge">
              {ridge}
            </text>
          </g>
        )}
        {centre.arrow && (
          <text x={v.w / 2} y={centre.arrow.dir === 'below' ? v.h - 18 : 18} textAnchor="middle" className="pano__label pano__label--arrow">
            {centre.arrow.dir === 'below' ? '↓' : '↑'} {t('pano.horizon_arrow', { deg: centre.arrow.deg, dir: centre.arrow.dir })}
          </text>
        )}
      </svg>
      <p id={`${idp}-desc`} className="pano__readout" aria-live="off">
        {hover ?? ' '}
      </p>
      {!body.visible && <p className="pano__note">{t('pano.below', { body: bodyName })}</p>}
      </div>

      <div className="pano__side">
        {/* 2. Horizon zoom */}
        <figure className="pano__zoom">
          <svg width={zv.w} height={zv.h} role="img" aria-label={t('pano.zoom_label')}>
            <Scene v={zv} model={model} sky={sky} showSmooth={showSmooth} idp={`${idp}-z`} />
            {zgrid.az.map((g) => (
              <line key={`za${g.label}`} x1={g.x} x2={g.x} y1={0} y2={zv.h} className="pano__grid" />
            ))}
            {zgrid.el.map((g) => (
              <line key={`ze${g.label}`} x1={0} x2={zv.w} y1={g.y} y2={g.y} className="pano__grid" />
            ))}
          </svg>
          <figcaption className="pano__label-text">{t('pano.zoom_caption')}</figcaption>
        </figure>
        <div className="pano__zoom-readout">
          {focus === 'sun' && <p data-testid="disc-visible">{t('pano.disc_visible', { pct: formatPct(sky.sun.discFraction * 100) })}</p>}
          <p data-testid="margin">{t('pano.margin', { margin: formatMargin(body.marginDeg) })}</p>
        </div>

        {/* F4: Terrain effect */}
        <section className="pano__effect" aria-labelledby={`${idp}-fx`}>
          <h3 id={`${idp}-fx`}>{t('pano.terrain_effect')}</h3>
          <p>{lines.sunlight}</p>
          <p>{lines.earthLink}</p>
          <p data-testid="first-event-shift">{lines.firstEvent}</p>
        </section>
      </div>
      </div>

      {/* 3. 360° strip */}
      <svg
        className="pano__strip"
        width={sw}
        height={STRIP_H}
        role="slider"
        tabIndex={0}
        aria-label={t('pano.strip_label')}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(centre.az)}
        aria-valuetext={`${Math.round(centre.az)}°`}
        onPointerDown={onStrip}
        onPointerMove={onStrip}
        onKeyDown={onKeyDown}
      >
        <rect width={sw} height={STRIP_H} className="pano__sky" />
        <path d={`${pathOf(stripHorizon(sw, STRIP_H, model.mask.elDeg))}L${sw} ${STRIP_H}L0 ${STRIP_H}Z`} className="pano__terrain" />
        {stripBracket(sw, centre.az).map((b, i) => (
          <rect key={i} x={b.x} y={1} width={b.w} height={STRIP_H - 2} className="pano__bracket" />
        ))}
        {BODIES.map((b) => {
          const p = stripProject(sw, STRIP_H, sky[b].azDeg, sky[b].elDeg);
          return <circle key={b} cx={p.x} cy={p.y} r={4} fill={COLOR[b]} stroke="var(--c-bg)" />;
        })}
        {['N', 'E', 'S', 'W'].map((c, i) => (
          <text key={c} x={(i * sw) / 4 + 3} y={12} className="pano__label">
            {c}
          </text>
        ))}
      </svg>
    </div>
  );
}
