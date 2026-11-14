// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// What a view needs to compute a scenario: the ephemeris table, the horizon mask of the site at the
// observer height and the site frame (07_visibilidad.md §5). Loaded once per site (loader cache)
// and memoised; the views derive everything else (02_arquitectura.md §8).
import { useMemo } from 'react';
import { loadEphemeris } from '../../core/ephemeris';
import type { EphemerisTable } from '../../core/ephemeris';
import type { SiteFrame } from '../../core/frames';
import { maskFromFile, smoothMask, type Mask } from '../../core/horizon';
import { loader } from '../../core/loaders';
import type { Resource, Site } from '../../core/types';
import { t } from '../../i18n/t';
import { parseSiteRef } from '../../state/selectors';
import type { Scenario } from '../../state/store';
import { frameFor } from '../../core/visibility';
import { latLonOfCell } from '../../core/grid';
import { loadCellMask } from '../map/mapData';
import { useBoot } from './data';
import { useResource } from './DataState';

export interface ScenarioModel {
  table: EphemerisTable;
  mask: Mask;
  frame: SiteFrame;
  site: Site | undefined;
  latDeg: number;
  lonDeg: number;
  /** Relief label for the provenance line (`Smooth Moon (no terrain)` on a smooth mask). */
  reliefLabel: string;
  smooth: boolean;
}

/** Every mesh point lies inside P1 (08 §1.2). */
export const MESH_RELIEF = 'LOLA polar 40 m + 120 m';

export function useEphemerisTable(): [Resource<EphemerisTable>, () => void] {
  const { config } = useBoot();
  return useResource(`ephemeris:${config.data_base_url}`, () => loadEphemeris(config.data_base_url));
}

/** Table + mask + frame of a scenario, or its loading/error state. */
export function useScenarioModel(scenario: Scenario): [Resource<ScenarioModel>, () => void] {
  const { config, sites } = useBoot();
  const ref = parseSiteRef(scenario.siteRef);
  const site = ref.kind === 'catalogue' ? sites.sites.find((s) => s.id === ref.id) : undefined;
  const withMask = site !== undefined && site.relief !== 'smooth' && site.has_mask;
  const h = scenario.observerHeightM;

  const [table, retryTable] = useEphemerisTable();
  const [horizon, retryHorizon] = useResource(withMask ? `horizon:${site.id}` : null, () =>
    loader.loadHorizon(config.data_base_url, site!.id),
  );
  // Mesh point (08 §7): mask from the horizon cube of the heavy origin.
  const cell = ref.kind === 'grid' ? ref : null;
  const [cellMask, retryCell] = useResource(cell ? `cell:${cell.i},${cell.j}` : null, () =>
    loadCellMask(loader, config.heavy_base_url, null, cell!.i, cell!.j),
  );

  const model = useMemo((): Resource<ScenarioModel> => {
    if (table.status === 'error') return table;
    if (withMask && horizon.status === 'error') return horizon;
    if (cell && cellMask.status === 'error') return cellMask;
    if (table.status !== 'ready' || (withMask && horizon.status !== 'ready')) return { status: 'loading' };
    if (cell) {
      if (cellMask.status !== 'ready') return { status: 'loading' };
      const { latDeg, lonDeg } = latLonOfCell(cell.i, cell.j);
      const mask = cellMask.data;
      return {
        status: 'ready',
        data: { table: table.data, mask, frame: frameFor(latDeg, lonDeg, mask), site: undefined, latDeg, lonDeg, reliefLabel: MESH_RELIEF, smooth: false },
      };
    }
    const latDeg = site ? site.lat_deg : ref.kind === 'custom' ? ref.latDeg : Number.NaN;
    const lonDeg = site ? site.lon_deg : ref.kind === 'custom' ? ref.lonDeg : Number.NaN;
    let mask: Mask | null = null;
    if (withMask && horizon.status === 'ready') mask = maskFromFile(horizon.data, h) ?? maskFromFile(horizon.data, 2);
    const smooth = mask === null;
    if (!mask) mask = smoothMask(h, latDeg, lonDeg);
    return {
      status: 'ready',
      data: {
        table: table.data,
        mask,
        frame: frameFor(latDeg, lonDeg, mask),
        site,
        latDeg,
        lonDeg,
        reliefLabel: smooth ? t('relief.smooth') : site!.relief_label,
        smooth,
      },
    };
    // `ref` is derived from scenario.siteRef.
  }, [table, horizon, cellMask, withMask, site, h, scenario.siteRef]);

  const retry = () => {
    retryTable();
    retryHorizon();
    retryCell();
  };
  return [model, retry];
}
