// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
import { defineConfig } from '@playwright/test';

const baseURL = 'http://localhost:4173';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL,
    // The welcome card (T-53) counts as closed in every test except `ux.spec.ts`, which clears it.
    storageState: { cookies: [], origins: [{ origin: baseURL, localStorage: [{ name: 'llsn.welcome.closed', value: '1' }] }] },
  },
  webServer: { command: 'npx vite preview --port 4173', port: 4173, reuseExistingServer: true },
});
