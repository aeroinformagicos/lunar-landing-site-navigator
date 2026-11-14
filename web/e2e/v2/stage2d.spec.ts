// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-62 (15_interfaz_v2.md §4.2–§5, §9): the full-width 2D scene with labels on the canvas and the 360°
// strip; Horizon detail; the minimap opens the Map view; the data views in the central sheet; the story,
// the welcome card and the validation page in the v2; phones without horizontal scroll.
import { expect, test, type Page } from '@playwright/test';

async function openV2(page: Page, query = '?ui=v2&vm=2d') {
  await page.goto('/' + query);
  await expect(page.locator('.v2')).toBeVisible({ timeout: 20_000 });
}

test('full-width scene: labels on the canvas, both traces, the strip on top, drag and arrows', async ({ page }) => {
  await openV2(page);
  const scene = page.getByRole('img', { name: '40° view of the horizon centred on the Sun' });
  await expect(scene).toBeVisible({ timeout: 20_000 });
  const box = (await scene.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.width).toBeGreaterThanOrEqual(vp.width - 1); // the whole stage
  await expect(page.locator('[data-label="sun"]')).toContainText(/^Sun( · (behind the ridge|below the horizon))?/);
  await expect(page.locator('[data-label="sun"]')).toContainText(/margin [+−]\d/);
  await expect(page.locator('.v2-scene__trace--sun')).toHaveCount(1);
  await expect(page.locator('.v2-scene__trace--earth')).toHaveCount(1);

  const strip = page.getByRole('slider', { name: /360° horizon strip/ });
  await expect(strip).toBeVisible();
  const before = Number(await strip.getAttribute('aria-valuenow'));
  await scene.focus();
  await page.keyboard.press('ArrowRight');
  await expect(strip).toHaveAttribute('aria-valuenow', String((Math.round(before + 1) + 360) % 360));
  // Centre on Earth (right panel) follows the Earth again.
  await page.getByRole('button', { name: 'Centre on Earth' }).click();
  await expect(page.getByRole('img', { name: '40° view of the horizon centred on the Earth' })).toBeVisible();
  await expect(page.locator('[data-label="earth"]')).toContainText(/^Earth/);
});

test('Horizon detail: zoom, disc, margin and Terrain effect; telemetry folds while open', async ({ page }) => {
  await openV2(page);
  const toggle = page.getByRole('button', { name: 'Horizon detail' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('img', { name: 'Horizon zoom around the focus body' })).toBeVisible();
  await expect(page.getByText(/^Horizon zoom ×[\d.]+ · grid [\d.]+°$/)).toBeVisible();
  await expect(page.getByTestId('margin')).toContainText(/[+−]\d/);
  const fx = page.getByRole('region', { name: 'Terrain effect' });
  await expect(fx).toContainText(/Sunlight: ([+−]\d+\.\d|0) h/);
  await expect(page.getByTestId('first-event-shift')).toHaveText(/^(Sunset|Sunrise): /);
  await expect(page.getByTestId('sun-countdown')).toHaveCount(0); // folded to one line
  await toggle.click();
  await expect(page.getByTestId('sun-countdown')).toHaveText(/^(Sunset|Sunrise) in |^No /);
});

test('minimap opens the Map view; data views open in the central sheet', async ({ page }) => {
  await openV2(page);
  await page.getByRole('button', { name: 'Open the map' }).click();
  await expect(page.getByRole('tab', { name: 'Map' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.v2-sheet')).toBeVisible();
  await page.getByRole('tab', { name: 'Terrain profile' }).click();
  await expect(page.locator('.v2-sheet')).toBeVisible();
  await page.getByRole('tab', { name: 'Horizon' }).click();
  await expect(page.locator('.v2-sheet')).toHaveCount(0);
  await expect(page.locator('.v2-scene')).toBeVisible();
});

test('welcome card and the whole guided story in the v2', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/?ui=v2&vm=2d');
  await page.evaluate(() => localStorage.removeItem('llsn.welcome.closed'));
  await page.reload();
  await page.getByRole('button', { name: 'Take the 60-second tour' }).click();
  const count = page.getByTestId('story-count');
  await expect(count).toHaveText('1 / 7');
  for (let i = 2; i <= 7; i++) {
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(count).toHaveText(`${i} / 7`);
  }
  await expect(page.getByRole('heading', { name: 'How we know the numbers are right' })).toBeVisible();
  await page.getByRole('button', { name: 'Try it yourself' }).click();
  await expect(page.getByRole('tab', { name: 'Explore' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.v2-scene')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('welcome')).toHaveCount(0); // it does not come back after the story
});

test('phone 390 × 844: one column, 2D, no horizontal scroll, panels inline', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openV2(page, '?ui=v2');
  await expect(page.getByRole('radio', { name: '3D' })).toBeDisabled();
  await expect(page.locator('.v2-scene')).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  await page.getByRole('button', { name: /^Open Setup/ }).click();
  await expect(page.getByLabel('Landing (UTC)')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeInViewport();
});
