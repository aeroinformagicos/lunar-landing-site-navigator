// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Messages between the main thread and the optimal-site worker (08_mapa_polar.md §10.2).
import type { DateHit } from '../core/optimal';

export interface OptimalRequest {
  type: 'run';
  t0Unix: number;
  /** 90 (08 §10.2). */
  maxDays: number;
  regionIndex: number | null;
  source: 'regions' | 'overview';
  heavyBaseUrl: string;
  dataBaseUrl: string;
}

export type OptimalMessage =
  | { type: 'progress'; done: number; total: number }
  | { type: 'result'; top: DateHit[]; evaluated: number; maxHours: number; elapsedMs: number }
  | { type: 'error'; message: string };
