// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Full-width 2D view of the v2 (15_interfaz_v2.md §4.2, §4.3): the 40° panorama of 10 §6.1 drawn
// under the whole shell, with the horizon at 58 % of the height, both mission traces, the Sun's glow,
// the Earth with its phase, labels on the canvas («Sun · behind the ridge») and the 360° strip on top.
// Same projection and data as the v1 panorama: only the presentation changes.
import { useContext, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { findSegment } from '../../core/ephemeris';
import { blockerAt, horizonAt, smoothHorizon } from '../../core/horizon';
import { evaluate } from '../../core/visibility';
import { t } from '../../i18n/t';
import { missionEnd, useAppStore } from '../../state/store';
import { formatDeg, formatMargin, formatPct } from '../common/format';
import { CHART_DESCRIBEDBY } from '../metrics/ChartData';
import { azDelta, flatLine, gridLines, horizonLine, pathOf, project, pxPerDeg, skyPath, stripAzAt, stripBracket, stripHorizon, stripProject, terrainPath, unproject, VIEW_WIDTH_DEG } from '../panorama/geometry';
import { bodyTrace, pointerReadout, ridgeLabel } from '../panorama/texts';
import { earthPhase, horizonFracFor, phasePath, placeLabels, stageView, type LabelBox } from './horizon2d';
import { BottomStripContext, useActive, type ActiveReady } from './useActive';

const STRIP_H = 30;
const COLOR = { sun: 'var(--c-sun)', earth: 'var(--c-earth)' } as const;

function useSize(): [React.RefObject<HTMLDivElement | null>, { w: number; h: number }] {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1280, h: 720 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setSize({ w: Math.max(320, el.clientWidth), h: Math.max(240, el.clientHeight) });
    const ro = new ResizeObserver(set);
    ro.observe(el);
    set();
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

/** Decorative contour arcs under the horizon (mockup), scaled to the stage. `aria-hidden`. */
function contourPaths(w: number, h: number, horizonY: number): string[] {
  const sx = w / 1440;
  const sy = h / 900;
  return [
    [70, 28],
    [130, 68],
    [220, 130],
    [350, 224],
  ].map(([edge, mid]) => {
    const e = horizonY + edge * sy;
    const m = horizonY + mid * sy;
    return `M0 ${e.toFixed(1)} C${300 * sx} ${(m + 12 * sy).toFixed(1)} ${520 * sx} ${m.toFixed(1)} ${720 * sx} ${m.toFixed(1)} C${920 * sx} ${m.toFixed(1)} ${1140 * sx} ${(m + 12 * sy).toFixed(1)} ${w} ${(e - 10 * sy).toFixed(1)}`;
  });
}

export function Stage2D() {
  const { resource } = useActive();
  const [box, size] = useSize();
  return (
    <div className="v2-stage2d" ref={box} data-view="2d">
      {resource.status === 'ready' ? (
        <Scene data={resource.data} w={size.w} h={size.h} />
      ) : (
        <p className="v2-stage__loading" role="status">
          {resource.status === 'error' ? t('pano.unavailable') : t('common.loading')}
        </p>
      )}
    </div>
  );
}

function Scene({ data, w, h }: { data: ActiveReady; w: number; h: number }) {
  const { scenario } = useActive();
  const { model } = data;
  const cursor = useAppStore((s) => s.cursorUnix);
  const focus = useAppStore((s) => s.focusBody);
  const showSmooth = useAppStore((s) => s.showSmooth);
  const bottomStrip = useContext(BottomStripContext);
  const [panAz, setPanAz] = useState<number | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const drag = useRef<{ x: number; az: number } | null>(null);
  const idp = useId().replace(/:/g, '');

  // Back to following the body when the user chooses `Centre on …` (focus changes).
  const lastFocus = useRef(focus);
  if (lastFocus.current !== focus) {
    lastFocus.current = focus;
    if (panAz !== null) setPanAz(null);
  }

  const sky = useMemo(() => (findSegment(model.table, cursor) ? evaluate(model.table, model.frame, model.mask, cursor) : null), [model, cursor]);
  const traces = useMemo(
    () => ({
      sun: bodyTrace(model.table, model.frame, 'sun', scenario.landingUnix, missionEnd(scenario)),
      earth: bodyTrace(model.table, model.frame, 'earth', scenario.landingUnix, missionEnd(scenario)),
    }),
    [model, scenario],
  );
  if (!sky) return <p className="v2-stage__loading">{t('error.range')}</p>;

  const body = sky[focus];
  // The bottom strip's measured height keeps the horizon clear of it.
  const stripPx = w < 768 ? 0 : bottomStrip || 0.4 * h; // phones: the strip is below the scene, not over it
  const { view: v, arrow } = stageView(w, h, model.mask.elDeg, body, panAz, horizonFracFor(h, stripPx));
  const k = pxPerDeg(v);
  const line = horizonLine(v, model.mask.elDeg);
  const grid = gridLines(v, 5);
  const inView = (az: number, pad = 2) => Math.abs(azDelta(az, v.az)) < VIEW_WIDTH_DEG / 2 + pad;
  const tracePath = (b: 'sun' | 'earth') => pathOf(traces[b].filter((p) => inView(p.azDeg)).map((p) => project(v, p.azDeg, p.elDeg)));
  const smoothEl = smoothHorizon(model.mask.observerHeightM).elDeg;

  const sunP = project(v, sky.sun.azDeg, sky.sun.elDeg);
  const sunR = Math.max(sky.sun.radiusDeg * k, 6);
  const earthP = project(v, sky.earth.azDeg, sky.earth.elDeg);
  const earthR = Math.max(sky.earth.radiusDeg * k, 16);
  const phase = earthPhase(sky.sun, sky.earth);
  const eclipse = sky.eclipse.kind !== 'none';

  // Labels: name and data per body (15 §4.3).
  const sunBlock = blockerAt(model.mask, sky.sun.azDeg);
  const sunHorizon = horizonAt(model.mask.elDeg, sky.sun.azDeg);
  const sunBehindRidge = !sky.sun.visible && sky.sun.elDeg > smoothEl && !model.smooth;
  const ridgeSun = ridgeLabel(sunBlock.distM);
  const sunName = sky.sun.visible ? t('stage.sun') : sunBehindRidge ? t('stage.sun_behind_ridge') : t('stage.sun_below');
  const sunData = `${formatDeg(sky.sun.elDeg)} · ${t('stage.margin', { margin: formatMargin(sky.sun.marginDeg) })}${sunBehindRidge && ridgeSun ? ` · ${ridgeSun.toLowerCase()}` : ''}`;
  const earthName = sky.earth.visible ? t('stage.earth') : t('stage.earth_below');
  const earthData = `${formatDeg(sky.earth.elDeg)} · ${t('stage.margin', { margin: formatMargin(sky.earth.marginDeg) })}`;
  const crest = project(v, sky.sun.azDeg, sunHorizon);

  const raw: (LabelBox & { lines: [string, string]; tone: 'sun' | 'earth'; anchor: { x: number; y: number } })[] = [];
  if (inView(sky.sun.azDeg, 0)) {
    const ax = sunBehindRidge ? crest.x : sunP.x + sunR;
    const ay = sunBehindRidge ? crest.y - 62 : sunP.y - 18;
    raw.push({ id: 'sun', x: ax + 12, y: ay - 14, w: Math.max(sunName.length * 7.6, sunData.length * 7.3), h: 34, lines: [sunName, sunData], tone: 'sun', anchor: { x: ax, y: ay } });
  }
  if (inView(sky.earth.azDeg, 0)) {
    raw.push({ id: 'earth', x: earthP.x + earthR + 10, y: earthP.y - 18, w: Math.max(earthName.length * 7.6, earthData.length * 7.3), h: 34, lines: [earthName, earthData], tone: 'earth', anchor: { x: earthP.x, y: earthP.y } });
  }
  const labels = placeLabels(raw).map((b, i) => ({ ...raw[i], x: Math.min(b.x, w - b.w - 16), y: Math.max(STRIP_H + 8, b.y) }));

  const focusBlock = blockerAt(model.mask, body.azDeg);
  const ridgeFocus = focus === 'earth' && !model.smooth ? ridgeLabel(focusBlock.distM) : null;
  const ridgeAt = project(v, focusBlock.azDeg, focusBlock.elDeg);

  function onPointerDown(e: React.PointerEvent) {
    drag.current = { x: e.clientX, az: v.az };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const p = unproject(v, x, y);
    setHover({ x, y, text: pointerReadout(p.az, p.el, horizonAt(model.mask.elDeg, p.az)) });
    if (drag.current) setPanAz(drag.current.az - (e.clientX - drag.current.x) / k);
  }
  function onKeyDown(e: React.KeyboardEvent) {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    setPanAz(v.az + d);
  }
  function onStrip(e: React.PointerEvent<SVGSVGElement>) {
    if (e.type === 'pointermove' && e.buttons === 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    setPanAz(stripAzAt(w, e.clientX - r.left));
  }

  const bodyName = focus === 'sun' ? 'Sun' : 'Earth';
  const glowRx = 260 * (w / 1440);
  const glowRy = 70 * (w / 1440);
  const ground = project(v, v.az, horizonAt(model.mask.elDeg, v.az)).y;

  return (
    <>
      <svg
        className="v2-scene"
        width={w}
        height={h}
        role="img"
        tabIndex={0}
        aria-label={t('pano.view_label', { body: bodyName })}
        aria-describedby={`${idp}-desc ${CHART_DESCRIBEDBY}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKeyDown}
      >
        <defs>
          <linearGradient id={`${idp}-ground`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1E293B" />
            <stop offset="0.5" stopColor="#111827" />
            <stop offset="1" stopColor="#0A0E17" />
          </linearGradient>
          <radialGradient id={`${idp}-glow`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#F59E0B" stopOpacity="0.45" />
            <stop offset="1" stopColor="#F59E0B" stopOpacity="0" />
          </radialGradient>
          <clipPath id={`${idp}-sky`}>
            <path d={skyPath(line)} />
          </clipPath>
        </defs>

        {/* Elevation ruler on the left (every 5°). */}
        <g aria-hidden="true">
          {grid.el.filter((g) => g.y > STRIP_H + 36).map((g) => (
            <g key={`e${g.label}`}>
              <line x1={0} x2={10} y1={g.y} y2={g.y} className="v2-scene__tick" />
              <text x={16} y={g.y + 4} className="v2-scene__axis">
                {g.label}
              </text>
            </g>
          ))}
        </g>

        {inView(sky.sun.azDeg, 20) && <ellipse cx={sunP.x} cy={Math.max(sunP.y, ground - 10)} rx={glowRx} ry={glowRy} fill={`url(#${idp}-glow)`} aria-hidden="true" />}
        <path d={tracePath('earth')} className="v2-scene__trace v2-scene__trace--earth" aria-hidden="true" />
        <path d={tracePath('sun')} className="v2-scene__trace v2-scene__trace--sun" aria-hidden="true" />
        {traces[focus]
          .filter((p) => p.daily && inView(p.azDeg, 0))
          .map((p) => {
            const q = project(v, p.azDeg, p.elDeg);
            return <circle key={p.t} cx={q.x} cy={q.y} r={2.5} fill={COLOR[focus]} aria-hidden="true" />;
          })}

        {/* Earth: dark disc with its lit phase, behind the terrain. */}
        <g clipPath={`url(#${idp}-sky)`}>
          {sky.earth.visible && <line x1={earthP.x} x2={earthP.x} y1={earthP.y + earthR + 4} y2={ground} className="v2-scene__drop" aria-hidden="true" />}
          <circle cx={earthP.x} cy={earthP.y} r={earthR} fill="var(--c-bg-0)" data-testid="disc-earth" />
          {!eclipse && <path d={phasePath(earthP.x, earthP.y, earthR, phase.lit, phase.towardSunRad)} fill="var(--c-earth)" />}
          <circle cx={sunP.x} cy={sunP.y} r={sunR} fill="var(--c-sun)" data-testid="disc-sun" />
        </g>
        <circle cx={earthP.x} cy={earthP.y} r={earthR} fill="none" stroke="var(--c-earth)" strokeWidth={1.5} />

        <path d={terrainPath(v, line)} fill={`url(#${idp}-ground)`} />
        <g fill="none" className="v2-scene__contour" aria-hidden="true">
          {contourPaths(w, h, ground).map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        <path d={pathOf(line)} className="v2-scene__horizon" />
        {showSmooth && <path d={pathOf(flatLine(v, smoothEl))} className="v2-scene__smooth" data-testid="smooth-line" />}

        {/* The Sun's outline: solid when its centre is up, dashed when hidden. */}
        <circle
          cx={sunP.x}
          cy={sunP.y}
          r={Math.max(sunR, 10)}
          fill="none"
          stroke="var(--c-sun)"
          strokeWidth={1.5}
          strokeDasharray={sky.sun.visible ? undefined : '3 3'}
        />

        {sunBehindRidge && inView(sky.sun.azDeg, 0) && (
          <g aria-hidden="true">
            <line x1={crest.x} x2={crest.x} y1={crest.y} y2={crest.y - 62} className="v2-scene__leader" />
            <circle cx={crest.x} cy={crest.y} r={3} fill="var(--c-text)" />
          </g>
        )}
        {ridgeFocus && ridgeAt.x > 0 && ridgeAt.x < w && (
          <g>
            <circle cx={ridgeAt.x} cy={ridgeAt.y} r={3} fill="var(--c-text)" />
            <text x={ridgeAt.x + 8} y={ridgeAt.y - 8} className="v2-scene__name">
              {ridgeFocus}
            </text>
          </g>
        )}

        {labels.map((l) => (
          <g key={l.id} data-label={l.id}>
            <text x={l.x} y={l.y + 13} className="v2-scene__name">
              {l.lines[0]}
            </text>
            <text x={l.x} y={l.y + 31} className={`v2-scene__data v2-scene__data--${l.tone}`}>
              {l.lines[1]}
            </text>
          </g>
        ))}
        {eclipse && inView(sky.sun.azDeg, 0) && (
          <text x={sunP.x + sunR + 12} y={sunP.y + 40} className="v2-scene__data v2-scene__data--eclipse">
            ◑ {t('stage.eclipse', { pct: formatPct(sky.eclipse.covered * 100) })}
          </text>
        )}

        {/* Azimuth ruler on top, under the 360° strip (mockup). */}
        <g aria-hidden="true">
          {grid.az.map((g) => (
            <g key={`a${g.label}`}>
              <line x1={g.x} x2={g.x} y1={STRIP_H} y2={STRIP_H + 6} className="v2-scene__tick" />
              <text x={g.x} y={STRIP_H + 19} textAnchor="middle" className="v2-scene__axis">
                {g.label}
              </text>
            </g>
          ))}
        </g>

        {arrow && (
          <text x={w / 2} y={arrow.dir === 'below' ? h * 0.75 : STRIP_H + 60} textAnchor="middle" className="v2-scene__name">
            {arrow.dir === 'below' ? '↓' : '↑'} {t('pano.horizon_arrow', { deg: arrow.deg, dir: arrow.dir })}
          </text>
        )}
      </svg>

      {hover && (
        <span className="v2-scene__hover" style={{ left: Math.min(hover.x + 14, w - 260), top: hover.y + 14 }} aria-hidden="true">
          {hover.text}
        </span>
      )}
      <p id={`${idp}-desc`} className="visually-hidden">
        {hover?.text ?? ''} {!body.visible ? t('pano.below', { body: bodyName }) : ''}
      </p>

      {/* 360° strip across the top: drag or arrows move the 40° window (10 §6.1). */}
      <svg
        className="v2-strip"
        width={w}
        height={STRIP_H}
        role="slider"
        tabIndex={0}
        aria-label={t('pano.strip_label')}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(v.az)}
        aria-valuetext={`${Math.round(v.az)}°`}
        onPointerDown={onStrip}
        onPointerMove={onStrip}
        onKeyDown={onKeyDown}
      >
        <path d={`${pathOf(stripHorizon(w, STRIP_H, model.mask.elDeg))}L${w} ${STRIP_H}L0 ${STRIP_H}Z`} className="v2-strip__ground" />
        {stripBracket(w, v.az).map((b, i) => (
          <rect key={i} x={b.x} y={1} width={b.w} height={STRIP_H - 2} className="v2-strip__bracket" />
        ))}
        {(['sun', 'earth'] as const).map((b) => {
          const p = stripProject(w, STRIP_H, sky[b].azDeg, sky[b].elDeg);
          return <circle key={b} cx={p.x} cy={p.y} r={3} fill={COLOR[b]} />;
        })}
        {['N', 'E', 'S', 'W'].map((c, i) => (
          <text key={c} x={(i * w) / 4 + 4} y={STRIP_H - 9} className="v2-scene__axis">
            {c}
          </text>
        ))}
      </svg>
    </>
  );
}
