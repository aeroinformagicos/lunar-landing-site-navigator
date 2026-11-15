// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-33 end to end (F16, 10_interfaz.md §10; 01_alcance.md F16): `Share` copies a URL that, opened in
// a new browser context, reproduces scenarios, cursor, mode and tab; a tampered link does not break
// the app (what is not valid is ignored and a message says so); a plain URL stays clean.
// Site names and defaults come from the published `sites.json`, so the test runs on the example data
// and on the real batch alike.
import { expect, test, type APIRequestContext, type Page } from './v1';
import { withV1 } from './v1';

const PARTIAL = 'Some settings in this link could not be restored.';
const DAY = 86_400;

interface Demo {
  pair: [{ id: string; name: string }, { id: string; name: string }];
  landing: number;
  days: number;
}

async function demoOf(request: APIRequestContext): Promise<Demo> {
  const file = await (await request.get('/data/sites.json')).json();
  const site = (id: string) => ({ id, name: file.sites.find((s: { id: string }) => s.id === id).short_name as string });
  return {
    pair: [site(file.defaults.demo_pair[0]), site(file.defaults.demo_pair[1])],
    landing: Date.parse(file.defaults.demo_landing_utc) / 1000,
    days: file.defaults.demo_mission_days,
  };
}

/** Cursor readout of 10 §4: `Day 3, 14:20 · 2027-08-04 14:20 UTC`. */
function cursorText(landing: number, offset: number): string {
  const hhmm = (s: number) => `${String(Math.floor((s % DAY) / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
  const iso = new Date((landing + offset) * 1000).toISOString();
  return `Day ${Math.floor(offset / DAY)}, ${hhmm(offset)} · ${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function linkOf(json: unknown): string {
  return `/#s=${Buffer.from(JSON.stringify(json), 'utf8').toString('base64url')}`;
}

async function ready(page: Page) {
  await expect(page.getByRole('article', { name: 'Scenario A' })).toBeVisible();
}

test('Share copies a link that a new context opens in the same state', async ({ browser, request }) => {
  const demo = await demoOf(request);
  const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage(); // its own context: not wrapped by the v1 `test`, so the URL says it
  await page.goto(withV1('/'));
  await ready(page);
  expect(new URL(page.url()).hash).toBe(''); // the initial state keeps a clean URL

  await page.getByRole('tab', { name: 'Plan', exact: true }).click();
  await page.getByRole('tab', { name: 'Timeline' }).click();
  await page.getByLabel('Mission', { exact: true }).fill('7');
  await page.getByRole('article', { name: 'Scenario B' }).locator('.scenario-card__select').click();
  await expect(page.getByRole('article', { name: 'Scenario B' })).toHaveAttribute('aria-current', 'true');
  const slider = page.getByLabel('Time within mission');
  await slider.focus();
  for (const key of ['PageUp', 'PageUp', 'PageUp', 'ArrowRight', 'ArrowRight']) await page.keyboard.press(key);
  const cursor = cursorText(demo.landing, 3 * DAY + 1200);
  await expect(page.getByText(cursor)).toBeVisible();

  await page.getByRole('button', { name: 'Share' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Link copied' })).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toBe(page.url());
  expect(new URL(link).hash).toMatch(/^#s=[A-Za-z0-9_-]+$/);
  await ctx.close();

  // A fresh context: no storage, no history.
  const other = await browser.newContext();
  const fresh = await other.newPage();
  await fresh.goto(link);
  await ready(fresh);
  await expect(fresh.getByRole('tab', { name: 'Plan', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(fresh.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true');
  await expect(fresh.getByLabel('Mission', { exact: true })).toHaveValue('7');
  await expect(fresh.getByRole('article', { name: 'Scenario B' })).toHaveAttribute('aria-current', 'true');
  await expect(fresh.getByText(cursor)).toBeVisible();
  await expect(fresh.getByRole('article', { name: 'Scenario A' })).toContainText(demo.pair[0].name);
  await expect(fresh.getByRole('article', { name: 'Scenario B' })).toContainText(demo.pair[1].name);
  await expect(fresh.getByText(PARTIAL)).toHaveCount(0);
  await other.close();
});

test('a link in the format of 10 §10 opens on the requested cursor and requirements', async ({ page, request }) => {
  const demo = await demoOf(request);
  const l = demo.landing;
  await page.goto(
    linkOf({
      v: 1, m: 'plan', t: 'replan', c: l + 3 * DAY + 14 * 3600 + 1200, f: 'sun',
      sc: [{ s: demo.pair[1].id, l, d: 14, h: 2 }, { s: demo.pair[0].id, l, d: 14, h: 2 }],
      a: 0, rq: { n: 36, su: 1, ea: 0 }, ml: 'both', mp: 'mean186',
    }),
  );
  await ready(page);
  await expect(page.getByText(cursorText(l, 3 * DAY + 14 * 3600 + 1200))).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Replan' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Longest night allowed (h)')).toHaveValue('36');
  await expect(page.getByLabel('Earth contact at landing')).not.toBeChecked();
  await expect(page.getByRole('article', { name: 'Scenario A' })).toContainText(demo.pair[1].name);
  await expect(page.getByRole('article', { name: 'Scenario B' })).toContainText(demo.pair[0].name);
  await expect(page.getByText(PARTIAL)).toHaveCount(0);
});

for (const [name, hash] of [
  ['not base64url', '/#s=%%%not-a-link'],
  ['not JSON', `/#s=${Buffer.from('{"v":1,', 'utf8').toString('base64url')}`],
  ['other version', linkOf({ v: 9, m: 'plan' })],
] as const) {
  test(`a corrupt link (${name}) opens the initial state with the message`, async ({ page, request }) => {
    const demo = await demoOf(request);
    await page.goto(hash);
    await ready(page);
    await expect(page.getByText(PARTIAL)).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Explore' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('article', { name: 'Scenario A' })).toContainText(demo.pair[0].name);
    await expect(page.getByRole('article', { name: 'Scenario B' })).toContainText(demo.pair[1].name);
    await expect(page.getByText(cursorText(demo.landing, 0))).toBeVisible();
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByText(PARTIAL)).toHaveCount(0);
  });
}

test('a tampered link keeps what is valid, drops the rest and says so', async ({ page, request }) => {
  const demo = await demoOf(request);
  const l = demo.landing;
  await page.goto(
    linkOf({
      v: 1, m: 'plan', t: 'timeline', c: l + 7200, f: 'moon',
      sc: [{ s: 'atlantis', l, d: 14, h: 2 }, { s: demo.pair[1].id, l, d: 999, h: 2 }],
      a: 1, rq: { n: -5 }, ml: 'both', mp: '2027-08',
    }),
  );
  await ready(page);
  await expect(page.getByText(PARTIAL)).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Plan', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('article', { name: 'Scenario A' })).toContainText(demo.pair[1].name);
  await expect(page.getByRole('article', { name: 'Scenario B' })).toHaveCount(0);
  await expect(page.getByLabel('Mission', { exact: true })).toHaveValue(String(demo.days));
  await expect(page.getByText(cursorText(l, 7200))).toBeVisible();
  // No technical text leaks into the page (14_ux_malaga.md §7, §9).
  await expect(page.locator('body')).not.toContainText(/undefined|NaN|null|\[object Object\]/);
});

test('the URL follows the state and the title link brings back the clean URL', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await page.getByRole('tab', { name: 'Timeline' }).click();
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#s=/);
  // Validation and back keep the state.
  await page.getByRole('link', { name: 'Validation' }).click();
  await expect(page).toHaveURL(/#\/validation$/);
  await page.goBack();
  await ready(page);
  await expect(page.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('link', { name: 'Lunar Sightline' }).click();
  await expect(page.getByRole('tab', { name: 'Panorama' })).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => new URL(page.url()).hash).toBe('');
});
