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
  await expect(now.getByText('Elevation: above the flat horizon (smooth Moon). Margin: above the real horizon.')).toBeVisible({ timeout: 20_000 });
  await expect(now.locator('.v2-dl__sub')).toHaveText(/^margin [+−-]\d+\.\d\d°$/);
});

test('(7) Link dates explains that it moves every scenario to the same date', async ({ page }) => {
  await openV2(page);
  await page.getByRole('button', { name: /^Open Setup · / }).click();
  const box = page.getByRole('checkbox', { name: 'Link dates' });
  await expect(box).toBeChecked();
  await expect(box).toHaveAccessibleDescription(/every scenario \(A, B…\) gets the same landing date/);
  await box.uncheck();
  await expect(box).toHaveAccessibleDescription(/only the active scenario changes its date/);
  await expect(page.locator('#link-dates-help')).toBeVisible();
});

test('(8) one line says what the active mode is for, and each mode tab carries it as a description', async ({ page }) => {
  await openV2(page);
  await expect(page.locator('.v2-modes__help')).toHaveText(/^Explore: one site and date\./);
  await expect(page.getByRole('tab', { name: 'Plan' })).toHaveAccessibleDescription(/^Plan: change sites, dates and mission requirements/);
  await page.getByRole('tab', { name: 'Plan' }).click();
  await expect(page.locator('.v2-modes__help')).toHaveText(/^Plan: /);
  await expect(page.getByRole('tab', { name: 'Learn' })).toHaveAccessibleDescription(/^Learn: a 60-second guided tour/);
});

test('(4) requirements: explained as editable team defaults, and reachable from the Now panel', async ({ page }) => {
  await openV2(page);
  const now = page.getByRole('region', { name: 'Now at site A' });
  await now.getByRole('button', { name: 'Change requirements' }).click();
  await expect(page.getByRole('heading', { name: 'Requirements' })).toBeVisible();
  await expect(page.getByText(/Team defaults, not mission rules: change them here or in Replan/)).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Sun at landing' })).toBeFocused();
  const night = page.getByRole('spinbutton', { name: 'Longest night allowed (h)' });
  await night.fill('48');
  await expect(now.getByText('No night over 48 h')).toBeVisible();
});

test('(5) Replan says what to set, what the columns and icons mean, and answers "when can I land here?"', async ({ page }) => {
  await openV2(page);
  await page.getByRole('tab', { name: 'Plan' }).click();
  await page.getByRole('tab', { name: 'Replan' }).click();
  await expect(page.getByText(/Each column is a later landing: \+0 is the planned date \(.* UTC\), \+1 d one day later/)).toBeVisible();
  await expect(page.locator('.replan__legend')).toContainText("✓ Works · ! Tight · ✕ Doesn't work · – no data");
  await expect(page.getByRole('columnheader', { name: /^When can I land here\?/ })).toBeVisible();
  await expect(page.getByTestId('next-window').first()).toHaveText(/^(Next valid landing window: .* UTC \(.*\)|No valid landing window in the next 90 days\.)$/, { timeout: 30_000 });
});

test('(2) map: the opacity shows its value up to 100 % and is off with the None layer', async ({ page }) => {
  await openV2(page);
  await page.getByRole('tab', { name: 'Map' }).click();
  const slider = page.getByRole('slider', { name: 'Opacity' });
  await expect(slider).toBeEnabled({ timeout: 20_000 });
  await slider.focus();
  await page.keyboard.press('End');
  await expect(slider).toHaveValue('1');
  await expect(slider).toHaveAttribute('aria-valuetext', '100 %');
  await expect(page.locator('.map__opacity-value')).toHaveText('100 %');
  await page.getByRole('button', { name: 'None', exact: true }).click();
  await expect(slider).toBeDisabled();
});
