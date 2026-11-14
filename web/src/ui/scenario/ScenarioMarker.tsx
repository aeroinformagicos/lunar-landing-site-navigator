// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Scenario letters A–D with distinct marker shapes, not colours (10_interfaz.md §2):
// circle, square, triangle, diamond.
import type { ScenarioId } from '../../state/store';

const SHAPES: Record<ScenarioId, string> = {
  A: 'M8 2a6 6 0 1 0 0.001 0Z',
  B: 'M2.5 2.5h11v11h-11Z',
  C: 'M8 1.5 14.5 13.5h-13Z',
  D: 'M8 1 15 8 8 15 1 8Z',
};

export function ScenarioMarker({ id, size = 16 }: { id: ScenarioId; size?: number }) {
  return (
    <svg className="scenario-marker" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d={SHAPES[id]} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
