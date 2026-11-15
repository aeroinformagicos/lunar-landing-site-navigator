// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Which scene the 3D view mounts for the active site (16_vista_3d.md §2.1), where each scenario sits,
// and the texts of the view (status line, relief line, description of §13). Pure.
import { GRID, latLonOfCell, xyOfLatLon } from '../../core/grid';
import { blockerAt, type Mask } from '../../core/horizon';
import type { Site } from '../../core/types';
import type { SkyState } from '../../core/visibility';
import { t, type TextKey } from '../../i18n/t';
import { parseSiteRef } from '../../state/selectors';
import { formatDeg, formatLatLon } from '../common/format';
import { compassWord, distanceWords } from '../summary/summarize';

/** The four scenes of §2.1: polar mesh, profile mesh, horizon ring, smooth Moon. */
export type SceneKind = 'polar' | 'profile' | 'ring' | 'smooth';
export type DemStatus = 'loading' | 'ready' | 'error';
/** A data source of a scene: not wanted for this site, loading, ready, or failed. */
export type Source = 'none' | 'loading' | 'ready' | 'error';

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

export interface SceneInput {
  latDeg: number;
  lonDeg: number;
  /** `map/dem_500m.bin.gz` of the heavy origin. */
  dem: DemStatus;
  /** `profile/<site_id>.bin.gz`: `none` unless the site is from the catalogue, has a profile and relief. */
  profile: Source;
  /** The site's horizon mask with relief (`has_mask`, or a mesh point): `none` on a smooth Moon. */
  mask: Source;
}

/** The scene and whether its data is still on its way (§2.1); a data error moves one scene down. */
export interface ScenePick {
  kind: SceneKind;
  /** The scene's data is still loading: a placeholder sphere is drawn meanwhile (§13, state 2). */
  pending: boolean;
}

/**
 * §2.1 (D-97 b), in order: polar if the site is inside the mesh and its DEM loads; else the profile
 * mesh; else the horizon ring from the mask; else the smooth Moon. A failed source moves down one
 * case, never to the 2D view.
 */
export function pickScene(i: SceneInput): ScenePick {
  if (inPolarMesh(i.latDeg, i.lonDeg) && i.dem !== 'error') return { kind: 'polar', pending: i.dem === 'loading' };
  if (i.profile === 'ready' || i.profile === 'loading') return { kind: 'profile', pending: i.profile === 'loading' };
  if (i.mask === 'ready' || i.mask === 'loading') return { kind: 'ring', pending: i.mask === 'loading' };
  return { kind: 'smooth', pending: false };
}

/** Short form used by the T-71 tests: polar while its DEM loads or once ready, smooth Moon otherwise. */
export function chooseScene(latDeg: number, lonDeg: number, dem: DemStatus): SceneKind {
  return pickScene({ latDeg, lonDeg, dem, profile: 'none', mask: 'none' }).kind;
}

/**
 * A catalogue site drawn as a marker in the polar scene (§8.5). Candidate regions with a contour
 * (`region_id` set) are drawn by their outline instead (§8.2); candidate points without one
 * (`region_id` null, T-91) are markers like any other site.
 */
export function catalogueMarker(site: Pick<Site, 'type' | 'region_id'>): boolean {
  return !(site.type === 'candidate_region' && site.region_id !== null);
}

export type ReliefLevel = 'ok' | 'warn' | 'red';

/**
 * Relief line of the controls (§2.1, §6.7): what the 3D shows and what the figures use. A smooth site
 * gets the red smooth-Moon notice with its triangle; a site with relief drawn as a smooth Moon (its
 * data failed) says so in the warning colour (D-107 b).
 */
export function reliefLine(kind: SceneKind, smoothSite: boolean, figuresRelief: string): { text: string; warn: boolean; level: ReliefLevel } {
  if (kind === 'polar') return { text: t('stage3d.relief_polar', { relief: figuresRelief }), warn: false, level: 'ok' };
  if (kind === 'profile') return { text: t('stage3d.relief_profile', { relief: figuresRelief }), warn: false, level: 'ok' };
  if (kind === 'ring') return { text: t('stage3d.relief_ring', { relief: figuresRelief }), warn: false, level: 'ok' };
  if (smoothSite) return { text: t('relief.smooth'), warn: true, level: 'red' };
  return { text: t('stage3d.relief_none', { relief: figuresRelief }), warn: true, level: 'warn' };
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
  /** The scene on screen (§2.1); the polar one needs no sentence. */
  scene?: SceneKind;
  /** The projected map layer and its period, when shown (§9). */
  overlay?: { layer: string; period: string } | null;
}

const SCENE_SENTENCE: Partial<Record<SceneKind, TextKey>> = {
  profile: 'stage3d.desc.scene_profile',
  ring: 'stage3d.desc.scene_ring',
  smooth: 'stage3d.desc.scene_smooth',
};

/** Text description of the view for screen readers (§13). Never prints NaN or identifiers. */
export function describeView(d: DescribeInput): string {
  const parts = [t('stage3d.desc.site', { letter: d.letter, name: d.name, coords: formatLatLon(d.latDeg, d.lonDeg) })];
  const scene = d.scene ? SCENE_SENTENCE[d.scene] : undefined;
  if (scene) parts.push(t(scene));
  if (d.overlay) parts.push(t('stage3d.desc.overlay', d.overlay));
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
