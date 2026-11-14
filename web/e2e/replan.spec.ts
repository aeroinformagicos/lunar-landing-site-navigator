// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-27 end to end (F10, 10_interfaz.md §6.5): matrix of the scenarios × 31 dates, keyboard in the
// matrix, a click sets the landing and shows the detail, delay steps, editable requirements, next
// valid window, ranking message, full status chip, and the Replan tab only in Plan.
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Plan', exact: true }).click();
  await page.getByRole('tab', { name: 'Replan' }).click();
  await expect(page.locator('[data-cell="1-30"]')).toBeVisible({ timeout: 30_000 });
});

test('matrix: one row per scenario, 31 dates, base column, next window per row', async ({ page }) => {
  await expect(page.locator('.replan__matrix tbody tr')).toHaveCount(2);
  await expect(page.locator('[data-cell^="0-"]')).toHaveCount(31);
  await expect(page.locator('.replan__matrix thead th').nth(1)).toHaveText('+0');
  await expect(page.locator('.replan__matrix thead th').nth(2)).toHaveText('+1 d');
  await expect(page.locator('[data-cell="0-0"]')).toHaveAttribute('aria-label', /^A · Demo A, landing 2027-08-01 00:00 UTC: (Still works|Works, low margin|Does not work)$/);
  for (const w of await page.getByTestId('next-window').allInnerTexts()) {
    expect(w).toMatch(/^(Next valid landing window: .* UTC \(.*\)|No valid landing window in the next 90 days\.)$/);
  }
  await expect(page.getByText('No candidate regions in this build.')).toBeVisible();
  await expect(page.getByTestId('status-chip')).toHaveText(/^(✓ Still works|! Works, low margin|✕ Does not work)$/);
});

test('keyboard: arrows move the active cell, Enter selects it and sets the landing', async ({ page }) => {
  await page.locator('[data-cell="0-0"]').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-cell="1-2"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('cell-detail')).toHaveText(/^B · Demo B · Landing 2027-08-03 00:00 UTC · Sun [✓✕] · Earth [✓✕] · Longest night [\d.]+ h [✓✕]$/);
  await expect(page.getByRole('article', { name: 'Scenario B' })).toContainText('Landing 2027-08-03 00:00 UTC');
});

test('delay steps and editable requirements', async ({ page }) => {
  await page.getByRole('button', { name: '6 h', exact: true }).click();
  await expect(page.locator('.replan__matrix thead th').nth(2)).toHaveText('+6 h');
  await expect(page.locator('.replan__matrix thead th').nth(5)).toHaveText('+1 d');
  // With the requirements switched off, every cell inside the table works.
  await page.getByLabel('Sun at landing').uncheck();
  await page.getByLabel('Earth link at landing').uncheck();
  await page.getByLabel('Longest night allowed (h)').fill('400');
  await expect(page.locator('.replan__cell--no_go')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset to defaults' }).click();
  await expect(page.getByLabel('Longest night allowed (h)')).toHaveValue('24');
  await expect(page.getByLabel('Sun at landing')).toBeChecked();
});

test('Replan exists only in Plan', async ({ page }) => {
  await page.getByRole('tab', { name: 'Explore' }).click();
  await expect(page.getByRole('tab', { name: 'Replan' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Panorama' })).toHaveAttribute('aria-selected', 'true');
});
