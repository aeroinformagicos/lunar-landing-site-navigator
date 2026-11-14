// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// End-to-end tests that assert values of the example data (T-82). Since T-39, `web/public/config.json`
// points the heavy origin at the real deployment and `web/public/data/validation_report.json` is the
// real report. Specs that check example values import `test` from here instead of `@playwright/test`:
// every page then reads `config.json` with both origins at `data` (the local example copy, 09 §1) and
// the example report kept in `e2e/fixtures/validation_report.json`.
import { readFileSync } from 'node:fs';
import { test as base } from '@playwright/test';

export { expect } from '@playwright/test';
export type { Page } from '@playwright/test';

const REPORT_PATH = new URL('./fixtures/validation_report.json', import.meta.url);

/** A fresh copy of the example validation report. */
export function exampleReport(): Record<string, unknown> & { headline: { id: string; status: string; note: string; rows: { ok: boolean; observed: string }[] }[] } {
  return JSON.parse(readFileSync(REPORT_PATH, 'utf8'));
}

export const test = base.extend<{ exampleData: void }>({
  exampleData: [
    async ({ page }, use) => {
      await page.route((url) => url.pathname === '/config.json', (route) =>
        route.fulfill({ json: { data_base_url: 'data', heavy_base_url: 'data' } }));
      await page.route('**/validation_report.json', (route) => route.fulfill({ json: exampleReport() }));
      await use();
    },
    { auto: true },
  ],
});
