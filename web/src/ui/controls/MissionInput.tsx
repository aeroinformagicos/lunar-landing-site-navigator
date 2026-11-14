// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Mission length (10_interfaz.md §4): number 0.5–60 in steps of 0.5, label `Mission`, suffix `days`.
import { useEffect, useState } from 'react';
import { t } from '../../i18n/t';
import { activeScenario, MISSION_MAX_DAYS, MISSION_MIN_DAYS, MISSION_STEP_DAYS, normaliseMissionDays } from '../../state/selectors';
import { useAppStore } from '../../state/store';

export function MissionInput() {
  const scenario = useAppStore(activeScenario);
  const setMissionDays = useAppStore((s) => s.setMissionDays);
  const [text, setText] = useState(String(scenario.missionDays));

  useEffect(() => setText(String(scenario.missionDays)), [scenario.id, scenario.missionDays]);

  function commit() {
    const days = normaliseMissionDays(Number(text));
    if (days === null) {
      setText(String(scenario.missionDays));
      return;
    }
    setText(String(days));
    if (days !== scenario.missionDays) setMissionDays(days);
  }

  return (
    <div className="field field--mission">
      <label htmlFor="mission-input">{t('header.mission')}</label>
      <input
        id="mission-input"
        type="number"
        min={MISSION_MIN_DAYS}
        max={MISSION_MAX_DAYS}
        step={MISSION_STEP_DAYS}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
      <span className="field__suffix">{t('header.days')}</span>
    </div>
  );
}
