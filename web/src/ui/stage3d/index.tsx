// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Stage3D (16_vista_3d.md; common contract in annex A): the realistic polar scene of T-71. Fills its
// container, reads everything from the store and the scenario model, draws only the camera controls
// as its own panel. A WebGL failure is thrown so the shell's error boundary shows the 2D view.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { enuBasis } from '../../core/frames';
import { loader } from '../../core/loaders';
import { evaluate, type SkyState } from '../../core/visibility';
import { t } from '../../i18n/t';
import { activeScenario } from '../../state/selectors';
import { useAppStore, type Scenario, type ScenarioId } from '../../state/store';
import { useBoot } from '../common/data';
import { useResource } from '../common/DataState';
import { formatLatLon } from '../common/format';
import { useScenarioModel } from '../common/model';
import { meshPointLabel } from '../map/mapData';
import { parseSiteRef } from '../../state/selectors';
import type { Site } from '../../core/types';
import { startOrbit } from './camera';
import { Controls } from './Controls';
import { POLAR_FRAME, azElToMe, localBasisAt, makeSceneFrame, surfaceDistanceM, type SceneFrame, type V3 } from './frame';
import { buildRadialMesh, ringDistances } from './meshes';
import { Pins, type PinView } from './Pins';
import { pickTier, TIER_SETTINGS, type Tier } from './quality';
import { bodyStatus, chooseScene, describeView, inPolarMesh, reliefLine, siteLatLon, type DemStatus, type SceneKind } from './scenePlan';
import { Engine } from './scene/engine';
import { loadPolarDem, meshJob, polarGround, sphereGround, surfacePoint } from './terrain';
import { litFraction } from './shadow';
import { GRID } from '../../core/grid';
import './stage3d.css';

const CAP_M = 300_000;
const DESC_EVERY_MS = 10_000;

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

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function Stage3D() {
  const { config, sites } = useBoot();
  const scenarios = useAppStore((s) => s.scenarios);
  const active = useAppStore(activeScenario);
  const cursorUnix = useAppStore((s) => s.cursorUnix);
  const playing = useAppStore((s) => s.playing);
  const focusBody = useAppStore((s) => s.focusBody);
  const mode = useAppStore((s) => s.mode);
  const setActiveScenario = useAppStore((s) => s.setActiveScenario);
  const [model] = useScenarioModel(active);

  const test = urlParam('test3d') === '1';
  const showFps = urlParam('fps') === '1';
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sizeRef = useRef({ w: 1, h: 1 });
  const heightsRef = useRef<Float32Array | null>(null);
  const holesRef = useRef<Uint8Array | null>(null);
  const pinEls = useRef(new Map<ScenarioId, HTMLElement>());
  const pinAnchors = useRef(new Map<ScenarioId, V3>());
  const [fatal, setFatal] = useState<Error | null>(null);
  const [engineKey, setEngineKey] = useState(0);
  const [engineReady, setEngineReady] = useState(false);
  const [tier, setTier] = useState<Tier>('alto');
  const [built, setBuilt] = useState<{ key: string; frame: SceneFrame } | null>(null);
  const [fpsText, setFpsText] = useState<string | null>(null);
  const [desc, setDesc] = useState('');

  // ---- Where is the active site, and which scene (§2.1) ----------------------------------
  const loc = useMemo(() => {
    const l = siteLatLon(active.siteRef, sites.sites);
    if (l) return l;
    return model.status === 'ready' ? { latDeg: model.data.latDeg, lonDeg: model.data.lonDeg } : null;
  }, [active.siteRef, sites.sites, model]);
  const wantsPolar = loc !== null && inPolarMesh(loc.latDeg, loc.lonDeg);
  const [demRes, retryDem] = useResource(wantsPolar ? `stage3d-dem:${config.heavy_base_url}` : null, () => loadPolarDem(loader, config.heavy_base_url));
  const dem: DemStatus = demRes.status === 'ready' ? 'ready' : demRes.status === 'error' ? 'error' : 'loading';
  const kind: SceneKind | null = loc ? chooseScene(loc.latDeg, loc.lonDeg, dem) : null;
  const sceneKey = kind === 'polar' ? 'polar' : kind === 'smooth' && loc ? `smooth:${loc.latDeg},${loc.lonDeg}` : null;
  const frame = built && built.key === sceneKey ? built.frame : null;

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
    engineRef.current = engine;
    setBuilt(null);
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
    if (!engine || !engineReady || !kind || !loc) return;
    let alive = true;
    if (kind === 'polar') {
      if (dem !== 'ready' || demRes.status !== 'ready') {
        engine.setPlaceholder(POLAR_FRAME);
        engine.setGround(sphereGround(POLAR_FRAME));
        setBuilt({ key: 'polar-placeholder', frame: POLAR_FRAME });
        return;
      }
      if (built?.key === 'polar') return;
      const lod = TIER_SETTINGS[tier].lod;
      const job = heightsRef.current
        ? meshJob({ heights: heightsRef.current, holes: holesRef.current ?? undefined, lod })
        : meshJob({ dem: demRes.data.slice(), lod });
      job.then((a) => {
        if (!alive || engineRef.current !== engine) return;
        heightsRef.current = a.heights;
        holesRef.current = a.holes;
        engine.setPolar(a.tiles, a.heights, a.holes);
        engine.setGround(polarGround(a.heights));
        setBuilt({ key: 'polar', frame: POLAR_FRAME });
      });
    } else {
      const f = makeSceneFrame(loc.latDeg, loc.lonDeg, 0);
      const cap = buildRadialMesh(f, 256, ringDistances(), () => 0, 0, true);
      engine.setSmooth(f, cap, CAP_M);
      engine.setGround(sphereGround(f));
      setBuilt({ key: sceneKey!, frame: f });
    }
    return () => {
      alive = false;
    };
    // `built` is read to skip a rebuild of the same scene; listing it would loop.
  }, [engineReady, engineKey, kind, sceneKey, dem, demRes, tier]);

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

  // ---- Pins (§8.1) ------------------------------------------------------------------------------
  const pins = useMemo((): (PinView & { base: V3; up: V3 })[] => {
    if (!frame) return [];
    const heights = frame.polar ? heightsRef.current : null;
    const out: (PinView & { base: V3; up: V3 })[] = [];
    for (const s of scenarios) {
      const l = siteLatLon(s.siteRef, sites.sites);
      if (!l) continue;
      const inScene = frame.polar ? inPolarMesh(l.latDeg, l.lonDeg) : surfaceDistanceM(l.latDeg, l.lonDeg, frame.latDeg, frame.lonDeg) < CAP_M;
      if (!inScene) continue;
      const base = surfacePoint(frame, l.latDeg, l.lonDeg, heights);
      const isActive = s.id === active.id;
      const status = isActive && sky ? [bodyStatus('sun', sky.sun.visible, sky.sun.elDeg), bodyStatus('earth', sky.earth.visible, sky.earth.elDeg)] : [];
      out.push({ id: s.id, name: scenarioName(s, sites.sites), active: isActive, status, base, up: localBasisAt(frame, base).u });
    }
    return out;
    // `built` changes when the polar heights arrive.
  }, [frame, built, scenarios, sites.sites, active.id, sky]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setMasts(pins.map((p) => ({ base: p.base, up: p.up })));
    pinAnchors.current = new Map(pins.map((p) => [p.id, [p.base[0] + p.up[0] * 300, p.base[1] + p.up[1] * 300, p.base[2] + p.up[2] * 300] as V3]));
    engine.invalidate();
  }, [pins]);

  const registerPin = useCallback((id: ScenarioId, el: HTMLElement | null) => {
    if (el) pinEls.current.set(id, el);
    else pinEls.current.delete(id);
  }, []);

  // ---- Camera framing (§7.1) --------------------------------------------------------------------
  const skyRef = useRef(sky);
  skyRef.current = sky;
  const framing = useCallback(
    (jump: boolean) => {
      const engine = engineRef.current;
      if (!engine || !frame || !loc) return;
      const target = surfacePoint(frame, loc.latDeg, loc.lonDeg, frame.polar ? heightsRef.current : null);
      const s = skyRef.current;
      const az = s ? (focusBody === 'sun' ? s.sun.azDeg : s.earth.azDeg) : 0;
      const other = scenarios.find((x) => x.id !== active.id);
      const ol = other ? siteLatLon(other.siteRef, sites.sites) : null;
      const sep = ol ? surfaceDistanceM(loc.latDeg, loc.lonDeg, ol.latDeg, ol.lonDeg) : null;
      engine.setOrbit(startOrbit(target, az, sep), jump);
    },
    [frame, loc, focusBody, scenarios, active.id, sites.sites],
  );
  const framedFor = useRef('');
  useEffect(() => {
    if (!frame || !loc) return;
    const key = `${built?.key}|${active.id}|${active.siteRef}|${sky ? 1 : 0}`;
    if (framedFor.current === key) return;
    const sameScene = framedFor.current.split('|')[0] === built?.key;
    framedFor.current = key;
    framing(!sameScene);
  }, [frame, loc, built, active.id, active.siteRef, framing, sky]);

  // Centre on Sun / Earth turns the orbit toward that body.
  const lastFocus = useRef(focusBody);
  useEffect(() => {
    const engine = engineRef.current;
    const goal = engine?.getOrbit();
    if (!engine || !goal || lastFocus.current === focusBody || !sky) return;
    lastFocus.current = focusBody;
    engine.setOrbit({ ...goal, headingDeg: focusBody === 'sun' ? sky.sun.azDeg : sky.earth.azDeg }, false);
  }, [focusBody, sky]);

  // ---- Labels and test hooks after each frame ---------------------------------------------------
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.afterRender = () => {
      const { w, h } = sizeRef.current;
      for (const [id, el] of pinEls.current) {
        const a = pinAnchors.current.get(id);
        const p = a ? engine.project(a, w, h) : null;
        if (!p) el.hidden = true;
        else {
          el.hidden = false;
          el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
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
        const h = heightsRef.current;
        const sky = engine?.lastSky();
        const size = engine?.shadowSize();
        if (!engine || !h || !sky || !size) return null;
        let agree = 0;
        let maxDiff = 0;
        let lit = 0;
        let seed = 7;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        for (let k = 0; k < n; k++) {
          const i = Math.floor(rnd() * size.w);
          const j = Math.floor(rnd() * size.h);
          const gpu = engine.readShadow(i, j);
          if (gpu === null) return null;
          const x = GRID.xMinM + (i + 0.5) * size.div * GRID.cellM;
          const y = GRID.yMaxM - (j + 0.5) * size.div * GRID.cellM;
          const cpu = litFraction(h, x, y, sky.sunMe, (sky.sunRadiusDeg * Math.PI) / 180);
          const d = Math.abs(gpu - cpu);
          if (d <= 0.05) agree++;
          maxDiff = Math.max(maxDiff, d);
          if (cpu > 0.5) lit++;
        }
        return { n, agree: agree / n, maxDiff, litShare: lit / n };
      },
    };
    return () => {
      delete w.__stage3d;
    };
  }, [test]);

  // ---- Description for screen readers (§13): at most every 10 s, never during playback ----------
  const descAt = useRef(0);
  useEffect(() => {
    if (playing) return;
    const make = () => {
      const goal = engineRef.current?.getOrbit();
      descAt.current = Date.now();
      setDesc(
        describeView({
          letter: active.id,
          name: scenarioName(active, sites.sites),
          latDeg: loc?.latDeg ?? 0,
          lonDeg: loc?.lonDeg ?? 0,
          sky,
          mask: model.status === 'ready' ? model.data.mask : null,
          distM: goal?.distM ?? Number.NaN,
          headingDeg: goal?.headingDeg ?? 0,
        }),
      );
    };
    const wait = DESC_EVERY_MS - (Date.now() - descAt.current);
    if (wait <= 0 || desc === '') {
      make();
      return;
    }
    const id = window.setTimeout(make, wait);
    return () => window.clearTimeout(id);
  }, [sky, active, loc, model, playing, sites.sites, built]);

  // ---- Input (§7.1) -------------------------------------------------------------------------------
  const recenter = useCallback(() => framing(false), [framing]);
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('.stage3d__controls, .stage3d__pin')) return;
      e.preventDefault();
      engineRef.current?.zoomBy(Math.exp(e.deltaY * 0.0015));
    };
    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  }, []);

  const pointers = useRef(new Map<number, { x: number; y: number; pan: boolean }>());
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, .stage3d__controls')) return;
    wrapRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointers.current.get(e.pointerId);
    const engine = engineRef.current;
    if (!p || !engine) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (pointers.current.size >= 2) {
      const others = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId);
      const o = others[0][1];
      const before = Math.hypot(p.x - o.x, p.y - o.y);
      const after = Math.hypot(e.clientX - o.x, e.clientY - o.y);
      if (before > 0 && after > 0) engine.zoomBy(before / after);
      engine.panBy(dx / 2, dy / 2);
    } else if (p.pan) engine.panBy(dx, dy);
    else engine.orbitBy(-dx * 0.3, dy * 0.2);
    pointers.current.set(e.pointerId, { ...p, x: e.clientX, y: e.clientY });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (mode === 'learn' || e.target !== wrapRef.current) return;
    const engine = engineRef.current;
    if (!engine || e.ctrlKey || e.metaKey || e.altKey) return;
    const act: Record<string, () => void> = {
      ArrowLeft: () => engine.orbitBy(-5, 0),
      ArrowRight: () => engine.orbitBy(5, 0),
      ArrowUp: () => engine.orbitBy(0, 5),
      ArrowDown: () => engine.orbitBy(0, -5),
      '+': () => engine.zoomBy(0.8),
      '=': () => engine.zoomBy(0.8),
      PageUp: () => engine.zoomBy(0.8),
      '-': () => engine.zoomBy(1.25),
      PageDown: () => engine.zoomBy(1.25),
      Home: recenter,
    };
    const f = act[e.key];
    if (!f) return;
    e.preventDefault();
    f();
  };

  if (fatal) throw fatal;

  const siteName = scenarioName(active, sites.sites);
  const smoothSite = model.status === 'ready' ? model.data.smooth : false;
  const figures = model.status === 'ready' ? model.data.reliefLabel : '';
  const relief = reliefLine(kind ?? 'smooth', smoothSite, figures);
  const terrain = kind === 'polar' ? (built?.key === 'polar' ? 'ready' : demRes.status === 'error' ? 'error' : 'loading') : demRes.status === 'error' && wantsPolar ? 'error' : 'none';
  const state = !engineReady ? 'loading' : terrain === 'loading' ? 'terrain' : frame ? 'ready' : 'loading';

  return (
    <div
      ref={wrapRef}
      className="stage3d"
      role="group"
      aria-roledescription="3D view"
      aria-label={t('stage3d.label', { site: siteName })}
      tabIndex={0}
      data-state={state}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
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
      <Pins pins={pins} register={registerPin} onSelect={(id) => setActiveScenario(id)} />
      <Controls relief={relief} terrain={terrain} onRetry={retryDem} onRecenter={recenter} fps={fpsText} />
    </div>
  );
}
