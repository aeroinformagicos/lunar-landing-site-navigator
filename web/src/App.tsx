// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// App shell (T-11): loads config, manifest and sites, builds the initial state from
// `sites.json.defaults` and shows the skeleton layout. T-14 replaces the placeholder columns with
// ui/layout and ui/scenario; each view arrives with its task.
import { useEffect } from 'react';
import { DataError, loader } from './core/loaders';
import type { BootData, Site } from './core/types';
import { t, type TextKey } from './i18n/t';
import { useAppStore, type Mode, type Scenario, type Tab } from './state/store';
import { DataState, useResource } from './ui/common/DataState';

const MODES: Mode[] = ['explore', 'plan', 'learn'];
const TABS: Tab[] = ['panorama', 'timeline', 'map', 'section'];

function bootError(error: Error): string {
  return error instanceof DataError && (error.kind === 'contract' || error.kind === 'format')
    ? t('error.contract')
    : t('error.boot');
}

export function App() {
  const [boot, retry] = useResource('boot', () => loader.loadBoot());
  const init = useAppStore((s) => s.init);
  const initialised = useAppStore((s) => s.initialised);

  useEffect(() => {
    if (boot.status === 'ready' && !initialised) init(boot.data.sites.defaults);
  }, [boot, initialised, init]);

  const synthetic = boot.status === 'ready' && boot.data.manifest.ephemeris.synthetic;

  return (
    <div className="app">
      {synthetic && (
        <div className="banner banner--example" role="note">
          {t('banner.example')}
        </div>
      )}
      <Header />
      <DataState resource={boot} errorText={bootError} onRetry={retry} className="app__boot">
        {(data) => (initialised ? <Shell data={data} /> : null)}
      </DataState>
      <footer className="app__footer">
        <p>{t('footer.credit')}</p>
        <p>{t('about.ai')}</p>
      </footer>
    </div>
  );
}

function Header() {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  return (
    <header className="app__header">
      <h1 className="app__title">
        <a href="#">{t('app.title')}</a>
      </h1>
      <div role="tablist" aria-label={t('mode.label')} className="segmented">
        {MODES.map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}>
            {t(`mode.${m}` as TextKey)}
          </button>
        ))}
      </div>
    </header>
  );
}

function Shell({ data }: { data: BootData }) {
  const scenarios = useAppStore((s) => s.scenarios);
  const activeId = useAppStore((s) => s.activeScenarioId);
  const setActive = useAppStore((s) => s.setActiveScenario);
  const mode = useAppStore((s) => s.mode);
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);
  const sites = new Map(data.sites.sites.map((s) => [s.id, s]));
  const tabs: Tab[] = mode === 'plan' ? [...TABS, 'replan'] : TABS;

  return (
    <div className="app__body">
      <aside className="app__left" aria-label={t('scenario.list')}>
        <h2>{t('scenario.list')}</h2>
        <ul className="scenario-list">
          {scenarios.map((sc) => (
            <li key={sc.id}>
              <ScenarioStub
                scenario={sc}
                site={sites.get(sc.siteRef)}
                dataBase={data.config.data_base_url}
                active={sc.id === activeId}
                onSelect={() => setActive(sc.id)}
              />
            </li>
          ))}
        </ul>
      </aside>
      <main className="app__main">
        <div role="tablist" aria-label={t('tab.label')} className="tabs">
          {tabs.map((tb) => (
            <button key={tb} type="button" role="tab" aria-selected={tab === tb} onClick={() => setTab(tb)}>
              {t(`tab.${tb}` as TextKey)}
            </button>
          ))}
        </div>
        <section className="view" role="tabpanel" aria-label={t(`tab.${tab}` as TextKey)}>
          <p className="data-state data-state--empty">{t('view.pending')}</p>
        </section>
      </main>
      <aside className="app__right" />
    </div>
  );
}

interface StubProps {
  scenario: Scenario;
  site: Site | undefined;
  dataBase: string;
  active: boolean;
  onSelect: () => void;
}

/** Minimal scenario card: proves the horizon loader and its states. T-14 makes the real card. */
function ScenarioStub({ scenario, site, dataBase, active, onSelect }: StubProps) {
  const siteId = site !== undefined && site.relief !== 'smooth' && site.has_mask ? site.id : null;
  const [horizon, retry] = useResource(siteId && `horizon:${siteId}`, () =>
    loader.loadHorizon(dataBase, siteId ?? ''),
  );
  return (
    <div className={`scenario-card${active ? ' scenario-card--active' : ''}`}>
      <button type="button" className="scenario-card__select" aria-pressed={active} onClick={onSelect}>
        <span className="scenario-card__letter">{scenario.id}</span> <span>{site?.short_name ?? scenario.siteRef}</span>
      </button>
      {site && <p className="scenario-card__relief">{site.relief_label}</p>}
      {site?.relief === 'smooth' && <p className="warn">{t('relief.smooth_warning')}</p>}
      {siteId && (
        <DataState resource={horizon} loadingText={t('scenario.loading')} errorText={t('scenario.error')} onRetry={retry}>
          {() => <p className="muted">{t('scenario.ready')}</p>}
        </DataState>
      )}
    </div>
  );
}
