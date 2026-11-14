// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Scenario column (10_interfaz.md §5, F1): one card per scenario (A–D), `Add scenario` (disabled
// with 4) and `Compare` (with 2 or more; the comparison view arrives with F8).
import { useState } from 'react';
import { MAX_SCENARIOS } from '../../core/constants';
import { loader } from '../../core/loaders';
import type { Site } from '../../core/types';
import { t } from '../../i18n/t';
import { parseSiteRef } from '../../state/selectors';
import { useAppStore, type Scenario, type ScenarioId } from '../../state/store';
import { useBoot } from '../common/data';
import { DataState, useResource } from '../common/DataState';
import { formatLatLon, formatUtc } from '../common/format';
import { ScenarioMarker } from './ScenarioMarker';
import { SitePicker } from './SitePicker';

/** What the picker is choosing for: a new scenario or the site of an existing one. */
type PickerTarget = { kind: 'add' } | { kind: 'change'; id: ScenarioId };

export function ScenarioColumn() {
  const { sites } = useBoot();
  const scenarios = useAppStore((s) => s.scenarios);
  const mode = useAppStore((s) => s.mode);
  const addScenario = useAppStore((s) => s.addScenario);
  const updateScenario = useAppStore((s) => s.updateScenario);
  const setActive = useAppStore((s) => s.setActiveScenario);
  const comparing = useAppStore((s) => s.comparing);
  const setComparing = useAppStore((s) => s.setComparing);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const full = scenarios.length >= MAX_SCENARIOS;

  function onPick(siteRef: string) {
    if (picker?.kind === 'add') {
      const id = addScenario(siteRef);
      if (id) setActive(id);
    } else if (picker?.kind === 'change') {
      updateScenario(picker.id, { siteRef });
    }
    setPicker(null);
  }

  return (
    <aside className="app__left" aria-labelledby="scenarios-title">
      <h2 id="scenarios-title">{t('scenario.list')}</h2>
      <ul className="scenario-list">
        {scenarios.map((sc) => (
          <li key={sc.id}>
            <ScenarioCard scenario={sc} sites={sites.sites} onChangeSite={() => setPicker({ kind: 'change', id: sc.id })} />
          </li>
        ))}
      </ul>
      <div className="scenario-actions">
        <button type="button" onClick={() => setPicker({ kind: 'add' })} disabled={full} aria-describedby={full ? 'max-scenarios' : undefined}>
          {t('scenario.add')}
        </button>
        {full && (
          <p id="max-scenarios" className="muted">
            {t('scenario.max')}
          </p>
        )}
        {scenarios.length >= 2 && (
          <button type="button" aria-pressed={comparing} onClick={() => setComparing(!comparing)}>
            {t('scenario.compare')}
          </button>
        )}
      </div>
      {picker && (
        <SitePicker sites={sites.sites} allowCustom={mode === 'plan'} onPick={onPick} onClose={() => setPicker(null)} />
      )}
    </aside>
  );
}

interface CardProps {
  scenario: Scenario;
  sites: readonly Site[];
  onChangeSite: () => void;
}

/** Scenario card: letter and marker, short name, coordinates, relief label, landing date, actions. */
export function ScenarioCard({ scenario, sites, onChangeSite }: CardProps) {
  const { config } = useBoot();
  const activeId = useAppStore((s) => s.activeScenarioId);
  const count = useAppStore((s) => s.scenarios.length);
  const setActive = useAppStore((s) => s.setActiveScenario);
  const duplicate = useAppStore((s) => s.duplicateScenario);
  const remove = useAppStore((s) => s.removeScenario);
  const ref = parseSiteRef(scenario.siteRef);
  const site = ref.kind === 'catalogue' ? sites.find((x) => x.id === ref.id) : undefined;
  const active = scenario.id === activeId;

  const name = site?.short_name ?? (ref.kind === 'catalogue' ? ref.id : t('scenario.custom'));
  const coords = site
    ? formatLatLon(site.lat_deg, site.lon_deg)
    : ref.kind === 'custom'
      ? formatLatLon(ref.latDeg, ref.lonDeg)
      : '';
  // Custom points are smooth Moon until the mesh lookup (core/grid.ts) exists (D-69).
  const smooth = site ? site.relief === 'smooth' || !site.has_mask : true;
  const reliefLabel = site && !smooth ? site.relief_label : t('relief.smooth');
  const horizonId = site && !smooth ? site.id : null;
  const [horizon, retry] = useResource(horizonId && `horizon:${horizonId}`, () =>
    loader.loadHorizon(config.data_base_url, horizonId ?? ''),
  );

  return (
    <article
      className={`scenario-card${active ? ' scenario-card--active' : ''}`}
      aria-label={t('scenario.label', { id: scenario.id })}
      aria-current={active ? 'true' : undefined}
    >
      <button type="button" className="scenario-card__select" aria-pressed={active} onClick={() => setActive(scenario.id)}>
        <ScenarioMarker id={scenario.id} />
        <span className="scenario-card__letter">{scenario.id}</span>
        <span className="scenario-card__name">{name}</span>
      </button>
      {coords && <p className="scenario-card__coords">{coords}</p>}
      <p className={smooth ? 'scenario-card__relief warn' : 'scenario-card__relief'}>
        {smooth && <span aria-hidden="true">⚠ </span>}
        {reliefLabel}
      </p>
      {smooth && <p className="scenario-card__note">{t('relief.smooth_warning')}</p>}
      <p className="scenario-card__date">{t('scenario.landing', { date: formatUtc(scenario.landingUnix) })}</p>
      {horizonId && (
        <DataState resource={horizon} loadingText={t('scenario.loading')} errorText={t('scenario.error')} onRetry={retry}>
          {() => null}
        </DataState>
      )}
      <div className="scenario-card__actions">
        <button type="button" onClick={onChangeSite}>
          {t('scenario.change')}
        </button>
        <button type="button" onClick={() => duplicate(scenario.id)} disabled={count >= MAX_SCENARIOS}>
          {t('scenario.duplicate')}
        </button>
        <button type="button" onClick={() => remove(scenario.id)} disabled={count <= 1}>
          {t('scenario.remove')}
        </button>
      </div>
    </article>
  );
}
