// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-90: the aerospace engineers' proposals done overnight (docs/handoff/T-90.md), in the v2 shell.
import { expect, test, type Page } from '@playwright/test';

async function openV2(page: Page, query = '?ui=v2&vm=2d') {
  await page.goto('/' + query);
  await expect(page.locator('.v2')).toBeVisible({ timeout: 20_000 });
}

test('(3) Now at site says what the elevations and the margin are measured from', async ({ page }) => {
  await openV2(page);
  const now = page.getByRole('region', { name: 'Now at site A' });
  await expect(now.getByText('Elevation: angle above the flat horizon of a smooth Moon. Margin: angle above the real horizon, with the terrain.')).toBeVisible({ timeout: 20_000 });
  await expect(now.locator('.v2-dl__sub')).toHaveText(/^real horizon margin [+−-]\d+\.\d\d°$/);
});

test('(7) Link dates explains that it moves every scenario to the same date', async ({ page }) => {
  await openV2(page);
  await page.getByRole('button', { name: /^Open Setup · / }).click();
  const box = page.getByRole('checkbox', { name: 'Link dates' });
  await expect(box).toBeChecked();
  await expect(box).toHaveAccessibleDescription(/applies to every scenario \(A, B…\)/);
  await box.uncheck();
  await expect(box).toHaveAccessibleDescription(/applies only to the active scenario/);
  await expect(page.locator('#link-dates-help')).toBeVisible();
});
