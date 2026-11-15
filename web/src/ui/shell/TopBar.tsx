// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Top of the v2 shell (15_interfaz_v2.md §3.1): brand (H), scenario pills (P), mode and Validation
// (M) and the 3D / 2D switch (T).
import { useEffect, useState } from 'react';
import './viewToggle.css';
import './modeHelp.css';
import { MAX_SCENARIOS } from '../../core/constants';
import { t, type TextKey } from '../../i18n/t';
import { parseSiteRef } from '../../state/selectors';
import { useAppStore, type Mode } from '../../state/store';
import { can3d, HAS_STAGE3D } from '../../state/viewMode';
import { useBoot } from '../common/data';
import { ShareButton } from '../layout/Header';
import { ScenarioMarker } from '../scenario/ScenarioMarker';
import { Emblem } from './Emblem';

const MODES: Mode[] = ['explore', 'plan', 'learn'];

export function Brand({ onReset }: { onReset: () => void }) {
  return (
    <header className="v2-brand">
      <a
        href="#"
        className="v2-brand__link"
        aria-describedby="v2-tagline"
        onClick={(e) => {
          e.preventDefault();
          onReset();
        }}
      >
        <Emblem size={48} />
        {/* The accessible name is the visible text plus the full title (label in name, B9). */}
        <span className="v2-brand__text">
          <span className="v2-brand__name">{t('app.brand')}</span>
          <span className="v2-brand__motto">{t('app.motto')}</span>
        </span>
        <span className="visually-hidden"> — {t('app.title')}</span>
      </a>
      <span id="v2-tagline" className="visually-hidden">
        {t('app.tagline')}
      </span>
    </header>
  );
}

/** One pill per scenario (marker, letter, short name), `+` and `Compare` (15 §2.2). */
export function ScenarioPills({ onAdd }: { onAdd: () => void }) {
  const { sites } = useBoot();
  const scenarios = useAppStore((s) => s.scenarios);
  const activeId = useAppStore((s) => s.activeScenarioId);
  const setActive = useAppStore((s) => s.setActiveScenario);
  const comparing = useAppStore((s) => s.comparing);
  const setComparing = useAppStore((s) => s.setComparing);
  const full = scenarios.length >= MAX_SCENARIOS;

  const nameOf = (siteRef: string) => {
    const ref = parseSiteRef(siteRef);
    if (ref.kind === 'catalogue') return sites.sites.find((x) => x.id === ref.id)?.short_name ?? ref.id;
    return ref.kind === 'grid' ? t('scenario.mesh') : t('scenario.custom');
  };

  return (
    <div className="v2-pills" role="group" aria-label={t('scenario.list')}>
      {scenarios.map((sc) => (
        <button
          key={sc.id}
          type="button"
          className="pill pill--scenario"
          aria-pressed={sc.id === activeId}
          onClick={() => setActive(sc.id)}
        >
          <ScenarioMarker id={sc.id} size={12} />
          <span>
            {sc.id} · {nameOf(sc.siteRef)}
          </span>
        </button>
      ))}
      <button
        type="button"
        className="pill pill--add"
        onClick={onAdd}
        disabled={full}
        aria-label={t('scenario.add')}
        title={full ? t('scenario.max') : t('scenario.add')}
      >
        +
      </button>
      {scenarios.length >= 2 && (
        <button type="button" className="v2-link" aria-pressed={comparing} onClick={() => setComparing(!comparing)}>
          {t('scenario.compare')}
        </button>
      )}
    </div>
  );
}

/** Explore / Plan / Learn (tablist, arrows), separator, Validation and, in Plan, Share. */
export function ModeNav() {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);

  function onKey(e: React.KeyboardEvent, i: number) {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = MODES[(i + d + MODES.length) % MODES.length];
    setMode(next);
    document.getElementById(`mode-${next}`)?.focus();
  }

  return (
    <nav className="v2-modes" aria-label={t('mode.label')}>
      <div role="tablist" aria-label={t('mode.label')} className="v2-modes__tabs">
        {MODES.map((m, i) => (
          <button
            key={m}
            id={`mode-${m}`}
            type="button"
            role="tab"
            className="tab tab--mode"
            aria-selected={mode === m}
            aria-describedby={`mode-help-${m}`}
            tabIndex={mode === m ? 0 : -1}
            onClick={() => setMode(m)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t(`mode.${m}` as TextKey)}
          </button>
        ))}
      </div>
      <span className="v2-sep" aria-hidden="true" />
      <a className="tab tab--mode v2-validation" href="#/validation">
        {t('header.validation')}
      </a>
      {mode === 'plan' && <ShareButton />}
      {/* T-90 (proposal 8): what the active mode is for, in one line; each tab carries its own as a description. */}
      <p className="v2-modes__help" aria-hidden="true">
        {t(`mode.${mode}_help` as TextKey)}
      </p>
      {MODES.map((m) => (
        <span key={m} id={`mode-help-${m}`} className="visually-hidden">
          {t(`mode.${m}_help` as TextKey)}
        </span>
      ))}
    </nav>
  );
}

/**
 * 3D / 2D switch over the stage (15 §4.1): text, not only icons; shortcut V. When the 3D view is not
 * possible its option stays focusable (`aria-disabled`, not `disabled`) and a tap, click or Enter shows
 * why in a visible line, also given as its description, so the reason never depends on hovering (T-74).
 */
export function ViewToggle() {
  const viewMode = useAppStore((s) => s.viewMode);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const possible = can3d();
  const why = HAS_STAGE3D ? t('view.3d_disabled') : t('view.3d_missing');
  const [showWhy, setShowWhy] = useState(false);
  useEffect(() => {
    if (!showWhy) return;
    const id = window.setTimeout(() => setShowWhy(false), 8000);
    return () => window.clearTimeout(id);
  }, [showWhy]);
  return (
    <div className="v2-toggle" role="radiogroup" aria-label={t('view.mode')}>
      {(['3d', '2d'] as const).map((m) => {
        const off = m === '3d' && !possible;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            className="v2-toggle__opt"
            aria-checked={viewMode === m}
            aria-disabled={off || undefined}
            aria-describedby={off ? 'v2-3d-why' : undefined}
            title={off ? why : undefined}
            onClick={() => (off ? setShowWhy((v) => !v) : setViewMode(m))}
          >
            {m === '3d' ? t('view.3d') : t('view.2d')}
          </button>
        );
      })}
      {!possible && (
        <p id="v2-3d-why" className="v2-toggle__why" role="status" hidden={!showWhy}>
          {why}
        </p>
      )}
    </div>
  );
}
