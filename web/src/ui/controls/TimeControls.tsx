// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Cursor slider and playback (10_interfaz.md §4, F2): slider from landing to landing + mission in
// 10-min steps (arrows ±10 min, PageUp/PageDown ±1 day), ±1 h buttons, Play/Pause and 3 speeds.
import { useEffect, useRef } from 'react';
import { DAY_S, HOUR_S } from '../../core/time';
import { t } from '../../i18n/t';
import { activeScenario, advanceCursor, cursorBounds, SLIDER_STEP_S, speedLabel } from '../../state/selectors';
import { useAppStore } from '../../state/store';
import { Button } from '../common/Button';
import { formatMissionDay, formatUtc } from '../common/format';

/** Advances the cursor with requestAnimationFrame while `playing`; stops at the end. */
export function usePlayback() {
  const playing = useAppStore((s) => s.playing);
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    last.current = null;
    const tick = (now: number) => {
      const s = useAppStore.getState();
      const dt = last.current === null ? 0 : now - last.current;
      last.current = now;
      const { max } = cursorBounds(s);
      const r = advanceCursor(s.cursorUnix, s.playSpeed, dt, max);
      s.setCursor(r.cursorUnix);
      if (r.done) {
        s.setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
}

/** Starts playback; from the end of the mission it restarts at the landing. */
export function togglePlay() {
  const s = useAppStore.getState();
  if (s.playing) {
    s.setPlaying(false);
    return;
  }
  const { min, max } = cursorBounds(s);
  if (s.cursorUnix >= max) s.setCursor(min);
  s.setPlaying(true);
}

export function TimeControls() {
  usePlayback();
  const scenario = useAppStore(activeScenario);
  const cursor = useAppStore((s) => s.cursorUnix);
  const playing = useAppStore((s) => s.playing);
  const speed = useAppStore((s) => s.playSpeed);
  const setCursor = useAppStore((s) => s.setCursor);
  const cycleSpeed = useAppStore((s) => s.cycleSpeed);
  const { min, max } = cursorBounds({ scenarios: [scenario], activeScenarioId: scenario.id });
  const readout = `${formatMissionDay(cursor - scenario.landingUnix)} · ${formatUtc(cursor)}`;

  function onSliderKey(e: React.KeyboardEvent<HTMLInputElement>) {
    const delta = e.key === 'PageUp' ? DAY_S : e.key === 'PageDown' ? -DAY_S : 0;
    if (delta) {
      e.preventDefault();
      setCursor(cursor + delta);
    }
  }

  return (
    <div className="time-controls" role="group" aria-label={t('time.label')}>
      {/* Explore's one primary action is Play (14_ux_malaga.md §3). */}
      <Button variant="primary" className="time-controls__play" onClick={togglePlay} aria-pressed={playing}>
        <span aria-hidden="true">{playing ? '⏸' : '⏵'}</span>
        {playing ? t('time.pause') : t('time.play')}
      </Button>
      <Button variant="secondary" onClick={() => setCursor(cursor - HOUR_S)} aria-label={t('time.back')} title={t('time.back')}>
        −1 h
      </Button>
      <Button variant="secondary" onClick={() => setCursor(cursor + HOUR_S)} aria-label={t('time.forward')} title={t('time.forward')}>
        +1 h
      </Button>
      <Button variant="secondary" className="time-controls__speed" onClick={cycleSpeed} aria-label={t('time.speed', { speed: speedLabel(speed) })}>
        {speedLabel(speed)}
      </Button>
      <input
        className="time-controls__slider"
        type="range"
        min={min}
        max={max}
        step={SLIDER_STEP_S}
        value={cursor}
        aria-label={t('time.slider')}
        aria-valuetext={readout}
        onChange={(e) => setCursor(Number(e.target.value))}
        onKeyDown={onSliderKey}
      />
      <output className="time-controls__readout" aria-live="off">
        {readout}
      </output>
    </div>
  );
}
