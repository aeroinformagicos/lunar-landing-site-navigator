// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Guided story overlay (10_interfaz.md §11, F15): bottom bar with the step text, `Back`, `Next`
// (also ← → and the space bar), `1 / 7` and `Exit tour` (14_ux_malaga.md §2). Each step writes its exact
// state to the store; the last step offers `Try it yourself` and `Restart`. Works without the heavy origin (step 6 variant).
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { findSegment } from '../../core/ephemeris';
import { skyAt } from '../../core/frames';
import { blockerAt } from '../../core/horizon';
import { isoToUnix } from '../../core/time';
import { t } from '../../i18n/t';
import { useAppStore, type Scenario } from '../../state/store';
import { useBoot } from '../common/data';
import { Button } from '../common/Button';
import { useScenarioModel } from '../common/model';
import { exploreState, STORY_LENGTH, storySteps, type StoryContext } from './storySteps';
import './storySpot.css';

/** The map view (T-29) is not integrated yet: step 6 uses its variant without map (§11). */
export const HAS_MAP_VIEW = false;

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** `{blockerDist}` of step 3: blocker of site B toward the Sun at the demo landing. */
function useBlockerDist(): number | null {
  const { sites } = useBoot();
  const d = sites.defaults;
  const scenarioB = useMemo<Scenario>(
    () => ({ id: 'B', siteRef: d.demo_pair[1], landingUnix: isoToUnix(d.demo_landing_utc), missionDays: d.demo_mission_days, observerHeightM: 2 }),
    [d],
  );
  const [model] = useScenarioModel(scenarioB);
  return useMemo(() => {
    if (model.status !== 'ready' || model.data.smooth) return null;
    const { table, frame, mask } = model.data;
    if (!findSegment(table, scenarioB.landingUnix)) return null;
    const b = blockerAt(mask, skyAt(table, frame, scenarioB.landingUnix).earth.azDeg);
    return Number.isFinite(b.distM) ? b.distM : null;
  }, [model, scenarioB]);
}

export function StoryOverlay() {
  const { sites } = useBoot();
  const step = useAppStore((s) => s.storyStep);
  const mode = useAppStore((s) => s.mode);
  const blockerDistM = useBlockerDist();
  const applied = useRef<number | null>(null);
  const ctx: StoryContext = { defaults: sites.defaults, sites: sites.sites, hasMap: HAS_MAP_VIEW, blockerDistM };

  const go = useCallback(
    (i: number) => {
      const s = storySteps[i];
      const c: StoryContext = { defaults: sites.defaults, sites: sites.sites, hasMap: HAS_MAP_VIEW, blockerDistM: null };
      const state = s.apply(c);
      const view = s.view(c);
      if (reducedMotion()) state.playing = false; // no automatic motion (§11)
      applied.current = i;
      useAppStore.setState(state);
      const hash = view.route === 'validation' ? '#/validation' : '';
      if (location.hash !== hash) location.hash = hash;
    },
    [sites],
  );

  // Entering Learn (mode selector) starts at the current step; each step change applies its state.
  useEffect(() => {
    if (mode === 'learn' && step !== null && applied.current !== step) go(step);
    if (mode !== 'learn') applied.current = null;
  }, [mode, step, go]);

  // Step 1 plays at 6 h/s for 4 s and then starts its cycle again from the landing (T-90, proposal 1;
  // D-138), until the step changes or someone presses Pause. Nothing moves with reduced motion.
  useEffect(() => {
    if (mode !== 'learn' || step === null) return;
    const play = storySteps[step].view(ctx).playForS;
    if (!play || reducedMotion()) return;
    const start = useAppStore.getState().cursorUnix;
    const id = setInterval(() => {
      const s = useAppStore.getState();
      if (!s.playing) {
        clearInterval(id); // paused by hand: the loop stops
        return;
      }
      s.setCursor(start);
    }, play * 1000);
    return () => clearInterval(id);
    // ctx changes with the data only; the loop belongs to the step.
  }, [mode, step]);

  const next = useCallback(() => {
    if (step === null) return;
    if (step < STORY_LENGTH - 1) go(step + 1);
  }, [step, go]);
  const back = useCallback(() => {
    if (step !== null && step > 0) go(step - 1);
  }, [step, go]);

  useEffect(() => {
    if (mode !== 'learn') return;
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowRight' || e.key === ' ') {
        if (e.key === ' ' && tag === 'BUTTON') return; // the focused button handles Space
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, next, back]);

  if (mode !== 'learn' || step === null) return null;

  function explore() {
    useAppStore.setState(exploreState({ defaults: sites.defaults, sites: sites.sites, hasMap: HAS_MAP_VIEW, blockerDistM: null }));
    applied.current = null;
    if (location.hash) location.hash = '';
  }

  /** `Exit tour`: back to Explore, keeping what the current step shows. */
  function exit() {
    useAppStore.getState().setMode('explore');
    applied.current = null;
    if (location.hash) location.hash = '';
  }

  const last = step === STORY_LENGTH - 1;

  return (
    <div className="story" role="region" aria-label={t('story.label')}>
      <p className="story__text" aria-live="polite" data-testid="story-text">
        {storySteps[step].text(ctx)}
      </p>
      <div className="story__controls">
        <Button variant="ghost" onClick={exit}>
          {t('story.exit')}
        </Button>
        <Button variant="secondary" onClick={back} disabled={step === 0}>
          {t('story.back')}
        </Button>
        <span className="story__count" data-testid="story-count">
          {step + 1} / {STORY_LENGTH}
        </span>
        {last ? (
          <>
            <Button variant="secondary" onClick={() => go(0)}>
              {t('story.restart')}
            </Button>
            <Button variant="primary" onClick={explore}>
              {t('story.explore')}
            </Button>
          </>
        ) : (
          <Button variant="primary" className="story__next" onClick={next}>
            {t('story.next')}
          </Button>
        )}
      </div>
    </div>
  );
}
