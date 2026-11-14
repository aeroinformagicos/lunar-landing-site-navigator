// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Mission-level results of a scenario, memoised on scenario + mask (not on the cursor, 10 §13):
// windows, events and hours (07 §7), the state at landing and the curves of the displayed interval.
import { useMemo } from 'react';
import { findSegment } from '../../core/ephemeris';
import { curves, missionMetrics, type Curves, type Metrics } from '../../core/metrics';
import { eclipseTimeline, type EclipseTimeline } from '../../core/events';
import { evaluate, type SkyState } from '../../core/visibility';
import type { Scenario } from '../../state/store';
import type { ScenarioModel } from '../common/model';
import { displayRange } from '../timeline/scale';

export interface MissionResult {
  metrics: Metrics;
  landing: SkyState | null;
  curves: Curves;
  range: { t0: number; t1: number };
  /** Eclipses over the displayed interval (07 §9). */
  eclipse: EclipseTimeline;
}

export function computeMission(model: ScenarioModel, scenario: Scenario): MissionResult {
  const { table, frame, mask } = model;
  const mission = { landingUnix: scenario.landingUnix, missionDays: scenario.missionDays };
  const metrics = missionMetrics(table, frame, mask, mission, scenario.landingUnix);
  const range = displayRange(scenario.landingUnix, scenario.missionDays);
  return {
    metrics,
    landing: findSegment(table, scenario.landingUnix) ? evaluate(table, frame, mask, scenario.landingUnix) : null,
    curves: curves(table, frame, mask, range.t0, range.t1),
    range,
    eclipse: eclipseTimeline(table, frame, range.t0, range.t1),
  };
}

/** Null while the model is not ready; an Error if the landing is outside the table. */
export function useMission(model: ScenarioModel | null, scenario: Scenario): MissionResult | Error | null {
  return useMemo(() => {
    if (!model) return null;
    try {
      return computeMission(model, scenario);
    } catch (e) {
      return e as Error;
    }
    // The model already depends on the site and the observer height.
  }, [model, scenario.landingUnix, scenario.missionDays]);
}
