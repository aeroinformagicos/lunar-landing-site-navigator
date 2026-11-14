// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-16 end to end (F5, F6, F7) on the example data: a click on the timeline moves the cursor to the
// same value as the slider; the countdown matches the event marker to the minute; the panel shows
// the figures with unit, help and source.
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Timeline' }).click();
  await expect(page.locator('.timeline__plot')).toBeVisible({ timeout: 20_000 });
});

test('clicking the timeline moves the cursor exactly like the slider', async ({ page }) => {
  const plot = page.locator('.timeline__plot');
  const box = (await plot.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.5, box.y + 100);
  const slider = page.getByLabel('Time within mission');
  const sliderValue = Number(await slider.inputValue());
  const plotValue = Number(await plot.getAttribute('aria-valuenow'));
  expect(plotValue).toBe(sliderValue);
  expect((sliderValue - Number(await slider.getAttribute('min'))) % 600).toBe(0);
  // Arrow keys on the focused timeline step 10 min, like the slider.
  await plot.focus();
  await page.keyboard.press('ArrowRight');
  expect(Number(await slider.inputValue())).toBe(sliderValue + 600);
});

test('countdown matches the next event marker to the minute (F6)', async ({ page }) => {
  const countdown = (await page.getByTestId('sun-countdown').innerText()).trim();
  const m = /^(Sunrise|Sunset) in (\d+)d (\d+)h (\d+)m$/.exec(countdown);
  expect(m, countdown).not.toBeNull();
  const seconds = Number(m![2]) * 86400 + Number(m![3]) * 3600 + Number(m![4]) * 60;
  const cursor = Number(await page.getByLabel('Time within mission').inputValue());
  const marker = page.getByRole('button', { name: new RegExp(`^${m![1]}, `) }).first();
  const t = Number(await marker.getAttribute('data-t'));
  expect(Math.abs(t - cursor - seconds)).toBeLessThan(60);
  // Clicking the marker moves the cursor there and the countdown flips.
  await marker.click();
  await expect(page.getByTestId('sun-countdown')).not.toHaveText(countdown);
});

test('panel: three figures with unit, help and source (F7)', async ({ page }) => {
  const panel = page.getByRole('complementary', { name: 'Mission figures' });
  await expect(panel.getByText(/^\d+(\.\d)? h · (\d+|<1|>99) %$/).first()).toBeVisible();
  await expect(panel.getByText('Longest night')).toBeVisible();
  await panel.getByRole('button', { name: 'About Sunlight' }).click();
  await expect(panel.getByText(/Source: JPL DE440 ephemeris and LOLA terrain\./)).toBeVisible();
  await expect(panel.getByText(/^Sun elevation -?\d+\.\d\d°$/)).toBeVisible();
  await expect(panel.getByText(/^Solar disc visible/)).toBeVisible();
  await expect(panel.getByText(/^Earth elevation .* \(margin [+−]\d+\.\d\d°\)$/)).toBeVisible();
  await expect(panel.getByText('Terrain: LOLA polar 40 m + 120 m · Ephemeris: JPL DE440 · Frame: MOON_ME')).toBeVisible();
  await expect(panel.getByText('Sun at landing')).toBeVisible();
});

test('pointer readout shows time, elevations and margins (F5)', async ({ page }) => {
  const box = (await page.locator('.timeline__plot').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.6, box.y + 80);
  await expect(page.locator('.timeline__readout')).toHaveText(/^\d{4}-\d\d-\d\d \d\d:\d\d UTC · Sun .*° \(margin [+−].*°\) · Earth .*° \(margin [+−].*°\)$/);
});
