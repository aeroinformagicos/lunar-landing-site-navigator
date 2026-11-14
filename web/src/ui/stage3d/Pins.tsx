// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Scenario pins of the 3D view (16_vista_3d.md §8.1): DOM buttons with the scenario's letter and
// shape, the site's short name and, on the active one, the core's Sun and Earth state. Positions
// are written by the render loop through `register` (no React render per frame).
import type { ScenarioId } from '../../state/store';
import { t } from '../../i18n/t';

export interface PinView {
  id: ScenarioId;
  name: string;
  active: boolean;
  status: string[];
}

/** Marker shapes of 10_interfaz.md §2: circle, square, triangle, diamond. */
export function PinShape({ id }: { id: ScenarioId }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2 };
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16">
      {id === 'A' && <circle cx="8" cy="8" r="6" {...common} />}
      {id === 'B' && <rect x="2.5" y="2.5" width="11" height="11" {...common} />}
      {id === 'C' && <path d="M8 2 L14 13.5 L2 13.5 Z" {...common} />}
      {id === 'D' && <path d="M8 1.5 L14.5 8 L8 14.5 L1.5 8 Z" {...common} />}
    </svg>
  );
}

export function Pins({ pins, register, onSelect }: { pins: PinView[]; register(id: ScenarioId, el: HTMLElement | null): void; onSelect(id: ScenarioId): void }) {
  return (
    <div className="stage3d__labels">
      {pins.map((p) => (
        <div key={p.id} ref={(el) => register(p.id, el)} className={`stage3d__pin${p.active ? ' stage3d__pin--active' : ''}`} hidden>
          <button type="button" className="stage3d__pin-btn" aria-label={t('stage3d.pin', { letter: p.id, name: p.name })} aria-pressed={p.active} onClick={() => onSelect(p.id)}>
            <PinShape id={p.id} />
            <span aria-hidden="true">{p.id}</span>
          </button>
          <span className="stage3d__pin-name">{p.name}</span>
          {p.active && p.status.length > 0 && (
            <span className="stage3d__pin-status">
              {p.status.map((s) => (
                <span key={s}>{s}</span>
              ))}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
