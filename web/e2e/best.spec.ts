// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-35 end to end (F32, 10_interfaz.md §6.4): «Most Sun + Earth in a period» lists 10 points and can
// add one as a scenario; «Longest continuous Sun + Earth from a date» runs in the worker, can be
// cancelled, and the interface keeps responding meanwhile.
import { expect, test, type Page } from './v1';

async function openBest(page: Page) {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Map' }).click();
  await expect(page.locator('.map__canvas')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Find the best site' }).click();
}

test('period mode: 10 points, a row centres the map, Add as scenario', async ({ page }) => {
  await openBest(page);
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  const rows = page.getByTestId('period-hits').locator('li');
  await expect(rows).toHaveCount(10);
  await expect(rows.first()).toContainText(/^1 · \d+\.\d\d° S, \d+\.\d\d° E · Both \d+ % · Sun \d+ % · Earth \d+ %/);
  await expect(page.locator('.map__canvas')).toHaveAttribute('data-zoom', '4');
  await rows.first().getByRole('button', { name: 'Add as scenario' }).click();
  await expect(page.getByRole('article', { name: 'Scenario C' })).toContainText('Mesh point');
  await page.getByLabel('Region').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await expect(rows.first()).toBeVisible();
});

test('date mode: the worker returns the best points', async ({ page }) => {
  await openBest(page);
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByTestId('best-result').or(page.getByText('No point in the selected area has both sunlight and Earth contact at that time.'))).toBeVisible({ timeout: 20_000 });
});

test('Cancel stops the search, and the interface responds while it runs', async ({ page }) => {
  await page.route('**/compact/regions.bin.gz', async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    await route.continue();
  });
  await openBest(page);
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByTestId('best-progress')).toBeVisible();
  // The main thread is free: the slider still moves.
  await page.getByLabel('Time within mission').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('Day 0, 00:10')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('best-progress')).toHaveCount(0);
  await page.waitForTimeout(3500);
  await expect(page.getByTestId('best-result')).toHaveCount(0);
});
