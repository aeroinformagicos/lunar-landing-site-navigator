// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Central stage of the v2 shell (15_interfaz_v2.md §4.1, §5.3): full-screen under the panels.
// Horizon shows Stage3D (lane I3, dynamic import) or Stage2D by `viewMode`; the other views, and the
// comparison, go in the central sheet. If the 3D module is missing or throws, the 2D view is shown.
import { Component, lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { DataError } from '../../core/loaders';
import { t } from '../../i18n/t';
import { useAppStore, type Tab } from '../../state/store';
import { can3d, STAGE3D_MODULES } from '../../state/viewMode';
import { DataState } from '../common/DataState';
import { Compare } from '../compare/Compare';
import { Panorama } from '../panorama/Panorama';
import { Replan } from '../replan/Replan';
import { CrossSection } from '../section/CrossSection';
import { replanViewForStep } from '../story/storySteps';
import { Timeline } from '../timeline/Timeline';
import { useActive, type ActiveReady } from './useActive';

const load3d = Object.values(STAGE3D_MODULES)[0] as (() => Promise<{ default: ComponentType }>) | undefined;
const Stage3D = load3d ? lazy(load3d) : null;
const MapView = lazy(() => import('../map/MapView'));

function dataError(e: Error): string {
  if (e instanceof RangeError) return t('error.range');
  if (e instanceof DataError && (e.kind === 'contract' || e.kind === 'format')) return t('error.contract');
  return t('error.ephemeris');
}

/** A 3D view that throws while rendering falls back to 2D with the plain notice (16 §10.3). */
class Fallback3d extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    useAppStore.getState().fallbackTo2d(error.message);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Active-scenario data for a view, with the four states of `DataState`. */
function WithData({ children, loading }: { children: (d: ActiveReady) => ReactNode; loading?: string }) {
  const { resource, retry } = useActive();
  return (
    <DataState resource={resource} loadingText={loading ?? t('view.ephemeris_loading')} errorText={dataError} onRetry={retry} className="v2-state">
      {children}
    </DataState>
  );
}

/** Provisional 2D view (T-61): the current panorama, centred on the stage, until T-62 draws it full-width. */
function Stage2D() {
  const { scenario } = useActive();
  return (
    <div className="v2-stage2d" data-view="2d">
      <WithData loading={t('common.loading')}>{(d) => <Panorama model={d.model} mission={d.mission} scenario={scenario} />}</WithData>
    </div>
  );
}

function SheetView({ tab }: { tab: Tab }) {
  const { scenario } = useActive();
  const storyStep = useAppStore((s) => s.storyStep);
  if (tab === 'map') {
    return (
      <Suspense fallback={<p className="data-state data-state--loading">{t('map.loading')}</p>}>
        <MapView />
      </Suspense>
    );
  }
  if (tab === 'replan') return <Replan story={replanViewForStep(storyStep)} />;
  if (tab === 'section') return <WithData>{(d) => <CrossSection model={d.model} scenario={scenario} />}</WithData>;
  return <WithData>{(d) => <Timeline model={d.model} mission={d.mission} scenario={scenario} />}</WithData>;
}

export function Stage() {
  const tab = useAppStore((s) => s.tab);
  const viewMode = useAppStore((s) => s.viewMode);
  const comparing = useAppStore((s) => s.comparing);
  const setComparing = useAppStore((s) => s.setComparing);
  const show3d = tab === 'panorama' && !comparing && viewMode === '3d' && Stage3D !== null && can3d();

  return (
    <main
      id="main-view"
      className={`v2-stage v2-stage--${tab}${comparing ? ' v2-stage--sheet' : tab === 'panorama' ? '' : ' v2-stage--sheet'}`}
      role="tabpanel"
      aria-labelledby={`tab-${tab}`}
      tabIndex={-1}
      data-view-mode={show3d ? '3d' : '2d'}
    >
      {show3d && Stage3D ? (
        <div className="v2-stage3d">
          <Fallback3d>
            <Suspense fallback={<p className="v2-stage__loading">{t('view.loading_3d')}</p>}>
              <Stage3D />
            </Suspense>
          </Fallback3d>
        </div>
      ) : tab === 'panorama' && !comparing ? (
        <Stage2D />
      ) : (
        <div className="v2-sheet">{comparing ? <Compare onClose={() => setComparing(false)} /> : <SheetView tab={tab} />}</div>
      )}
    </main>
  );
}
