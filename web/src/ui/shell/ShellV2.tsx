// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Interface v2 shell (15_interfaz_v2.md, T-61): a single 100vw × 100vh screen with the central stage
// underneath and floating panels on top: brand, scenario pills, mode, 3D/2D switch, Sites, Setup,
// Now at site and the bottom strip. Opened with `?ui=v2` until T-63.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t } from '../../i18n/t';
import { useAppStore, type ScenarioId, type Tab } from '../../state/store';
import { useBoot } from '../common/data';
import { Dialog } from '../common/Dialog';
import { useShortcuts } from '../layout/AppLayout';
import { SitePicker } from '../scenario/SitePicker';
import { WelcomeCard } from '../welcome/WelcomeCard';
import { welcomePending } from '../welcome/welcome';
import { Figures, Provenance, SummaryBlock, TimeBar, Verdict, ViewTabs } from './BottomStrip';
import { NowPanel, SetupPanel, SitesPanel } from './Panels';
import { Stage } from './Stage';
import { Brand, ModeNav, ScenarioPills, ViewToggle } from './TopBar';
import { ActiveContext, useActiveData } from './useActive';
import { readPanelOpen, writePanelOpen } from './panelState';

/** Shortcuts of the 3D view, listed in the global help if lane I3 has added them (16 §10.4). */
const STAGE3D_SHORTCUT_MODULES = import.meta.glob('../stage3d/shortcuts.ts', { eager: true }) as Record<
  string,
  { STAGE3D_SHORTCUTS?: { keys: string; actionKey: string }[] }
>;
const STAGE3D_SHORTCUTS = Object.values(STAGE3D_SHORTCUT_MODULES)[0]?.STAGE3D_SHORTCUTS ?? [];

/** `1`–`4` follow the v2 tab order (D-101): Horizon, Map, Timeline, Terrain profile. */
const remapTab = (tab: Tab): Tab => (tab === 'timeline' ? 'map' : tab === 'map' ? 'timeline' : tab);

type PickerTarget = { kind: 'add' } | { kind: 'change'; id: string };

export default function ShellV2() {
  const { sites } = useBoot();
  const active = useActiveData();
  const mode = useAppStore((s) => s.mode);
  const tab = useAppStore((s) => s.tab);
  const comparing = useAppStore((s) => s.comparing);
  const viewNotice = useAppStore((s) => s.viewNotice);
  const dismissViewNotice = useAppStore((s) => s.dismissViewNotice);
  const init = useAppStore((s) => s.init);
  const addScenario = useAppStore((s) => s.addScenario);
  const updateScenario = useAppStore((s) => s.updateScenario);
  const setActive = useAppStore((s) => s.setActiveScenario);
  const [help, setHelp] = useState(false);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  // Left panels as an accordion: one open at a time, so each gets the full height (15 §5.1).
  const [left, setLeftState] = useState<'sites' | 'setup' | null>(() =>
    readPanelOpen('sites', false) ? 'sites' : readPanelOpen('setup', false) ? 'setup' : null,
  );
  const setLeft = (which: 'sites' | 'setup' | null) => {
    setLeftState(which);
    writePanelOpen('sites', which === 'sites');
    writePanelOpen('setup', which === 'setup');
  };
  const [welcome, setWelcome] = useState(welcomePending);

  const onHelp = useCallback(() => setHelp(true), []);
  // The stage views end where the bottom strip starts: its height is measured, not assumed.
  const rootRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    const bottom = bottomRef.current;
    if (!root || !bottom || typeof ResizeObserver === 'undefined') return;
    const set = () => root.style.setProperty('--bottom-h', `${Math.ceil(bottom.getBoundingClientRect().height) + 24}px`);
    const ro = new ResizeObserver(set);
    ro.observe(bottom);
    set();
    return () => ro.disconnect();
  }, []);
  useShortcuts(onHelp, remapTab);

  // `V` switches 3D / 2D (15 §4.1), except while typing, in a dialog or in the guided story.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'v' && e.key !== 'V') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.closest('[role="dialog"]')) return;
      const s = useAppStore.getState();
      if (s.mode === 'learn') return;
      e.preventDefault();
      s.setViewMode(s.viewMode === '3d' ? '2d' : '3d');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function onPick(siteRef: string) {
    if (picker?.kind === 'add') {
      const id = addScenario(siteRef);
      if (id) setActive(id);
    } else if (picker?.kind === 'change') {
      updateScenario(picker.id as ScenarioId, { siteRef });
    }
    setPicker(null);
  }
  const openPicker = (target: PickerTarget) => {
    if (target.kind === 'add') setLeft('sites');
    setPicker(target);
  };

  const learning = mode === 'learn';
  const onHorizon = tab === 'panorama' && !comparing;

  return (
    <ActiveContext.Provider value={active}>
      <div ref={rootRef} className={`v2${learning ? ' v2--learn' : ''}${onHorizon ? '' : ' v2--sheet'}`}>
        <a className="v2-skip" href="#main-view">
          {t('shell.skip')}
        </a>
        <Stage />

        <Brand onReset={() => init(sites.defaults)} />
        <ScenarioPills onAdd={() => openPicker({ kind: 'add' })} />
        <ModeNav />
        {onHorizon && <ViewToggle />}

        <div className="v2-left">
          <SitesPanel onPick={openPicker} open={left === 'sites'} onOpenChange={(o) => setLeft(o ? 'sites' : null)} />
          <SetupPanel open={left === 'setup'} onOpenChange={(o) => setLeft(o ? 'setup' : null)} />
        </div>
        <div className="v2-right">
          <NowPanel />
        </div>

        <section ref={bottomRef} className="v2-bottom" aria-label={t('panel.label')}>
          <div className="v2-mission">
            <Verdict />
            {!learning && <Figures />}
            {!learning && onHorizon && <SummaryBlock />}
          </div>
          <ViewTabs />
          <TimeBar />
          <Provenance />
        </section>

        {viewNotice && (
          <div className="v2-notice" role="status">
            <span>{t('view.3d_unavailable')}</span>
            <button type="button" className="v2-link" onClick={dismissViewNotice}>
              {t('share.dismiss')}
            </button>
          </div>
        )}

        {welcome && mode === 'explore' && (
          <div className="v2-welcome">
            <WelcomeCard onClose={() => setWelcome(false)} />
          </div>
        )}

        {picker && <SitePicker sites={sites.sites} allowCustom={mode === 'plan'} onPick={onPick} onClose={() => setPicker(null)} />}

        {help && (
          <Dialog title={t('shortcuts.title')} onClose={() => setHelp(false)}>
            <ul className="shortcuts">
              <li>{t('shortcuts.tabs')}</li>
              <li>{t('shortcuts.play')}</li>
              <li>{t('shortcuts.step')}</li>
              <li>{t('shortcuts.view')}</li>
              <li>{t('shortcuts.help')}</li>
              {STAGE3D_SHORTCUTS.map((s) => (
                <li key={s.keys}>
                  {s.keys}: {t(s.actionKey as Parameters<typeof t>[0])}
                </li>
              ))}
            </ul>
          </Dialog>
        )}
      </div>
    </ActiveContext.Provider>
  );
}
