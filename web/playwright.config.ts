// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:4173' },
  webServer: { command: 'npx vite preview --port 4173', port: 4173, reuseExistingServer: true },
});
