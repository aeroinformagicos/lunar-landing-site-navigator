// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Timeline (10_interfaz.md §6.2, F5): Sun and Earth elevation curves and the horizon at their
// azimuth (Canvas: > 2,000 points, 02 §8), 0° line, day ticks, mission zone, three bars with their
// patterns, event markers and a draggable cursor (SVG). Pointer readout; arrows ±10 min with focus.
// A legend row names every line and bar and shows the cursor's mission day and time in large type (T-64 d).
import { CHART_DESCRIBEDBY } from '../metrics/ChartData';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { evaluate } from '../../core/visibility';
import { findSegment } from '../../core/ephemeris';
import { t } from '../../i18n/t';
import { SLIDER_STEP_S } from '../../state/selectors';
import { missionEnd, useAppStore, type Scenario } from '../../state/store';
import { formatDeg, formatMargin, formatMissionDay, formatUtc } from '../common/format';
import type { ScenarioModel } from '../common/model';
import type { MissionResult } from '../metrics/useMission';
import { barSegments, cursorFromX, dayTicks, elevationDomain, eventLabel, timeScale } from './scale';

const H = 360;
const PAD_L = 62; // P-09 (D-157): room for «-21.17°» (was 44: the minus sign was cut off)
const PAD_R = 12;
const PLOT_TOP = 10;
const PLOT_H = 200;
const AXIS_H = 34;
const BAR_H = 18;
const BAR_GAP = 6;
const BARS_TOP = PLOT_TOP + PLOT_H + AXIS_H;

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(800);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(320, el.clientWidth)));
    ro.observe(el);
    setW(Math.max(320, el.clientWidth));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function Timeline({ model, mission, scenario }: { model: ScenarioModel; mission: MissionResult; scenario: Scenario }) {
  const cursor = useAppStore((s) => s.cursorUnix);
  const setCursor = useAppStore((s) => s.setCursor);
  const [box, width] = useWidth<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const dragging = useRef(false);

  const { curves: c, metrics, range, eclipse } = mission;
  const end = missionEnd(scenario);
  const x = useMemo(() => timeScale(range.t0, range.t1, PAD_L, width - PAD_R), [range, width]);
  const dom = useMemo(() => elevationDomain(c), [c]);
  const y = (el: number) => PLOT_TOP + ((dom.max - el) / (dom.max - dom.min)) * PLOT_H;
  const ticks = useMemo(() => dayTicks(scenario.landingUnix, range.t0, range.t1), [scenario.landingUnix, range]);
  const tickStep = Math.max(1, Math.ceil(ticks.length / Math.max(1, Math.floor(width / 70))));

  // Curves on Canvas, redrawn only when the curves or the size change (10 §13), never with the cursor.
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(width * dpr);
    cv.height = Math.round((PLOT_TOP + PLOT_H) * dpr);
    const g = cv.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, PLOT_TOP + PLOT_H);
    const line = (vals: Float64Array, color: string, dashed: boolean, lw: number) => {
      g.beginPath();
      g.strokeStyle = color;
      g.lineWidth = lw;
      g.setLineDash(dashed ? [5, 4] : []);
      let pen = false;
      for (let i = 0; i < vals.length; i++) {
        const v = vals[i];
        if (Number.isNaN(v)) {
          pen = false;
          continue;
        }
        const px = x.x(c.t[i]);
        const py = PLOT_TOP + ((dom.max - v) / (dom.max - dom.min)) * PLOT_H;
        if (pen) g.lineTo(px, py);
        else g.moveTo(px, py);
        pen = true;
      }
      g.stroke();
    };
    const sun = cssVar('--c-sun');
    const earth = cssVar('--c-earth');
    line(c.sunHorizonDeg, sun, true, 1);
    line(c.earthHorizonDeg, earth, true, 1);
    line(c.sunElDeg, sun, false, 2);
    line(c.earthElDeg, earth, false, 2);
  }, [c, x, dom, width]);

  function tAt(clientX: number): number {
    const rect = box.current!.getBoundingClientRect();
    return cursorFromX(clientX - rect.left, x, scenario.landingUnix, end);
  }

  function onPointerDown(e: React.PointerEvent) {
    dragging.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setCursor(tAt(e.clientX));
  }

  function onPointerMove(e: React.PointerEvent) {
    const rect = box.current!.getBoundingClientRect();
    setHoverT(x.t(e.clientX - rect.left));
    if (dragging.current) setCursor(tAt(e.clientX));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const d = e.key === 'ArrowRight' ? SLIDER_STEP_S : e.key === 'ArrowLeft' ? -SLIDER_STEP_S : 0;
    if (!d) return;
    e.preventDefault();
    setCursor(cursor + d);
  }

  const readout = useMemo(() => {
    if (hoverT === null || !findSegment(model.table, hoverT)) return null;
    const s = evaluate(model.table, model.frame, model.mask, hoverT);
    return t('timeline.readout', {
      time: formatUtc(hoverT),
      sunEl: formatDeg(s.sun.elDeg),
      sunMargin: formatMargin(s.sun.marginDeg),
      earthEl: formatDeg(s.earth.elDeg),
      earthMargin: formatMargin(s.earth.marginDeg),
    });
  }, [hoverT, model]);

  const bars = [
    { key: 'sun', label: t('timeline.sun'), ws: metrics.windows.sun, fill: 'url(#pat-sun)' },
    { key: 'earth', label: t('timeline.earth'), ws: metrics.windows.earth, fill: 'url(#pat-earth)' },
    { key: 'both', label: t('timeline.both'), ws: metrics.windows.both, fill: 'url(#pat-both)' },
  ];
  const cx = x.x(cursor);
  const y0 = y(0);

  return (
    <figure className="timeline">
      <div className="timeline__legend">
        <span className="timeline__key timeline__key--sun">
          <i aria-hidden="true" />
          {t('timeline.legend_sun_el')}
        </span>
        <span className="timeline__key timeline__key--earth">
          <i aria-hidden="true" />
          {t('timeline.legend_earth_el')}
        </span>
        <span className="timeline__key timeline__key--horizon">
          <i aria-hidden="true" />
          {t('timeline.legend_horizon')}
        </span>
        <span className="timeline__key timeline__key--bars">
          <i aria-hidden="true" />
          {t('timeline.legend_bars')}
        </span>
        <span className="timeline__now" data-testid="timeline-now">
          <span className="timeline__now-day">{formatMissionDay(cursor - scenario.landingUnix)}</span>
          <span className="timeline__now-utc">{formatUtc(cursor)}</span>
        </span>
      </div>
      <div
        ref={box}
        className="timeline__plot"
        tabIndex={0}
        role="slider"
        aria-label={t('timeline.label')}
        aria-valuemin={scenario.landingUnix}
        aria-valuemax={end}
        aria-valuenow={cursor}
        aria-valuetext={formatUtc(cursor)}
        aria-describedby={CHART_DESCRIBEDBY}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (dragging.current = false)}
        onPointerLeave={() => setHoverT(null)}
        style={{ height: H }}
      >
        <canvas ref={canvas} className="timeline__canvas" style={{ width, height: PLOT_TOP + PLOT_H }} aria-hidden="true" />
        <svg className="timeline__svg" width={width} height={H} aria-hidden="true">
          <defs>
            <pattern id="pat-sun" width="6" height="6" patternUnits="userSpaceOnUse">
              <rect width="6" height="6" fill="var(--c-sun)" />
            </pattern>
            <pattern id="pat-earth" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="var(--c-surface)" />
              <rect width="3" height="6" fill="var(--c-earth)" />
            </pattern>
            <pattern id="pat-both" width="6" height="6" patternUnits="userSpaceOnUse">
              <rect width="6" height="6" fill="var(--c-both)" />
              <path d="M0 0H6M0 0V6" stroke="var(--c-surface)" strokeWidth="1.5" />
            </pattern>
            <pattern id="pat-eclipse" width="6" height="6" patternUnits="userSpaceOnUse">
              <rect width="2" height="6" fill="var(--c-eclipse)" />
            </pattern>
          </defs>
          {/* Eclipse band (07 §9, F13): partial phases striped, totality denser */}
          {eclipse.windows.map((ew) => (
            <g key={`e${ew.startUnix}`} data-testid="eclipse-band">
              <rect x={x.x(ew.startUnix)} y={PLOT_TOP} width={Math.max(2, x.x(ew.endUnix) - x.x(ew.startUnix))} height={PLOT_H} fill="url(#pat-eclipse)" opacity={0.55} />
              <text x={x.x(ew.startUnix) + 3} y={PLOT_TOP + 12} className="timeline__label timeline__label--eclipse">
                {t('timeline.eclipse')}
              </text>
            </g>
          ))}
          {eclipse.totality.map((tw) => (
            <rect key={`t${tw.startUnix}`} x={x.x(tw.startUnix)} y={PLOT_TOP} width={Math.max(2, x.x(tw.endUnix) - x.x(tw.startUnix))} height={PLOT_H} fill="var(--c-eclipse)" opacity={0.35} data-testid="totality-band" />
          ))}
          {/* Mission zone */}
          {/* P-09 (D-157): the plot frame covers the whole time axis, so the curves before and after the mission stay inside the chart. */}
          <rect x={PAD_L} y={PLOT_TOP} width={Math.max(0, width - PAD_R - PAD_L)} height={PLOT_H} className="timeline__frame" />
          <rect x={x.x(scenario.landingUnix)} y={PLOT_TOP} width={x.x(end) - x.x(scenario.landingUnix)} height={PLOT_H} className="timeline__mission" />
          {/* 0° line and elevation labels */}
          {y0 >= PLOT_TOP && y0 <= PLOT_TOP + PLOT_H && <line x1={PAD_L} x2={width - PAD_R} y1={y0} y2={y0} className="timeline__zero" />}
          <text x={PAD_L - 6} y={PLOT_TOP + 10} textAnchor="end" className="timeline__label">
            {formatDeg(dom.max).replace('.00', '')}
          </text>
          <text x={PAD_L - 6} y={PLOT_TOP + PLOT_H} textAnchor="end" className="timeline__label">
            {formatDeg(dom.min).replace('.00', '')}
          </text>
          {y0 >= PLOT_TOP + 14 && y0 <= PLOT_TOP + PLOT_H - 14 && (
            <text x={PAD_L - 6} y={y0 + 4} textAnchor="end" className="timeline__label">
              0°
            </text>
          )}
          {/* Day ticks */}
          {ticks
            .filter((tk, i) => i % tickStep === 0 && x.x(tk.t) >= PAD_L + 30 && x.x(tk.t) <= width - PAD_R - 34)
            .map((tk) => (
              <g key={tk.t}>
                <line x1={x.x(tk.t)} x2={x.x(tk.t)} y1={PLOT_TOP} y2={PLOT_TOP + PLOT_H + 4} className="timeline__tick" />
                <text x={x.x(tk.t)} y={PLOT_TOP + PLOT_H + 16} textAnchor="middle" className="timeline__label">
                  Day {tk.day}
                </text>
                <text x={x.x(tk.t)} y={PLOT_TOP + PLOT_H + 29} textAnchor="middle" className="timeline__label timeline__label--date">
                  {tk.date}
                </text>
              </g>
            ))}
          {/* Bars */}
          {bars.map((b, i) => {
            const top = BARS_TOP + i * (BAR_H + BAR_GAP);
            return (
              <g key={b.key}>
                <text x={PAD_L - 6} y={top + BAR_H - 4} textAnchor="end" className={`timeline__label timeline__label--bar timeline__label--${b.key}`}>
                  {b.label.replace('Sun + Earth', 'Both')}
                </text>
                <rect x={x.x(scenario.landingUnix)} y={top} width={x.x(end) - x.x(scenario.landingUnix)} height={BAR_H} className="timeline__bar-bg" />
                {barSegments(b.ws, x).map((s, k) => (
                  <rect key={k} x={s.x} y={top} width={Math.max(1, s.w)} height={BAR_H} fill={b.fill} data-bar={b.key} />
                ))}
              </g>
            );
          })}
          {/* Cursor */}
          <line x1={cx} x2={cx} y1={PLOT_TOP} y2={H - 4} className="timeline__cursor" />
        </svg>
        {/* Event markers: buttons over the bars (accessible, keyboard focusable) */}
        {metrics.events.filter((e) => e.kind.endsWith('rise') || e.kind.endsWith('set')).map((e) => {
          const row = e.kind.startsWith('sun') ? 0 : 1;
          return (
            <button
              key={`${e.kind}-${e.tUnix}`}
              type="button"
              className={`timeline__event timeline__event--${e.kind}`}
              style={{ left: x.x(e.tUnix) - 7, top: BARS_TOP + row * (BAR_H + BAR_GAP) + (BAR_H - 14) / 2 }}
              aria-label={eventLabel(e)}
              title={eventLabel(e)}
              data-t={e.tUnix}
              onPointerDown={(ev) => ev.stopPropagation()}
              onClick={() => setCursor(e.tUnix)}
            >
              {e.kind.endsWith('rise') ? '▲' : '▼'}
            </button>
          );
        })}
      </div>
      <p className="timeline__readout" aria-hidden="true">
        {readout ?? ' '}
      </p>
    </figure>
  );
}

