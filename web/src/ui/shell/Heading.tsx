// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Heading indicator of the 2D view, next to the time bar (T-64, D-120 c). It replaces the 360° strip
// on top of the scene, which users did not read: a small compass with the 40° view as a wedge, the
// Sun and the Earth as dots on its rim, and the direction in words (`Facing S · 172°`). It keeps the
// strip's job (10 §6.1 point 3): click or drag on the dial, or arrows (±1°, Shift ±10°), turn the view.
import { t } from '../../i18n/t';
import { VIEW_WIDTH_DEG } from '../panorama/geometry';
import { compassPoint, useView2d } from './view2d';

const R = 18; // dial radius in the 44 × 44 box
const C = 22;

/** Point on the dial at azimuth `az` (north up, east to the right, as seen from above). */
function onDial(az: number, r: number): [number, number] {
  const a = (az * Math.PI) / 180;
  return [C + r * Math.sin(a), C - r * Math.cos(a)];
}

function wedge(az: number): string {
  const [x1, y1] = onDial(az - VIEW_WIDTH_DEG / 2, R);
  const [x2, y2] = onDial(az + VIEW_WIDTH_DEG / 2, R);
  return `M${C} ${C}L${x1.toFixed(2)} ${y1.toFixed(2)}A${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}Z`;
}

export function Heading() {
  const viewAz = useView2d((s) => s.viewAz);
  const sunAz = useView2d((s) => s.sunAz);
  const earthAz = useView2d((s) => s.earthAz);
  const turnTo = useView2d((s) => s.turnTo);
  if (viewAz === null) return null;
  const az = Math.round(viewAz) % 360;
  const text = t('pano.heading_value', { dir: compassPoint(viewAz), az });

  function fromPointer(e: React.PointerEvent<SVGSVGElement>) {
    if (e.type === 'pointermove' && e.buttons === 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left - r.width / 2;
    const y = e.clientY - r.top - r.height / 2;
    if (Math.hypot(x, y) < 3) return;
    turnTo((Math.atan2(x, -y) * 180) / Math.PI);
  }
  function onKeyDown(e: React.KeyboardEvent) {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    turnTo(viewAz! + d * (e.shiftKey ? 10 : 1));
  }

  return (
    <div className="v2-heading">
      <svg
        className="v2-heading__dial"
        width={44}
        height={44}
        viewBox="0 0 44 44"
        role="slider"
        tabIndex={0}
        aria-label={t('pano.heading_label')}
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={az}
        aria-valuetext={text}
        onPointerDown={(e) => {
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={fromPointer}
        onKeyDown={onKeyDown}
      >
        <circle cx={C} cy={C} r={R} className="v2-heading__ring" />
        <path d={wedge(viewAz)} className="v2-heading__wedge" />
        <text x={C} y={10} textAnchor="middle" className="v2-heading__n">
          N
        </text>
        {sunAz !== null && <circle cx={onDial(sunAz, R)[0]} cy={onDial(sunAz, R)[1]} r={3.5} fill="var(--c-sun)" />}
        {earthAz !== null && <circle cx={onDial(earthAz, R)[0]} cy={onDial(earthAz, R)[1]} r={3} fill="var(--c-earth)" stroke="var(--c-bg-0)" strokeWidth={1} />}
      </svg>
      <span className="v2-heading__text" aria-hidden="true">
        {text}
      </span>
    </div>
  );
}
