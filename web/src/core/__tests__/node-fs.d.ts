// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Minimal typing of node:fs for the tests that read the contract example files and tests/golden
// (Vitest runs in Node); avoids adding @types/node for two functions.
declare module 'node:fs' {
  export function readFileSync(path: URL | string): Uint8Array;
  export function existsSync(path: URL | string): boolean;
}
