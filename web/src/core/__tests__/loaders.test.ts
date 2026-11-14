// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-11: loaders with mocked responses (correct, 404, other major version, wrong size).
import { describe, expect, it } from 'vitest';
import { EPHEMERIS_BYTES, N_AZ, NETWORK_RETRY_DELAY_MS, PROFILE_BYTES } from '../constants';
import { contractMajor, createLoader, DataError, joinUrl } from '../loaders';
import type { HorizonFile, Manifest } from '../types';
import { exampleBytes, exampleJson, fakeFetch, type Reply } from './fixtures';

const manifest = exampleJson<Manifest>('manifest.json');
const sites = exampleJson('sites.json');
const horizonA = exampleJson<HorizonFile>('horizon/demo-a.json');

function setup(routes: Record<string, Reply | Reply[]>) {
  const server = fakeFetch(routes);
  const sleeps: number[] = [];
  const loader = createLoader({
    fetch: server.fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { loader, calls: server.calls, sleeps };
}

async function failure(p: Promise<unknown>): Promise<DataError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(DataError);
    return e as DataError;
  }
  throw new Error('expected a DataError');
}

const exampleRoutes: Record<string, Reply> = {
  'config.json': { json: { data_base_url: 'data', heavy_base_url: 'https://heavy.example/' } },
  'data/manifest.json': { json: manifest },
  'data/sites.json': { json: sites },
  'data/horizon/demo-a.json': { json: horizonA },
};

describe('helpers', () => {
  it('joins base URLs and paths', () => {
    expect(joinUrl('data', 'manifest.json')).toBe('data/manifest.json');
    expect(joinUrl('https://x.pages.dev/', '/map/grid.json')).toBe('https://x.pages.dev/map/grid.json');
  });

  it('reads the major contract version', () => {
    expect(contractMajor('1.0.0')).toBe(1);
    expect(contractMajor('2.3.4')).toBe(2);
    expect(contractMajor('1.0')).toBeNaN();
    expect(contractMajor(undefined)).toBeNaN();
  });
});

describe('correct responses (T-02 example data)', () => {
  it('boots with config, manifest and sites', async () => {
    const { loader, calls } = setup(exampleRoutes);
    const boot = await loader.loadBoot();
    expect(boot.config).toEqual({ data_base_url: 'data', heavy_base_url: 'https://heavy.example/' });
    expect(boot.manifest.ephemeris.synthetic).toBe(true);
    expect(boot.manifest.ephemeris.bytes).toBe(EPHEMERIS_BYTES);
    expect(boot.sites.defaults.demo_pair).toEqual(['demo-a', 'demo-b']);
    expect(boot.sites.sites.map((s) => s.id)).toContain('apollo-11');
    expect([...calls].sort()).toEqual(['config.json', 'data/manifest.json', 'data/sites.json']);
  });

  it('loads a horizon with 720 values per vector', async () => {
    const { loader } = setup(exampleRoutes);
    const h = await loader.loadHorizon('data', 'demo-a');
    expect(h.masks[0].observer_height_m).toBe(2);
    expect(h.masks[0].el_deg).toHaveLength(N_AZ);
  });

  it('caches per URL and reports the status', async () => {
    const { loader, calls } = setup(exampleRoutes);
    expect(loader.status('data/manifest.json').status).toBe('idle');
    const p = loader.loadManifest('data');
    expect(loader.status('data/manifest.json').status).toBe('loading');
    await Promise.all([p, loader.loadManifest('data')]);
    expect(loader.status('data/manifest.json').status).toBe('ready');
    expect(calls).toEqual(['data/manifest.json']);
  });

  it('notifies subscribers of status changes', async () => {
    const { loader } = setup(exampleRoutes);
    let n = 0;
    const off = loader.subscribe(() => n++);
    await loader.loadSites('data');
    off();
    await loader.loadManifest('data');
    expect(n).toBe(2); // loading + ready of sites only
  });

  it('falls back to `data` for both origins when config.json is missing', async () => {
    const { loader } = setup({});
    expect(await loader.loadConfig()).toEqual({ data_base_url: 'data', heavy_base_url: 'data' });
  });

  it('loads a gzip binary and checks its size and header', async () => {
    const url = 'data/profile/demo-a.bin.gz';
    const { loader } = setup({ [url]: { bytes: exampleBytes('profile/demo-a.bin.gz') } });
    const raw = await loader.binary(url, { bytes: PROFILE_BYTES, magic: 'LLSNPRF1', gzip: true });
    expect(raw.byteLength).toBe(PROFILE_BYTES);
  });

  it('loads the ephemeris with the size from the manifest', async () => {
    const { loader } = setup({ 'data/ephemeris.bin': { bytes: new Uint8Array(EPHEMERIS_BYTES) } });
    expect((await loader.loadEphemerisBytes('data', manifest)).byteLength).toBe(EPHEMERIS_BYTES);
  });
});

describe('404', () => {
  it('fails with not_found and does not retry', async () => {
    const { loader, calls, sleeps } = setup({});
    const e = await failure(loader.loadHorizon('data', 'demo-b'));
    expect(e.kind).toBe('not_found');
    expect(calls).toEqual(['data/horizon/demo-b.json']);
    expect(sleeps).toEqual([]);
    expect(loader.status('data/horizon/demo-b.json').status).toBe('error');
  });

  it('does not cache failures: a later call retries', async () => {
    const { loader, calls } = setup({ 'data/manifest.json': [{ status: 404 }, { json: manifest }] });
    await failure(loader.loadManifest('data'));
    expect((await loader.loadManifest('data')).sites).toBe(4);
    expect(calls).toHaveLength(2);
  });
});

describe('network failures', () => {
  it('retries once after 2 s and succeeds', async () => {
    const { loader, calls, sleeps } = setup({ 'data/manifest.json': ['network-error', { json: manifest }] });
    expect((await loader.loadManifest('data')).contract_version).toBe('1.1.0'); // example data, contract 1.1.0 (D-95)
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([NETWORK_RETRY_DELAY_MS]);
  });

  it('gives up after the second failure', async () => {
    const { loader, calls } = setup({ 'data/sites.json': 'network-error' });
    expect((await failure(loader.loadSites('data'))).kind).toBe('network');
    expect(calls).toHaveLength(2);
  });

  it('retries a 5xx once', async () => {
    const { loader, calls } = setup({ 'data/sites.json': { status: 503 } });
    expect((await failure(loader.loadSites('data'))).kind).toBe('http');
    expect(calls).toHaveLength(2);
  });
});

describe('different major version', () => {
  const v2 = (body: unknown) => ({ json: { ...(body as object), contract_version: '2.0.0' } });

  it('rejects the manifest', async () => {
    const { loader } = setup({ 'data/manifest.json': v2(manifest) });
    expect((await failure(loader.loadManifest('data'))).kind).toBe('contract');
  });

  it('rejects sites.json', async () => {
    const { loader } = setup({ 'data/sites.json': v2(sites) });
    expect((await failure(loader.loadSites('data'))).kind).toBe('contract');
  });

  it('rejects a horizon', async () => {
    const { loader } = setup({ 'data/horizon/demo-a.json': v2(horizonA) });
    expect((await failure(loader.loadHorizon('data', 'demo-a'))).kind).toBe('contract');
  });

  it('accepts a newer minor version', async () => {
    const { loader } = setup({ 'data/manifest.json': { json: { ...manifest, contract_version: '1.7.2' } } });
    expect((await loader.loadManifest('data')).contract_version).toBe('1.7.2');
  });
});

describe('wrong size or structure', () => {
  it('rejects a horizon vector of 719 values', async () => {
    const bad = structuredClone(horizonA);
    bad.masks[0].dist_m = bad.masks[0].dist_m.slice(1);
    const { loader } = setup({ 'data/horizon/demo-a.json': { json: bad } });
    const e = await failure(loader.loadHorizon('data', 'demo-a'));
    expect(e.kind).toBe('format');
    expect(e.message).toContain('dist_m has 719 values');
  });

  it('rejects a horizon for another site', async () => {
    const { loader } = setup({ 'data/horizon/demo-b.json': { json: horizonA } });
    expect((await failure(loader.loadHorizon('data', 'demo-b'))).kind).toBe('format');
  });

  it('rejects a manifest with the wrong ephemeris size', async () => {
    const bad = { ...manifest, ephemeris: { ...manifest.ephemeris, bytes: 5_260_000 } };
    const { loader } = setup({ 'data/manifest.json': { json: bad } });
    expect((await failure(loader.loadManifest('data'))).kind).toBe('format');
  });

  it('rejects sites whose demo pair is missing', async () => {
    const bad = { ...sites, defaults: { ...(sites.defaults as object), demo_pair: ['demo-a', 'nowhere'] } };
    const { loader } = setup({ 'data/sites.json': { json: bad } });
    expect((await failure(loader.loadSites('data'))).kind).toBe('format');
  });

  it('rejects a truncated binary', async () => {
    const { loader } = setup({ 'data/ephemeris.bin': { bytes: new Uint8Array(EPHEMERIS_BYTES - 24) } });
    const e = await failure(loader.binary('data/ephemeris.bin', { bytes: EPHEMERIS_BYTES }));
    expect(e.kind).toBe('format');
    expect(e.message).toContain(`expected ${EPHEMERIS_BYTES} B`);
  });

  it('rejects a binary with the wrong header', async () => {
    const bytes = new Uint8Array(PROFILE_BYTES);
    bytes.set(new TextEncoder().encode('LLSNCUB1'));
    const { loader } = setup({ 'data/profile/x.bin.gz': { bytes } });
    const p = loader.binary('data/profile/x.bin.gz', { bytes: PROFILE_BYTES, magic: 'LLSNPRF1', gzip: true });
    expect((await failure(p)).kind).toBe('format');
  });

  it('rejects invalid JSON', async () => {
    const { loader } = setup({ 'data/manifest.json': { bytes: new TextEncoder().encode('{nope') } });
    expect((await failure(loader.loadManifest('data'))).kind).toBe('format');
  });
});
