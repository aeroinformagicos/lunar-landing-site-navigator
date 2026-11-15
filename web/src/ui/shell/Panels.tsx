// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Floating panels of the v2 shell (15_interfaz_v2.md §5.1, §5.2): Sites and Setup on the left,
// Now at site on the right. They reuse the v1 controls and the same store.
import { useState } from 'react';
import { MAX_SCENARIOS } from '../../core/constants';
import { t } from '../../i18n/t';
import { useAppStore, DEFAULT_REQUIREMENTS } from '../../state/store';
import { Button } from '../common/Button';
import { useBoot } from '../common/data';
import { formatDeg, formatMargin, formatPct } from '../common/format';
import { LandingInput } from '../controls/LandingInput';
import { MissionInput } from '../controls/MissionInput';
import { countdownText, requirementChecks } from '../metrics/derive';
import { ScenarioCard } from '../scenario/ScenarioColumn';
import { FloatingPanel } from './FloatingPanel';
import { HorizonDetail } from './HorizonDetail';
import { openLeftPanel, REQUIREMENTS_FOCUS } from './openPanel';
import { requestBestSite } from '../optimal/request';
import { useActive } from './useActive';
import { useView2d } from './view2d';

/** Between 768 and 1279 px wide, Now at site opens folded (15 §3.2). */
function tabletWidth(): boolean {
  try {
    return window.matchMedia('(min-width: 768px) and (max-width: 1279px)').matches;
  } catch {
    return false;
  }
}

const SitesIcon = (
  <svg className="fp-icon" width="14" height="14" viewBox="0 0 18 18" aria-hidden="true">
    <circle cx="9" cy="9" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path d="M9 0v5M9 13v5M0 9h5M13 9h5" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);
const SetupIcon = (
  <svg className="fp-icon" width="14" height="14" viewBox="0 0 18 18" aria-hidden="true">
    <path d="M2 5h14M2 13h14" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="6" cy="5" r="2.2" fill="var(--c-bg-0)" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="12" cy="13" r="2.2" fill="var(--c-bg-0)" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

/** `1 Aug 2027` for the folded Setup tab. */
function shortDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

interface LeftProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SitesPanel({ onPick, open, onOpenChange }: LeftProps & { onPick: (target: { kind: 'add' } | { kind: 'change'; id: string }) => void }) {
  const { sites } = useBoot();
  const scenarios = useAppStore((s) => s.scenarios);
  const comparing = useAppStore((s) => s.comparing);
  const setComparing = useAppStore((s) => s.setComparing);
  const full = scenarios.length >= MAX_SCENARIOS;
  return (
    <FloatingPanel id="sites" title={t('panel.sites')} side="left" defaultOpen={false} icon={SitesIcon} className="fp--sites" open={open} onOpenChange={onOpenChange}>
      <ul className="v2-cards">
        {scenarios.map((sc) => (
          <li key={sc.id}>
            <ScenarioCard scenario={sc} sites={sites.sites} onChangeSite={() => onPick({ kind: 'change', id: sc.id })} />
          </li>
        ))}
      </ul>
      <div className="v2-row">
        <Button variant="secondary" onClick={() => onPick({ kind: 'add' })} disabled={full} aria-describedby={full ? 'v2-max-scenarios' : undefined}>
          {t('scenario.add')}
        </Button>
        {scenarios.length >= 2 && (
          <Button variant="secondary" aria-pressed={comparing} onClick={() => setComparing(!comparing)}>
            {t('scenario.compare')}
          </Button>
        )}
        {/* T-90 (proposal 9): the best-site search, reachable from the main view. */}
        <Button variant="secondary" onClick={requestBestSite}>
          {t('best.find_best')}
        </Button>
      </div>
      {full && (
        <p id="v2-max-scenarios" className="v2-note">
          {t('scenario.max')}
        </p>
      )}
    </FloatingPanel>
  );
}

export function SetupPanel({ open, onOpenChange }: LeftProps) {
  const { scenario } = useActive();
  const req = useAppStore((s) => s.requirements);
  const setRequirements = useAppStore((s) => s.setRequirements);
  const summary = t('panel.setup_summary', { date: shortDate(scenario.landingUnix), d: scenario.missionDays });
  return (
    <FloatingPanel id="setup" title={t('panel.setup')} side="left" defaultOpen={false} summary={summary} icon={SetupIcon} className="fp--setup" open={open} onOpenChange={onOpenChange}>
      <div className="v2-setup">
        <LandingInput />
        <MissionInput />
      </div>
      <section className="v2-section" aria-labelledby="v2-req-title">
        <h3 id="v2-req-title" className="v2-section__title">
          {t('panel.requirements')}
        </h3>
        <p className="v2-note">{t('panel.requirements_help')}</p>
        <label className="field__check">
          <input type="checkbox" checked={req.needSunAtLanding} onChange={(e) => setRequirements({ needSunAtLanding: e.target.checked })} />
          {t('req.sun')}
        </label>
        <label className="field__check">
          <input type="checkbox" checked={req.needEarthAtLanding} onChange={(e) => setRequirements({ needEarthAtLanding: e.target.checked })} />
          {t('req.earth')}
        </label>
        <label className="field v2-night">
          <span>{t('replan.night')}</span>
          <input
            type="number"
            min={0}
            max={400}
            step={1}
            value={req.maxNightHours}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v >= 0 && v <= 400) setRequirements({ maxNightHours: v });
            }}
          />
        </label>
        <Button variant="ghost" onClick={() => setRequirements({ ...DEFAULT_REQUIREMENTS })}>
          {t('replan.reset')}
        </Button>
      </section>
    </FloatingPanel>
  );
}

/** Now at site: telemetry, requirements, eclipse, focus and smooth Moon (15 §5.2). */
export function NowPanel() {
  const { scenario, resource } = useActive();
  // `Horizon detail` open: telemetry and requirements fold to one line so the panel still fits (15 §3.2).
  const [detail, setDetail] = useState(false);
  const cursor = useAppStore((s) => s.cursorUnix);
  const requirements = useAppStore((s) => s.requirements);
  const focus = useAppStore((s) => s.focusBody);
  const setFocus = useAppStore((s) => s.setFocusBody);
  const showSmooth = useAppStore((s) => s.showSmooth);
  const setShowSmooth = useAppStore((s) => s.setShowSmooth);
  const data = resource.status === 'ready' ? resource.data : null;
  const now = data?.now ?? null;
  const checks = data ? requirementChecks(data.mission.landing, data.mission.metrics, requirements) : [];
  const checkLabel = (key: string) =>
    key === 'sun' ? t('req.sun') : key === 'earth' ? t('req.earth_short') : t('req.night', { h: requirements.maxNightHours });

  const row = (label: string, value: string, tone: 'sun' | 'earth' | 'plain', sub?: string) => (
    <div className="v2-dl__row">
      <dt>{label}</dt>
      <dd className={`v2-dl__v v2-dl__v--${tone}`}>
        {value}
        {sub && <span className="v2-dl__sub">{sub}</span>}
      </dd>
    </div>
  );

  return (
    <FloatingPanel id="now" title={t('panel.now_at', { id: scenario.id })} side="right" defaultOpen={!tabletWidth()} className="fp--now">
      {detail && now ? (
        <p className="v2-now-line">
          <span className="v2-dl__v--sun">☀ {formatDeg(now.sky.sun.elDeg)}</span>
          <span className="v2-dl__v--earth">◐ {formatDeg(now.sky.earth.elDeg)}</span>
          {checks.some((c) => !c.ok) ? <span className="v2-check--fail">✕ {checks.filter((c) => !c.ok).length}</span> : <span>✓</span>}
        </p>
      ) : now ? (
        <dl className="v2-dl">
          {row(t('now.sun_elevation'), formatDeg(now.sky.sun.elDeg), 'sun')}
          {row(t('now.disc'), formatPct(now.sky.sun.discFraction * 100), 'sun')}
          {row(t('now.earth_elevation'), formatDeg(now.sky.earth.elDeg), 'earth', t('now.margin', { margin: formatMargin(now.sky.earth.marginDeg) }))}
          {now.nextSun && countdownRow(countdownText(now.nextSun, cursor), 'sun-countdown')}
          {now.nextEarth && countdownRow(countdownText(now.nextEarth, cursor), 'earth-countdown')}
        </dl>
      ) : (
        <p className="v2-note">{resource.status === 'ready' ? t('metrics.outside') : t('metrics.loading')}</p>
      )}
      {/* T-90 (proposal 3): what the elevations and the margin are measured from. */}
      {!detail && now && <p className="v2-note">{t('now.reference')}</p>}

      {!detail && checks.length > 0 && (
        <ul className="v2-checks" aria-label={t('metrics.status')}>
          {checks.map((c) => (
            <li key={c.key} className={c.ok ? 'v2-check v2-check--ok' : 'v2-check v2-check--fail'}>
              <span className="v2-check__mark" aria-label={c.ok ? 'met' : 'not met'}>
                {c.ok ? '✓' : '✕'}
              </span>
              {c.ok ? checkLabel(c.key) : t('req.not_met', { req: checkLabel(c.key) })}
            </li>
          ))}
        </ul>
      )}
      {!detail && checks.length > 0 && (
        <Button variant="ghost" onClick={() => openLeftPanel({ which: 'setup', focus: REQUIREMENTS_FOCUS })}>
          {t('panel.requirements_change')}
        </Button>
      )}

      {now && now.sky.eclipse.kind !== 'none' && (
        <p className="v2-eclipse" role="status" data-testid="eclipse-notice">
          <span aria-hidden="true">◑ </span>
          {t('metrics.eclipse', { pct: formatPct(now.sky.eclipse.covered * 100) })}
          {!now.sky.sun.visible && ` ${t('metrics.eclipse_sun_below')}`}
        </p>
      )}

      <div className="v2-focus">
        <div className="v2-focus__pills" role="group" aria-label={t('pano.centre_on')}>
          {(['sun', 'earth'] as const).map((b) => (
            <button key={b} type="button" className={`pill pill--small pill--${b}`} aria-pressed={focus === b} onClick={() => {
                setFocus(b);
                useView2d.getState().recentre(); // the 2D view centres on it again (D-120 a)
              }}>
              {t(b === 'sun' ? 'pano.centre_sun' : 'pano.centre_earth')}
            </button>
          ))}
        </div>
        <label className="field__check v2-smooth">
          <input type="checkbox" checked={showSmooth} onChange={(e) => setShowSmooth(e.target.checked)} />
          {t('pano.compare_smooth')}
        </label>
      </div>
      <HorizonDetail open={detail} setOpen={setDetail} />
    </FloatingPanel>
  );
}

/** `Sunrise in 0d 17h 22m` → label `Sunrise in`, value `0d 17h 22m` (the full text is the name). */
function countdownRow(text: string, testId: string) {
  // `Sunrise in 0d 17h 22m` → label and value; `No earthset in the next 60 days` stays one sentence.
  const m = /^(\w+ in) (\d.*)$/.exec(text);
  if (!m) {
    return (
      <div className="v2-dl__row v2-dl__row--full">
        <dt className="visually-hidden">{testId === 'sun-countdown' ? t('compare.next_sun') : t('compare.next_earth')}</dt>
        <dd className="v2-dl__v v2-dl__v--note countdown" data-testid={testId}>
          {text}
        </dd>
      </div>
    );
  }
  return (
    <div className="v2-dl__row">
      <dt>{m[1]}</dt>
      <dd className="v2-dl__v v2-dl__v--plain countdown" data-testid={testId}>
        <span className="visually-hidden">{`${m[1]} `}</span>
        {m[2]}
      </dd>
    </div>
  );
}
