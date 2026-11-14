// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Which scene the 3D view mounts for the active site (16_vista_3d.md §2.1), where each scenario sits,
// and the texts of the view (status line, relief line, description of §13). Pure.
import { GRID, latLonOfCell, xyOfLatLon } from '../../core/grid';
import { blockerAt, type Mask } from '../../core/horizon';
import type { Site } from '../../core/types';
import type { SkyState } from '../../core/visibility';
import { t } from '../../i18n/t';
import { parseSiteRef } from '../../state/selectors';
import { formatDeg, formatLatLon } from '../common/format';
import { compassWord, distanceWords } from '../summary/summarize';

/** T-71 knows the polar scene (a) and the smooth Moon (d); (b) and (c) arrive with T-73. */
export type SceneKind = 'polar' | 'smooth';
export type DemStatus = 'loading' | 'ready' | 'error';

export function siteLatLon(siteRef: string, sites: readonly Site[]): { latDeg: number; lonDeg: number } | null {
  const ref = parseSiteRef(siteRef);
  if (ref.kind === 'custom') return { latDeg: ref.latDeg, lonDeg: ref.lonDeg };
  if (ref.kind === 'grid') return latLonOfCell(ref.i, ref.j);
  const s = sites.find((x) => x.id === ref.id);
  return s ? { latDeg: s.lat_deg, lonDeg: s.lon_deg } : null;
}

/** The point falls inside the rectangle of the polar mesh (08 §1.2). */
export function inPolarMesh(latDeg: number, lonDeg: number): boolean {
  if (!(latDeg < -75)) return false;
  const { x, y } = xyOfLatLon(latDeg, lonDeg);
  return x >= GRID.xMinM && x <= GRID.xMinM + GRID.nx * GRID.cellM && y <= GRID.yMaxM && y >= GRID.yMaxM - GRID.ny * GRID.cellM;
}

/** §2.1: polar while its DEM loads or once it is ready; smooth Moon otherwise (until T-73). */
export function chooseScene(latDeg: number, lonDeg: number, dem: DemStatus): SceneKind {
  return inPolarMesh(latDeg, lonDeg) && dem !== 'error' ? 'polar' : 'smooth';
}

/** Relief line of the controls (§6.7): what the 3D shows and what the figures use. */
export function reliefLine(kind: SceneKind, smoothSite: boolean, figuresRelief: string): { text: string; warn: boolean } {
  if (kind === 'polar') return { text: t('stage3d.relief_polar', { relief: figuresRelief }), warn: false };
  if (smoothSite) return { text: t('relief.smooth'), warn: true };
  return { text: t('stage3d.relief_none', { relief: figuresRelief }), warn: true };
}

/** One body of the pin's status line: `✓ Sun 0.24°` or `✕ Sun hidden` (icon and word, §8.1). */
export function bodyStatus(body: 'sun' | 'earth', visible: boolean, elDeg: number): string {
  const name = t(body === 'sun' ? 'stage3d.sun' : 'stage3d.earth');
  return visible ? t('stage3d.body_up', { body: name, el: formatDeg(elDeg) }) : t('stage3d.body_hidden', { body: name });
}

export interface DescribeInput {
  letter: string;
  name: string;
  latDeg: number;
  lonDeg: number;
  sky: SkyState | null;
  mask: Mask | null;
  /** Camera mode; `distM` is the distance to the site (orbit) or the height above the terrain (fly). */
  mode?: 'orbit' | 'fly' | 'ground';
  distM: number;
  headingDeg: number;
  /** Observer height in Ground (m). */
  eyeM?: number;
}

/** Text description of the view for screen readers (§13). Never prints NaN or identifiers. */
export function describeView(d: DescribeInput): string {
  const parts = [t('stage3d.desc.site', { letter: d.letter, name: d.name, coords: formatLatLon(d.latDeg, d.lonDeg) })];
  if (d.sky) {
    const s = d.sky.sun;
    if (s.visible) parts.push(t('stage3d.desc.sun_up', { el: formatDeg(s.elDeg) }));
    else {
      const b = d.mask ? blockerAt(d.mask, s.azDeg) : null;
      const behind = b && Number.isFinite(b.distM) && s.elDeg > d.mask!.minElDeg - 1;
      parts.push(
        behind
          ? t('stage3d.desc.sun_hidden', { dist: distanceWords(b!.distM), dir: compassWord(s.azDeg) })
          : t('stage3d.desc.sun_down'),
      );
    }
    const e = d.sky.earth;
    parts.push(e.visible ? t('stage3d.desc.earth_up', { el: formatDeg(e.elDeg) }) : t('stage3d.desc.earth_hidden'));
  }
  const dir = compassWord(((d.headingDeg % 360) + 360) % 360);
  if (d.mode === 'ground') parts.push(t('stage3d.desc.camera_ground', { h: d.eyeM ?? 2, dir }));
  else if (Number.isFinite(d.distM)) {
    const dist = distanceWords(Math.max(0, d.distM));
    parts.push(t(d.mode === 'fly' ? 'stage3d.desc.camera_fly' : 'stage3d.desc.camera', { dist, dir }));
  }
  return parts.join(' ');
}
