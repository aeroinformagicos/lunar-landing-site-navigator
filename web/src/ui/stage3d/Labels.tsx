// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// DOM labels of the 3D view (16_vista_3d.md §8): scenario pins, region names, catalogue sites, the
// blocking ridge, path labels, daily marks and the bodies' beads. React renders them once per change;
// the render loop places, hides and culls them (`placeLabels`) without a React render per frame.
import type { ScenarioId } from '../../state/store';
import { norm, sub, type V3 } from './frame';

export type LabelKind = 'pin' | 'region' | 'site' | 'ridge' | 'path' | 'day' | 'bead';

export interface LabelView {
  key: string;
  kind: LabelKind;
  /** Scene point the label sits on. */
  anchor: V3;
  /** Higher wins when two labels overlap (§8: pins > ridge > regions > sites). */
  priority: number;
  /** Hidden when the camera is farther than this (m). */
  maxDistM?: number;
  /** Hidden when the terrain is between the camera and the anchor. */
  occlude: boolean;
  text: string;
  sub?: string;
  body?: 'sun' | 'earth';
  pin?: { id: ScenarioId; active: boolean; status: string[] };
  ariaLabel?: string;
  onClick?: () => void;
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

function Label({ l }: { l: LabelView }) {
  if (l.kind === 'pin' && l.pin) {
    return (
      <>
        <button type="button" className="stage3d__pin-btn" aria-label={l.ariaLabel} aria-pressed={l.pin.active} onClick={l.onClick}>
          <PinShape id={l.pin.id} />
          <span aria-hidden="true">{l.pin.id}</span>
        </button>
        <span className="stage3d__pin-name">{l.text}</span>
        {l.pin.active && l.pin.status.length > 0 && (
          <span className="stage3d__pin-status">
            {l.pin.status.map((s) => (
              <span key={s}>{s}</span>
            ))}
          </span>
        )}
      </>
    );
  }
  if (l.kind === 'region' || l.kind === 'site') {
    return (
      <button type="button" className={`stage3d__mark stage3d__mark--${l.kind}`} aria-label={l.ariaLabel} onClick={l.onClick}>
        {l.kind === 'site' && <span className="stage3d__dot" aria-hidden="true" />}
        <span>{l.text}</span>
      </button>
    );
  }
  if (l.kind === 'ridge') {
    return (
      <span className={`stage3d__ridge stage3d__ridge--${l.body}`}>
        <span className="stage3d__diamond" aria-hidden="true" />
        <span className="stage3d__ridge-text">
          <span>{l.text}</span>
          {l.sub && <span className="stage3d__mono">{l.sub}</span>}
        </span>
      </span>
    );
  }
  if (l.kind === 'bead') return <span className={`stage3d__bead stage3d__bead--${l.body}`} aria-hidden="true" />;
  return <span className={`stage3d__tag stage3d__tag--${l.kind}${l.body ? ` stage3d__tag--${l.body}` : ''}`}>{l.text}</span>;
}

export function Labels({ labels, register }: { labels: LabelView[]; register(key: string, el: HTMLElement | null): void }) {
  return (
    <div className="stage3d__labels">
      {labels.map((l) => (
        <div
          key={l.key}
          ref={(el) => register(l.key, el)}
          className={`stage3d__label stage3d__label--${l.kind}${l.kind === 'pin' && l.pin?.active ? ' stage3d__pin--active' : ''}${l.kind === 'pin' ? ' stage3d__pin' : ''}`}
          hidden
        >
          <Label l={l} />
        </div>
      ))}
    </div>
  );
}

export const MAX_LABELS = 14;

/** Rough box of a label for the overlap test (no layout reads per frame). */
function boxOf(l: LabelView, x: number, y: number): [number, number, number, number] {
  if (l.kind === 'bead') return [x, y, x, y];
  const w = l.kind === 'pin' ? 56 + 8 * l.text.length : 24 + 7.5 * Math.max(l.text.length, (l.sub ?? '').length);
  const h = l.kind === 'pin' ? 56 : l.sub ? 40 : 28;
  return [x - 22, y - h / 2, x - 22 + w, y + h / 2];
}

/**
 * Places the labels for one frame (§8): projects each anchor, hides those off screen, too far, behind
 * the terrain (`occluded`, refreshed by the caller) or overlapping a label of higher priority, and
 * shows at most `MAX_LABELS` (beads do not count).
 */
export function placeLabels(
  labels: LabelView[],
  els: Map<string, HTMLElement>,
  project: (p: V3) => { x: number; y: number } | null,
  camera: V3,
  occluded: Set<string>,
): void {
  const shown: [number, number, number, number][] = [];
  let count = 0;
  const order = [...labels].sort((a, b) => b.priority - a.priority);
  for (const l of order) {
    const el = els.get(l.key);
    if (!el) continue;
    const p = project(l.anchor);
    let ok = p !== null && !(l.occlude && occluded.has(l.key));
    if (ok && l.maxDistM !== undefined && norm(sub(l.anchor, camera)) > l.maxDistM) ok = false;
    if (ok && l.kind !== 'bead') {
      const b = boxOf(l, p!.x, p!.y);
      if (count >= MAX_LABELS || shown.some((s) => b[0] < s[2] && b[2] > s[0] && b[1] < s[3] && b[3] > s[1])) ok = false;
      else {
        shown.push(b);
        count++;
      }
    }
    if (!ok) {
      if (!el.hidden) el.hidden = true;
      continue;
    }
    el.hidden = false;
    el.style.transform = `translate(${p!.x.toFixed(1)}px, ${p!.y.toFixed(1)}px)`;
  }
}

