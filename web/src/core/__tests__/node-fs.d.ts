// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Minimal typing of node:fs for the tests that read the contract example files (Vitest runs in
// Node); avoids adding @types/node for a single function.
declare module 'node:fs' {
  export function readFileSync(path: URL | string): Uint8Array;
}
