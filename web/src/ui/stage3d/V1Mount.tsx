// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Stage3D inside the current interface (16_vista_3d.md §10.5), until the v2 shell (T-61) mounts it:
// only with `?ui=v2&vm=3d`; any failure shows the 2D panorama with the fallback notice. This file
// does not import three.js: the 3D chunk loads on demand.
import { Component, lazy, Suspense, type ReactNode } from 'react';
import { t } from '../../i18n/t';

const Stage3D = lazy(() => import('./index'));

/** The URL asks for the 3D view in the current interface. */
export function stage3dInV1(search = typeof location === 'undefined' ? '' : location.search): boolean {
  const q = new URLSearchParams(search);
  return q.get('ui') === 'v2' && q.get('vm') === '3d';
}

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <>
        <p className="stage3d-v1__notice" role="status" data-testid="stage3d-fallback">
          {t('stage3d.fallback')}
        </p>
        {this.props.fallback}
      </>
    );
  }
}

export function Stage3DV1({ fallback }: { fallback: ReactNode }) {
  return (
    <Boundary fallback={fallback}>
      <Suspense fallback={<p className="data-state data-state--loading">{t('stage3d.loading')}</p>}>
        <div className="stage3d-v1">
          <Stage3D />
        </div>
      </Suspense>
    </Boundary>
  );
}
