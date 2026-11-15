// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Stage3D (16_vista_3d.md; common contract in annex A). T-71: the realistic polar scene. T-72: orbit,
// fly and ground cameras, Go to flights, the signals of §8 and the click on the terrain. T-73: the
// profile, horizon-ring and smooth-Moon scenes for sites off the polar mesh (§2.1, §4.2–§4.4) with a
// fade between scenes, the projected map layers (§9) and the quality checks. Fills its container,
// reads everything from the store and the scenario model, draws only the camera controls as its own
// panel. A WebGL failure is thrown so the shell's error boundary shows the 2D view.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { enuBasis } from '../../core/frames';
import { GRID, cellOfXY, gridRef, inGrid, xyOfLatLon } from '../../core/grid';
import { blockerAt, horizonAt, smoothHorizon, type Mask } from '../../core/horizon';
import { DataError, joinUrl, loader } from '../../core/loaders';
import type { Site } from '../../core/types';
import { evaluate, type SkyState } from '../../core/visibility';
import { t, type TextKey } from '../../i18n/t';
import { activeScenario, parseSiteRef } from '../../state/selectors';
import { missionEnd, useAppStore, type MapLayer, type Scenario } from '../../state/store';
import { useBoot } from '../common/data';
import { useResource } from '../common/DataState';
import { formatDeg, formatInt, formatLatLon, formatMargin } from '../common/format';
import { useScenarioModel } from '../common/model';
import { loadCellMask, loadLayer, meshPointLabel, NotComputed, type Band, type LayersInfo, type LayerPeriod } from '../map/mapData';
import { bodyTrace, pointerReadout, ridgeLabel } from '../panorama/texts';
import { startOrbit, wrapDeg } from './camera';
import { Controls, type GoToItem, type LiveRefs, type OverlayControl } from './Controls';
import {
  POLAR_FRAME,
  R_M,
  add,
  azElToMe,
  dirToScene,
  fromScene,
  latLonHToMe,
  localBasisAt,
  makeSceneFrame,
  mapToScene,
  meToLatLonH,
  norm,
  scale,
  sub,
  surfaceDistanceM,
  toScene,
  type SceneFrame,
  type V3,
} from './frame';
import { Labels, placeLabels, type LabelView } from './Labels';
import { buildRadialMesh, ringDistances } from './meshes';
import { GROUND, raycastGround, segmentBlocked, type CameraMode, type FlyInput, type LookState } from './navigation';
import { bandBytes, overlayChoices, overlayLutLinear, overlayRamp, shownLayer } from './overlay';
import { pickTier, TIER_SETTINGS, type Tier } from './quality';
import { RADIAL_MAX_M, buildRingPanels, ringGroundAt } from './radial';
import { bodyStatus, catalogueMarker, describeView, inPolarMesh, pickScene, reliefLine, siteLatLon, type DemStatus, type SceneKind, type Source } from './scenePlan';
import { Engine, type Ground, type LineItem } from './scene/engine';
import { litFraction, radialLitFraction } from './shadow';
import { crestIndices, crestLine, pathOnDome, regionOutline, scaleBar } from './signals';
import {
  loadPolarDem,
  meshJob,
  polarGround,
  polarHeightAt,
  polarHeights,
  profileHeightFn,
  radialGround,
  radialHeights,
  sphereGround,
  type TerrainHeights,
} from './terrain';
import './stage3d.css';

const CAP_M = RADIAL_MAX_M;
/** Fade to black between two scenes (§7.4). */
const FADE_MS = 250;
const DESC_EVERY_MS = 10_000;
/** Radius of the dome that carries the Sun and Earth paths (§8.3). */
const DOME_M = 20_000;
const MAST_M = 300;
const OCCLUDE_EVERY_MS = 200;
const LIVE_EVERY_MS = 100;

interface RegionRow {
  id: string;
  name: string;
  box_m: [number, number, number, number];
  status?: string;
}

function scenarioName(s: Scenario, sites: readonly Site[]): string {
  const ref = parseSiteRef(s.siteRef);
  if (ref.kind === 'grid') return meshPointLabel(ref.i, ref.j);
  if (ref.kind === 'custom') return formatLatLon(ref.latDeg, ref.lonDeg);
  return sites.find((x) => x.id === ref.id)?.short_name ?? '';
}

function cssColour(el: Element, name: string, fallback: string): [number, number, number] {
  const v = getComputedStyle(el).getPropertyValue(name).trim() || fallback;
  const m = /^#([0-9a-f]{6})$/i.exec(v) ?? /^#([0-9a-f]{6})$/i.exec(fallback)!;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function urlParam(name: string): string | null {
  try {
    return new URLSearchParams(location.search).get(name);
  } catch {
    return null;
  }
}

/**
 * Whether the viewer turned the projected layer on, for the life of the page: the view unmounts when
 * another tab opens, and the store keeps no 3D state (§10.2).
 */
const overlaySession = { on: false };

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const FLY_KEYS: Record<string, keyof FlyInput | 'back' | 'left' | 'down'> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyD: 'right',
  ArrowRight: 'right',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyE: 'up',
  KeyQ: 'down',
};

export default function Stage3D() {
  const { config, sites } = useBoot();
  const scenarios = useAppStore((s) => s.scenarios);
  const active = useAppStore(activeScenario);
  const cursorUnix = useAppStore((s) => s.cursorUnix);
  const playing = useAppStore((s) => s.playing);
  const focusBody = useAppStore((s) => s.focusBody);
  const showSmooth = useAppStore((s) => s.showSmooth);
  const mode = useAppStore((s) => s.mode);
  const storyStep = useAppStore((s) => s.storyStep);
  const mapLayer = useAppStore((s) => s.mapLayer);
  const mapPeriod = useAppStore((s) => s.mapPeriod);
  const setActiveScenario = useAppStore((s) => s.setActiveScenario);
  const updateScenario = useAppStore((s) => s.updateScenario);
  const setMapLayer = useAppStore((s) => s.setMapLayer);
  const [model] = useScenarioModel(active);

  const test = urlParam('test3d') === '1';
  const showFps = urlParam('fps') === '1';
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sizeRef = useRef({ w: 1, h: 1 });
  const heightsRef = useRef<Float32Array | null>(null);
  const holesRef = useRef<Uint8Array | null>(null);
  const groundRef = useRef<Ground | null>(null);
  /** Terrain heights of the built scene (polar DEM, profile, ring ground; null on a sphere). */
  const terrRef = useRef<TerrainHeights | null>(null);
  /** Time of the last mesh job in the worker (ms, §12.3), for the test hooks. */
  const meshMsRef = useRef<number | null>(null);
  const labelEls = useRef(new Map<string, HTMLElement>());
  const labelsRef = useRef<LabelView[]>([]);
  const occluded = useRef(new Set<string>());
  const occludedAt = useRef(0);
  const liveAt = useRef(0);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const held = useRef(new Set<string>());
  const doneRef = useRef<Uint8Array | null | undefined>(undefined);
  const live: LiveRefs = {
    compass: useRef<SVGGElement>(null),
    earthSide: useRef<SVGGElement>(null),
    scaleBar: useRef<HTMLSpanElement>(null),
    scaleText: useRef<HTMLSpanElement>(null),
    readout: useRef<HTMLSpanElement>(null),
    skyNote: useRef<HTMLParagraphElement>(null),
    beyond: useRef<HTMLParagraphElement>(null),
  };
  const [fatal, setFatal] = useState<Error | null>(null);
  const [engineKey, setEngineKey] = useState(0);
  const [engineReady, setEngineReady] = useState(false);
  const [tier, setTier] = useState<Tier>('alto');
  const tierRef = useRef(tier);
  tierRef.current = tier;
  /** The scene on screen: `key` includes the level of detail, `group` is the scene and its site. */
  const [built, setBuilt] = useState<{ key: string; group: string; frame: SceneFrame } | null>(null);
  /** Scene group whose build may run: it lags the wanted one by the fade to black (§7.4). */
  const [shownGroup, setShownGroup] = useState<string | null>(null);
  const [fading, setFading] = useState(false);
  /** The projected map layer is on (it starts at `None` in the 3D view, §9; kept while the page lives). */
  const [overlayOn, setOverlayOnState] = useState(overlaySession.on);
  const setOverlayOn = useCallback((on: boolean) => {
    overlaySession.on = on;
    setOverlayOnState(on);
  }, []);
  const [camMode, setCamMode] = useState<CameraMode>('orbit');
  const [fpsText, setFpsText] = useState<string | null>(null);
  const [desc, setDesc] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [colours, setColours] = useState({ sun: [0.96, 0.62, 0.04] as [number, number, number], earth: [0.22, 0.74, 0.97] as [number, number, number], text: [0.97, 0.98, 0.99] as [number, number, number], muted: [0.58, 0.64, 0.72] as [number, number, number] });

  // ---- Where is the active site, and which scene (§2.1) ----------------------------------
  const loc = useMemo(() => {
    const l = siteLatLon(active.siteRef, sites.sites);
    if (l) return l;
    return model.status === 'ready' ? { latDeg: model.data.latDeg, lonDeg: model.data.lonDeg } : null;
  }, [active.siteRef, sites.sites, model]);
  const wantsPolar = loc !== null && inPolarMesh(loc.latDeg, loc.lonDeg);
  const [demRes, retryDem] = useResource(wantsPolar ? `stage3d-dem:${config.heavy_base_url}` : null, () => loadPolarDem(loader, config.heavy_base_url));
  const [regionsRes] = useResource(wantsPolar ? `stage3d-regions:${config.heavy_base_url}` : null, () =>
    loader.json(joinUrl(config.heavy_base_url, 'map/regions.json'), (_u, j) => (j as { regions: RegionRow[] }).regions),
  );
  const dem: DemStatus = demRes.status === 'ready' ? 'ready' : demRes.status === 'error' ? 'error' : 'loading';
  // Off the polar mesh (or without its DEM): the site's profile (§2.3), then its mask (§2.4).
  const ref = parseSiteRef(active.siteRef);
  const site = ref.kind === 'catalogue' ? sites.sites.find((s) => s.id === ref.id) : undefined;
  const withRelief = site !== undefined && site.relief !== 'smooth';
  const offPolar = !wantsPolar || dem === 'error';
  const profileFile = offPolar && withRelief && site.has_profile ? `profile/${site.id}.bin.gz` : null;
  const [profileRes, retryProfile] = useResource(profileFile ? `stage3d-profile:${config.data_base_url}/${profileFile}` : null, () =>
    loader.loadProfile(config.data_base_url, profileFile!),
  );
  const resSource = (r: { status: string }): Source => (r.status === 'ready' ? 'ready' : r.status === 'error' ? 'error' : 'loading');
  const profileSrc: Source = profileFile ? resSource(profileRes) : 'none';
  const maskWanted = (withRelief && site.has_mask) || ref.kind === 'grid';
  const maskSrc: Source = !maskWanted ? 'none' : model.status === 'ready' ? (model.data.smooth ? 'none' : 'ready') : resSource(model);
  const pick = loc ? pickScene({ latDeg: loc.latDeg, lonDeg: loc.lonDeg, dem, profile: profileSrc, mask: maskSrc }) : null;
  const kind: SceneKind | null = pick?.kind ?? null;
  const lod = TIER_SETTINGS[tier].lod;
  const sceneGroup = !kind || !loc ? null : kind === 'polar' ? 'polar' : kind === 'profile' ? `profile:${site!.id}` : kind === 'ring' ? `ring:${active.siteRef}:${active.observerHeightM}` : `smooth:${loc.latDeg},${loc.lonDeg}`;
  const sceneKey = sceneGroup && kind === 'profile' ? `${sceneGroup}:${lod}` : sceneGroup;
  const frame = built && built.key === sceneKey ? built.frame : null;
  const polarReady = frame?.polar === true && built?.key === 'polar';
  const regions = regionsRes.status === 'ready' && polarReady ? regionsRes.data : [];
  const mask: Mask | null = model.status === 'ready' ? model.data.mask : null;

  // Fade to black before mounting another scene, and back in once it is built (§7.4); a jump with
  // reduced motion and for the first scene.
  useEffect(() => {
    if (!sceneGroup || sceneGroup === shownGroup) return;
    if (shownGroup === null || reducedMotion()) {
      setShownGroup(sceneGroup);
      return;
    }
    setFading(true);
    const id = window.setTimeout(() => setShownGroup(sceneGroup), FADE_MS);
    return () => window.clearTimeout(id);
  }, [sceneGroup, shownGroup]);
  useEffect(() => {
    if (fading && built?.group === shownGroup && shownGroup === sceneGroup) setFading(false);
  }, [fading, built, shownGroup, sceneGroup]);

  // ---- Map layers projected on the terrain (§9), polar scene only ------------------------------
  const [layersRes] = useResource(wantsPolar ? `stage3d-layers:${config.heavy_base_url}` : null, () =>
    loader.json(joinUrl(config.heavy_base_url, 'layers/layers.json'), (url, j): LayersInfo => {
      const l = j as { source: LayersInfo['source']; periods: LayerPeriod[]; encoding: { bands: Band[] } };
      if (!Array.isArray(l.periods) || l.periods.length === 0) throw new DataError('format', url, 'No layer periods');
      return { source: l.source, periods: l.periods, bands: l.encoding.bands };
    }),
  );
  const layers = layersRes.status === 'ready' ? layersRes.data : null;
  const period = layers ? (layers.periods.find((p) => p.id === mapPeriod) ?? layers.periods[0]) : null;
  const band = layers ? shownLayer(overlayOn, mapLayer, layers.source, layers.bands) : null;
  // Same resource key as the map view, so a layer it loaded is not asked for twice (§2.7).
  const [layerRes, retryLayer] = useResource(polarReady && band && period ? `layer:${config.heavy_base_url}/${period.file}` : null, () =>
    loadLayer(loader, config.heavy_base_url, period!),
  );

  const flash = useCallback((text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage((m) => (m === text ? null : m)), 4000);
  }, []);

  // ---- Engine ------------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    let engine: Engine;
    const device = {
      coarsePointer: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
      widthPx: window.innerWidth,
      cores: navigator.hardwareConcurrency ?? 8,
      override: urlParam('q'),
    };
    try {
      const provisional = pickTier({ ...device, renderer: '' });
      engine = new Engine({
        canvas,
        test,
        tier: provisional,
        tierLocked: device.override !== null,
        reducedMotion: reducedMotion(),
        haloColour: cssColour(wrap, '--c-sun', '#F59E0B'),
        onTierDrop: (next) => setTier(next),
      });
      const gl = engine.renderer.getContext();
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      const rendererName = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
      const final = pickTier({ ...device, renderer: rendererName });
      setTier(final);
      engine.setTier(final, null);
    } catch (e) {
      setFatal(e instanceof Error ? e : new Error('webgl'));
      return;
    }
    setColours({
      sun: cssColour(wrap, '--c-sun', '#F59E0B'),
      earth: cssColour(wrap, '--c-earth', '#38BDF8'),
      text: cssColour(wrap, '--c-text', '#F8FAFC'),
      muted: cssColour(wrap, '--c-muted', '#94A3B8'),
    });
    engine.input = () => {
      const h = held.current;
      const has = (k: string) => [...h].some((code) => FLY_KEYS[code] === k);
      return {
        forward: (has('forward') ? 1 : 0) - (has('back') ? 1 : 0),
        right: (has('right') ? 1 : 0) - (has('left') ? 1 : 0),
        up: (has('up') ? 1 : 0) - (has('down') ? 1 : 0),
        fast: h.has('ShiftLeft') || h.has('ShiftRight'),
      };
    };
    engineRef.current = engine;
    setBuilt(null);
    setCamMode('orbit');
    setEngineReady(true);
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      sizeRef.current = { w: r.width, h: r.height };
      engine.setSize(r.width, r.height, window.devicePixelRatio || 1);
    });
    ro.observe(wrap);
    let lostTimer = 0;
    const onLost = (e: Event) => {
      e.preventDefault();
      lostTimer = window.setTimeout(() => setFatal(new Error('context')), 3000);
    };
    const onRestored = () => {
      window.clearTimeout(lostTimer);
      setEngineKey((k) => k + 1);
    };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    return () => {
      ro.disconnect();
      window.clearTimeout(lostTimer);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      engine.dispose();
      engineRef.current = null;
      setEngineReady(false);
    };
  }, [engineKey, test]);

  // ---- Scene build ---------------------------------------------------------------------------
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !engineReady || !kind || !loc || !pick || !sceneKey || !sceneGroup) return;
    // During the fade to black the previous scene stays on screen.
    if (shownGroup !== sceneGroup) return;
    let alive = true;
    const setGround = (g: Ground, h: TerrainHeights | null) => {
      groundRef.current = g;
      terrRef.current = h;
      engine.setGround(g);
    };
    /** A bare sphere around `f` while the scene's data loads: never an empty view (§13). */
    const placeholder = (f: SceneFrame) => {
      engine.setPlaceholder(f);
      setGround(sphereGround(f), null);
      setBuilt({ key: `${sceneKey}:placeholder`, group: sceneGroup, frame: f });
    };
    if (built?.key === sceneKey) return;
    if (kind === 'polar') {
      if (pick.pending || demRes.status !== 'ready') {
        placeholder(POLAR_FRAME);
        return;
      }
      const job = heightsRef.current
        ? meshJob({ heights: heightsRef.current, holes: holesRef.current ?? undefined, lod })
        : meshJob({ dem: demRes.data.slice(), lod });
      job.then((a) => {
        if (!alive || engineRef.current !== engine) return;
        heightsRef.current = a.heights;
        holesRef.current = a.holes;
        meshMsRef.current = a.ms;
        engine.setPolar(a.tiles, a.heights, a.holes);
        setGround(polarGround(a.heights), polarHeights(a.heights));
        setBuilt({ key: 'polar', group: 'polar', frame: POLAR_FRAME });
      });
    } else if (kind === 'profile') {
      if (pick.pending || profileRes.status !== 'ready') {
        placeholder(makeSceneFrame(loc.latDeg, loc.lonDeg, 0));
        return;
      }
      const p = profileRes.data;
      // Profile mesh (§4.2) in the worker; the anchor sits at the site's height (§3.1).
      meshJob({ kind: 'profile', raw: p.heightM, law: p.law, latDeg: loc.latDeg, lonDeg: loc.lonDeg, siteHeightM: p.siteHeightM, lod }).then((a) => {
        if (!alive || engineRef.current !== engine) return;
        const f = makeSceneFrame(loc.latDeg, loc.lonDeg, p.siteHeightM);
        meshMsRef.current = a.ms;
        engine.setRadialScene(f, [a.mesh], CAP_M, a.drawn);
        const fn = profileHeightFn(a.terrain);
        setGround(radialGround(f, fn), radialHeights(f, fn));
        setBuilt({ key: sceneKey, group: sceneGroup, frame: f });
      });
    } else if (kind === 'ring') {
      if (pick.pending || !mask) {
        placeholder(makeSceneFrame(loc.latDeg, loc.lonDeg, 0));
        return;
      }
      // Horizon ring (§4.3): flat ground at the site's height, panels at the mask's distances.
      const siteH = mask.siteHeightM;
      const f = makeSceneFrame(loc.latDeg, loc.lonDeg, siteH);
      const dist = ringDistances();
      const ground = buildRadialMesh(f, 256, dist, (_j, b) => ringGroundAt(siteH, dist[b]), siteH, false);
      engine.setRadialScene(f, [ground, buildRingPanels(f, mask)], CAP_M);
      const fn = (d: number) => ringGroundAt(siteH, d);
      setGround(radialGround(f, fn), radialHeights(f, fn));
      setBuilt({ key: sceneKey, group: sceneGroup, frame: f });
    } else {
      const f = makeSceneFrame(loc.latDeg, loc.lonDeg, 0);
      const cap = buildRadialMesh(f, 256, ringDistances(), () => 0, 0, true);
      engine.setSmooth(f, cap, CAP_M);
      setGround(sphereGround(f), null);
      setBuilt({ key: sceneKey, group: sceneGroup, frame: f });
    }
    return () => {
      alive = false;
    };
    // `built` is read to skip a rebuild of the same scene; listing it would loop.
  }, [engineReady, engineKey, kind, sceneKey, sceneGroup, shownGroup, pick?.pending, demRes, profileRes, mask, lod]);

  // A lower tier after slow frames (§12.2): new level of detail and shadow resolution.
  const lastTier = useRef(tier);
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || lastTier.current === tier) return;
    const lodChanged = TIER_SETTINGS[lastTier.current].lod !== TIER_SETTINGS[tier].lod;
    lastTier.current = tier;
    engine.setTier(tier, heightsRef.current);
    if (lodChanged && heightsRef.current && built?.key === 'polar') {
      meshJob({ heights: heightsRef.current, holes: holesRef.current ?? undefined, lod: TIER_SETTINGS[tier].lod }).then((a) => {
        if (engineRef.current === engine) engine.replaceTiles(a.tiles);
      });
    }
    const r = sizeRef.current;
    engine.setSize(r.w, r.h, window.devicePixelRatio || 1);
  }, [tier, built]);

  // The projected layer (§9): one band of the period's file on the polar terrain; none elsewhere.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (!polarReady || !band || !layers || layerRes.status !== 'ready') engine.setOverlay(null, null);
    else engine.setOverlay(bandBytes(layerRes.data, layers.bands.indexOf(band)), overlayLutLinear(band));
  }, [polarReady, band, layers, layerRes, built, engineReady]);

  const overlay = useMemo((): OverlayControl | null => {
    if (!polarReady || !layers || !period) return null;
    return {
      choices: overlayChoices(layers.source).map((layer) => ({ layer, label: t(layer === 'none' ? 'stage3d.overlay_none' : (`map.layer.${layer}` as TextKey)) })),
      current: band ?? 'none',
      onPick(layer: MapLayer) {
        // A layer chosen here is the map's layer too (§9); `None` only hides it in the 3D view.
        if (layer === 'none') setOverlayOn(false);
        else {
          setOverlayOn(true);
          setMapLayer(layer);
        }
      },
      legend: band
        ? { ramp: overlayRamp(band), periodLabel: period.label, planB: layers.source === 'nasa_avgvisib', status: layerRes.status, onRetry: retryLayer }
        : null,
    };
  }, [polarReady, layers, period, band, layerRes.status, retryLayer, setMapLayer, setOverlayOn]);

  // ---- Positions in the scene ---------------------------------------------------------------
  /** Scene point of a latitude, longitude and height above the sphere. */
  const pointAt = useCallback(
    (latDeg: number, lonDeg: number, hM: number): V3 | null => {
      if (!frame) return null;
      if (frame.polar) {
        const { x, y } = xyOfLatLon(latDeg, lonDeg);
        return mapToScene(x, y, hM);
      }
      return toScene(frame, latLonHToMe(latDeg, lonDeg, hM));
    },
    [frame],
  );
  /** Terrain height (m) under a latitude and longitude in the current scene. */
  const groundAt = useCallback(
    (latDeg: number, lonDeg: number): number => (frame && terrRef.current ? terrRef.current.heightAt(latDeg, lonDeg) : 0),
    // `built` changes when the scene's heights arrive.
    [frame, built],
  );
  /** The observer's eye at the active site (§7.3): terrain or mask height + observer height. */
  const eye = useMemo((): V3 | null => {
    if (!loc || !frame) return null;
    const siteH = mask ? mask.siteHeightM : 0;
    return pointAt(loc.latDeg, loc.lonDeg, Math.max(groundAt(loc.latDeg, loc.lonDeg), siteH) + active.observerHeightM);
  }, [loc, frame, mask, pointAt, groundAt, active.observerHeightM]);
  const dirOf = useCallback(
    (azDeg: number, elDeg: number): V3 => (frame && loc ? dirToScene(frame, azDeg, elDeg, loc.latDeg, loc.lonDeg) : [0, 1, 0]),
    [frame, loc],
  );

  // ---- Sky at the cursor (§5) -----------------------------------------------------------------
  const sky: SkyState | null = useMemo(() => {
    if (model.status !== 'ready') return null;
    const m = model.data;
    try {
      return evaluate(m.table, m.frame, m.mask, cursorUnix);
    } catch {
      return null; // outside the ephemeris table: the shell shows the error
    }
  }, [model, cursorUnix]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !frame) return;
    if (!sky || model.status !== 'ready') {
      engine.setSky(null);
      return;
    }
    const b = enuBasis(model.data.latDeg, model.data.lonDeg);
    engine.setSky({
      sunMe: azElToMe(sky.sun.azDeg, sky.sun.elDeg, b),
      earthMe: azElToMe(sky.earth.azDeg, sky.earth.elDeg, b),
      sunRadiusDeg: sky.sun.radiusDeg,
      earthRadiusDeg: sky.earth.radiusDeg,
      covered: sky.eclipse.covered,
    });
  }, [sky, frame, model]);

  useEffect(() => {
    if (engineRef.current) engineRef.current.playing = playing;
  }, [playing]);

  // ---- Cameras (§7) -----------------------------------------------------------------------------
  const skyRef = useRef(sky);
  skyRef.current = sky;
  const focusAz = useCallback(() => {
    const s = skyRef.current;
    return s ? (focusBody === 'sun' ? s.sun.azDeg : s.earth.azDeg) : 0;
  }, [focusBody]);
  const groundLook = useCallback((): LookState | null => {
    if (!eye) return null;
    const az = focusAz();
    return { pos: eye, yawDeg: az, pitchDeg: mask ? horizonAt(mask.elDeg, az) : 0, fovDeg: GROUND.startFov };
  }, [eye, focusAz, mask]);
  const startFor = useCallback(() => {
    if (!frame || !loc) return null;
    const target = pointAt(loc.latDeg, loc.lonDeg, groundAt(loc.latDeg, loc.lonDeg));
    if (!target) return null;
    const other = scenarios.find((x) => x.id !== active.id);
    const ol = other ? siteLatLon(other.siteRef, sites.sites) : null;
    const sep = ol ? surfaceDistanceM(loc.latDeg, loc.lonDeg, ol.latDeg, ol.lonDeg) : null;
    return startOrbit(target, focusAz(), sep);
  }, [frame, loc, scenarios, active.id, sites.sites, focusAz, pointAt, groundAt]);

  const changeMode = useCallback(
    (m: CameraMode) => {
      const engine = engineRef.current;
      if (!engine) return;
      if (m === 'ground') {
        const g = groundLook();
        if (!g) return;
        engine.setMode('ground', g);
      } else engine.setMode(m);
      setCamMode(m);
    },
    [groundLook],
  );

  const recenter = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.getMode() === 'ground') {
      const g = groundLook();
      if (g) engine.setLook(g);
      return;
    }
    const s = startFor();
    if (s) engine.goTo(s);
  }, [groundLook, startFor]);

  // Framing: a new scene jumps; another site of the same scene flies there (§7.4).
  const framedFor = useRef('');
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !frame || !loc) return;
    // By scene group, not key: a new level of detail of the same scene keeps the camera.
    const key = `${built?.group}|${active.id}|${active.siteRef}|${sky ? 1 : 0}`;
    if (framedFor.current === key) return;
    const prevScene = framedFor.current.split('|')[0];
    const prevSite = framedFor.current.split('|').slice(1, 3).join('|');
    framedFor.current = key;
    const s = startFor();
    if (!s) return;
    if (prevScene !== built?.group) engine.setOrbit(s, true);
    else if (prevSite !== `${active.id}|${active.siteRef}`) engine.goTo(s);
    else engine.setOrbit(s, false); // the sky arrived: turn toward the focus body
    if (engine.getMode() === 'ground') {
      const g = groundLook();
      if (g) engine.setLook(g);
    }
  }, [frame, loc, built, active.id, active.siteRef, sky, startFor, groundLook]);

  // Centre on Sun / Earth turns the camera toward that body.
  const lastFocus = useRef(focusBody);
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || lastFocus.current === focusBody || !sky) return;
    lastFocus.current = focusBody;
    const az = focusBody === 'sun' ? sky.sun.azDeg : sky.earth.azDeg;
    if (engine.getMode() === 'ground') {
      const g = groundLook();
      if (g) engine.setLook(g);
    } else if (engine.getMode() === 'orbit') {
      const goal = engine.getOrbit();
      if (goal) engine.setOrbit({ ...goal, headingDeg: az }, false);
    }
  }, [focusBody, sky, groundLook]);

  // Guided story, step 1 (§7.7): a fixed orbit over A, looking toward the Sun.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || mode !== 'learn' || storyStep !== 0 || !frame || !loc || !sky) return;
    const s = startFor();
    if (!s) return;
    engine.setMode('orbit');
    setCamMode('orbit');
    engine.setOrbit({ ...s, headingDeg: sky.sun.azDeg, pitchDeg: 10, distM: 12_000 }, true);
    // Once per step; the playback of the step moves only the light.
  }, [mode, storyStep, frame, loc, sky !== null]);

  // ---- Signals (§8) ---------------------------------------------------------------------------------
  // Paths of the Sun and the Earth along the mission (cursor-independent).
  const paths = useMemo(() => {
    if (model.status !== 'ready' || !eye || !mask) return null;
    const m = model.data;
    const end = missionEnd(active);
    return (['sun', 'earth'] as const).map((body) => ({ body, path: pathOnDome(bodyTrace(m.table, m.frame, body, active.landingUnix, end), mask, eye, DOME_M, dirOf) }));
  }, [model, eye, mask, active.landingUnix, active.missionDays, dirOf]);

  /** Scene point of mask sample j's blocking point (height from the mask, or the terrain). */
  const blockerPoint = useCallback(
    (lat: number, lon: number, h: number, liftM: number): V3 | null => {
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return pointAt(lat, lon, (Number.isFinite(h) ? Math.max(h, groundAt(lat, lon)) : groundAt(lat, lon)) + liftM);
    },
    [pointAt, groundAt],
  );

  /**
   * Blocking point of mask sample j. From above, on the terrain (lifted 30 m to clear the 500 m
   * mesh); in Ground, on the line of sight at the mask's elevation, so it sits on the computed
   * horizon line (a lift would look like degrees from 2 m up).
   */
  const crestPointAt = useCallback(
    (j: number): V3 | null => {
      if (!mask) return null;
      if (camMode === 'ground') {
        if (!eye) return null;
        const d = Number.isFinite(mask.distM[j]) && mask.distM[j] > 0 ? mask.distM[j] : 30_000;
        return add(eye, scale(dirOf(j * 0.5, mask.elDeg[j]), d));
      }
      return blockerPoint(mask.blkLatDeg[j], mask.blkLonDeg[j], mask.blkHeightM[j], 30);
    },
    [mask, camMode, eye, dirOf, blockerPoint],
  );

  const crest = useMemo(() => {
    if (!mask || !frame || camMode === 'ground') return [];
    return crestLine(crestPointAt);
  }, [mask, frame, camMode, crestPointAt]);

  // Lines: regions, paths, crest and its highlight, lines of sight, horizon in Ground.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !frame) return;
    const c = colours;
    const regionLines: LineItem[] = regions.map((r) => ({
      points: regionOutline(r.box_m, (x, y, lift) => mapToScene(x, y, (heightsRef.current ? polarHeightAt(heightsRef.current, x, y) : 0) + lift)),
      colour: c.text,
      widthPx: 1.5,
      opacity: 0.55,
      dash: r.status && r.status !== 'candidate_2024' ? ([400, 250] as [number, number]) : undefined,
    }));
    engine.setLines('regions', regionLines);
  }, [regions, frame, built, colours, engineReady]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !frame) return;
    const c = colours;
    const items: LineItem[] = [];
    for (const { body, path } of paths ?? []) {
      const col = body === 'sun' ? c.sun : c.earth;
      for (const run of path.runs) {
        items.push(
          run.visible
            ? { points: run.points, colour: col, widthPx: 2, opacity: 1, dash: body === 'earth' ? [900, 300] : undefined, overlay: true }
            : { points: run.points, colour: col, widthPx: 1.5, opacity: 0.45, dash: [120, 240], overlay: true },
        );
      }
    }
    engine.setLines('paths', items);
  }, [paths, frame, colours, engineReady]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !frame) return;
    const c = colours;
    const items: LineItem[] = [];
    if (crest.length > 1) items.push({ points: crest, colour: c.text, widthPx: 1, opacity: 0.35 });
    if (mask && sky && !sky.sun.visible) {
      const pts = crestIndices(sky.sun.azDeg)
        .map(crestPointAt)
        .filter((p): p is V3 => p !== null);
      if (pts.length > 1) items.push({ points: pts, colour: c.sun, widthPx: 2.5, opacity: 1, overlay: true });
    }
    // Lines of sight from the eye toward the body, and to its blocking point (§8.4).
    if (mask && sky && eye && camMode !== 'ground') {
      for (const body of ridgeBodies(focusBody, sky)) {
        const b = sky[body];
        const blk = blockerAt(mask, b.azDeg);
        const p = crestPointAt(Math.round(blk.azDeg / 0.5));
        if (!p || !Number.isFinite(blk.distM)) continue;
        const col = body === 'sun' ? c.sun : c.earth;
        items.push({ points: [eye, p], colour: col, widthPx: 1, opacity: 0.7, overlay: true });
        items.push({ points: [eye, add(eye, scale(dirOf(b.azDeg, b.elDeg), blk.distM * 1.3))], colour: col, widthPx: 1, opacity: 0.5, dash: [200, 200], overlay: true });
      }
    }
    engine.setLines('crest', items);
  }, [crest, mask, sky, eye, focusBody, frame, colours, crestPointAt, dirOf, camMode, engineReady]);

  // Computed horizon (and the smooth one) on the sky in Ground (§7.3).
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !frame) return;
    if (camMode !== 'ground' || !mask || !eye) {
      engine.setLines('horizon', []);
      return;
    }
    const R = 30_000;
    const line = (el: (az: number) => number) => Array.from({ length: 721 }, (_, j) => add(eye, scale(dirOf(j * 0.5, el(j * 0.5)), R)));
    const items: LineItem[] = [{ points: line((az) => horizonAt(mask.elDeg, az)), colour: colours.text, widthPx: 1.5, opacity: 0.7, overlay: true }];
    if (showSmooth) {
      const s = smoothHorizon(active.observerHeightM).elDeg;
      items.push({ points: line(() => s), colour: colours.muted, widthPx: 1.5, opacity: 0.9, dash: [300, 300], overlay: true });
    }
    engine.setLines('horizon', items);
  }, [camMode, mask, eye, dirOf, showSmooth, frame, colours, active.observerHeightM, engineReady]);

  // Masts of the scenario pins.
  const pinBases = useMemo(() => {
    if (!frame) return [];
    const out: { s: Scenario; base: V3; up: V3 }[] = [];
    for (const s of scenarios) {
      const l = siteLatLon(s.siteRef, sites.sites);
      if (!l) continue;
      const inScene = frame.polar ? inPolarMesh(l.latDeg, l.lonDeg) : surfaceDistanceM(l.latDeg, l.lonDeg, frame.latDeg, frame.lonDeg) < CAP_M;
      if (!inScene) continue;
      const base = pointAt(l.latDeg, l.lonDeg, groundAt(l.latDeg, l.lonDeg));
      if (!base) continue;
      out.push({ s, base, up: localBasisAt(frame, base).u });
    }
    return out;
  }, [frame, scenarios, sites.sites, pointAt, groundAt]);

  useEffect(() => {
    engineRef.current?.setMasts(camMode === 'ground' ? pinBases.filter((p) => p.s.id !== active.id) : pinBases);
  }, [pinBases, camMode, active.id, engineReady]);

  // Labels of §8 (DOM), recomputed when their inputs change; placed by the render loop.
  const labels = useMemo((): LabelView[] => {
    if (!frame) return [];
    const out: LabelView[] = [];
    for (const { s, base, up } of pinBases) {
      const isActive = s.id === active.id;
      if (isActive && camMode === 'ground') continue;
      const name = scenarioName(s, sites.sites);
      out.push({
        key: `pin:${s.id}`,
        kind: 'pin',
        anchor: add(base, scale(up, MAST_M)),
        priority: 5,
        occlude: false,
        text: name,
        ariaLabel: t('stage3d.pin', { letter: s.id, name }),
        pin: { id: s.id, active: isActive, status: isActive && sky ? [bodyStatus('sun', sky.sun.visible, sky.sun.elDeg), bodyStatus('earth', sky.earth.visible, sky.earth.elDeg)] : [] },
        onClick: () => setActiveScenario(s.id),
      });
    }
    if (mask && sky) {
      for (const body of ridgeBodies(focusBody, sky)) {
        const b = sky[body];
        const blk = blockerAt(mask, b.azDeg);
        const p = crestPointAt(Math.round(blk.azDeg / 0.5));
        const text = ridgeLabel(blk.distM);
        if (!p || !text) continue;
        out.push({
          key: `ridge:${body}`,
          kind: 'ridge',
          anchor: p,
          priority: 4,
          occlude: false,
          text,
          sub: t('stage3d.ridge_sub', { el: formatDeg(b.elDeg), margin: formatMargin(b.marginDeg) }),
          body,
        });
      }
    }
    for (const r of regions) {
      const cx = (r.box_m[0] + r.box_m[2]) / 2;
      const cy = (r.box_m[1] + r.box_m[3]) / 2;
      const h = heightsRef.current ? polarHeightAt(heightsRef.current, cx, cy) : 0;
      out.push({
        key: `region:${r.id}`,
        kind: 'region',
        anchor: mapToScene(cx, cy, h + 200),
        priority: 2,
        maxDistM: 250_000,
        occlude: true,
        text: r.name,
        ariaLabel: t('stage3d.region', { name: r.name }),
        onClick: () => goToRegionRef.current(r),
      });
    }
    if (frame.polar) {
      const used = new Set(scenarios.map((s) => s.siteRef));
      for (const site of sites.sites) {
        if (used.has(site.id) || !catalogueMarker(site) || !inPolarMesh(site.lat_deg, site.lon_deg)) continue;
        const p = pointAt(site.lat_deg, site.lon_deg, groundAt(site.lat_deg, site.lon_deg) + 50);
        if (!p) continue;
        out.push({
          key: `site:${site.id}`,
          kind: 'site',
          anchor: p,
          priority: 1,
          maxDistM: 60_000,
          occlude: true,
          text: site.short_name,
          ariaLabel: t('stage3d.site_pick', { name: site.short_name, letter: active.id }),
          onClick: () => updateScenario(active.id, { siteRef: site.id }),
        });
      }
    }
    for (const { body, path } of paths ?? []) {
      if (path.end) out.push({ key: `path:${body}`, kind: 'path', anchor: path.end, priority: 1, occlude: false, text: t(body === 'sun' ? 'stage3d.sun_path' : 'stage3d.earth_path'), body });
      for (const tick of path.ticks) {
        if (tick.day % 2 === 0) out.push({ key: `day:${body}:${tick.day}`, kind: 'day', anchor: tick.pos, priority: 0, occlude: false, text: t('stage3d.day', { n: tick.day }), body });
      }
      if (sky && eye) {
        const b = sky[body];
        out.push({ key: `bead:${body}`, kind: 'bead', anchor: add(eye, scale(dirOf(b.azDeg, b.elDeg), DOME_M)), priority: 6, occlude: false, text: '', body });
      }
    }
    return out;
  }, [frame, pinBases, active.id, camMode, sites.sites, sky, mask, focusBody, crestPointAt, regions, scenarios, pointAt, groundAt, paths, eye, dirOf, setActiveScenario, updateScenario]);
  labelsRef.current = labels;
  useEffect(() => {
    occludedAt.current = 0;
    engineRef.current?.invalidate();
  }, [labels]);

  const registerLabel = useCallback((key: string, el: HTMLElement | null) => {
    if (el) labelEls.current.set(key, el);
    else labelEls.current.delete(key);
  }, []);

  // ---- Go to (§7.4) ---------------------------------------------------------------------------------
  const goToRegionRef = useRef<(r: RegionRow) => void>(() => {});
  goToRegionRef.current = (r: RegionRow) => {
    const engine = engineRef.current;
    if (!engine || !frame?.polar) return;
    const cx = (r.box_m[0] + r.box_m[2]) / 2;
    const cy = (r.box_m[1] + r.box_m[3]) / 2;
    const size = Math.max(r.box_m[2] - r.box_m[0], r.box_m[3] - r.box_m[1]);
    const goal = engine.getOrbit();
    const target = mapToScene(cx, cy, heightsRef.current ? polarHeightAt(heightsRef.current, cx, cy) : 0);
    if (engine.getMode() === 'ground') changeMode('orbit');
    engine.goTo({ target, headingDeg: goal?.headingDeg ?? focusAz(), pitchDeg: 35, distM: Math.max(8000, size * 1.6) });
  };
  const goToItems = useMemo((): GoToItem[] => {
    const items: GoToItem[] = scenarios.map((s) => ({
      key: `s:${s.id}`,
      label: t('stage3d.goto_scenario', { letter: s.id, name: scenarioName(s, sites.sites) }),
      onSelect: () => (s.id === active.id ? recenter() : setActiveScenario(s.id)),
    }));
    for (const r of regions) items.push({ key: `r:${r.id}`, label: r.name, onSelect: () => goToRegionRef.current(r) });
    if (frame?.polar) {
      items.push({
        key: 'pole',
        label: t('stage3d.goto_pole'),
        onSelect: () => {
          const engine = engineRef.current;
          if (!engine) return;
          if (engine.getMode() === 'ground') changeMode('orbit');
          engine.goTo({ target: mapToScene(0, 0, heightsRef.current ? polarHeightAt(heightsRef.current, 0, 0) : 0), headingDeg: 0, pitchDeg: 40, distM: 60_000 });
        },
      });
    }
    return items;
  }, [scenarios, sites.sites, active.id, regions, frame, recenter, setActiveScenario, changeMode]);

  const northUp = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.getMode() === 'orbit') {
      const goal = engine.getOrbit();
      if (goal) engine.setOrbit({ ...goal, headingDeg: 0 }, false);
    } else {
      const l = engine.getLook();
      if (l) engine.setLook({ ...l, yawDeg: 0 });
    }
  }, []);

  // ---- Click on the terrain = click on the map (§10.2, 08 §7) ------------------------------------------
  const clickAt = useCallback(
    async (x: number, y: number) => {
      const engine = engineRef.current;
      const g = groundRef.current;
      if (!engine || !g || !frame?.polar || built?.key !== 'polar') return;
      const { o, d } = engine.rayAt(x, y);
      const hit = raycastGround(o, d, (p) => g.clearance(p));
      if (!hit) return;
      const { latDeg, lonDeg } = meToLatLonH(fromScene(frame, hit));
      const xy = xyOfLatLon(latDeg, lonDeg);
      const { i, j } = cellOfXY(xy.x, xy.y);
      if (!inGrid(i, j)) return;
      if (doneRef.current === undefined) {
        doneRef.current = await loader.binary(joinUrl(config.heavy_base_url, 'cube/done.bin'), { bytes: GRID.nChunkRows * GRID.nChunkCols }).catch(() => null);
      }
      try {
        await loadCellMask(loader, config.heavy_base_url, doneRef.current ?? null, i, j);
        updateScenario(active.id, { siteRef: gridRef(i, j) });
      } catch (e) {
        flash(e instanceof NotComputed ? t('map.not_computed') : t('map.unavailable'));
      }
    },
    [frame, built, config.heavy_base_url, active.id, updateScenario, flash],
  );

  // ---- Live readouts and labels after each frame ---------------------------------------------------
  const camModeRef = useRef(camMode);
  camModeRef.current = camMode;
  const liveCtx = useRef({ frame, mask, eye, loc, letter: active.id, polarBuilt: polarReady });
  liveCtx.current = { frame, mask, eye, loc, letter: active.id, polarBuilt: polarReady };
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.afterRender = () => {
      const { w, h } = sizeRef.current;
      const now = performance.now();
      const camPos = engine.cameraPosition();
      const g = groundRef.current;
      if (g && now - occludedAt.current > OCCLUDE_EVERY_MS) {
        occludedAt.current = now;
        const next = new Set<string>();
        for (const l of labelsRef.current) if (l.occlude && segmentBlocked(camPos, l.anchor, (p) => g.clearance(p))) next.add(l.key);
        occluded.current = next;
      }
      placeLabels(labelsRef.current, labelEls.current, (p) => engine.project(p, w, h), camPos, occluded.current);
      const ctx = liveCtx.current;
      const info = engine.viewInfo();
      if (live.compass.current) live.compass.current.setAttribute('transform', `rotate(${(-info.headingDeg).toFixed(1)})`);
      if (live.earthSide.current && ctx.frame?.polar) {
        const ref = engine.getMode() === 'orbit' ? engine.getOrbit()?.target : engine.getLook()?.pos;
        if (ref) {
          const m = fromScene(ctx.frame, ref);
          const { latDeg, lonDeg } = meToLatLonH(m);
          const xy = xyOfLatLon(latDeg, lonDeg);
          const az0 = (Math.atan2(-xy.x, xy.y) * 180) / Math.PI;
          live.earthSide.current.setAttribute('transform', `rotate(${(az0 - info.headingDeg).toFixed(1)})`);
        }
      }
      if (now - liveAt.current > LIVE_EVERY_MS && g) {
        liveAt.current = now;
        // Readout under the pointer, or under the centre without one (keyboard and touch, 14 §6).
        if (live.readout.current) {
          let text = '';
          if (engine.getMode() === 'ground' && ctx.mask) {
            const l = engine.getLook();
            if (l) text = pointerReadout(wrapDeg(l.yawDeg), l.pitchDeg, horizonAt(ctx.mask.elDeg, l.yawDeg));
          } else {
            const pt = pointerRef.current ?? { x: w / 2, y: h / 2 };
            const { o, d } = engine.rayAt(pt.x, pt.y);
            const hit = raycastGround(o, d, (p) => g.clearance(p));
            if (hit && ctx.frame) {
              const ll = meToLatLonH(fromScene(ctx.frame, hit));
              const hm = Math.round(ll.hM);
              text = `${formatLatLon(ll.latDeg, ll.lonDeg, 3)} · ${hm > 0 ? '+' : ''}${formatInt(hm)} m`;
            }
          }
          live.readout.current.textContent = text;
        }
        // Scale bar at the distance of the centre of the view.
        if (live.scaleBar.current && live.scaleText.current) {
          const { o, d } = engine.rayAt(w / 2, h / 2);
          const hit = engine.getMode() === 'orbit' ? null : raycastGround(o, d, (p) => g.clearance(p), 400_000);
          const dist = engine.getMode() === 'orbit' ? info.distM : hit ? norm(sub(hit, o)) : Number.NaN;
          const sb = scaleBar((2 * dist * Math.tan(((info.fovDeg / 2) * Math.PI) / 180)) / Math.max(1, info.heightPx));
          live.scaleBar.current.style.width = sb ? `${sb.px.toFixed(0)}px` : '0px';
          live.scaleText.current.textContent = sb ? (sb.metres >= 1000 ? `${formatInt(sb.metres / 1000)} km` : `${formatInt(sb.metres)} m`) : '';
        }
        if (live.skyNote.current) {
          const far = engine.getMode() === 'fly' && ctx.eye !== null && norm(sub(camPos, ctx.eye)) > 50_000;
          live.skyNote.current.hidden = !far;
          if (far) live.skyNote.current.textContent = t('stage3d.sky_from', { letter: ctx.letter });
        }
        // §4.1: when the smooth sphere beyond the polar mesh is in view, the relief line says so.
        if (live.beyond.current) {
          let beyond = false;
          if (ctx.frame?.polar && ctx.polarBuilt) {
            // Nine rays against the reference sphere (cheap; the relief changes little at that scale).
            for (const fx of [0.05, 0.5, 0.95]) {
              for (const fy of [0.05, 0.5, 0.95]) {
                const r = engine.rayAt(w * fx, h * fy);
                const hit = raySphere(r.o, r.d, POLAR_CENTRE, R_M);
                if (!hit) continue;
                const m = meToLatLonH(fromScene(ctx.frame, hit));
                if (!inPolarMesh(m.latDeg, m.lonDeg)) beyond = true;
              }
            }
          }
          live.beyond.current.hidden = !beyond;
        }
      }
      const wrap = wrapRef.current;
      if (wrap && test) {
        wrap.dataset.frames = String(engine.frames);
        wrap.dataset.camera = engine.cameraState();
      }
    };
    return () => {
      engine.afterRender = null;
    };
  }, [engineReady, test]);

  useEffect(() => {
    if (!showFps) return;
    const id = window.setInterval(() => {
      const f = engineRef.current?.currentFps();
      setFpsText(f ? t('stage3d.fps', { fps: Math.round(f) }) : null);
    }, 500);
    return () => window.clearInterval(id);
  }, [showFps]);

  // ---- Test hook (`?test3d=1`): the GPU shadow pass against the TypeScript reference (§15.2) -----
  useEffect(() => {
    if (!test) return;
    const w = window as unknown as { __stage3d?: unknown };
    w.__stage3d = {
      compareShadow(n: number) {
        const engine = engineRef.current;
        const s = engine?.lastSky();
        const size = engine?.shadowSize();
        if (!engine || !s || !size) return null;
        const hts = heightsRef.current;
        const radial = size.kind === 'radial' ? engine.radialShadowSource() : null;
        const f = liveCtx.current.frame;
        if (size.kind === 'polar' ? !hts : !radial || !f) return null;
        let agree = 0;
        let maxDiff = 0;
        let lit = 0;
        /** The first texels that disagree (diagnostics of the test). */
        const worst: { i: number; j: number; gpu: number; cpu: number }[] = [];
        let seed = 7;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const rho = (s.sunRadiusDeg * Math.PI) / 180;
        for (let k = 0; k < n; k++) {
          const i = Math.floor(rnd() * size.w);
          const j = Math.floor(rnd() * size.h);
          const gpu = engine.readShadow(i, j);
          if (gpu === null) return null;
          let cpu: number;
          if (radial && f) {
            // Radial texel (bin i, azimuth j) of the profile scene.
            cpu = radialLitFraction(radial, f, j, i, s.sunMe, rho);
          } else {
            const x = GRID.xMinM + (i + 0.5) * size.div * GRID.cellM;
            const y = GRID.yMaxM - (j + 0.5) * size.div * GRID.cellM;
            cpu = litFraction(hts!, x, y, s.sunMe, rho);
          }
          const d = Math.abs(gpu - cpu);
          if (d <= 0.05) agree++;
          else if (worst.length < 8) worst.push({ i, j, gpu, cpu });
          maxDiff = Math.max(maxDiff, d);
          if (cpu > 0.5) lit++;
        }
        return { n, agree: agree / n, maxDiff, litShare: lit / n, kind: size.kind, worst };
      },
      /** Figures of §12.3: GPU memory (MB), last mesh job in the worker (ms), mean shadow pass (ms), tier. */
      perf(passes = 10) {
        const engine = engineRef.current;
        if (!engine) return null;
        return { gpuMB: engine.gpuMemoryMB(), meshMs: meshMsRef.current, shadowMs: engine.benchShadow(passes), tier: tierRef.current };
      },
      /** Looks straight down at a map point (m) from 3 km, in orbit (the tests then press Enter). */
      focusMap(x: number, y: number) {
        const engine = engineRef.current;
        if (!engine) return false;
        const h = heightsRef.current ? polarHeightAt(heightsRef.current, x, y) : 0;
        engine.setMode('orbit');
        setCamMode('orbit');
        engine.setOrbit({ target: mapToScene(x, y, h), headingDeg: 0, pitchDeg: 89, distM: 3000 }, true);
        return true;
      },
      /** Screen position of a scene label (for clicks in the tests). */
      labelAt(key: string) {
        const el = labelEls.current.get(key);
        if (!el || el.hidden) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top };
      },
    };
    return () => {
      delete w.__stage3d;
    };
  }, [test]);

  // ---- Description for screen readers (§13): at most every 10 s, never during playback ----------
  const shownLabel = overlay?.legend ? (overlay.choices.find((c) => c.layer === overlay.current)?.label ?? null) : null;
  const descOverlay = useMemo(() => (shownLabel && period ? { layer: shownLabel, period: period.label } : null), [shownLabel, period]);
  const descAt = useRef(0);
  /** The last description had the sky and the camera: later ones wait for the 10 s step. */
  const descComplete = useRef(false);
  useEffect(() => {
    if (playing) return;
    const make = () => {
      const engine = engineRef.current;
      const goal = engine?.getOrbit();
      const look = engine?.getLook();
      const m = engine?.getMode() ?? 'orbit';
      const g = groundRef.current;
      descAt.current = Date.now();
      descComplete.current = sky !== null && (m !== 'orbit' || goal !== null);
      setDesc(
        describeView({
          letter: active.id,
          name: scenarioName(active, sites.sites),
          latDeg: loc?.latDeg ?? 0,
          lonDeg: loc?.lonDeg ?? 0,
          sky,
          mask,
          mode: m,
          distM: m === 'orbit' ? (goal?.distM ?? Number.NaN) : m === 'fly' && look && g ? g.clearance(look.pos) : Number.NaN,
          headingDeg: m === 'orbit' ? (goal?.headingDeg ?? 0) : (look?.yawDeg ?? 0),
          eyeM: active.observerHeightM,
          scene: kind ?? undefined,
          overlay: descOverlay,
        }),
      );
    };
    const wait = DESC_EVERY_MS - (Date.now() - descAt.current);
    if (wait <= 0 || !descComplete.current) {
      make();
      return;
    }
    const id = window.setTimeout(make, wait);
    return () => window.clearTimeout(id);
  }, [sky, active, loc, mask, playing, sites.sites, built, camMode, kind, descOverlay]);

  // ---- Input (§7) -----------------------------------------------------------------------------------
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('.stage3d__controls, .stage3d__label')) return;
      e.preventDefault();
      engineRef.current?.zoomBy(Math.exp(e.deltaY * 0.0015));
    };
    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  }, []);

  const pointers = useRef(new Map<number, { x: number; y: number; pan: boolean; x0: number; y0: number; t0: number }>());
  const local = (e: React.PointerEvent) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, .stage3d__controls')) return;
    wrapRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey, x0: e.clientX, y0: e.clientY, t0: performance.now() });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointers.current.get(e.pointerId);
    const engine = engineRef.current;
    if (!p) {
      if (e.pointerType === 'mouse' && !(e.target as HTMLElement).closest('.stage3d__controls')) {
        pointerRef.current = local(e);
        liveAt.current = 0;
        engine?.invalidate();
      }
      return;
    }
    if (!engine) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    const m = engine.getMode();
    if (pointers.current.size >= 2) {
      const o = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId)[0][1];
      const before = Math.hypot(p.x - o.x, p.y - o.y);
      const after = Math.hypot(e.clientX - o.x, e.clientY - o.y);
      if (before > 0 && after > 0) engine.zoomBy(before / after);
      engine.panBy(dx / 2, dy / 2);
    } else if (m === 'ground') {
      // Grab the view, as the 2D panorama: the terrain follows the finger.
      const k = engine.viewInfo().fovDeg / Math.max(1, sizeRef.current.h);
      engine.lookBy(-dx * k, dy * k);
    } else if (m === 'fly') engine.lookBy(dx * 0.15, -dy * 0.15);
    else if (p.pan) engine.panBy(dx, dy);
    else engine.orbitBy(-dx * 0.3, dy * 0.2);
    pointers.current.set(e.pointerId, { ...p, x: e.clientX, y: e.clientY });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const p = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (p && pointers.current.size === 0 && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 5 && performance.now() - p.t0 < 600 && e.button === 0) {
      const q = local(e);
      void clickAt(q.x, q.y);
    }
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (mode === 'learn' || e.target !== wrapRef.current) return;
    const engine = engineRef.current;
    if (!engine || e.ctrlKey || e.metaKey || e.altKey) return;
    const m = engine.getMode();
    if (e.key === 'Home') {
      e.preventDefault();
      recenter();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      void clickAt(sizeRef.current.w / 2, sizeRef.current.h / 2);
      return;
    }
    if (m === 'fly') {
      if (e.code in FLY_KEYS || e.key === 'Shift') {
        e.preventDefault();
        held.current.add(e.code);
        engine.invalidate();
      }
      return;
    }
    const step = m === 'ground' ? 1 : 5;
    const act: Record<string, () => void> = {
      ArrowLeft: () => engine.orbitBy(-step, 0),
      ArrowRight: () => engine.orbitBy(step, 0),
      ArrowUp: () => engine.orbitBy(0, step),
      ArrowDown: () => engine.orbitBy(0, -step),
      '+': () => engine.zoomBy(m === 'ground' ? 0.9 : 0.8),
      '=': () => engine.zoomBy(m === 'ground' ? 0.9 : 0.8),
      PageUp: () => engine.zoomBy(m === 'ground' ? 0.9 : 0.8),
      '-': () => engine.zoomBy(m === 'ground' ? 1.1 : 1.25),
      PageDown: () => engine.zoomBy(m === 'ground' ? 1.1 : 1.25),
    };
    const f = act[e.key];
    if (!f) return;
    e.preventDefault();
    f();
  };
  const onKeyUp = (e: React.KeyboardEvent) => {
    held.current.delete(e.code);
  };

  if (fatal) throw fatal;

  const siteName = scenarioName(active, sites.sites);
  const smoothSite = model.status === 'ready' ? model.data.smooth : false;
  const figures = model.status === 'ready' ? model.data.reliefLabel : '';
  const relief = reliefLine(kind ?? 'smooth', smoothSite, figures);
  // A failed source moved the site one scene down (§2.1): the controls say so, with Retry.
  const dataError = (wantsPolar && demRes.status === 'error') || (profileFile !== null && profileRes.status === 'error');
  const terrain = pick?.pending || (kind !== null && !frame) ? 'loading' : dataError ? 'error' : kind === 'smooth' ? 'none' : 'ready';
  const state = !engineReady ? 'loading' : terrain === 'loading' ? 'terrain' : frame ? 'ready' : 'loading';
  const retryTerrain = () => {
    retryDem();
    retryProfile();
  };

  return (
    <div
      ref={wrapRef}
      className="stage3d"
      role="group"
      aria-roledescription="3D view"
      aria-label={t('stage3d.label', { site: siteName })}
      tabIndex={0}
      data-state={state}
      data-mode={camMode}
      data-scene={frame ? (kind ?? undefined) : undefined}
      data-overlay={polarReady && band && layerRes.status === 'ready' ? band : 'none'}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={() => held.current.clear()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
      onPointerLeave={() => {
        pointerRef.current = null;
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={canvasRef} className="stage3d__canvas" role="img" aria-label={t('stage3d.img_label', { site: siteName })} aria-describedby="stage3d-desc" />
      <p id="stage3d-desc" className="visually-hidden">
        {desc}
      </p>
      {!engineReady && (
        <p className="stage3d__loading" role="status">
          {t('stage3d.loading')}
        </p>
      )}
      <div className={`stage3d__fade${fading ? ' stage3d__fade--on' : ''}`} aria-hidden="true" />
      <Labels labels={labels} register={registerLabel} />
      <Controls
        relief={relief}
        overlay={overlay}
        terrain={terrain}
        onRetry={retryTerrain}
        onRecenter={recenter}
        onNorthUp={northUp}
        mode={camMode}
        onMode={changeMode}
        goTo={goToItems}
        message={message}
        fps={fpsText}
        live={live}
        polar={frame?.polar === true}
      />
    </div>
  );
}

/** Centre of the Moon in the polar scene (16 §3.1). */
const POLAR_CENTRE: V3 = [0, -R_M, 0];

/** First intersection of the ray o + t·d (unit d, t > 0) with a sphere, or null. */
function raySphere(o: V3, d: V3, c: V3, r: number): V3 | null {
  const oc = sub(o, c);
  const b = oc[0] * d[0] + oc[1] * d[1] + oc[2] * d[2];
  const q = oc[0] * oc[0] + oc[1] * oc[1] + oc[2] * oc[2] - r * r;
  const disc = b * b - q;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t = -b - s > 0 ? -b - s : -b + s;
  return t > 0 ? add(o, scale(d, t)) : null;
}

/** Bodies whose blocking ridge is drawn (§8.4): the focus body (as the panorama), and the Sun whenever it is hidden. */
function ridgeBodies(focus: 'sun' | 'earth', sky: SkyState): ('sun' | 'earth')[] {
  const out: ('sun' | 'earth')[] = [focus];
  if (focus !== 'sun' && !sky.sun.visible) out.push('sun');
  return out;
}
