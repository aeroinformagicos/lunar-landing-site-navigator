// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-33 end to end (F16, 10_interfaz.md §10; 01_alcance.md F16): `Share` copies a URL that, opened in
// a new browser context, reproduces scenarios, cursor, mode and tab; a tampered link does not break
// the app (what is not valid is ignored and a message says so); a plain URL stays clean.
import { expect, test, type Page } from '@playwright/test';

const PARTIAL = 'Some settings in this link could not be restored.';

function linkOf(json: unknown): string {
  return `/#s=${Buffer.from(JSON.stringify(json), 'utf8').toString('base64url')}`;
}

async function ready(page: Page) {
  await expect(page.getByRole('article', { name: 'Scenario A' })).toBeVisible();
}

test('Share copies a link that a new context opens in the same state', async ({ browser }) => {
  const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  await page.goto('/');
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
  await expect(page.getByText('Day 3, 00:20 · 2027-08-04 00:20 UTC')).toBeVisible();

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
  await expect(fresh.getByText('Day 3, 00:20 · 2027-08-04 00:20 UTC')).toBeVisible();
  await expect(fresh.getByRole('article', { name: 'Scenario A' })).toContainText('Demo A');
  await expect(fresh.getByText(PARTIAL)).toHaveCount(0);
  await other.close();
});

test('the example link of 10 §10 opens on the requested cursor and requirements', async ({ page }) => {
  await page.goto(
    linkOf({
      v: 1, m: 'plan', t: 'replan', c: 1817389200, f: 'sun',
      sc: [{ s: 'demo-a', l: 1817078400, d: 14, h: 2 }, { s: 'blue-ghost-1', l: 1817078400, d: 14, h: 2 }],
      a: 0, rq: { n: 36, su: 1, ea: 0 }, ml: 'both', mp: '2027-08',
    }),
  );
  await ready(page);
  await expect(page.getByText('Day 3, 14:20 · 2027-08-04 14:20 UTC')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Replan' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Longest night allowed (h)')).toHaveValue('36');
  await expect(page.getByLabel('Earth link at landing')).not.toBeChecked();
  await expect(page.getByRole('article', { name: 'Scenario B' })).toContainText('Blue Ghost');
  await expect(page.getByText(PARTIAL)).toHaveCount(0);
});

for (const [name, hash] of [
  ['not base64url', '/#s=%%%not-a-link'],
  ['not JSON', `/#s=${Buffer.from('{"v":1,', 'utf8').toString('base64url')}`],
  ['other version', linkOf({ v: 9, m: 'plan' })],
] as const) {
  test(`a corrupt link (${name}) opens the initial state with the message`, async ({ page }) => {
    await page.goto(hash);
    await ready(page);
    await expect(page.getByText(PARTIAL)).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Explore' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('article', { name: 'Scenario B' })).toContainText('Demo B');
    await expect(page.getByText('Day 0, 00:00 · 2027-08-01 00:00 UTC')).toBeVisible();
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByText(PARTIAL)).toHaveCount(0);
  });
}

test('a tampered link keeps what is valid, drops the rest and says so', async ({ page }) => {
  await page.goto(
    linkOf({
      v: 1, m: 'plan', t: 'timeline', c: 1817078400 + 7200, f: 'moon',
      sc: [{ s: 'atlantis', l: 1817078400, d: 14, h: 2 }, { s: 'demo-b', l: 1817078400, d: 999, h: 2 }],
      a: 1, rq: { n: -5 }, ml: 'both', mp: '2027-08',
    }),
  );
  await ready(page);
  await expect(page.getByText(PARTIAL)).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Plan', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('article', { name: 'Scenario A' })).toContainText('Demo B');
  await expect(page.getByRole('article', { name: 'Scenario B' })).toHaveCount(0);
  await expect(page.getByLabel('Mission', { exact: true })).toHaveValue('14');
  await expect(page.getByText('Day 0, 02:00 · 2027-08-01 02:00 UTC')).toBeVisible();
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
  await page.getByRole('link', { name: 'Lunar Landing Site Navigator' }).click();
  await expect(page.getByRole('tab', { name: 'Panorama' })).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => new URL(page.url()).hash).toBe('');
});
