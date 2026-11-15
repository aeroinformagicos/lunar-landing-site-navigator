// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Landing date and time (10_interfaz.md §4): `datetime-local` read as UTC, step 1 min; applies to the
// active scenario, or to all with `Link dates` (on by default), which the v2 explains under the box (T-90).
import { useEffect, useState } from 'react';
import { t } from '../../i18n/t';
import { activeScenario, missionTruncated, parseLanding } from '../../state/selectors';
import { useAppStore } from '../../state/store';
import { toDateTimeLocal } from '../common/format';
import { UI_VERSION } from '../shell/uiVersion';
import './landing.css';

export function LandingInput() {
  const scenario = useAppStore(activeScenario);
  const setLanding = useAppStore((s) => s.setLanding);
  const linkDates = useAppStore((s) => s.linkDates);
  const setLinkDates = useAppStore((s) => s.setLinkDates);
  const [text, setText] = useState(toDateTimeLocal(scenario.landingUnix));
  const [error, setError] = useState<string | null>(null);

  // Follow the store when the scenario or its landing changes elsewhere.
  useEffect(() => {
    setText(toDateTimeLocal(scenario.landingUnix));
    setError(null);
  }, [scenario.id, scenario.landingUnix]);

  function onChange(value: string) {
    setText(value);
    const r = parseLanding(value);
    if ('error' in r) {
      setError(r.error === 'range' ? t('error.range') : t('error.date_invalid'));
      return;
    }
    setError(null);
    setLanding(r.unix);
  }

  const truncated = !error && missionTruncated(scenario.landingUnix, scenario.missionDays);
  return (
    <div className="field field--landing">
      <label htmlFor="landing-input">{t('header.landing')}</label>
      <input
        id="landing-input"
        type="datetime-local"
        step={60}
        value={text}
        aria-invalid={error !== null}
        aria-describedby={error || truncated ? 'landing-msg' : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <label className="field__check">
        <input
          type="checkbox"
          checked={linkDates}
          aria-describedby={UI_VERSION === 'v2' ? 'link-dates-help' : undefined}
          onChange={(e) => setLinkDates(e.target.checked)}
        />
        {t('header.link_dates')}
      </label>
      {/* T-90 (proposal 7): what Link dates does, in the Setup panel of the v2 (the v1 header has no room). */}
      {UI_VERSION === 'v2' && (
        <p id="link-dates-help" className="field__hint">
          {t(linkDates ? 'header.link_dates_on' : 'header.link_dates_off')}
        </p>
      )}
      {(error || truncated) && (
        <p id="landing-msg" className={error ? 'field__error' : 'field__warn'} role={error ? 'alert' : 'status'}>
          {error ?? t('warn.truncated')}
        </p>
      )}
    </div>
  );
}
