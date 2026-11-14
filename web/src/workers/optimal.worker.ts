// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Web Worker of F32 «longest continuous Sun + Earth from a date» (08_mapa_polar.md §10.2): loads the
// compact masks and the ephemeris table, runs `longestBothFrom` and reports progress every 256 points.
// The main thread cancels it by terminating the worker. URLs arrive absolute (the worker resolves
// relative paths against its own script).
import { loadEphemeris } from '../core/ephemeris';
import { maybeGunzip } from '../core/gz';
import { createLoader, joinUrl } from '../core/loaders';
import { decodeCompact, longestBothFrom } from '../core/optimal';
import type { OptimalMessage, OptimalRequest } from './protocol';

const post = (m: OptimalMessage) => (self as unknown as Worker).postMessage(m);

/** The compact file's size depends on its number of points: `decodeCompact` checks it. */
async function fetchCompact(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Compact masks not available (HTTP ${res.status})`);
  return maybeGunzip(new Uint8Array(await res.arrayBuffer()));
}

self.onmessage = async (e: MessageEvent<OptimalRequest>) => {
  const req = e.data;
  if (req.type !== 'run') return;
  const started = performance.now();
  try {
    const compact = decodeCompact(await fetchCompact(joinUrl(req.heavyBaseUrl, `compact/${req.source}.bin.gz`)));
    const table = await loadEphemeris(req.dataBaseUrl, createLoader());
    const r = longestBothFrom(compact, table, req.t0Unix, req.maxDays, req.regionIndex, (done, total) =>
      post({ type: 'progress', done, total }),
    );
    post({ type: 'result', top: r.top, evaluated: r.evaluated, maxHours: r.maxHours, elapsedMs: performance.now() - started });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
