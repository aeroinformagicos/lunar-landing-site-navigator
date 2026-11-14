// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Single-screen layout (10_interfaz.md §3): header, scenario column, tabs and main view, right panel.
// Keyboard shortcuts of §12 and the mobile rule for Plan (§3.2).
import { useEffect, useState } from 'react';
import { t, type TextKey } from '../../i18n/t';
import { shortcutFor } from '../../state/selectors';
import { useAppStore, type Tab } from '../../state/store';
import { useBoot } from '../common/data';
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
            <section id="main-view" className="view" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={0}>
              <p className="data-state data-state--empty">{t('view.pending')}</p>
            </section>
          </main>
          <aside className="app__right" aria-label={t('panel.label')} />
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
