// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// D-183: while the mission plays, the 3D camera follows the focus body and the plain summary does not
// rewrite itself on every frame.
import { expect, test, type Page } from '../example';

const stage = (page: Page) => page.locator('.stage3d');
/** Orbit heading of the 3D camera (`data-camera` = `heading,pitch,dist` with `?test3d=1`). */
const heading = async (page: Page) => Number(((await stage(page).getAttribute('data-camera')) ?? '').split(',')[0]);
const turned = (a: number, b: number) => Math.abs(((b - a + 540) % 360) - 180);
/** Heading once the eased turn has settled (two reads 400 ms apart agree). */
async function settled(page: Page): Promise<number> {
  let last = Number.NaN;
  await expect
    .poll(async () => {
      const a = last;
      last = await heading(page);
      return a === last;
    }, { timeout: 20_000, intervals: [400] })
    .toBe(true);
  return last;
}

async function open3d(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?ui=v2&test3d=1');
  await expect(page.locator('.stage3d[data-state="ready"]')).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => Number(await stage(page).getAttribute('data-frames')), { timeout: 10_000 }).toBeGreaterThan(1);
}

test('3D: Play turns the camera with the Sun; turning the view by hand stops it until Centre on Sun', async ({ page }) => {
  test.setTimeout(120_000); // WebGL 2 by software
  await open3d(page);
  await page.getByRole('button', { name: 'Centre on Sun' }).click();
  const start = await settled(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => turned(start, await heading(page)), { timeout: 15_000 }).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();

  // A turn by hand: playing again leaves the camera where the user put it.
  await stage(page).focus();
  await page.keyboard.press('ArrowLeft');
  const mine = await settled(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForTimeout(3000);
  expect(turned(mine, await heading(page))).toBeLessThan(0.3);

  // Centre on Sun (already on) starts the following again.
  await page.getByRole('button', { name: 'Centre on Sun' }).click();
  const again = await heading(page);
  await expect.poll(async () => turned(again, await heading(page)), { timeout: 15_000 }).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
});

test('the plain summary holds still while playing and is live again on pause', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?ui=v2&vm=2d');
  const summary = page.locator('#plain-summary');
  await expect(summary.locator('p')).toHaveCount(3, { timeout: 20_000 });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForTimeout(500);
  const a = await summary.innerText();
  await page.waitForTimeout(1500);
  expect(await summary.innerText()).toBe(a);
  expect(a).not.toMatch(/ comes in \d|elevation and the Earth/);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(summary.locator('p').first()).toHaveText(/^(The Sun is in view at -?\d+\.\d\d° elevation|The Sun is up|The Earth is in view|Neither)/);
});
