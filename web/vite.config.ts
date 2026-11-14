// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  // The 3D chunk (three.js, loaded with import(), 16_vista_3d.md §12.3) is ~580 kB before gzip.
  build: { outDir: 'dist', sourcemap: true, chunkSizeWarningLimit: 700 },
  test: {
    environment: 'node',
    // Two groups (D-91): every test in parallel, then the timing budgets (`*.perf.test.ts`) one at a
    // time, so a budget in microseconds never shares the CPU with another test.
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
          exclude: ['src/**/*.perf.test.ts'],
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: { name: 'perf', include: ['src/**/*.perf.test.ts'], fileParallelism: false, sequence: { groupOrder: 1 } },
      },
    ],
  },
});
