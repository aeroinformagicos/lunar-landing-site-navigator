// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Data loaders (02_arquitectura.md §8, 09_contrato_datos.md §1–§5): in-memory cache per URL, a
// load status per resource, one automatic retry after 2 s on network failures (10_interfaz.md §9),
// and contract checks on load (major version, vector lengths, exact sizes).
// Pure TypeScript: no React, no DOM beyond fetch.
import {
  CONTRACT_MAJOR,
  DEFAULT_DATA_BASE_URL,
  DEFAULT_HEAVY_BASE_URL,
  EPHEMERIS_BYTES,
  N_AZ,
  NETWORK_RETRY_DELAY_MS,
  PROFILE_BYTES,
} from './constants';
import { lawNSamples, type LawName } from './law';
import { maybeGunzip } from './gz';
import type { AppConfig, BootData, HorizonFile, Manifest, Resource, SitesFile } from './types';

/**
 * Why a load failed. `network` and `http` (5xx) are retried once; `not_found`, `contract`
 * (unsupported major version) and `format` (wrong size, header or structure) are not.
 */
export type DataErrorKind = 'network' | 'not_found' | 'http' | 'contract' | 'format';

export class DataError extends Error {
  readonly kind: DataErrorKind;
  readonly url: string;

  constructor(kind: DataErrorKind, url: string, message: string) {
    super(`${message} (${url})`);
    this.name = 'DataError';
    this.kind = kind;
    this.url = url;
  }
}

export interface LoaderOptions {
  fetch?: typeof fetch;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface BinaryCheck {
  /** Exact size after decompression. */
  bytes: number;
  /** ASCII magic at offset 0 (`LLSNPRF1`, `LLSNCUB1`…), if the format has one. */
  magic?: string;
  /** The file is `.gz`: decompress it (or accept it already decompressed by the host). */
  gzip?: boolean;
}

type Listener = () => void;

/** Joins a base URL (`data`, `https://x.pages.dev/`) and a contract path. */
export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/** Major version of `1.2.3`, or NaN. */
export function contractMajor(version: unknown): number {
  if (typeof version !== 'string') return Number.NaN;
  const m = /^(\d+)\.\d+\.\d+$/.exec(version);
  return m ? Number(m[1]) : Number.NaN;
}

function checkVersion(url: string, json: unknown): void {
  const version = (json as { contract_version?: unknown } | null)?.contract_version;
  if (contractMajor(version) !== CONTRACT_MAJOR) {
    throw new DataError('contract', url, `Unsupported contract version ${String(version)}`);
  }
}

function fail(url: string, message: string): never {
  throw new DataError('format', url, message);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function validateManifest(url: string, json: unknown): Manifest {
  checkVersion(url, json);
  if (!isObject(json) || !isObject(json.ephemeris)) fail(url, 'Malformed manifest');
  const m = json as unknown as Manifest;
  if (m.ephemeris.bytes !== EPHEMERIS_BYTES) {
    fail(url, `Ephemeris size ${m.ephemeris.bytes} B, expected ${EPHEMERIS_BYTES} B`);
  }
  if (typeof m.ephemeris.synthetic !== 'boolean') fail(url, 'Missing ephemeris.synthetic');
  return m;
}

export function validateSites(url: string, json: unknown): SitesFile {
  checkVersion(url, json);
  if (!isObject(json) || !isObject(json.defaults) || !Array.isArray(json.sites)) {
    fail(url, 'Malformed sites file');
  }
  const s = json as unknown as SitesFile;
  if (s.sites.length === 0) fail(url, 'No sites');
  const ids = new Set(s.sites.map((site) => site.id));
  if (ids.size !== s.sites.length) fail(url, 'Duplicate site id');
  for (const id of s.defaults.demo_pair ?? []) {
    if (!ids.has(id)) fail(url, `Demo site ${id} not in sites`);
  }
  if (Number.isNaN(Date.parse(s.defaults.demo_landing_utc))) fail(url, 'Invalid demo_landing_utc');
  return s;
}

const MASK_VECTORS = ['el_deg', 'dist_m', 'blk_lat_deg', 'blk_lon_deg', 'blk_height_m'] as const;

export function validateHorizon(url: string, json: unknown, siteId: string): HorizonFile {
  checkVersion(url, json);
  if (!isObject(json) || !Array.isArray(json.masks)) fail(url, 'Malformed horizon file');
  const h = json as unknown as HorizonFile;
  if (h.site_id !== siteId) fail(url, `Horizon is for ${h.site_id}, expected ${siteId}`);
  if (h.n_az !== N_AZ) fail(url, `n_az ${h.n_az}, expected ${N_AZ}`);
  if (h.masks.length < 1 || h.masks.length > 2) fail(url, `${h.masks.length} masks`);
  if (h.masks[0].observer_height_m !== 2) fail(url, 'masks[0] is not the 2 m mask');
  for (const mask of h.masks) {
    for (const key of MASK_VECTORS) {
      const v = mask[key];
      if (!Array.isArray(v) || v.length !== N_AZ) {
        fail(url, `${key} has ${Array.isArray(v) ? v.length : 0} values, expected ${N_AZ}`);
      }
    }
  }
  return h;
}

export function validateConfig(json: unknown): AppConfig {
  const c = isObject(json) ? json : {};
  const str = (v: unknown, d: string) => (typeof v === 'string' && v.length > 0 ? v : d);
  return {
    data_base_url: str(c.data_base_url, DEFAULT_DATA_BASE_URL),
    heavy_base_url: str(c.heavy_base_url, DEFAULT_HEAVY_BASE_URL),
  };
}

export function checkBinary(url: string, bytes: Uint8Array, check: BinaryCheck): Uint8Array {
  if (bytes.byteLength !== check.bytes) {
    fail(url, `Size ${bytes.byteLength} B, expected ${check.bytes} B`);
  }
  if (check.magic) {
    const head = String.fromCharCode(...bytes.subarray(0, check.magic.length));
    if (head !== check.magic) fail(url, `Header ${JSON.stringify(head)}, expected ${check.magic}`);
  }
  return bytes;
}

/** Terrain profile of a site (09_contrato_datos.md §6): heights per azimuth (720) and bin (512). */
export interface Profile {
  law: LawName;
  nSamples: number;
  nBins: number;
  siteHeightM: number;
  observerHeightM: number;
  /** int16[720][512], metres; PROFILE_NODATA = no data. */
  heightM: Int16Array;
}

export const PROFILE_MAGIC = 'LLSNPRF1';
export const PROFILE_NODATA = -32768;
const PROFILE_HEADER_BYTES = 32;

/** Decodes a decompressed profile (09 §6), checking every header field. */
export function decodeProfile(url: string, bytes: Uint8Array): Profile {
  checkBinary(url, bytes, { bytes: PROFILE_BYTES, magic: PROFILE_MAGIC });
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (o: number) => dv.getUint16(o, true);
  if (u16(8) !== CONTRACT_MAJOR) throw new DataError('contract', url, `Profile contract version ${u16(8)}`);
  const nAz = u16(12);
  const nBins = u16(14);
  const lawId = u16(16);
  const nSamples = u16(18);
  const law: LawName | null = lawId === 1 ? 'full' : lawId === 2 ? 'fast' : null;
  if (nAz !== N_AZ || nBins !== 512) fail(url, `Profile of ${nAz} × ${nBins}, expected ${N_AZ} × 512`);
  if (!law) fail(url, `Unknown law_id ${lawId}`);
  if (nSamples !== lawNSamples(law)) fail(url, `n_samples ${nSamples} does not match law ${law}`);
  const aligned = bytes.byteOffset % 2 === 0 ? bytes : bytes.slice();
  return {
    law,
    nSamples,
    nBins,
    siteHeightM: dv.getFloat32(20, true),
    observerHeightM: dv.getFloat32(24, true),
    heightM: new Int16Array(aligned.buffer, aligned.byteOffset + PROFILE_HEADER_BYTES, N_AZ * nBins),
  };
}

export function createLoader(options: LoaderOptions = {}) {
  const doFetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const retryDelayMs = options.retryDelayMs ?? NETWORK_RETRY_DELAY_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const cache = new Map<string, Promise<unknown>>();
  const states = new Map<string, Resource<unknown>>();
  const listeners = new Set<Listener>();

  function setState(key: string, state: Resource<unknown>) {
    states.set(key, state);
    for (const l of listeners) l();
  }

  async function fetchOnce(url: string): Promise<Response> {
    let res: Response;
    try {
      res = await doFetch(url);
    } catch (e) {
      throw new DataError('network', url, `Network error: ${(e as Error).message}`);
    }
    if (res.status === 404) throw new DataError('not_found', url, 'Not found');
    if (!res.ok) throw new DataError('http', url, `HTTP ${res.status}`);
    return res;
  }

  async function fetchWithRetry(url: string): Promise<Response> {
    try {
      return await fetchOnce(url);
    } catch (e) {
      if (e instanceof DataError && (e.kind === 'network' || e.kind === 'http')) {
        await sleep(retryDelayMs);
        return fetchOnce(url);
      }
      throw e;
    }
  }

  /** Runs `load` once per key; failures are not cached, so a later call retries. */
  function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit) return hit as Promise<T>;
    setState(key, { status: 'loading' });
    const p = load().then(
      (data) => {
        setState(key, { status: 'ready', data });
        return data;
      },
      (error: Error) => {
        cache.delete(key);
        setState(key, { status: 'error', error });
        throw error;
      },
    );
    cache.set(key, p);
    return p;
  }

  async function readJson(url: string): Promise<unknown> {
    const res = await fetchWithRetry(url);
    try {
      return await res.json();
    } catch {
      throw new DataError('format', url, 'Invalid JSON');
    }
  }

  function json<T>(url: string, validate: (url: string, json: unknown) => T): Promise<T> {
    return cached(url, async () => validate(url, await readJson(url)));
  }

  function binary(url: string, check: BinaryCheck): Promise<Uint8Array> {
    return cached(url, async () => {
      const raw = new Uint8Array(await (await fetchWithRetry(url)).arrayBuffer());
      let bytes: Uint8Array = raw;
      if (check.gzip) {
        try {
          bytes = await maybeGunzip(raw);
        } catch {
          fail(url, 'Corrupt gzip stream');
        }
      }
      return checkBinary(url, bytes, check);
    });
  }

  /** `config.json` at the web root; if it is missing, both origins default to `data` (09 §1). */
  function loadConfig(url = 'config.json'): Promise<AppConfig> {
    return cached(url, async () => {
      try {
        return validateConfig(await readJson(url));
      } catch (e) {
        if (e instanceof DataError && e.kind === 'not_found') return validateConfig({});
        throw e;
      }
    });
  }

  const loadManifest = (base: string) => json(joinUrl(base, 'manifest.json'), validateManifest);
  const loadSites = (base: string) => json(joinUrl(base, 'sites.json'), validateSites);
  const loadHorizon = (base: string, siteId: string) =>
    json(joinUrl(base, `horizon/${siteId}.json`), (url, j) => validateHorizon(url, j, siteId));
  /** `profile/<site>.bin.gz` (or the `file` named by the horizon file), decompressed and decoded. */
  const loadProfile = (base: string, file: string) => {
    const url = joinUrl(base, file);
    return cached(`profile:${url}`, async () =>
      decodeProfile(url, await binary(url, { bytes: PROFILE_BYTES, magic: PROFILE_MAGIC, gzip: true })),
    );
  };
  const loadEphemerisBytes = (base: string, manifest: Manifest) =>
    binary(joinUrl(base, manifest.ephemeris.file), { bytes: manifest.ephemeris.bytes });

  /** Config, then manifest and sites in parallel: everything the first screen needs. */
  async function loadBoot(configUrl?: string): Promise<BootData> {
    const config = await loadConfig(configUrl);
    const [manifest, sites] = await Promise.all([
      loadManifest(config.data_base_url),
      loadSites(config.data_base_url),
    ]);
    return { config, manifest, sites };
  }

  return {
    loadConfig,
    loadManifest,
    loadSites,
    loadHorizon,
    loadEphemerisBytes,
    loadProfile,
    loadBoot,
    /** Generic loaders for later tasks (profile, layers, cube…), same cache and checks. */
    json,
    binary,
    status(url: string): Resource<unknown> {
      return states.get(url) ?? { status: 'idle' };
    },
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    clear() {
      cache.clear();
      states.clear();
    },
  };
}

export type Loader = ReturnType<typeof createLoader>;

/** The app-wide loader. Tests create their own with a mocked fetch. */
export const loader: Loader = createLoader();
