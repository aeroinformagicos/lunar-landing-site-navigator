// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// The v1 interface is the safety net once the v2 is the default (15_interfaz_v2.md §10, T-63): the
// specs written for it import `test` from here, which opens every app URL with `?ui=v1`.
import { test as base } from '@playwright/test';

export { expect } from '@playwright/test';
export type { APIRequestContext, Page } from '@playwright/test';

/** `/`, `/?fresh`, `/#s=…` → the same URL with `ui=v1` in its query (before the fragment). */
export function withV1(url: string): string {
  if (!url.startsWith('/') || /[?&]ui=/.test(url)) return url;
  const hash = url.indexOf('#');
  const path = hash < 0 ? url : url.slice(0, hash);
  const frag = hash < 0 ? '' : url.slice(hash);
  return `${path}${path.includes('?') ? '&' : '?'}ui=v1${frag}`;
}

export const test = base.extend({
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page);
    page.goto = (url, options) => goto(withV1(url), options);
    await use(page);
  },
});
