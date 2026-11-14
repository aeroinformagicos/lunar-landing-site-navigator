// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Data of the active scenario for the whole v2 shell, computed once and shared by context: the
// scenario model (mask, frame, table), the memoised mission, the state at the cursor and the verdict.
import { createContext, useContext, useMemo } from 'react';
import { assess, type Assessment } from '../../core/requirements';
import { activeScenario } from '../../state/selectors';
import { useAppStore, type Scenario } from '../../state/store';
import type { Resource } from '../../core/types';
import { useScenarioModel, type ScenarioModel } from '../common/model';
import { cursorState, type CursorState } from '../metrics/derive';
import { useMission, type MissionResult } from '../metrics/useMission';

export interface ActiveReady {
  model: ScenarioModel;
  mission: MissionResult;
  now: CursorState | null;
  assessment: Assessment | null;
}

export interface ActiveData {
  scenario: Scenario;
  resource: Resource<ActiveReady>;
  retry: () => void;
}

export function useActiveData(): ActiveData {
  const scenario = useAppStore(activeScenario);
  const cursor = useAppStore((s) => s.cursorUnix);
  const requirements = useAppStore((s) => s.requirements);
  const [model, retry] = useScenarioModel(scenario);
  const ready = model.status === 'ready' ? model.data : null;
  const mission = useMission(ready, scenario);
  const now = useMemo(() => (ready ? cursorState(ready.table, ready.frame, ready.mask, cursor) : null), [ready, cursor]);
  const assessment = useMemo(
    () => (mission && !(mission instanceof Error) && mission.landing ? assess(mission.landing, mission.metrics, requirements) : null),
    [mission, requirements],
  );
  const resource: Resource<ActiveReady> =
    mission instanceof Error
      ? { status: 'error', error: mission }
      : ready && mission
        ? { status: 'ready', data: { model: ready, mission, now, assessment } }
        : model.status === 'error'
          ? model
          : { status: 'loading' };
  return { scenario, resource, retry };
}

export const ActiveContext = createContext<ActiveData | null>(null);

export function useActive(): ActiveData {
  const a = useContext(ActiveContext);
  if (!a) throw new Error('useActive outside the v2 shell');
  return a;
}
