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

  const model = useMemo((): Resource<ScenarioModel> => {
    if (table.status === 'error') return table;
    if (withMask && horizon.status === 'error') return horizon;
    if (table.status !== 'ready' || (withMask && horizon.status !== 'ready')) return { status: 'loading' };
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
  }, [table, horizon, withMask, site, h, scenario.siteRef]);

  const retry = () => {
    retryTable();
    retryHorizon();
  };
  return [model, retry];
}
