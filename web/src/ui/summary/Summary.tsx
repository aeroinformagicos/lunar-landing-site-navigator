// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Plain summary block of the right panel (10_interfaz.md §6.6, §8): three sentences for the active
// scenario at the cursor. Referenced by the charts' `aria-describedby` (`#plain-summary`, §12).
import { blockerAt, smoothHorizon } from '../../core/horizon';
import type { Assessment } from '../../core/requirements';
import { t } from '../../i18n/t';
import { missionEnd, useAppStore, type Scenario } from '../../state/store';
import type { ScenarioModel } from '../common/model';
import type { CursorState } from '../metrics/derive';
import type { MissionResult } from '../metrics/useMission';
import { summarize } from './summarize';

export interface SummaryProps {
  model: ScenarioModel;
  mission: MissionResult;
  scenario: Scenario;
  now: CursorState;
  assessment: Assessment;
}

export function Summary({ model, mission, scenario, now, assessment }: SummaryProps) {
  const req = useAppStore((s) => s.requirements);
  const playing = useAppStore((s) => s.playing);
  const sentences = summarize({
    state: now.sky,
    nextSun: now.nextSun,
    nextEarth: now.nextEarth,
    missionEndUnix: missionEnd(scenario),
    missionDays: scenario.missionDays,
    sunPct: mission.metrics.sunPct,
    earthPct: mission.metrics.earthPct,
    assessment,
    maxNightHours: req.maxNightHours,
    marginalEarthMarginDeg: req.marginalEarthMarginDeg,
    blockerSun: blockerAt(model.mask, now.sky.sun.azDeg),
    blockerEarth: blockerAt(model.mask, now.sky.earth.azDeg),
    site: {
      heightM: model.mask.siteHeightM,
      smooth: model.smooth,
      smoothElDeg: smoothHorizon(model.mask.observerHeightM).elDeg,
    },
    steady: playing,
  });
  return (
    <section id="plain-summary" className="summary" aria-label={t('summary.label')}>
      {/* Keyed by position, not by text: the text changes on every frame while playing and a text key
          rebuilt the paragraph each time (T-64 b). */}
      {sentences.map((s, i) => (
        <p key={i}>{s}</p>
      ))}
    </section>
  );
}
