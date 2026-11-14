// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-27 end to end (F10, 10_interfaz.md §6.5): matrix of the scenarios × 31 dates, keyboard in the
// matrix, a click sets the landing and shows the detail, delay steps, editable requirements, next
// valid window, ranking message, full status chip, and the Replan tab only in Plan.
import { expect, test } from './v1';
import { DAY, re, sitesInfo, utc } from './data';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Plan', exact: true }).click();
  await page.getByRole('tab', { name: 'Replan' }).click();
  await expect(page.locator('[data-cell="1-30"]')).toBeVisible({ timeout: 30_000 });
});

test('matrix: one row per scenario, 31 dates, base column, next window per row', async ({ page, request }) => {
  const { pair, candidates, landingUnix } = await sitesInfo(request);
  await expect(page.locator('.replan__matrix tbody tr')).toHaveCount(2);
  await expect(page.locator('[data-cell^="0-"]')).toHaveCount(31);
  await expect(page.locator('.replan__matrix thead th').nth(1)).toHaveText('+0');
  await expect(page.locator('.replan__matrix thead th').nth(2)).toHaveText('+1 d');
  await expect(page.locator('[data-cell="0-0"]')).toHaveAttribute('aria-label', new RegExp(`^A · ${re(pair[0].short_name)}, landing ${utc(landingUnix)} UTC: (Works|Tight|Doesn't work)$`));
  for (const w of await page.getByTestId('next-window').allInnerTexts()) {
    expect(w).toMatch(/^(Next valid landing window: .* UTC \(.*\)|No valid landing window in the next 90 days\.)$/);
  }
  if (candidates.length === 0) await expect(page.getByText('No candidate regions in this build.')).toBeVisible();
  else await expect(page.getByTestId('alternative')).toHaveText(/^(Best alternative: .+ — (Works|Tight), (\d+|<1|>99) % Sun \+ Earth\.|No candidate region works for this landing\.)$/, { timeout: 30_000 });
  await expect(page.getByTestId('status-chip')).toHaveText(/^(✓ Works|! Tight|✕ Doesn't work)$/);
});

test('keyboard: arrows move the active cell, Enter selects it and sets the landing', async ({ page, request }) => {
  const { pair, landingUnix } = await sitesInfo(request);
  await page.locator('[data-cell="0-0"]').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-cell="1-2"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('cell-detail')).toHaveText(new RegExp(`^B · ${re(pair[1].short_name)} · Landing ${utc(landingUnix + 2 * DAY)} UTC · Sun [✓✕] · Earth [✓✕] · Longest night [\\d.]+ h [✓✕]$`));
  await expect(page.getByRole('article', { name: 'Scenario B' })).toContainText(`Landing ${utc(landingUnix + 2 * DAY)} UTC`);
});

test('delay steps and editable requirements', async ({ page }) => {
  await page.getByRole('button', { name: '6 h', exact: true }).click();
  await expect(page.locator('.replan__matrix thead th').nth(2)).toHaveText('+6 h');
  await expect(page.locator('.replan__matrix thead th').nth(5)).toHaveText('+1 d');
  // With the requirements switched off, every cell inside the table works.
  await page.getByLabel('Sun at landing').uncheck();
  await page.getByLabel('Earth contact at landing').uncheck();
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
