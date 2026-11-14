// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Minimap of the south pole (15_interfaz_v2.md §3.1, zone K): a round button that opens the Map
// view. Polar stereographic like the map (core/grid `xyOfLatLon`, 0° E up), rings every 2° of
// latitude, the NASA candidate regions and the scenarios with their marker shape and letter.
import { xyOfLatLon } from '../../core/grid';
import { t } from '../../i18n/t';
import { parseSiteRef } from '../../state/selectors';
import { useAppStore, type ScenarioId } from '../../state/store';
import { useBoot } from '../common/data';
import { latLonOfCell } from '../../core/grid';

const SIZE = 196;
/** Radius of the minimap in metres of the polar projection: about 6° from the pole. */
const RADIUS_M = 190_000;

const SHAPE: Record<ScenarioId, (x: number, y: number) => string> = {
  A: (x, y) => `M${x - 5} ${y}a5 5 0 1 0 10 0a5 5 0 1 0 -10 0`,
  B: (x, y) => `M${x - 4} ${y - 4}h8v8h-8Z`,
  C: (x, y) => `M${x} ${y - 5}l5 9h-10Z`,
  D: (x, y) => `M${x} ${y - 5}l5 5-5 5-5-5Z`,
};

export function Minimap() {
  const { sites } = useBoot();
  const scenarios = useAppStore((s) => s.scenarios);
  const activeId = useAppStore((s) => s.activeScenarioId);
  const setTab = useAppStore((s) => s.setTab);
  const c = SIZE / 2;
  const s = (c - 6) / RADIUS_M;
  const at = (latDeg: number, lonDeg: number) => {
    const p = xyOfLatLon(latDeg, lonDeg);
    return { x: c + p.x * s, y: c - p.y * s, inside: Math.hypot(p.x, p.y) < RADIUS_M };
  };
  const regions = sites.sites.filter((x) => x.replan_candidate).map((x) => at(x.lat_deg, x.lon_deg));
  const points = scenarios
    .map((sc) => {
      const ref = parseSiteRef(sc.siteRef);
      const ll =
        ref.kind === 'catalogue'
          ? (() => {
              const site = sites.sites.find((x) => x.id === ref.id);
              return site ? { latDeg: site.lat_deg, lonDeg: site.lon_deg } : null;
            })()
          : ref.kind === 'grid'
            ? latLonOfCell(ref.i, ref.j)
            : ref.kind === 'custom'
              ? { latDeg: ref.latDeg, lonDeg: ref.lonDeg }
              : null;
      return ll ? { id: sc.id, ...at(ll.latDeg, ll.lonDeg) } : null;
    })
    .filter((p): p is { id: ScenarioId; x: number; y: number; inside: boolean } => p !== null && p.inside);

  return (
    <button type="button" className="v2-minimap" aria-label={t('minimap.open')} onClick={() => setTab('map')}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE - 2} height={SIZE - 2} aria-hidden="true">
        <g fill="none" stroke="var(--c-muted)" strokeOpacity="0.4" strokeWidth="1">
          {[1, 2, 3].map((k) => (
            <circle key={k} cx={c} cy={c} r={(k * (c - 6)) / 3} />
          ))}
          <path d={`M${c} 0v${SIZE}M0 ${c}h${SIZE}`} />
        </g>
        <g fill="none" stroke="var(--c-text)" strokeOpacity="0.55" strokeWidth="1">
          {regions.filter((r) => r.inside).map((r, i) => (
            <circle key={i} cx={r.x} cy={r.y} r={6} />
          ))}
        </g>
        {points.map((p) => (
          <g key={p.id}>
            <path d={SHAPE[p.id](p.x, p.y)} fill="var(--c-bg-0)" stroke={p.id === activeId ? 'var(--c-accent)' : 'var(--c-text)'} strokeWidth="2" />
            <text x={p.x + 8} y={p.y - 6} className="v2-minimap__letter" fill={p.id === activeId ? 'var(--c-accent)' : 'var(--c-text)'}>
              {p.id}
            </text>
          </g>
        ))}
        <text x={c} y={SIZE - 14} textAnchor="middle" className="v2-minimap__label">
          {t('minimap.label')}
        </text>
      </svg>
    </button>
  );
}
