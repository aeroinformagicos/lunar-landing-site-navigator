// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Test helpers: the T-02 example files and a scripted fetch.
import { existsSync, readFileSync } from 'node:fs';
import { buildTable, type EphemerisMeta, type EphemerisTable } from '../ephemeris';

const EXAMPLES = new URL('../../../../contract/examples/data/', import.meta.url);

export function exampleBytes(path: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(path, EXAMPLES)));
}

export function exampleJson<T = Record<string, unknown>>(path: string): T {
  return JSON.parse(new TextDecoder().decode(exampleBytes(path))) as T;
}

/** A reply of the fake server: a body (JSON value or bytes) with a status, or a network failure. */
export type Reply = { status?: number; json?: unknown; bytes?: Uint8Array } | 'network-error';

/** fetch that answers each URL from `routes` (a list is consumed in order); unknown URLs are 404. */
export function fakeFetch(routes: Record<string, Reply | Reply[]>) {
  const calls: string[] = [];
  const queues = new Map(Object.entries(routes).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]));
  const fn = async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    calls.push(url);
    const queue = queues.get(url);
    const reply = queue && queue.length > 1 ? queue.shift()! : queue?.[0];
    if (reply === undefined) return new Response('Not found', { status: 404 });
    if (reply === 'network-error') throw new TypeError('Failed to fetch');
    const body = reply.bytes ? reply.bytes.slice() : JSON.stringify(reply.json);
    return new Response(body, { status: reply.status ?? 200 });
  };
  return { fetch: fn as typeof fetch, calls };
}

/** The T-02 synthetic ephemeris table (09 §13, D-56). */
export function exampleTable(): EphemerisTable {
  return buildTable(exampleJson<EphemerisMeta>('ephemeris.meta.json'), exampleBytes('ephemeris.bin'));
}

const ROOT = new URL('../../../../', import.meta.url);

/** A file of the repository (tests/golden/…, web/public/data/…), or null if it does not exist. */
export function repoFile(path: string): Uint8Array | null {
  const url = new URL(path, ROOT);
  return existsSync(url) ? new Uint8Array(readFileSync(url)) : null;
}

/** The real table published by T-06 in web/public/data, or null while it is synthetic or absent. */
export function realTable(): EphemerisTable | null {
  const metaBytes = repoFile('web/public/data/ephemeris.meta.json');
  if (!metaBytes) return null;
  const meta = JSON.parse(new TextDecoder().decode(metaBytes)) as EphemerisMeta;
  if (meta.synthetic !== false) return null;
  return buildTable(meta, repoFile('web/public/data/ephemeris.bin')!);
}

/**
 * Best of `rounds` timings of `fn` (milliseconds). Budgets (07 §11) are checked on the best round:
 * Vitest runs test files in parallel, and a round that shares the CPU measures the machine, not the code.
 */
export function bestTimeMs(fn: () => void, rounds = 5): number {
  let best = Infinity;
  for (let r = 0; r < rounds; r++) {
    const start = performance.now();
    fn();
    best = Math.min(best, performance.now() - start);
  }
  return best;
}
