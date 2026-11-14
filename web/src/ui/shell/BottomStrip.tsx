// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Bottom strip of the v2 shell (15_interfaz_v2.md §2.4, §3.1): verdict line, three big figures with
// help, plain summary, view tabs, time bar (with the Sun and Earth windows in its track) and the
// provenance and credits line.
import { useState } from 'react';
import type { Window } from '../../core/events';
import { DAY_S, HOUR_S } from '../../core/time';
import { t, type TextKey } from '../../i18n/t';
import { activeScenario, cursorBounds, SLIDER_STEP_S, speedLabel } from '../../state/selectors';
import { missionEnd, useAppStore, type Tab } from '../../state/store';
import { formatHours, formatMissionDay, formatPct, formatUtc } from '../common/format';
import { togglePlay, usePlayback } from '../controls/TimeControls';
import { STATUS_ICON, STATUS_TEXT } from '../replan/texts';
import { Summary } from '../summary/Summary';
import { reasonText } from '../summary/summarize';
import { useActive } from './useActive';

/** View tabs of the v2, in the mockup's order (D-101): Horizon, Map, Timeline, Terrain profile (+ Replan). */
export const V2_TABS: Tab[] = ['panorama', 'map', 'timeline', 'section'];
const TAB_TEXT: Record<Tab, TextKey> = {
  panorama: 'tab.horizon',
  map: 'tab.map',
  timeline: 'tab.timeline',
  section: 'tab.section',
  replan: 'tab.replan',
};

export function Verdict() {
  const { scenario, resource } = useActive();
  const req = useAppStore((s) => s.requirements);
  if (resource.status !== 'ready' || !resource.data.assessment) return <p className="v2-verdict v2-verdict--empty" aria-hidden="true" />;
  const { assessment, mission } = resource.data;
  const first = assessment.reasons[0];
  const reason = first
    ? reasonText(first, {
        assessment,
        missionDays: scenario.missionDays,
        sunPct: mission.metrics.sunPct,
        earthPct: mission.metrics.earthPct,
        maxNightHours: req.maxNightHours,
        marginalEarthMarginDeg: req.marginalEarthMarginDeg,
      })
    : null;
  return (
    <p className={`v2-verdict v2-verdict--${assessment.status}`}>
      <span data-testid="status-chip">
        <span aria-hidden="true">{STATUS_ICON[assessment.status]}</span> {STATUS_TEXT[assessment.status]}
      </span>
      {reason && <span className="v2-verdict__why"> · {reason}</span>}
    </p>
  );
}

function Figure({ id, value, share, tone }: { id: 'sunlight' | 'earth_link' | 'longest_night'; value: string; share?: string; tone: 'sun' | 'earth' | 'plain' }) {
  const [help, setHelp] = useState(false);
  const name = t(`metrics.${id}` as TextKey);
  const number = value.replace(/ h$/, '');
  return (
    <div className={`figure figure--${id} v2-fig v2-fig--${tone}`}>
      <p className="figure__value v2-fig__value">
        {number}
        <span className="v2-fig__unit"> h</span>
        {share && <span className="visually-hidden"> · {share}</span>}
      </p>
      <p className="v2-fig__label">
        <span>{name}</span>
        {share && (
          <span aria-hidden="true">
            {' · '}
            <span className="v2-mono">{share}</span>
          </span>
        )}
        <button
          type="button"
          className="v2-help"
          aria-expanded={help}
          aria-controls={`v2-help-${id}`}
          aria-label={t('metrics.help_button', { name })}
          onClick={() => setHelp(!help)}
        >
          ⓘ
        </button>
      </p>
      {help && (
        <p id={`v2-help-${id}`} className="v2-fig__help" role="note">
          {t(`metrics.help.${id}` as TextKey)}
        </p>
      )}
    </div>
  );
}

export function Figures() {
  const { resource } = useActive();
  if (resource.status !== 'ready') return <div className="v2-figs v2-figs--loading" aria-busy="true" />;
  const m = resource.data.mission.metrics;
  return (
    <div className="v2-figs" role="group" aria-label={t('panel.label')}>
      <Figure id="sunlight" value={formatHours(m.sunHours)} share={formatPct(m.sunPct)} tone="sun" />
      <Figure id="earth_link" value={formatHours(m.earthHours)} share={formatPct(m.earthPct)} tone="earth" />
      <Figure id="longest_night" value={formatHours(m.longestNightH)} tone="plain" />
    </div>
  );
}

/** Plain summary (F18): sentences 1 and 2 visible, the third behind `More` (15 §2.4). */
export function SummaryBlock() {
  const { scenario, resource } = useActive();
  const [more, setMore] = useState(false);
  if (resource.status !== 'ready' || !resource.data.now || !resource.data.assessment) return null;
  const { model, mission, now, assessment } = resource.data;
  return (
    <div className={more ? 'v2-summary v2-summary--all' : 'v2-summary'}>
      <Summary model={model} mission={mission} scenario={scenario} now={now} assessment={assessment} />
      <button type="button" className="v2-link v2-summary__more" aria-expanded={more} onClick={() => setMore(!more)}>
        {more ? t('summary.less') : t('summary.more')}
      </button>
    </div>
  );
}

export function ViewTabs() {
  const mode = useAppStore((s) => s.mode);
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);
  const tabs: Tab[] = mode === 'plan' || tab === 'replan' ? [...V2_TABS, 'replan'] : V2_TABS;

  function onKey(e: React.KeyboardEvent, i: number) {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = tabs[(i + d + tabs.length) % tabs.length];
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  }

  return (
    <div role="tablist" aria-label={t('tab.label')} className="v2-tabs">
      {tabs.map((tb, i) => (
        <button
          key={tb}
          id={`tab-${tb}`}
          type="button"
          role="tab"
          className="tab tab--view"
          aria-selected={tab === tb}
          aria-controls="main-view"
          tabIndex={tab === tb ? 0 : -1}
          onClick={() => setTab(tb)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {t(TAB_TEXT[tb])}
        </button>
      ))}
    </div>
  );
}

/** Windows as `[from %, to %]` segments of the mission track. */
function segments(ws: Window[], t0: number, t1: number): [number, number][] {
  const span = Math.max(1, t1 - t0);
  return ws
    .map((w): [number, number] => [Math.max(0, (w.startUnix - t0) / span), Math.min(1, (w.endUnix - t0) / span)])
    .filter(([a, b]) => b > a)
    .map(([a, b]) => [a * 100, b * 100]);
}

function Bar({ segs, tone, top }: { segs: [number, number][]; tone: 'sun' | 'earth'; top: number }) {
  return (
    <span className={`v2-track__bar v2-track__bar--${tone}`} style={{ top }} aria-hidden="true">
      {segs.map(([a, b]) => (
        <span key={a} style={{ left: `${a}%`, width: `${b - a}%` }} />
      ))}
    </span>
  );
}

export function TimeBar() {
  usePlayback();
  const { resource } = useActive();
  const scenario = useAppStore(activeScenario);
  const cursor = useAppStore((s) => s.cursorUnix);
  const playing = useAppStore((s) => s.playing);
  const speed = useAppStore((s) => s.playSpeed);
  const setCursor = useAppStore((s) => s.setCursor);
  const cycleSpeed = useAppStore((s) => s.cycleSpeed);
  const { min, max } = cursorBounds({ scenarios: [scenario], activeScenarioId: scenario.id });
  const end = missionEnd(scenario);
  const day = formatMissionDay(cursor - scenario.landingUnix);
  const utc = formatUtc(cursor);
  const frac = Math.min(1, Math.max(0, (cursor - min) / Math.max(1, max - min)));
  const windows = resource.status === 'ready' ? resource.data.mission.metrics.windows : null;
  const days = Math.max(1, Math.round((end - scenario.landingUnix) / DAY_S));
  const step = days > 20 ? 5 : days > 8 ? 2 : 1;
  const ticks = Array.from({ length: Math.floor(days / step) + 1 }, (_, k) => k * step);

  function onSliderKey(e: React.KeyboardEvent<HTMLInputElement>) {
    const delta = e.key === 'PageUp' ? DAY_S : e.key === 'PageDown' ? -DAY_S : 0;
    if (delta) {
      e.preventDefault();
      setCursor(cursor + delta);
    }
  }

  return (
    <div className="v2-time" role="group" aria-label={t('time.label')}>
      <button type="button" className="v2-play btn btn--primary" onClick={togglePlay} aria-pressed={playing} aria-label={playing ? t('time.pause') : t('time.play')}>
        <svg width="16" height="18" viewBox="0 0 10 12" aria-hidden="true">
          {playing ? <path d="M1 0h3v12H1zM6 0h3v12H6z" fill="currentColor" /> : <path d="M1 0l9 6-9 6z" fill="currentColor" />}
        </svg>
      </button>
      <button type="button" className="v2-step" onClick={() => setCursor(cursor - HOUR_S)} aria-label={`−1 h, ${t('time.back')}`} title={t('time.back')}>
        −1 h
      </button>
      <button type="button" className="v2-step" onClick={() => setCursor(cursor + HOUR_S)} aria-label={`+1 h, ${t('time.forward')}`} title={t('time.forward')}>
        +1 h
      </button>
      <button type="button" className="pill pill--small v2-speed" onClick={cycleSpeed} aria-label={t('time.speed', { speed: speedLabel(speed) })}>
        {speedLabel(speed)}
      </button>
      <div className="v2-track">
        {windows && (
          <>
            <Bar segs={segments(windows.sun, min, max)} tone="sun" top={12} />
            <Bar segs={segments(windows.earth, min, max)} tone="earth" top={22} />
          </>
        )}
        <span className="v2-track__cursor" style={{ left: `${frac * 100}%` }} aria-hidden="true" />
        <input
          className="v2-track__slider"
          type="range"
          min={min}
          max={max}
          step={SLIDER_STEP_S}
          value={cursor}
          aria-label={t('time.slider')}
          aria-valuetext={`${day} · ${utc}`}
          onChange={(e) => setCursor(Number(e.target.value))}
          onKeyDown={onSliderKey}
        />
        <span className="v2-track__ticks" aria-hidden="true">
          {ticks.map((d) => (
            <span key={d} style={{ left: `${(d / days) * 100}%` }}>
              D{d}
            </span>
          ))}
        </span>
      </div>
      <output className="v2-readout" aria-live="off">
        <span className="v2-readout__day">{day}</span>
        <span className="v2-readout__utc">{utc}</span>
      </output>
    </div>
  );
}

export function Provenance() {
  const { resource } = useActive();
  const relief = resource.status === 'ready' ? resource.data.model.reliefLabel : null;
  return (
    <p className="v2-provenance">
      {relief && <span>{t('metrics.provenance', { terrain: relief })}</span>}
      <span className="v2-credits">
        {t('footer.credit')} · {t('about.ai')}
      </span>
    </p>
  );
}
