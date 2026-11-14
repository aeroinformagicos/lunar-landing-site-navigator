// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Map view, minimal version (10_interfaz.md §6.4; 12_tareas.md §11): canvas with hillshade, layer,
// region outlines and site markers; zoom 1×–16× (wheel, buttons, + −) and drag; layer, period and
// opacity controls; legend, scale and orientation; pointer readout; click (or Enter on the centre
// cross) creates the mesh-point scenario of 08 §7. Loaded on demand (`import()`), 02 §7.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { GRID, gridRef, inGrid, xyOfLatLon } from '../../core/grid';
import { loader } from '../../core/loaders';
import { t, type TextKey } from '../../i18n/t';
import { activeScenario, parseSiteRef } from '../../state/selectors';
import { useAppStore, type MapLayer } from '../../state/store';
import { useBoot } from '../common/data';
import { DataState, useResource } from '../common/DataState';
import {
  cellAtScreen,
  cellReadout,
  fitView,
  layerPixels,
  loadCellMask,
  loadLayer,
  loadMapData,
  NotComputed,
  rampColour,
  worldOfXY,
  zoomAt,
  type Band,
  type MapData,
  type ViewState,
} from './mapData';

const LAYERS: MapLayer[] = ['sun', 'earth', 'both', 'none'];
const YEARS = [2026, 2027, 2028, 2029, 2030];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MAX_H = 330;

export default function MapView() {
  const { config } = useBoot();
  const heavy = config.heavy_base_url;
  const [data, retry] = useResource(`map:${heavy}`, () => loadMapData(loader, heavy));
  return (
    <DataState resource={data} loadingText={t('map.loading')} errorText={t('map.unavailable')} onRetry={retry}>
      {(d) => <MapCanvas data={d} />}
    </DataState>
  );
}

function useSize(): [React.RefObject<HTMLDivElement | null>, number, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(280, el.clientWidth)));
    ro.observe(el);
    setW(Math.max(280, el.clientWidth));
    return () => ro.disconnect();
  }, []);
  const h = Math.min(MAX_H, Math.round((w * GRID.ny) / GRID.nx));
  return [ref, w, h];
}

function MapCanvas({ data }: { data: MapData }) {
  const { sites } = useBoot();
  const layer = useAppStore((s) => s.mapLayer);
  const setLayer = useAppStore((s) => s.setMapLayer);
  const periodId = useAppStore((s) => s.mapPeriod);
  const setPeriod = useAppStore((s) => s.setMapPeriod);
  const scenario = useAppStore(activeScenario);
  const updateScenario = useAppStore((s) => s.updateScenario);
  const [box, w, h] = useSize();
  const canvas = useRef<HTMLCanvasElement>(null);
  const fit = useMemo(() => fitView(w, h), [w, h]);
  const [view, setView] = useState<ViewState>({ zoom: 1, tx: fit.tx, ty: fit.ty });
  const [opacity, setOpacity] = useState(0.75);
  const [readout, setReadout] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);

  useEffect(() => setView({ zoom: 1, tx: fit.tx, ty: fit.ty }), [fit]);
  useEffect(() => {
    const im = new Image();
    im.onload = () => setImg(im);
    im.src = data.hillshadeUrl;
  }, [data.hillshadeUrl]);

  const planB = data.layers.source === 'nasa_avgvisib';
  const period = data.layers.periods.find((p) => p.id === periodId) ?? data.layers.periods[0];
  const bandIndex = layer === 'none' ? -1 : data.layers.bands.indexOf(layer as Band);
  const [bands] = useResource(`layer:${data.base}/${period.file}`, () => loadLayer(loader, data.base, period));
  const bandBytes = bands.status === 'ready' ? bands.data : null;

  // The coloured layer is built once per period and band (10 §13), not on every frame.
  const layerCanvas = useMemo(() => {
    if (!bandBytes || bandIndex < 0 || typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = GRID.nx;
    c.height = GRID.ny;
    const g = c.getContext('2d');
    if (!g) return null;
    g.putImageData(new ImageData(layerPixels(bandBytes, layer as Band, bandIndex), GRID.nx, GRID.ny), 0, 0);
    return c;
  }, [bandBytes, bandIndex, layer]);

  const markers = useMemo(
    () =>
      sites.sites
        .map((s) => ({ s, ...worldOfXY(xyOfLatLon(s.lat_deg, s.lon_deg).x, xyOfLatLon(s.lat_deg, s.lon_deg).y) }))
        .filter((m) => m.wx >= 0 && m.wx <= GRID.nx && m.wy >= 0 && m.wy <= GRID.ny),
    [sites],
  );
  const activeWorld = useMemo(() => {
    const ref = parseSiteRef(scenario.siteRef);
    if (ref.kind === 'grid') return { wx: ref.i + 0.5, wy: ref.j + 0.5 };
    const m = markers.find((x) => x.s.id === scenario.siteRef);
    return m ? { wx: m.wx, wy: m.wy } : null;
  }, [markers, scenario.siteRef]);

  const s = fit.base * view.zoom;
  const toScreen = useCallback((wx: number, wy: number) => ({ x: view.tx + wx * s, y: view.ty + wy * s }), [view, s]);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const g = cv.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#05070b';
    g.fillRect(0, 0, w, h);
    g.save();
    g.translate(view.tx, view.ty);
    g.scale(s, s);
    g.imageSmoothingEnabled = view.zoom < 4;
    if (img) g.drawImage(img, 0, 0, GRID.nx, GRID.ny);
    if (layerCanvas) {
      g.globalAlpha = opacity;
      g.imageSmoothingEnabled = false;
      g.drawImage(layerCanvas, 0, 0);
      g.globalAlpha = 1;
    }
    g.restore();
    g.lineWidth = 1.5;
    g.font = '12px system-ui, sans-serif';
    for (const r of data.regions) {
      const a = worldOfXY(r.box_m[0], r.box_m[3]);
      const b = worldOfXY(r.box_m[2], r.box_m[1]);
      const p = toScreen(a.wx, a.wy);
      const q = toScreen(b.wx, b.wy);
      g.strokeStyle = '#e8eaed';
      g.strokeRect(p.x, p.y, q.x - p.x, q.y - p.y);
      g.fillStyle = '#e8eaed';
      g.fillText(r.name, p.x + 2, p.y - 3);
    }
    for (const m of markers) {
      const p = toScreen(m.wx, m.wy);
      g.beginPath();
      g.arc(p.x, p.y, 4, 0, 2 * Math.PI);
      g.fillStyle = '#e8eaed';
      g.fill();
    }
    if (activeWorld) {
      const p = toScreen(activeWorld.wx, activeWorld.wy);
      g.beginPath();
      g.arc(p.x, p.y, 8, 0, 2 * Math.PI);
      g.strokeStyle = '#f0e442';
      g.lineWidth = 2;
      g.stroke();
    }
    // Centre cross (keyboard selection).
    g.strokeStyle = 'rgba(232,234,237,0.7)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(w / 2 - 8, h / 2);
    g.lineTo(w / 2 + 8, h / 2);
    g.moveTo(w / 2, h / 2 - 8);
    g.lineTo(w / 2, h / 2 + 8);
    g.stroke();
  }, [w, h, view, s, img, layerCanvas, opacity, data.regions, markers, activeWorld, toScreen]);

  const select = useCallback(
    async (i: number, j: number) => {
      if (!inGrid(i, j)) return;
      setMessage(null);
      try {
        await loadCellMask(loader, data.base, data.done, i, j);
        updateScenario(scenario.id, { siteRef: gridRef(i, j) });
      } catch (e) {
        setMessage(e instanceof NotComputed ? t('map.not_computed') : t('map.unavailable'));
      }
    },
    [data, scenario.id, updateScenario],
  );

  function local(e: { clientX: number; clientY: number }) {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onPointerDown(e: React.PointerEvent) {
    drag.current = { ...local(e), tx: view.tx, ty: view.ty, moved: false };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const p = local(e);
    const { i, j } = cellAtScreen(view, fit.base, p.x, p.y);
    setReadout(inGrid(i, j) ? cellReadout(i, j, data.dem, bandBytes, data.layers.bands) : null);
    const d = drag.current;
    if (!d) return;
    if (Math.abs(p.x - d.x) + Math.abs(p.y - d.y) > 4) d.moved = true;
    if (d.moved) setView((v) => ({ ...v, tx: d.tx + p.x - d.x, ty: d.ty + p.y - d.y }));
  }
  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    const p = local(e);
    const hit = markers.find((m) => {
      const q = toScreen(m.wx, m.wy);
      return Math.hypot(q.x - p.x, q.y - p.y) <= 7;
    });
    if (hit) {
      updateScenario(scenario.id, { siteRef: hit.s.id });
      return;
    }
    const { i, j } = cellAtScreen(view, fit.base, p.x, p.y);
    void select(i, j);
  }
  function onKeyDown(e: React.KeyboardEvent) {
    const pan = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[e.key];
    if (pan) {
      e.preventDefault();
      setView((v) => ({ ...v, tx: v.tx + pan[0], ty: v.ty + pan[1] }));
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      setView((v) => zoomAt(v, 2, w / 2, h / 2));
    } else if (e.key === '-') {
      e.preventDefault();
      setView((v) => zoomAt(v, 0.5, w / 2, h / 2));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const { i, j } = cellAtScreen(view, fit.base, w / 2, h / 2);
      void select(i, j);
    }
  }
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      setView((v) => zoomAt(v, e.deltaY < 0 ? 1.25 : 0.8, e.clientX - r.left, e.clientY - r.top));
    };
    cv.addEventListener('wheel', onWheel, { passive: false });
    return () => cv.removeEventListener('wheel', onWheel);
  }, []);

  // Scale bar: a round number of km close to 80 px.
  const pxPerKm = s * (1000 / GRID.cellM);
  const km = [1, 2, 5, 10, 20, 50, 100].find((k) => k * pxPerKm >= 60) ?? 100;
  const month = /^\d{4}-\d{2}$/.test(period.id) ? period.id : null;
  const band = layer === 'none' ? null : (layer as Band);

  return (
    <div className="map">
      {planB && (
        <p className="map__planb" role="note">
          {t('map.plan_b')}
        </p>
      )}
      <div className="map__controls">
        <div className="segmented" role="group" aria-label={t('map.layer')}>
          {LAYERS.map((l) => (
            <button key={l} type="button" aria-pressed={layer === l} disabled={planB && l === 'both'} onClick={() => setLayer(l)}>
              {t(`map.layer.${l}` as TextKey)}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label={t('map.period')}>
          <button type="button" aria-pressed={period.id === 'mean186'} onClick={() => setPeriod('mean186')}>
            {t('map.mean')}
          </button>
          <label className="field">
            <span className="visually-hidden">{t('map.year')}</span>
            <select
              aria-label={t('map.year')}
              disabled={planB}
              value={month ? month.slice(0, 4) : ''}
              onChange={(e) => setPeriod(`${e.target.value}-${month ? month.slice(5) : '01'}`)}
            >
              <option value="" disabled>
                {t('map.year')}
              </option>
              {YEARS.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="visually-hidden">{t('map.month')}</span>
            <select
              aria-label={t('map.month')}
              disabled={planB}
              value={month ? month.slice(5) : ''}
              onChange={(e) => setPeriod(`${month ? month.slice(0, 4) : '2026'}-${e.target.value}`)}
            >
              <option value="" disabled>
                {t('map.month')}
              </option>
              {MONTHS.map((m, k) => (
                <option key={m} value={String(k + 1).padStart(2, '0')}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>{t('map.opacity')}</span>
          <input type="range" min={0} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
        </label>
        <button type="button" aria-label={t('map.zoom_in')} onClick={() => setView((v) => zoomAt(v, 2, w / 2, h / 2))}>
          +
        </button>
        <button type="button" aria-label={t('map.zoom_out')} onClick={() => setView((v) => zoomAt(v, 0.5, w / 2, h / 2))}>
          −
        </button>
      </div>

      <div ref={box} className="map__box">
        <canvas
          ref={canvas}
          className="map__canvas"
          style={{ width: w, height: h }}
          tabIndex={0}
          role="img"
          aria-label={t('map.label')}
          data-zoom={view.zoom}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setReadout(null)}
          onKeyDown={onKeyDown}
        />
        <div className="map__legend">
          {band && (
            <div className="map__ramp" aria-hidden="true">
              {Array.from({ length: 11 }, (_, k) => {
                const c = rampColour(k, band);
                return <span key={k} style={{ background: `rgb(${c.join(',')})` }} />;
              })}
            </div>
          )}
          <p>
            {t('map.legend')} · 0–100 {bands.status === 'loading' && <em>· {t('map.layer_loading')}</em>}
          </p>
          <p>{t('map.criterion')}</p>
          <p>{planB ? t('map.source_nasa') : t('map.source_computed')}</p>
        </div>
        <div className="map__scale">
          <span className="map__bar" style={{ width: km * pxPerKm }} />
          <span>{km} km</span>
          <p>{t('map.north')}</p>
          <p>{t('map.projection')}</p>
        </div>
      </div>
      <p className="map__readout" data-testid="map-readout">
        {readout ?? ' '}
      </p>
      {message && (
        <p className="map__message" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
