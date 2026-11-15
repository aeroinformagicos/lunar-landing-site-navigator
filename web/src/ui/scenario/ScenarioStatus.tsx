// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Does the mission of a scenario work with its date and the current requirements? (T-90, proposal 6.)
// Only for the open scenarios (A–D), on their cards in the Sites panel (mounted when the panel is open):
// at most four masks, and none computed while another scenario is being activated. Icon (✓ ! ✕) plus
// the word for screen readers; never colour alone.
import { useMemo } from 'react';
import { findSegment } from '../../core/ephemeris';
import { missionMetrics } from '../../core/metrics';
import { assess, type Status } from '../../core/requirements';
import { evaluate } from '../../core/visibility';
import { t, type TextKey } from '../../i18n/t';
import { useAppStore, type Scenario } from '../../state/store';
import { useScenarioModel } from '../common/model';
import './scenarioStatus.css';

const ICON: Record<Status, string> = { go: '✓', marginal: '!', no_go: '⊗' };

/** Status of the scenario's mission with the current requirements; null while loading or outside the table. */
export function useScenarioStatus(sc: Scenario): Status | null {
  const req = useAppStore((s) => s.requirements);
  const [model] = useScenarioModel(sc);
  return useMemo(() => {
    if (model.status !== 'ready') return null;
    const { table, frame, mask } = model.data;
    if (!findSegment(table, sc.landingUnix)) return null;
    try {
      const metrics = missionMetrics(table, frame, mask, { landingUnix: sc.landingUnix, missionDays: sc.missionDays }, sc.landingUnix);
      return assess(evaluate(table, frame, mask, sc.landingUnix), metrics, req).status;
    } catch {
      return null;
    }
  }, [model, sc.landingUnix, sc.missionDays, req]);
}

/** `✓` / `!` / `⊗` next to a scenario, with the status word for screen readers. */
export function ScenarioStatus({ scenario }: { scenario: Scenario }) {
  const status = useScenarioStatus(scenario);
  if (!status) return null;
  return (
    <span className={`scenario-status scenario-status--${status}`} title={t(`status.${status}` as TextKey)}>
      <span aria-hidden="true">{ICON[status]}</span>
      <span className="visually-hidden">{` · ${t(`status.${status}` as TextKey)}`}</span>
    </span>
  );
}
