// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Right panel (10_interfaz.md §6.6, F6, F7): three big figures with icon, unit and help, the basic
// requirement chip, the `Now` block with the two countdowns and the provenance line.
import { useEffect, useMemo, useRef, useState } from 'react';
import { t, type TextKey } from '../../i18n/t';
import { assess } from '../../core/requirements';
import { useAppStore, type Scenario } from '../../state/store';
import { Summary } from '../summary/Summary';
import { ChartData } from './ChartData';
import { STATUS_ICON, STATUS_TEXT } from '../replan/texts';
import { formatDeg, formatHours, formatMargin, formatPct } from '../common/format';
import type { ScenarioModel } from '../common/model';
import { countdownText, cursorState, requirementChecks } from './derive';
import type { MissionResult } from './useMission';

/** Live text for screen readers: at most every 10 s and never during playback (10 §12). */
function useThrottledLive(text: string, paused: boolean): string {
  const [live, setLive] = useState(text);
  const last = useRef(0);
  useEffect(() => {
    if (paused) return;
    const now = Date.now();
    const wait = Math.max(0, 10_000 - (now - last.current));
    const id = setTimeout(() => {
      last.current = Date.now();
      setLive(text);
    }, wait);
    return () => clearTimeout(id);
  }, [text, paused]);
  return live;
}

function Figure({ id, icon, value }: { id: 'sunlight' | 'earth_link' | 'longest_night'; icon: string; value: string }) {
  const [help, setHelp] = useState(false);
  const name = t(`metrics.${id}` as TextKey);
  // `259 h · 77 %`: hours large (≥ 28 px, 14 §4), the share smaller; the text stays the same.
  const cut = value.indexOf(' · ');
  const main = cut < 0 ? value : value.slice(0, cut);
  const rest = cut < 0 ? '' : value.slice(cut);
  return (
    <div className={`figure figure--${id}`}>
      <div className="figure__head">
        <span className="figure__icon" aria-hidden="true">
          {icon}
        </span>
        <span className="figure__name">{name}</span>
        <button
          type="button"
          className="figure__help"
          aria-expanded={help}
          aria-controls={`help-${id}`}
          aria-label={t('metrics.help_button', { name })}
          onClick={() => setHelp(!help)}
        >
          ⓘ
        </button>
      </div>
      <p className="figure__value">
        {main}
        {rest && <span className="figure__sub">{rest}</span>}
      </p>
      {help && (
        <div id={`help-${id}`} className="figure__helptext">
          <p>{t(`metrics.help.${id}` as TextKey)}</p>
          {/* Limitation of every rise and set time (decision D-95). */}
          <p>{t('limits.rise_set')}</p>
        </div>
      )}
    </div>
  );
}

export function MetricsPanel({ model, mission, scenario }: { model: ScenarioModel; mission: MissionResult; scenario: Scenario }) {
  const cursor = useAppStore((s) => s.cursorUnix);
  const playing = useAppStore((s) => s.playing);
  const requirements = useAppStore((s) => s.requirements);
  const { metrics, landing } = mission;
  const now = useMemo(() => cursorState(model.table, model.frame, model.mask, cursor), [model, cursor]);
  const checks = requirementChecks(landing, metrics, requirements);
  const assessment = useMemo(() => (landing ? assess(landing, metrics, requirements) : null), [landing, metrics, requirements]);

  const sunCountdown = now?.nextSun ? countdownText(now.nextSun, cursor) : '';
  const earthCountdown = now?.nextEarth ? countdownText(now.nextEarth, cursor) : '';
  const live = useThrottledLive(`${sunCountdown}. ${earthCountdown}.`, playing);
  const checkLabel = (key: string) =>
    key === 'sun' ? t('req.sun') : key === 'earth' ? t('req.earth_short') : t('req.night', { h: requirements.maxNightHours });

  return (
    <>
      <div className="figures">
        <Figure id="sunlight" icon="☀" value={`${formatHours(metrics.sunHours)} · ${formatPct(metrics.sunPct)}`} />
        <Figure id="earth_link" icon="◐" value={`${formatHours(metrics.earthHours)} · ${formatPct(metrics.earthPct)}`} />
        <Figure id="longest_night" icon="☾" value={formatHours(metrics.longestNightH)} />
      </div>
      {metrics.truncated && <p className="field__warn">{t('warn.truncated')}</p>}

      {/* Verdict card (T-54): the state with icon and word, then the requirement checks. */}
      <section className={`verdict${assessment ? ` verdict--${assessment.status}` : ''}`} aria-labelledby="verdict-title">
        <h3 id="verdict-title" className="visually-hidden">
          {t('panel.verdict')}
        </h3>
        {assessment && (
          <p className={`status-chip status-chip--${assessment.status}`} data-testid="status-chip">
            <span aria-hidden="true">{STATUS_ICON[assessment.status]}</span> {STATUS_TEXT[assessment.status]}
          </p>
        )}
        <ul className="checks" aria-label={t('metrics.status')}>
          {checks.map((c) => (
            <li key={c.key} className={c.ok ? 'check check--ok' : 'check check--fail'}>
              <span className="check__mark" aria-label={c.ok ? 'met' : 'not met'}>
                {c.ok ? '✓' : '✕'}
              </span>{' '}
              {checkLabel(c.key)}
            </li>
          ))}
        </ul>
      </section>

      <section className="now" aria-labelledby="now-title">
        <h3 id="now-title">{t('metrics.now')}</h3>
        {now ? (
          <>
            <p>{t('metrics.sun_elevation', { el: formatDeg(now.sky.sun.elDeg) })}</p>
            <p>{t('metrics.disc_visible', { pct: formatPct(now.sky.sun.discFraction * 100) })}</p>
            <p>
              {t('metrics.earth_elevation', {
                el: formatDeg(now.sky.earth.elDeg),
                margin: formatMargin(now.sky.earth.marginDeg),
              })}
            </p>
            <p className="countdown" data-testid="sun-countdown">
              {sunCountdown}
            </p>
            <p className="countdown" data-testid="earth-countdown">
              {earthCountdown}
            </p>
            {now.sky.eclipse.kind !== 'none' && (
              <p className="eclipse-notice" role="status" data-testid="eclipse-notice">
                <span aria-hidden="true">◑ </span>
                {t('metrics.eclipse', { pct: formatPct(now.sky.eclipse.covered * 100) })}
                {!now.sky.sun.visible && ` ${t('metrics.eclipse_sun_below')}`}
              </p>
            )}
          </>
        ) : (
          <p>{t('metrics.outside')}</p>
        )}
        <p className="visually-hidden" aria-live="polite">
          {live}
        </p>
      </section>

      {now && assessment && <Summary model={model} mission={mission} scenario={scenario} now={now} assessment={assessment} />}

      <ChartData mission={mission} />

      <p className="provenance">{t('metrics.provenance', { terrain: model.reliefLabel })}</p>
    </>
  );
}
