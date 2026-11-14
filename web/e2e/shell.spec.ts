// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-14 end to end (F1, F2, 10_interfaz.md §4, §5, §12) on the example data: start with the demo pair,
// keyboard navigation through header and cards, site picker, 4-scenario limit, date validation,
// custom coordinates in Plan, playback.
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('article', { name: 'Scenario A' })).toBeVisible();
});

test('opens with the demo pair and the example banner', async ({ page }) => {
  await expect(page.getByText('Example data — not for use')).toBeVisible();
  await expect(page.getByRole('article', { name: 'Scenario A' })).toContainText('Demo A');
  await expect(page.getByRole('article', { name: 'Scenario B' })).toContainText('Demo B');
  await expect(page.getByLabel('Landing (UTC)')).toHaveValue('2027-08-01T00:00');
  await expect(page.getByLabel('Mission', { exact: true })).toHaveValue('14');
  await expect(page.getByText('Day 0, 00:00 · 2027-08-01 00:00 UTC')).toBeVisible();
});

test('keyboard: Tab reaches the header, the cards and the tabs; shortcuts work', async ({ page }) => {
  await page.getByRole('link', { name: 'Lunar Landing Site Navigator' }).focus();
  const seen: string[] = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    seen.push(await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return `${el?.getAttribute('aria-label') ?? ''}|${el?.textContent?.trim() ?? ''}`;
    }));
  }
  const order = (text: string) => seen.findIndex((s) => s.includes(text));
  expect(order('Explore')).toBeGreaterThanOrEqual(0);
  expect(order('Time within mission')).toBeGreaterThan(order('Explore'));
  expect(order('Change site')).toBeGreaterThan(order('Time within mission'));
  expect(order('Panorama')).toBeGreaterThan(order('Change site'));

  // Arrow keys move between modes; shortcuts 1–4 change tab, ] moves the cursor.
  await page.getByRole('tab', { name: 'Explore' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Plan', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Replan' })).toBeVisible();
  await page.locator('#main-view').focus();
  await page.keyboard.press('2');
  await expect(page.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press(']');
  await expect(page.getByText('Day 0, 01:00 · 2027-08-01 01:00 UTC')).toBeVisible();
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('slider: arrows ±10 min, PageUp +1 day; ±1 hour buttons', async ({ page }) => {
  const slider = page.getByLabel('Time within mission');
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('Day 0, 00:10 · 2027-08-01 00:10 UTC')).toBeVisible();
  await page.keyboard.press('PageUp');
  await expect(page.getByText('Day 1, 00:10 · 2027-08-02 00:10 UTC')).toBeVisible();
  await page.getByRole('button', { name: 'Forward 1 hour' }).click();
  await expect(page.getByText('Day 1, 01:10')).toBeVisible();
});

test('site picker: groups, search, no results, change site', async ({ page }) => {
  await page.getByRole('article', { name: 'Scenario B' }).getByRole('button', { name: 'Change site' }).click();
  const dialog = page.getByRole('dialog', { name: 'Choose a site' });
  await expect(dialog.getByRole('heading', { name: 'Landed missions' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Other points' })).toBeVisible();
  await expect(dialog.getByText('Custom coordinates')).toHaveCount(0); // Explore: catalogue only
  await dialog.getByLabel('Search sites').fill('zzz');
  await expect(dialog.getByText('No sites match "zzz".')).toBeVisible();
  await dialog.getByLabel('Search sites').fill('ghost');
  await dialog.getByRole('button', { name: /Blue Ghost Mission 1/ }).click();
  const card = page.getByRole('article', { name: 'Scenario B' });
  await expect(card).toContainText('Blue Ghost 1');
  await expect(card).toContainText('18.56° N, 61.81° E');
  await expect(card).toContainText('Smooth Moon (no terrain)');
  await expect(card).toContainText('No terrain data here — smooth Moon.');
});

test('at most 4 scenarios', async ({ page }) => {
  for (const name of [/Apollo 11/, /Blue Ghost Mission 1/]) {
    await page.getByRole('button', { name: 'Add scenario' }).click();
    await page.getByRole('dialog').getByRole('button', { name }).click();
  }
  await expect(page.getByRole('article')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Add scenario' })).toBeDisabled();
  await expect(page.getByText('Maximum of 4 scenarios')).toBeVisible();
  await page.getByRole('article', { name: 'Scenario D' }).getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByRole('button', { name: 'Add scenario' })).toBeEnabled();
});

test('date validation messages', async ({ page }) => {
  const input = page.getByLabel('Landing (UTC)');
  await input.fill('1990-05-01T00:00');
  await expect(page.getByText('Date outside the supported range (1969–1972 and 2024–2044).')).toBeVisible();
  await input.fill('2044-12-25T00:00');
  await expect(page.getByText('Mission extends beyond available ephemeris; results truncated.')).toBeVisible();
  await input.fill('2027-09-01T06:30');
  await expect(page.getByText('Day 0, 00:00 · 2027-09-01 06:30 UTC')).toBeVisible();
  await expect(page.getByRole('article', { name: 'Scenario B' })).toContainText('Landing 2027-09-01 06:30 UTC');
});

test('custom coordinates in Plan', async ({ page }) => {
  await page.getByRole('tab', { name: 'Plan', exact: true }).click();
  await page.getByRole('button', { name: 'Add scenario' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Latitude (°, north positive)').fill('-95');
  await dialog.getByLabel('Longitude (°, east positive)').fill('400');
  await dialog.getByRole('button', { name: 'Use coordinates' }).click();
  await expect(dialog.getByText('Latitude must be between −90 and 90.')).toBeVisible();
  await expect(dialog.getByText('Longitude must be between −180 and 360.')).toBeVisible();
  await dialog.getByLabel('Latitude (°, north positive)').fill('-85.5');
  await dialog.getByLabel('Longitude (°, east positive)').fill('300');
  await dialog.getByRole('button', { name: 'Use coordinates' }).click();
  const card = page.getByRole('article', { name: 'Scenario C' });
  await expect(card).toContainText('85.50° S, 60.00° W');
  await expect(card).toContainText('Smooth Moon (no terrain)');
});

test('playback advances the cursor and cycles three speeds', async ({ page }) => {
  const speed = page.getByRole('button', { name: /Playback speed/ });
  await expect(speed).toHaveText('1 h/s');
  await speed.click();
  await speed.click();
  await expect(speed).toHaveText('1 d/s');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('.time-controls__readout')).not.toHaveText(/Day 0, 00:00/);
  await speed.click();
  await expect(speed).toHaveText('1 h/s');
});

test('mobile: Plan asks for a wider screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: 'Plan', exact: true }).click();
  await expect(page.getByText('Plan mode needs a wider screen.')).toBeVisible();
  await page.getByRole('button', { name: 'Back to Explore' }).click();
  await expect(page.getByRole('article', { name: 'Scenario A' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
