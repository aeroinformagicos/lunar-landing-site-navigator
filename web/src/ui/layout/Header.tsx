// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Header (10_interfaz.md §3.1, §4): title (link to the initial state), mode selector, landing date,
// mission length, time controls, `Validation` and, in Plan, `Share`.
import { useState } from 'react';
import { t, type TextKey } from '../../i18n/t';
import { useAppStore, type Mode } from '../../state/store';
import { flushUrl } from '../../state/url';
import { LandingInput } from '../controls/LandingInput';
import { MissionInput } from '../controls/MissionInput';
import { TimeControls } from '../controls/TimeControls';
import { Button, buttonClass } from '../common/Button';

const MODES: Mode[] = ['explore', 'plan', 'learn'];

export function Header({ onReset }: { onReset: () => void }) {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);

  function onModeKey(e: React.KeyboardEvent, i: number) {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = MODES[(i + d + MODES.length) % MODES.length];
    setMode(next);
    document.getElementById(`mode-${next}`)?.focus();
  }

  return (
    <header className="app__header">
      <div className="header__row">
        <div className="header__brand">
        <h1 className="app__title">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onReset();
            }}
          >
            <span className="title--long">{t('app.title')}</span>
            <span className="title--short">{t('app.title_short')}</span>
          </a>
        </h1>
        <p className="app__tagline">{t('app.tagline')}</p>
        </div>
        <div role="tablist" aria-label={t('mode.label')} className="segmented">
          {MODES.map((m, i) => (
            <button
              key={m}
              id={`mode-${m}`}
              type="button"
              role="tab"
              aria-selected={mode === m}
              tabIndex={mode === m ? 0 : -1}
              onClick={() => setMode(m)}
              onKeyDown={(e) => onModeKey(e, i)}
            >
              {t(`mode.${m}` as TextKey)}
            </button>
          ))}
        </div>
        <LandingInput />
        <MissionInput />
      </div>
      <div className="header__row">
        <TimeControls />
        <a className={buttonClass('ghost', 'button-link')} href="#/validation">
          {t('header.validation')}
        </a>
        {mode === 'plan' && <ShareButton />}
      </div>
    </header>
  );
}

/** Copies the page URL, whose fragment carries the state (F16, 10 §10); without clipboard, shows it. */
export function ShareButton() {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle');

  async function share() {
    flushUrl(); // the last change may still be waiting for the 2-per-second limit
    try {
      await navigator.clipboard.writeText(location.href);
      setState('copied');
    } catch {
      setState('manual');
    }
  }

  return (
    <span className="share">
      <Button variant="secondary" onClick={share}>
        {t('header.share')}
      </Button>
      {state === 'copied' && (
        <span role="status" className="muted">
          {t('header.copied')}
        </span>
      )}
      {state === 'manual' && <input readOnly value={location.href} onFocus={(e) => e.target.select()} autoFocus aria-label={t('header.share')} />}
    </span>
  );
}
