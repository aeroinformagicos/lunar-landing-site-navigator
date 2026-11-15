// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// three.js side of the 3D view (16_vista_3d.md §4–§6, §7.1, §9, §12): renderer, terrain (polar tiles
// or a radial mesh around the site), smooth sphere, sky, Sun, Earth, cast-shadow pass (polar or
// radial), projected map layer, scenario masts and the cameras. Imperative; the React component
// feeds it and draws the DOM labels from `project`.
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { GRID } from '../../../core/grid';
import { clampOrbit, easeOrbit, orbitPosition, orbitsClose, type OrbitState } from '../camera';
import { POLAR_FRAME, R_M, localBasisAt, rotToScene, type Basis, type SceneFrame, type V3 } from '../frame';
import { flightAt, flyStep, lookDir, makeFlight, orbitToLook, turn, type CameraMode, type Flight, type FlyInput, type LookState } from '../navigation';
import { LOOK } from '../look';
import type { TileMesh } from '../meshes';
import { FpsMonitor, TIER_SETTINGS, type Tier } from '../quality';
import { RAMP_STEPS } from '../overlay';
import type { RadialTerrain } from '../radial';
import { BIN_LUT_SIZE, RADIAL_SHADOW_FRAG, SHADOW_FRAG, SHADOW_VERT, binLut } from '../shadow';
import { EARTH_FRAG, EARTH_VERT, SKY_VERT, STAR_FRAG, STAR_VERT, SUN_FRAG, TERRAIN_FRAG, TERRAIN_VERT } from './shaders';

export interface SkyInput {
  /** Unit directions in MOON_ME, from `skyAt` at the site (16 §5.1). */
  sunMe: V3;
  earthMe: V3;
  sunRadiusDeg: number;
  earthRadiusDeg: number;
  /** Fraction of the Sun covered by the Earth (eclipse), 0…1. */
  covered: number;
}

export interface Ground {
  /** Height of a scene point above the terrain under it (m; negative below). */
  clearance(p: V3): number;
  /** The terrain point under a scene point. */
  surface(p: V3): V3;
}

export interface LineItem {
  points: V3[];
  colour: [number, number, number];
  widthPx: number;
  opacity: number;
  /** World-unit dash and gap (m); solid when absent. */
  dash?: [number, number];
  /** Drawn over the terrain, without depth test (§8.3). */
  overlay?: boolean;
}

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  test: boolean;
  tier: Tier;
  tierLocked: boolean;
  reducedMotion: boolean;
  haloColour: [number, number, number];
  onTierDrop(t: Tier): void;
}

const DEG = Math.PI / 180;
const v3 = (a: V3) => new THREE.Vector3(a[0], a[1], a[2]);

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fails with `webgl2` when the device cannot give a WebGL 2 context (16 §10.3). */
export function createContext(canvas: HTMLCanvasElement, test: boolean): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: test, powerPreference: 'high-performance' });
  if (!gl) throw new Error('webgl2');
  return gl;
}

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly cam = new THREE.PerspectiveCamera(50, 1, 0.5, 4e6);
  private readonly skyScene = new THREE.Scene();
  private readonly skyCam = new THREE.PerspectiveCamera(50, 1, 1, 5000);
  private readonly terrain = new THREE.Group();
  private readonly terrainMat: THREE.ShaderMaterial;
  private readonly sphereMat: THREE.ShaderMaterial;
  private readonly sphere: THREE.Mesh;
  private readonly stars: THREE.Points;
  private readonly sun: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly earth: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly masts: THREE.LineSegments;
  private shadow: {
    kind: 'polar' | 'radial';
    rt: THREE.WebGLRenderTarget;
    scene: THREE.Scene;
    cam: THREE.Camera;
    mat: THREE.RawShaderMaterial;
    textures: THREE.Texture[];
  } | null = null;
  /** Source of the radial shadow pass (the profile scene). */
  private radialSrc: RadialTerrain | null = null;
  private overlayTex: THREE.DataTexture | null = null;
  private holeTex: THREE.DataTexture | null = null;
  private frame: SceneFrame = POLAR_FRAME;
  private ground: Ground | null = null;
  private skyIn: SkyInput | null = null;
  private cur: OrbitState | null = null;
  private goal: OrbitState | null = null;
  private mode: CameraMode = 'orbit';
  private look: LookState | null = null;
  private flight: Flight | null = null;
  private flyAfterFlight = false;
  private readonly lineGroups = new Map<string, THREE.Group>();
  private readonly lineMats = new Set<LineMaterial>();
  private size = { w: 1, h: 1 };
  /** Held keys of the fly mode (set by the component). */
  input: () => FlyInput = () => ({ forward: 0, right: 0, up: 0, fast: false });
  private dirty = true;
  private shadowDirty = false;
  private lastShadowMs = -Infinity;
  private lastFrameMs = 0;
  private lastLoopMs = 0;
  private raf = 0;
  private disposed = false;
  private readonly fps: FpsMonitor;
  private tier: Tier;
  /** Playback is running: the scene renders continuously. */
  playing = false;
  frames = 0;
  afterRender: (() => void) | null = null;

  constructor(private readonly o: EngineOptions) {
    const gl = createContext(o.canvas, o.test);
    this.renderer = new THREE.WebGLRenderer({ canvas: o.canvas, context: gl, logarithmicDepthBuffer: true, preserveDrawingBuffer: o.test });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = LOOK.exposure;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0x000000, 1);
    this.tier = o.tier;
    this.fps = new FpsMonitor(o.tierLocked);

    const uniforms = () => ({
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      earthDir: { value: new THREE.Vector3(0, 1, 0) },
      sunI: { value: LOOK.neutralIntensity },
      earthI: { value: 0 },
      earthColour: { value: new THREE.Vector3(...LOOK.earthshineColour) },
      ambient: { value: LOOK.ambient },
      albedo: { value: LOOK.albedo },
      albedoVar: { value: LOOK.albedoVariation },
      useShadow: { value: 0 },
      shadowTex: { value: null as THREE.Texture | null },
      useHoles: { value: 0 },
      holeTex: { value: null as THREE.Texture | null },
      detail: { value: TIER_SETTINGS[o.tier].detail ? 1 : 0 },
      detailRange: { value: new THREE.Vector2(LOOK.detailNearM, LOOK.detailFarM) },
      clipMode: { value: 0 },
      clipRect: { value: new THREE.Vector4() },
      frameO: { value: new THREE.Vector3() },
      frameE: { value: new THREE.Vector3() },
      frameN: { value: new THREE.Vector3() },
      frameU: { value: new THREE.Vector3() },
      clipCos: { value: 1 },
      R: { value: R_M },
      exag: { value: 1 },
      exagRefH: { value: 0 },
      moonC: { value: new THREE.Vector3(0, -R_M, 0) },
      useOverlay: { value: 0 },
      overlayTex: { value: null as THREE.Texture | null },
      overlayLut: { value: Array.from({ length: RAMP_STEPS }, () => new THREE.Vector3()) },
    });
    this.terrainMat = new THREE.ShaderMaterial({ vertexShader: TERRAIN_VERT, fragmentShader: TERRAIN_FRAG, uniforms: uniforms() });
    this.sphereMat = new THREE.ShaderMaterial({ vertexShader: TERRAIN_VERT, fragmentShader: TERRAIN_FRAG, uniforms: uniforms() });
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(R_M, 256, 128), this.sphereMat);
    this.scene.add(this.terrain, this.sphere);

    this.masts = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.75 }),
    );
    this.masts.frustumCulled = false;
    this.scene.add(this.masts);

    // Sky: stars (decorative, fixed seed), Sun, Earth (§5.2).
    // T-74 (D-136): magnitudes with the counts rising toward faint stars, a colour per star (blue-white
    // to orange) and a band of denser stars along a fixed great circle, like a Milky Way. Decorative.
    const rnd = mulberry32(LOOK.starSeed);
    const n = LOOK.stars;
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const bright = new Float32Array(n);
    const tint = new Float32Array(n * 3);
    const tints: [number, number, number][] = [
      [0.78, 0.86, 1.0],
      [0.92, 0.95, 1.0],
      [1.0, 0.98, 0.94],
      [1.0, 0.9, 0.76],
      [1.0, 0.78, 0.6],
    ];
    const band = LOOK.starBand;
    const ct = Math.cos(band.tiltRad);
    const st = Math.sin(band.tiltRad);
    for (let i = 0; i < n; i++) {
      let z = 2 * rnd() - 1;
      // A share of the stars hug the band (small z in the band's frame, then tilted).
      if (rnd() < band.share) z = (rnd() + rnd() + rnd() - 1.5) * band.width;
      const phi = 2 * Math.PI * rnd();
      const r = Math.sqrt(Math.max(0, 1 - z * z));
      const x0 = r * Math.cos(phi);
      const z0 = r * Math.sin(phi);
      pos.set([x0 * LOOK.skyRadius, (z * ct - z0 * st) * LOOK.skyRadius, (z * st + z0 * ct) * LOOK.skyRadius], 3 * i);
      // Magnitude 1 to 6.5 with N(m) rising as 10^(0.45 m), brightness as 10^(-0.4 m), scaled to 0..1.
      const m = 6.5 - Math.log10(1 + rnd() * (10 ** (0.45 * 5.5) - 1)) / 0.45;
      const b = Math.min(1, 0.05 + 2.2 * 10 ** (-0.4 * (m - 1)));
      bright[i] = b;
      size[i] = b > 0.5 ? 2.4 : b > 0.15 ? 1.7 : 1.2;
      tint.set(tints[Math.floor(rnd() * tints.length)], 3 * i);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('size', new THREE.BufferAttribute(size, 1));
    sg.setAttribute('bright', new THREE.BufferAttribute(bright, 1));
    sg.setAttribute('tint', new THREE.BufferAttribute(tint, 3));
    this.stars = new THREE.Points(
      sg,
      new THREE.ShaderMaterial({
        vertexShader: STAR_VERT,
        fragmentShader: STAR_FRAG,
        uniforms: { pixelRatio: { value: 1 }, dim: { value: 1 } },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.stars.renderOrder = 0;
    this.sun = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SUN_FRAG,
        uniforms: {
          halfAngle: { value: 0.1 },
          rho: { value: 0.0047 },
          discColour: { value: new THREE.Vector3(...LOOK.sunDiscColour) },
          discI: { value: LOOK.sunDiscIntensity },
          haloColour: { value: new THREE.Vector3(...o.haloColour) },
          haloScale: { value: LOOK.haloScaleDeg * DEG },
          haloStrength: { value: LOOK.haloStrength },
          dim: { value: 1 },
          spikes: { value: TIER_SETTINGS[o.tier].halo ? LOOK.sunSpikes : 0 },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.sun.renderOrder = 1;
    this.earth = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 32),
      new THREE.ShaderMaterial({
        vertexShader: EARTH_VERT,
        fragmentShader: EARTH_FRAG,
        uniforms: {
          sunDir: { value: new THREE.Vector3(0, 1, 0) },
          ocean: { value: new THREE.Vector3(...LOOK.earthOcean) },
          night: { value: new THREE.Vector3(...LOOK.earthNight) },
          clouds: { value: LOOK.earthClouds },
          intensity: { value: LOOK.earthIntensity },
          toCam: { value: new THREE.Vector3(0, 0, 1) },
        },
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.earth.renderOrder = 2;
    this.sun.visible = false;
    this.earth.visible = false;
    this.skyScene.add(this.stars, this.sun, this.earth);

    this.applyFrameUniforms();
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---- Scene setup -------------------------------------------------------------------------

  private applyFrameUniforms() {
    const f = this.frame;
    const u = this.sphereMat.uniforms;
    u.frameO.value.set(...f.o);
    u.frameE.value.set(...f.e);
    u.frameN.value.set(...f.n);
    u.frameU.value.set(...f.u);
    this.sphere.position.set(0, -(R_M + f.hM), 0);
    this.sphere.visible = true;
    // Exaggeration about the anchor (D-131); the smooth sphere beyond the terrain keeps exag = 1.
    for (const m of [this.terrainMat, this.sphereMat]) {
      m.uniforms.exagRefH.value = f.hM;
      m.uniforms.moonC.value.set(0, -(R_M + f.hM), 0);
    }
  }

  /** Vertical exaggeration of the drawn terrain (T-74, D-131); 1 in Ground. Shadows keep the real relief. */
  setExaggeration(k: number) {
    if (this.terrainMat.uniforms.exag.value === k) return;
    this.terrainMat.uniforms.exag.value = k;
    this.dirty = true;
  }

  private clearTerrain() {
    for (const m of this.terrain.children as THREE.Mesh[]) m.geometry.dispose();
    this.terrain.clear();
  }

  private addMesh(t: TileMesh) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(t.position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(t.normal, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(t.uv, 2));
    g.setIndex(new THREE.BufferAttribute(t.index, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.terrainMat);
    m.position.set(...t.offset);
    this.terrain.add(m);
  }

  /** Polar scene (§4.1): tiles, the DEM and hole textures, the shadow pass and the clipped sphere. */
  setPolar(tiles: TileMesh[], heights: Float32Array, holes: Uint8Array) {
    this.frame = POLAR_FRAME;
    this.radialSrc = null;
    this.applyFrameUniforms();
    this.clearTerrain();
    for (const t of tiles) this.addMesh(t);
    const u = this.sphereMat.uniforms;
    const half = GRID.cellM;
    const yMin = GRID.yMaxM - GRID.ny * GRID.cellM;
    u.clipMode.value = 1;
    u.clipRect.value.set(GRID.xMinM + half, yMin + half, GRID.xMinM + GRID.nx * GRID.cellM - half, GRID.yMaxM - half);
    this.setShadowSource(heights);
    this.holeTex?.dispose();
    this.holeTex = new THREE.DataTexture(Uint8Array.from(holes, (h) => h * 255), GRID.nx, GRID.ny, THREE.RedFormat, THREE.UnsignedByteType);
    this.holeTex.needsUpdate = true;
    this.terrainMat.uniforms.holeTex.value = this.holeTex;
    this.terrainMat.uniforms.useHoles.value = holes.some((h) => h) ? 1 : 0;
    this.shadowDirty = true;
    this.dirty = true;
  }

  /** Only the tiles change (level of detail after a tier drop). */
  replaceTiles(tiles: TileMesh[]) {
    this.clearTerrain();
    for (const t of tiles) this.addMesh(t);
    this.dirty = true;
  }

  /**
   * A scene around a site (§4.2–§4.4): its meshes (profile mesh, ring ground and panels, or the smooth
   * cap) and the sphere beyond `capRadiusM`; with `shadow`, the radial cast-shadow pass of §6.3.
   */
  setRadialScene(frame: SceneFrame, meshes: TileMesh[], capRadiusM: number, shadow: RadialTerrain | null = null) {
    this.frame = frame;
    this.applyFrameUniforms();
    this.clearTerrain();
    for (const m of meshes) this.addMesh(m);
    const u = this.sphereMat.uniforms;
    u.clipMode.value = 2;
    u.clipCos.value = Math.cos((capRadiusM - 2000) / R_M);
    this.disposeShadow();
    this.radialSrc = shadow;
    this.terrainMat.uniforms.useShadow.value = 0;
    this.terrainMat.uniforms.useHoles.value = 0;
    this.setOverlay(null, null);
    if (shadow) this.setRadialShadow(shadow);
    this.dirty = true;
  }

  /** Smooth Moon around an anchor (§4.4): the fine cap and the sphere beyond it. */
  setSmooth(frame: SceneFrame, cap: TileMesh, capRadiusM: number) {
    this.setRadialScene(frame, [cap], capRadiusM);
  }

  /** Just the sphere (polar anchor) while the terrain loads: never an empty view (§13). */
  setPlaceholder(frame: SceneFrame) {
    this.frame = frame;
    this.applyFrameUniforms();
    this.clearTerrain();
    this.sphereMat.uniforms.clipMode.value = 0;
    this.disposeShadow();
    this.radialSrc = null;
    this.terrainMat.uniforms.useShadow.value = 0;
    this.setOverlay(null, null);
    this.dirty = true;
  }

  private disposeShadow() {
    if (!this.shadow) return;
    this.shadow.rt.dispose();
    for (const t of this.shadow.textures) t.dispose();
    this.shadow.mat.dispose();
    this.shadow = null;
  }

  private setShadowSource(heights: Float32Array) {
    this.disposeShadow();
    const div = TIER_SETTINGS[this.tier].shadowDiv;
    const w = Math.floor(GRID.nx / div);
    const h = Math.floor(GRID.ny / div);
    const dem = new THREE.DataTexture(heights, GRID.nx, GRID.ny, THREE.RedFormat, THREE.FloatType);
    dem.minFilter = THREE.NearestFilter;
    dem.magFilter = THREE.NearestFilter;
    dem.needsUpdate = true;
    const rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: SHADOW_VERT,
      fragmentShader: SHADOW_FRAG,
      uniforms: {
        dem: { value: dem },
        demSize: { value: new THREE.Vector2(GRID.nx, GRID.ny) },
        cellM: { value: GRID.cellM },
        gridOrigin: { value: new THREE.Vector2(GRID.xMinM, GRID.yMaxM) },
        outSize: { value: new THREE.Vector2(w, h) },
        sunMe: { value: new THREE.Vector3(0, 0, -1) },
        rhoSun: { value: 0.27 * DEG },
        R: { value: R_M },
      },
      depthTest: false,
      depthWrite: false,
    });
    // `demSize` is an ivec2 in GLSL: three uploads a Vector2 to it with uniform2i.
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    this.shadow = { kind: 'polar', rt, scene, cam: new THREE.Camera(), mat, textures: [dem] };
    this.terrainMat.uniforms.shadowTex.value = rt.texture;
    this.terrainMat.uniforms.useShadow.value = this.skyIn ? 1 : 0;
  }

  /**
   * Radial cast-shadow pass of the profile scene (§6.3): one texel per (bin, azimuth) of the drawn
   * terrain, the uv of the radial mesh; the azimuth wraps, so there is no seam at north.
   */
  private setRadialShadow(t: RadialTerrain) {
    this.disposeShadow();
    const nb = t.dist.length;
    const floatTex = (data: Float32Array, w: number, h: number) => {
      const tex = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.FloatType);
      tex.minFilter = THREE.NearestFilter;
      tex.magFilter = THREE.NearestFilter;
      tex.needsUpdate = true;
      return tex;
    };
    const prof = floatTex(t.heights, nb, t.nAz);
    const dist = floatTex(Float32Array.from(t.dist), nb, 1);
    const lut = floatTex(binLut(t.dist), BIN_LUT_SIZE, 1);
    const rt = new THREE.WebGLRenderTarget(nb, t.nAz, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    rt.texture.wrapT = THREE.RepeatWrapping;
    const f = this.frame;
    const mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: SHADOW_VERT,
      fragmentShader: RADIAL_SHADOW_FRAG,
      uniforms: {
        prof: { value: prof },
        binDist: { value: dist },
        binLut: { value: lut },
        nAz: { value: t.nAz },
        nb: { value: nb },
        dist0: { value: t.dist[0] },
        distMax: { value: t.dist[nb - 1] },
        centreH: { value: t.centreH },
        siteE: { value: new THREE.Vector3(...f.e) },
        siteN: { value: new THREE.Vector3(...f.n) },
        siteU: { value: new THREE.Vector3(...f.u) },
        sunMe: { value: new THREE.Vector3(0, 0, 1) },
        rhoSun: { value: 0.27 * DEG },
        R: { value: R_M },
      },
      depthTest: false,
      depthWrite: false,
    });
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    this.shadow = { kind: 'radial', rt, scene, cam: new THREE.Camera(), mat, textures: [prof, dist, lut] };
    this.terrainMat.uniforms.shadowTex.value = rt.texture;
    this.terrainMat.uniforms.useShadow.value = this.skyIn ? 1 : 0;
    if (this.skyIn) {
      mat.uniforms.sunMe.value.set(...this.skyIn.sunMe);
      mat.uniforms.rhoSun.value = this.skyIn.sunRadiusDeg * DEG;
    }
    this.shadowDirty = true;
  }

  /**
   * Projected map layer (§9): one band of `layers/<period>.bin.gz` as an R8 texture on the polar
   * grid, coloured with the map's ramp (`lut`: 11 linear RGB triplets); null hides it.
   */
  setOverlay(band: Uint8Array | null, lut: Float32Array | null) {
    const u = this.terrainMat.uniforms;
    this.overlayTex?.dispose();
    this.overlayTex = null;
    if (!band || !lut) {
      u.useOverlay.value = 0;
      u.overlayTex.value = null;
      this.dirty = true;
      return;
    }
    const tex = new THREE.DataTexture(band, GRID.nx, GRID.ny, THREE.RedFormat, THREE.UnsignedByteType);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.unpackAlignment = 1;
    tex.needsUpdate = true;
    this.overlayTex = tex;
    u.overlayTex.value = tex;
    (u.overlayLut.value as THREE.Vector3[]).forEach((v, k) => v.set(lut[3 * k], lut[3 * k + 1], lut[3 * k + 2]));
    u.useOverlay.value = 1;
    this.dirty = true;
  }

  setTier(t: Tier, heights: Float32Array | null) {
    this.tier = t;
    this.terrainMat.uniforms.detail.value = TIER_SETTINGS[t].detail ? 1 : 0;
    if (heights && this.shadow?.kind === 'polar') {
      this.setShadowSource(heights);
      this.shadowDirty = true;
    }
    this.dirty = true;
  }

  /** The frame of the scene on screen. */
  sceneFrame(): SceneFrame {
    return this.frame;
  }

  setGround(g: Ground | null) {
    this.ground = g;
  }

  // ---- Sky and light ----------------------------------------------------------------------

  setSky(s: SkyInput | null) {
    this.skyIn = s;
    const tu = this.terrainMat.uniforms;
    const su = this.sphereMat.uniforms;
    if (!s) {
      const up = rotToScene(this.frame, this.frame.u);
      for (const u of [tu, su]) {
        u.sunDir.value.set(...up);
        u.sunI.value = LOOK.neutralIntensity;
        u.earthI.value = 0;
      }
      tu.useShadow.value = 0;
      this.sun.visible = false;
      this.earth.visible = false;
      this.dirty = true;
      return;
    }
    const sd = rotToScene(this.frame, s.sunMe);
    const ed = rotToScene(this.frame, s.earthMe);
    const earthLit = (1 - (s.sunMe[0] * s.earthMe[0] + s.sunMe[1] * s.earthMe[1] + s.sunMe[2] * s.earthMe[2])) / 2;
    for (const u of [tu, su]) {
      u.sunDir.value.set(...sd);
      u.earthDir.value.set(...ed);
      u.sunI.value = LOOK.sunIntensity * (1 - s.covered);
      u.earthI.value = LOOK.earthshine * LOOK.sunIntensity * earthLit;
    }
    tu.useShadow.value = this.shadow ? 1 : 0;
    // Sun disc and halo.
    const halo = TIER_SETTINGS[this.tier].halo;
    const rho = s.sunRadiusDeg * DEG;
    // Without halo the quad is 4 disc radii: the core glow has faded to ~5 % there (D-154).
    const half = halo ? LOOK.haloRadiusDeg * DEG : rho * 4;
    const um = this.sun.material.uniforms;
    um.halfAngle.value = half;
    um.rho.value = rho;
    um.haloStrength.value = halo ? LOOK.haloStrength : 0;
    um.spikes.value = halo ? LOOK.sunSpikes : 0;
    um.dim.value = 1 - s.covered;
    this.sun.position.copy(v3(sd).multiplyScalar(LOOK.skyRadius));
    this.sun.scale.setScalar(LOOK.skyRadius * Math.tan(half));
    this.sun.lookAt(0, 0, 0);
    this.sun.visible = true;
    // Earth with its phase.
    this.earth.position.copy(v3(ed).multiplyScalar(LOOK.skyRadius));
    this.earth.scale.setScalar(LOOK.skyRadius * Math.tan(s.earthRadiusDeg * DEG));
    this.earth.material.uniforms.sunDir.value.set(...sd);
    this.earth.material.uniforms.toCam.value.set(-ed[0], -ed[1], -ed[2]);
    this.earth.visible = true;
    if (this.shadow) {
      this.shadow.mat.uniforms.sunMe.value.set(...s.sunMe);
      this.shadow.mat.uniforms.rhoSun.value = rho;
      this.shadowDirty = true;
    }
    this.dirty = true;
  }

  // ---- Scenario masts ---------------------------------------------------------------------

  setMasts(list: { base: V3; up: V3 }[]) {
    const pos = new Float32Array(list.length * 6);
    list.forEach((m, i) => {
      pos.set(m.base, 6 * i);
      pos.set([m.base[0] + m.up[0] * LOOK.mastM, m.base[1] + m.up[1] * LOOK.mastM, m.base[2] + m.up[2] * LOOK.mastM], 6 * i + 3);
    });
    this.masts.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.masts.geometry = g;
    this.dirty = true;
  }

  // ---- Camera -----------------------------------------------------------------------------

  basisAt(p: V3): Basis {
    return localBasisAt(this.frame, p);
  }

  private clamp(s: OrbitState): OrbitState {
    const g = this.ground;
    return g ? clampOrbit(s, this.basisAt(s.target), (p) => g.clearance(p)) : s;
  }

  setOrbit(s: OrbitState, jump: boolean) {
    this.flight = null;
    this.goal = this.clamp(s);
    if (jump || !this.cur || this.o.reducedMotion) this.cur = this.goal;
    this.dirty = true;
  }

  getOrbit(): OrbitState | null {
    return this.goal;
  }

  orbitBy(dHeadingDeg: number, dPitchDeg: number) {
    if (this.mode !== 'orbit') {
      this.lookBy(dHeadingDeg, dPitchDeg);
      return;
    }
    if (!this.goal) return;
    this.setOrbit({ ...this.goal, headingDeg: this.goal.headingDeg + dHeadingDeg, pitchDeg: this.goal.pitchDeg + dPitchDeg }, false);
  }

  zoomBy(factor: number) {
    if (this.mode === 'ground') {
      this.lookBy(0, 0, factor);
      return;
    }
    if (this.mode === 'fly') {
      this.flyImpulse(factor < 1 ? 1 : -1, Math.abs(Math.log(factor)));
      return;
    }
    if (!this.goal) return;
    this.setOrbit({ ...this.goal, distM: this.goal.distM * factor }, false);
  }

  /** Moves the target across the terrain by a drag of (dx, dy) pixels. */
  panBy(dx: number, dy: number) {
    if (this.mode !== 'orbit') {
      if (this.mode === 'fly') this.flyImpulse(0, 0, -dy * 0.004);
      return;
    }
    if (!this.goal || !this.ground) return;
    const b = this.basisAt(this.goal.target);
    const h = this.goal.headingDeg * DEG;
    const right: V3 = [Math.cos(h) * b.e[0] - Math.sin(h) * b.n[0], Math.cos(h) * b.e[1] - Math.sin(h) * b.n[1], Math.cos(h) * b.e[2] - Math.sin(h) * b.n[2]];
    const fwd: V3 = [Math.sin(h) * b.e[0] + Math.cos(h) * b.n[0], Math.sin(h) * b.e[1] + Math.cos(h) * b.n[1], Math.sin(h) * b.e[2] + Math.cos(h) * b.n[2]];
    const k = this.goal.distM * 0.0012;
    const t = this.goal.target;
    const moved: V3 = [t[0] - right[0] * dx * k + fwd[0] * dy * k, t[1] - right[1] * dx * k + fwd[1] * dy * k, t[2] - right[2] * dx * k + fwd[2] * dy * k];
    this.setOrbit({ ...this.goal, target: this.ground.surface(moved) }, true);
  }

  private applyCamera() {
    let fov = 50;
    if (this.mode !== 'orbit' && this.look) {
      const b = this.basisAt(this.look.pos);
      const d = lookDir(this.look.yawDeg, this.look.pitchDeg, b);
      this.cam.position.set(...this.look.pos);
      this.cam.up.set(...b.u);
      this.cam.lookAt(this.look.pos[0] + d[0], this.look.pos[1] + d[1], this.look.pos[2] + d[2]);
      fov = this.look.fovDeg;
    } else if (this.cur) {
      const b = this.basisAt(this.cur.target);
      const p = orbitPosition(this.cur, b);
      this.cam.position.set(...p);
      this.cam.up.set(...b.u);
      this.cam.lookAt(v3(this.cur.target));
    } else return;
    if (this.cam.fov !== fov) {
      for (const c of [this.cam, this.skyCam]) {
        c.fov = fov;
        c.updateProjectionMatrix();
      }
    }
    this.cam.updateMatrixWorld();
    this.skyCam.quaternion.copy(this.cam.quaternion);
    this.skyCam.updateMatrixWorld();
  }

  // ---- Camera modes (§7.2–§7.4) -------------------------------------------------------------

  getMode(): CameraMode {
    return this.mode;
  }

  /** Orbit → Fly keeps the current view; Ground needs its eye (`look`). */
  setMode(mode: CameraMode, look?: LookState) {
    this.flight = null;
    if (mode === 'fly' && !look) {
      this.applyCamera();
      const p = this.cam.position;
      if (this.mode === 'orbit' && this.cur) this.look = orbitToLook(this.cur, [p.x, p.y, p.z], 50);
      else if (this.look) this.look = { ...this.look, fovDeg: 50 };
    } else if (look) this.look = look;
    this.mode = mode;
    this.dirty = true;
  }

  getLook(): LookState | null {
    return this.look;
  }

  setLook(l: LookState) {
    this.look = l;
    this.dirty = true;
  }

  lookBy(dYawDeg: number, dPitchDeg: number, fovFactor = 1) {
    if (!this.look) return;
    this.look = turn(this.look, dYawDeg, dPitchDeg, fovFactor);
    this.dirty = true;
  }

  /** One push of the fly camera (wheel, pinch, two-finger drag). */
  flyImpulse(forward: number, amount: number, up = 0) {
    if (this.mode !== 'fly' || !this.look || !this.ground) return;
    const g = this.ground;
    this.look = flyStep(this.look, { forward, right: 0, up: Math.sign(up), fast: false }, Math.min(0.1, amount * 0.4 + Math.abs(up)), {
      clearance: (p) => g.clearance(p),
      basisAt: (p) => this.basisAt(p),
    });
    this.dirty = true;
  }

  /** A smooth flight of the orbit camera (§7.4); a jump with reduced motion. */
  goTo(to: OrbitState) {
    const target = this.clamp(to);
    const wasFly = this.mode === 'fly';
    if (this.o.reducedMotion || !this.cur || this.mode === 'ground') {
      this.flight = null;
      this.goal = target;
      this.cur = target;
      if (wasFly) {
        this.mode = 'orbit';
        this.setMode('fly');
      }
      this.dirty = true;
      return;
    }
    this.flyAfterFlight = wasFly;
    this.mode = 'orbit';
    this.flight = makeFlight(this.frame, this.cur, target, performance.now());
    this.goal = target;
    this.dirty = true;
  }

  isFlying(): boolean {
    return this.flight !== null;
  }

  cameraPosition(): V3 {
    const p = this.cam.position;
    return [p.x, p.y, p.z];
  }

  /** Heading of the view (deg clockwise from local north), and what the scale bar needs. */
  viewInfo(): { headingDeg: number; distM: number; fovDeg: number; heightPx: number } {
    if (this.mode !== 'orbit' && this.look) return { headingDeg: this.look.yawDeg, distM: Number.NaN, fovDeg: this.look.fovDeg, heightPx: this.size.h };
    return { headingDeg: this.cur?.headingDeg ?? 0, distM: this.cur?.distM ?? Number.NaN, fovDeg: this.cam.fov, heightPx: this.size.h };
  }

  /** Ray through a CSS pixel of the view. */
  rayAt(x: number, y: number): { o: V3; d: V3 } {
    const ndc = new THREE.Vector3((x / this.size.w) * 2 - 1, -(y / this.size.h) * 2 + 1, 0.5).unproject(this.cam);
    const o = this.cam.position;
    const d = ndc.sub(o).normalize();
    return { o: [o.x, o.y, o.z], d: [d.x, d.y, d.z] };
  }

  // ---- Lines (§8): fat lines of three/addons, offset to their first point for precision -------

  setLines(group: string, items: LineItem[]) {
    const old = this.lineGroups.get(group);
    if (old) {
      for (const l of old.children as Line2[]) {
        l.geometry.dispose();
        l.material.dispose();
        this.lineMats.delete(l.material);
      }
      this.scene.remove(old);
    }
    const g = new THREE.Group();
    for (const it of items) {
      if (it.points.length < 2) continue;
      const o = it.points[0];
      const flat: number[] = [];
      for (const p of it.points) flat.push(p[0] - o[0], p[1] - o[1], p[2] - o[2]);
      const geo = new LineGeometry();
      geo.setPositions(flat);
      const mat = new LineMaterial({
        color: new THREE.Color(...it.colour),
        linewidth: it.widthPx,
        transparent: it.opacity < 1 || !!it.overlay,
        opacity: it.opacity,
        dashed: !!it.dash,
        dashSize: it.dash?.[0] ?? 1,
        gapSize: it.dash?.[1] ?? 0,
        depthTest: !it.overlay,
        depthWrite: !it.overlay,
      });
      mat.resolution.set(this.size.w, this.size.h);
      this.lineMats.add(mat);
      const line = new Line2(geo, mat);
      line.position.set(...o);
      if (it.dash) line.computeLineDistances();
      line.frustumCulled = false;
      if (it.overlay) line.renderOrder = 10;
      g.add(line);
    }
    this.lineGroups.set(group, g);
    this.scene.add(g);
    this.dirty = true;
  }

  setSize(w: number, h: number, dpr: number) {
    const ratio = Math.min(dpr, TIER_SETTINGS[this.tier].maxPixelRatio);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    for (const c of [this.cam, this.skyCam]) {
      c.aspect = w / Math.max(1, h);
      c.updateProjectionMatrix();
    }
    (this.stars.material as THREE.ShaderMaterial).uniforms.pixelRatio.value = ratio;
    this.size = { w, h };
    for (const m of this.lineMats) m.resolution.set(w, h);
    this.dirty = true;
  }

  /** Screen position (CSS px) of a scene point; null when behind the camera or off screen. */
  project(p: V3, w: number, h: number): { x: number; y: number } | null {
    const v = v3(p).applyMatrix4(this.cam.matrixWorldInverse);
    if (v.z > -1) return null;
    v.applyMatrix4(this.cam.projectionMatrix);
    const x = (v.x * 0.5 + 0.5) * w;
    const y = (-v.y * 0.5 + 0.5) * h;
    if (x < -40 || y < -40 || x > w + 40 || y > h + 40) return null;
    return { x, y };
  }

  invalidate() {
    this.dirty = true;
  }

  // ---- Loop -------------------------------------------------------------------------------

  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    let animating = false;
    const dtS = this.lastLoopMs > 0 ? (now - this.lastLoopMs) / 1000 : 0;
    this.lastLoopMs = now;
    if (this.flight && this.ground) {
      const g = this.ground;
      const { state, done } = flightAt(this.flight, this.frame, now, (p) => g.surface(p));
      this.cur = this.clamp(state);
      if (done) this.goal = this.cur;
      animating = true;
      this.dirty = true;
      if (done) {
        this.flight = null;
        if (this.flyAfterFlight) this.setMode('fly');
        this.flyAfterFlight = false;
      }
    } else if (this.mode === 'fly' && this.look && this.ground) {
      const inp = this.input();
      if (inp.forward || inp.right || inp.up) {
        const g = this.ground;
        this.look = flyStep(this.look, inp, dtS, { clearance: (p) => g.clearance(p), basisAt: (p) => this.basisAt(p) });
        animating = true;
        this.dirty = true;
      }
    } else if (this.cur && this.goal && !orbitsClose(this.cur, this.goal)) {
      // Time-based smoothing (τ = 65 ms): the same feel at 60 fps and on a slow device.
      this.cur = this.clamp(easeOrbit(this.cur, this.goal, 1 - Math.exp(-Math.min(Math.max(dtS, 0.016), 0.1) / 0.065)));
      animating = true;
      this.dirty = true;
    } else if (this.cur !== this.goal) {
      this.cur = this.goal; // the last step lands exactly on the goal
      this.dirty = true;
    }
    const continuous = animating || this.playing;
    if (!this.dirty && !(this.shadowDirty && this.shadow)) {
      this.fps.pause();
      return;
    }
    if (this.shadow && this.shadowDirty && this.skyIn) {
      const every = continuous ? TIER_SETTINGS[this.tier].shadowEveryMs : 0;
      if (now - this.lastShadowMs >= every) {
        this.renderer.setRenderTarget(this.shadow.rt);
        this.renderer.render(this.shadow.scene, this.shadow.cam);
        this.renderer.setRenderTarget(null);
        this.lastShadowMs = now;
        this.shadowDirty = false;
        this.dirty = true;
      }
    }
    if (!this.dirty) return;
    this.applyCamera();
    // Stars dim when the Sun is in the field of view (glare).
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.cam.quaternion);
    const sunIn = this.sun.visible && fwd.angleTo(this.sun.position.clone().normalize()) < (this.cam.fov * DEG) * 0.75;
    (this.stars.material as THREE.ShaderMaterial).uniforms.dim.value = sunIn ? LOOK.starGlareDim : 1;
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.skyScene, this.skyCam);
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.cam);
    this.dirty = false;
    this.frames++;
    this.afterRender?.();
    if (continuous && this.lastFrameMs > 0 && this.fps.frame(now - this.lastFrameMs, now)) {
      const lower = this.tier === 'alto' ? 'medio' : 'bajo';
      if (lower !== this.tier) this.o.onTierDrop(lower);
    }
    this.lastFrameMs = continuous ? now : 0;
  };

  /** Test hook (`?test3d=1`): the GPU lit fraction of shadow texel (i, j), 0…1, or null. */
  readShadow(i: number, j: number): number | null {
    if (!this.shadow || this.shadowDirty) return null;
    const buf = new Uint8Array(4);
    this.renderer.readRenderTargetPixels(this.shadow.rt, i, j, 1, 1, buf);
    return buf[0] / 255;
  }

  shadowSize(): { w: number; h: number; div: number; kind: 'polar' | 'radial' } | null {
    if (!this.shadow) return null;
    return { w: this.shadow.rt.width, h: this.shadow.rt.height, div: TIER_SETTINGS[this.tier].shadowDiv, kind: this.shadow.kind };
  }

  /**
   * Test hook (§12.3, «cursor → shadows»): mean time of `n` shadow passes (ms), each one waited for
   * with a one-pixel read-back; null without a shadow pass or a sky.
   */
  benchShadow(n: number): number | null {
    if (!this.shadow || !this.skyIn) return null;
    const buf = new Uint8Array(4);
    const t0 = performance.now();
    for (let k = 0; k < n; k++) {
      this.renderer.setRenderTarget(this.shadow.rt);
      this.renderer.render(this.shadow.scene, this.shadow.cam);
      this.renderer.setRenderTarget(null);
      this.renderer.readRenderTargetPixels(this.shadow.rt, k % this.shadow.rt.width, 0, 1, 1, buf);
    }
    return (performance.now() - t0) / n;
  }

  /** Source terrain of the radial shadow pass (test hook). */
  radialShadowSource(): RadialTerrain | null {
    return this.radialSrc;
  }

  /** Rough GPU memory of the scene (MB): vertex and index buffers and the data textures (§12.3). */
  gpuMemoryMB(): number {
    let bytes = 0;
    const geo = (g: THREE.BufferGeometry) => {
      for (const a of Object.values(g.attributes)) bytes += (a as THREE.BufferAttribute).array.byteLength;
      if (g.index) bytes += g.index.array.byteLength;
    };
    for (const m of this.terrain.children as THREE.Mesh[]) geo(m.geometry);
    geo(this.sphere.geometry);
    const tex = (t: THREE.Texture | null | undefined) => {
      const img = t?.image as { data?: ArrayBufferView } | undefined;
      return img?.data ? img.data.byteLength : 0;
    };
    if (this.shadow) {
      bytes += this.shadow.rt.width * this.shadow.rt.height * 4;
      for (const t of this.shadow.textures) bytes += tex(t);
    }
    bytes += tex(this.holeTex) + tex(this.overlayTex);
    return bytes / 1e6;
  }

  lastSky(): SkyInput | null {
    return this.skyIn;
  }

  currentFps(): number | null {
    return this.fps.fps();
  }

  cameraState(): string {
    if (this.mode !== 'orbit' && this.look) {
      const l = this.look;
      return `${this.mode}:${l.yawDeg.toFixed(1)},${l.pitchDeg.toFixed(1)},${l.fovDeg.toFixed(0)},${l.pos.map((v) => v.toFixed(0)).join('/')}`;
    }
    const c = this.cur;
    return c ? `${c.headingDeg.toFixed(1)},${c.pitchDeg.toFixed(1)},${Math.round(c.distM)}` : '';
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.clearTerrain();
    this.disposeShadow();
    this.holeTex?.dispose();
    this.overlayTex?.dispose();
    this.sphere.geometry.dispose();
    this.terrainMat.dispose();
    this.sphereMat.dispose();
    this.masts.geometry.dispose();
    for (const k of [...this.lineGroups.keys()]) this.setLines(k, []);
    this.stars.geometry.dispose();
    this.sun.geometry.dispose();
    this.earth.geometry.dispose();
    this.renderer.dispose();
  }
}
