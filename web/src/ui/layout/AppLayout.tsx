// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Single-screen layout (10_interfaz.md §3): header, scenario column, tabs and main view, right panel.
// Keyboard shortcuts of §12 and the mobile rule for Plan (§3.2).
import { useEffect, useState } from 'react';
import { t, type TextKey } from '../../i18n/t';
import { activeScenario, shortcutFor } from '../../state/selectors';
import { useAppStore, type Tab } from '../../state/store';
import { DataError } from '../../core/loaders';
import { useBoot } from '../common/data';
import { DataState } from '../common/DataState';
import { useScenarioModel, type ScenarioModel } from '../common/model';
import { MetricsPanel } from '../metrics/MetricsPanel';
import { useMission, type MissionResult } from '../metrics/useMission';
import { Compare } from '../compare/Compare';
import { Panorama } from '../panorama/Panorama';
import { CrossSection } from '../section/CrossSection';
import { Timeline } from '../timeline/Timeline';
import { Dialog } from '../common/Dialog';
import { togglePlay } from '../controls/TimeControls';
import { ScenarioColumn } from '../scenario/ScenarioColumn';
import { Header } from './Header';

const BASE_TABS: Tab[] = ['panorama', 'timeline', 'map', 'section'];
const MOBILE_QUERY = '(max-width: 767px)';

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => typeof matchMedia === 'function' && matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(MOBILE_QUERY);
    const on = () => setMobile(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return mobile;
}

/** Global shortcuts: `1`–`4` tabs, `Space` play, `[` `]` ±1 h, `?` help. */
function useShortcuts(onHelp: () => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[role="dialog"]')) return;
      const sc = shortcutFor({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        targetTag: target?.tagName,
        targetRole: target?.getAttribute('role') ?? null,
      });
      if (!sc) return;
      e.preventDefault();
      const s = useAppStore.getState();
      if (sc.kind === 'tab') s.setTab(sc.tab);
      else if (sc.kind === 'play') togglePlay();
      else if (sc.kind === 'step') s.setCursor(s.cursorUnix + sc.seconds);
      else onHelp();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onHelp]);
}

export function AppLayout() {
  const { sites } = useBoot();
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);
  const comparing = useAppStore((s) => s.comparing);
  const setComparing = useAppStore((s) => s.setComparing);
  const init = useAppStore((s) => s.init);
  const mobile = useIsMobile();
  const [help, setHelp] = useState(false);
  useShortcuts(() => setHelp(true));

  const tabs: Tab[] = mode === 'plan' ? [...BASE_TABS, 'replan'] : BASE_TABS;
  const reset = () => init(sites.defaults);

  function onTabKey(e: React.KeyboardEvent, i: number) {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = tabs[(i + d + tabs.length) % tabs.length];
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  }

  return (
    <>
      <Header onReset={reset} />
      {mobile && mode === 'plan' ? (
        <main className="app__plan-mobile">
          <p>{t('mobile.plan')}</p>
          <button type="button" onClick={() => setMode('explore')}>
            {t('mobile.back')}
          </button>
        </main>
      ) : (
        <div className="app__body">
          <ScenarioColumn />
          <main className="app__main">
            <div role="tablist" aria-label={t('tab.label')} className="tabs">
              {tabs.map((tb, i) => (
                <button
                  key={tb}
                  id={`tab-${tb}`}
                  type="button"
                  role="tab"
                  aria-selected={tab === tb}
                  aria-controls="main-view"
                  tabIndex={tab === tb ? 0 : -1}
                  onClick={() => setTab(tb)}
                  onKeyDown={(e) => onTabKey(e, i)}
                >
                  {t(`tab.${tb}` as TextKey)}
                </button>
              ))}
            </div>
            <section id="main-view" className="view" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={-1}>
              {comparing ? <Compare onClose={() => setComparing(false)} /> : <ActiveView tab={tab} />}
            </section>
          </main>
          <aside className="app__right" aria-label={t('panel.label')}>
            <ActiveView tab="panel" />
          </aside>
        </div>
      )}
      {help && (
        <Dialog title={t('shortcuts.title')} onClose={() => setHelp(false)}>
          <ul className="shortcuts">
            <li>{t('shortcuts.tabs')}</li>
            <li>{t('shortcuts.play')}</li>
            <li>{t('shortcuts.step')}</li>
            <li>{t('shortcuts.help')}</li>
          </ul>
        </Dialog>
      )}
    </>
  );
}

function dataError(e: Error): string {
  if (e instanceof RangeError) return t('error.range');
  if (e instanceof DataError && (e.kind === 'contract' || e.kind === 'format')) return t('error.contract');
  return t('error.ephemeris');
}

/** Views of the active scenario: one model and one memoised mission per render of the layout. */
function ActiveView({ tab }: { tab: Tab | 'panel' }) {
  const scenario = useAppStore(activeScenario);
  const [model, retry] = useScenarioModel(scenario);
  const ready = model.status === 'ready' ? model.data : null;
  const mission = useMission(ready, scenario);
  if (tab !== 'timeline' && tab !== 'panel' && tab !== 'panorama' && tab !== 'section') return <p className="data-state data-state--empty">{t('view.pending')}</p>;
  const resource =
    mission instanceof Error
      ? ({ status: 'error', error: mission } as const)
      : model.status === 'ready' && mission
        ? ({ status: 'ready', data: { model: model.data, mission } } as const)
        : model.status === 'error'
          ? model
          : ({ status: 'loading' } as const);
  return (
    <DataState
      resource={resource}
      loadingText={tab === 'panorama' ? t('common.loading') : t('view.ephemeris_loading')}
      errorText={(e) => (tab === 'panorama' && !(e instanceof RangeError) ? t('pano.unavailable') : dataError(e))}
      onRetry={retry}
    >
      {(d: { model: ScenarioModel; mission: MissionResult }) =>
        tab === 'panel' ? (
          <MetricsPanel model={d.model} mission={d.mission} scenario={scenario} />
        ) : tab === 'panorama' ? (
          <Panorama model={d.model} mission={d.mission} scenario={scenario} />
        ) : tab === 'section' ? (
          <CrossSection model={d.model} scenario={scenario} />
        ) : (
          <Timeline model={d.model} mission={d.mission} scenario={scenario} />
        )
      }
    </DataState>
  );
}
