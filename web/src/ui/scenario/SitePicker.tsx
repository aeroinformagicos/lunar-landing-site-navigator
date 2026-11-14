// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Site picker (10_interfaz.md §5, F1): modal dialog with search, sites grouped by type and, in Plan,
// custom coordinates. Each row: name, coordinates, year and relief label.
import { useMemo, useState } from 'react';
import type { Site } from '../../core/types';
import { t, type TextKey } from '../../i18n/t';
import { groupSites, parseCustomCoords, SITE_GROUPS, siteYear } from '../../state/selectors';
import { Dialog } from '../common/Dialog';
import { formatLatLon } from '../common/format';

export interface SitePickerProps {
  sites: readonly Site[];
  /** Plan mode shows the custom coordinates section. */
  allowCustom: boolean;
  onPick: (siteRef: string) => void;
  onClose: () => void;
}

export function SitePicker({ sites, allowCustom, onPick, onClose }: SitePickerProps) {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => groupSites(sites, query), [sites, query]);
  const empty = SITE_GROUPS.every((g) => groups[g].length === 0);

  return (
    <Dialog title={t('picker.title')} onClose={onClose} className="site-picker">
      <label className="field">
        <span>{t('picker.search')}</span>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      </label>
      <div className="site-picker__list">
        {empty && <p className="muted">{t('picker.none', { q: query })}</p>}
        {SITE_GROUPS.filter((g) => groups[g].length > 0).map((g) => (
          <section key={g} aria-label={t(`picker.group.${g}` as TextKey)}>
            <h3>{t(`picker.group.${g}` as TextKey)}</h3>
            <ul>
              {groups[g].map((site) => (
                <li key={site.id}>
                  <button type="button" className="site-row" onClick={() => onPick(site.id)}>
                    <span className="site-row__name">{site.name}</span>
                    <span className="site-row__meta">
                      {formatLatLon(site.lat_deg, site.lon_deg)}
                      {siteYear(site) && ` · ${siteYear(site)}`} · {site.relief_label}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {allowCustom && <CustomCoordinates onUse={onPick} />}
    </Dialog>
  );
}

function CustomCoordinates({ onUse }: { onUse: (siteRef: string) => void }) {
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [errors, setErrors] = useState<('lat' | 'lon')[]>([]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = parseCustomCoords(lat, lon);
    if ('errors' in r) setErrors(r.errors);
    else onUse(r.siteRef);
  }

  return (
    <form className="custom-coords" onSubmit={submit} noValidate>
      <h3>{t('picker.custom')}</h3>
      <label className="field">
        <span>{t('picker.lat')}</span>
        <input
          inputMode="decimal"
          value={lat}
          aria-invalid={errors.includes('lat')}
          aria-describedby={errors.includes('lat') ? 'lat-error' : undefined}
          onChange={(e) => setLat(e.target.value)}
        />
      </label>
      {errors.includes('lat') && (
        <p id="lat-error" className="field__error" role="alert">
          {t('picker.lat_error')}
        </p>
      )}
      <label className="field">
        <span>{t('picker.lon')}</span>
        <input
          inputMode="decimal"
          value={lon}
          aria-invalid={errors.includes('lon')}
          aria-describedby={errors.includes('lon') ? 'lon-error' : undefined}
          onChange={(e) => setLon(e.target.value)}
        />
      </label>
      {errors.includes('lon') && (
        <p id="lon-error" className="field__error" role="alert">
          {t('picker.lon_error')}
        </p>
      )}
      <button type="submit">{t('picker.use')}</button>
    </form>
  );
}
