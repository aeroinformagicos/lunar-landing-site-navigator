// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// End-to-end tests that assert values of the example data (T-82). Since T-39, `web/public/config.json`
// points the heavy origin at the real deployment and `web/public/data/validation_report.json` is the
// real report. Specs that check example values import `test` (or `v1Test`, the `?ui=v1` wrapper of
// `e2e/v1.ts`, T-63) from here instead of `@playwright/test`: every page then reads `config.json` with
// both origins at `data` (the local example copy, 09 §1) and the example report kept in
// `e2e/fixtures/validation_report.json`.
import { readFileSync } from 'node:fs';
import { test as base } from '@playwright/test';
import { test as v1Base } from './v1';

export { expect } from '@playwright/test';
export type { Page } from '@playwright/test';

const REPORT_PATH = new URL('./fixtures/validation_report.json', import.meta.url);

/** A fresh copy of the example validation report. */
export function exampleReport(): Record<string, unknown> & { headline: { id: string; status: string; note: string; rows: { ok: boolean; observed: string }[] }[] } {
  return JSON.parse(readFileSync(REPORT_PATH, 'utf8'));
}

/** Adds the automatic `exampleData` fixture to a Playwright `test`. */
function withExampleData<T extends typeof base>(t: T) {
  return t.extend<{ exampleData: void }>({
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
}

/** Example data, default interface. */
export const test = withExampleData(base);
/** Example data, v1 interface (`?ui=v1`). */
export const v1Test = withExampleData(v1Base);
