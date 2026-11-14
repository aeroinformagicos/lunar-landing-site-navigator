// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Test helpers: the T-02 example files and a scripted fetch.
import { readFileSync } from 'node:fs';

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
