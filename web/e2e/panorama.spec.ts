// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-15 end to end (F3, F4, 10_interfaz.md §6.1) on the example data: drag and keys pan the 40° view,
// the 360° strip jumps to another direction, `Centre on …` follows the body again, the smooth-Moon
// line and the `Terrain effect` box, loading and error states.
import { expect, test, type Page } from '@playwright/test';

const strip = (page: Page) => page.getByRole('slider', { name: /360° horizon strip/ });
const azimuth = async (page: Page) => Number(await strip(page).getAttribute('aria-valuenow'));

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.pano__view')).toBeVisible({ timeout: 20_000 });
});

test('40° view with degree axes, zoom and strip (F3)', async ({ page }) => {
  await expect(page.getByRole('img', { name: '40° view of the horizon centred on the Sun' })).toBeVisible();
  await expect(page.locator('.pano__view text').filter({ hasText: /°/ }).first()).toBeVisible();
  await expect(page.getByText('Horizon zoom ×10 · grid 0.5°')).toBeVisible();
  await expect(page.getByTestId('disc-visible')).toHaveText(/^Solar disc visible: (\d+|<1|>99) %$/);
  await expect(page.getByTestId('margin')).toHaveText(/^Margin: [+−]\d+\.\d\d°$/);
  await expect(page.locator('.pano__bracket')).toHaveCount(1);
});

test('drag and arrow keys pan the view; Centre on follows the body again', async ({ page }) => {
  const start = await azimuth(page);
  const view = page.locator('.pano__view');
  const box = (await view.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 160, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  const dragged = await azimuth(page);
  const degPerPx = 40 / box.width; // same scale on both axes, 40° across the view
  expect(Math.abs(((dragged - start + 540) % 360) - 180 - 160 * degPerPx)).toBeLessThanOrEqual(1);
  await view.focus();
  await page.keyboard.press('ArrowRight');
  expect(await azimuth(page)).toBe((dragged + 1) % 360);
  await page.getByRole('button', { name: 'Centre on Sun' }).click();
  expect(await azimuth(page)).toBe(start);
});

test('the strip jumps to another direction; Centre on Earth', async ({ page }) => {
  const s = strip(page);
  const box = (await s.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2);
  expect(Math.abs((await azimuth(page)) - 270)).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: 'Centre on Earth' }).click();
  await expect(page.getByRole('img', { name: '40° view of the horizon centred on the Earth' })).toBeVisible();
  await expect(page.getByTestId('disc-visible')).toHaveCount(0); // the disc fraction is the Sun's only
});

test('smooth-Moon line and Terrain effect box (F4)', async ({ page }) => {
  await expect(page.getByTestId('smooth-line')).toHaveCount(0);
  await page.getByLabel('Compare with smooth Moon').check();
  await expect(page.getByTestId('smooth-line')).toHaveCount(2); // 40° view and zoom (a flat line has no height)
  await expect(page.getByTestId('smooth-line').first()).toHaveAttribute('d', /^M0\.00 [\d.]+L\d+\.00 [\d.]+$/);
  const fx = page.getByRole('region', { name: 'Terrain effect' });
  await expect(fx).toContainText(/Sunlight: ([+−]\d+\.\d|0) h/);
  await expect(fx).toContainText(/Earth link: ([+−]\d+\.\d|0) h/);
  await expect(page.getByTestId('first-event-shift')).toHaveText(/^(Sunset|Sunrise): /);
});

test('loading and error states', async ({ page }) => {
  await page.route('**/ephemeris.bin', (route) => route.abort());
  await page.goto('/?fresh');
  await expect(page.getByText('Panorama unavailable.')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Retry' }).first()).toBeVisible();
});
