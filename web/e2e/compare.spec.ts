// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-19 end to end (F8, 10_interfaz.md §5): the comparison table with 2, 3 and 4 scenarios, the best
// figure marked with ▲, `Close comparison` back to the previous tab, the one-scenario message, and
// add / duplicate / remove still working with never more than 4.
import { expect, test, type Page } from '@playwright/test';

const table = (page: Page) => page.locator('.compare__table');

async function addSite(page: Page, name: RegExp) {
  await page.getByRole('button', { name: 'Add scenario' }).click();
  await page.getByRole('dialog').getByRole('button', { name }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('article', { name: 'Scenario A' })).toBeVisible();
});

test('2, 3 and 4 scenarios: one column each, same rows, best figure marked', async ({ page }) => {
  await page.getByRole('tab', { name: 'Timeline' }).click();
  await page.getByRole('button', { name: 'Compare' }).click();
  await expect(table(page)).toBeVisible({ timeout: 20_000 });
  const rows = ['Site', 'Landing (UTC)', 'Status', 'Sunlight', 'Earth contact', 'Sun + Earth', 'Longest night', 'Sun elevation now', 'Solar disc visible now', 'Next sunset / sunrise', 'Next Earthset / Earthrise', 'Terrain'];
  for (const r of rows) await expect(table(page).getByRole('rowheader', { name: r, exact: true })).toBeVisible();
  for (const [n, add] of [
    [2, null],
    [3, /Blue Ghost Mission 1/],
    [4, /Apollo 11/],
  ] as const) {
    if (add) await addSite(page, add);
    await expect(table(page).locator('thead th')).toHaveCount(n + 1, { timeout: 20_000 });
    await expect(table(page).getByRole('row', { name: /^Sunlight/ }).locator('td')).toHaveCount(n);
    await expect(table(page).locator('.compare__best').first()).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Add scenario' })).toBeDisabled();
  await expect(page.getByRole('article', { name: 'Scenario D' }).getByRole('button', { name: 'Duplicate' })).toBeDisabled();
  await expect(page.locator('.compare__mini')).toHaveCount(4);
  // Close comparison returns to the previous tab.
  await page.getByRole('button', { name: 'Close comparison' }).click();
  await expect(table(page)).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true');
});

test('removing down to one scenario shows the message; duplicate brings the table back', async ({ page }) => {
  await page.getByRole('button', { name: 'Compare' }).click();
  await expect(table(page)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('article', { name: 'Scenario B' }).getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Add a second scenario to compare.')).toBeVisible();
  await page.getByRole('article', { name: 'Scenario A' }).getByRole('button', { name: 'Duplicate' }).click();
  await expect(table(page).locator('thead th')).toHaveCount(3, { timeout: 20_000 });
});
