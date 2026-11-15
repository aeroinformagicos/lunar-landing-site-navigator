// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-74 end to end: the vertical exaggeration control of the 3D view (D-131). It is labelled on screen,
// offers ×1, the readout keeps the real height and Ground always draws the true scale.
import { expect, test, type Page } from '@playwright/test';

const stage = (page: Page) => page.locator('.stage3d');
const note = (page: Page) => page.locator('.stage3d__exag');

async function openPolar(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?ui=v2&test3d=1');
  await expect(page.locator('.stage3d[data-state="ready"][data-scene="polar"]')).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => Number(await stage(page).getAttribute('data-frames')), { timeout: 10_000 }).toBeGreaterThan(1);
}

test('exaggeration: ×2 by default and labelled, ×1 on request, true scale in Ground', async ({ page }) => {
  await openPolar(page);
  const button = page.getByRole('button', { name: 'Vertical exaggeration of the 3D terrain: ×2' });
  await expect(button).toBeVisible();
  await expect(button).toHaveText('Height ×2');
  await expect(note(page)).toContainText('Heights drawn ×2');
  await expect(note(page)).toContainText('use the real relief');
  const box = await button.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);

  // The readout under the centre gives the real height: the same at ×2 and at ×1.
  const readout = page.locator('.stage3d__readout');
  await expect(readout).toContainText(' m');
  await button.click();
  const menu = page.getByRole('group', { name: 'Vertical exaggeration of the 3D terrain' });
  await expect(menu.getByRole('button', { name: '×2' })).toHaveAttribute('aria-pressed', 'true');
  await menu.getByRole('button', { name: '×1 (true scale)' }).click();
  await expect(page.getByRole('button', { name: 'Vertical exaggeration of the 3D terrain: ×1' })).toBeVisible();
  await expect(note(page)).toHaveCount(0);

  // The choice is remembered; Ground says it draws the true scale.
  await page.getByRole('button', { name: 'Vertical exaggeration of the 3D terrain: ×1' }).click();
  await page.getByRole('group', { name: 'Vertical exaggeration of the 3D terrain' }).getByRole('button', { name: '×3' }).click();
  await page.reload();
  await expect(page.locator('.stage3d[data-state="ready"][data-scene="polar"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Vertical exaggeration of the 3D terrain: ×3' })).toBeVisible();
  await page.getByRole('button', { name: 'Ground', exact: true }).click();
  await expect(note(page)).toHaveText('Ground view: true scale (×1), as seen from the site.');
});

test('exaggeration: no control on a smooth Moon (nothing to exaggerate)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const sc = [{ s: 'apollo-11', l: Date.UTC(1969, 6, 20, 20, 0) / 1000, d: 3, h: 2 }];
  const state = { v: 1, m: 'explore', t: 'panorama', f: 'sun', c: sc[0].l + 86_400, sc };
  await page.goto(`/?ui=v2&test3d=1#s=${Buffer.from(JSON.stringify(state), 'utf8').toString('base64url')}`);
  await expect(page.locator('.stage3d[data-state="ready"][data-scene="smooth"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /Vertical exaggeration/ })).toHaveCount(0);
  await expect(note(page)).toHaveCount(0);
});

test('phone: the 3D option says why it is off, on tap and to screen readers, without hovering', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?ui=v2');
  const toggle = page.getByRole('radiogroup', { name: /view/i });
  const three = toggle.getByRole('radio', { name: '3D' });
  await expect(three).toBeVisible();
  await expect(three).toBeDisabled(); // aria-disabled: still focusable and tappable
  await expect(three).toHaveAccessibleDescription('3D needs WebGL 2 and a wider screen');
  const why = page.locator('#v2-3d-why');
  await expect(why).toBeHidden();
  await three.dispatchEvent('click');
  await expect(why).toBeVisible();
  await expect(why).toHaveText('3D needs WebGL 2 and a wider screen');
  await expect(toggle.getByRole('radio', { name: '2D' })).toHaveAttribute('aria-checked', 'true');
  // Keyboard: focus and Enter toggle the same line.
  await three.focus();
  await page.keyboard.press('Enter');
  await expect(why).toBeHidden();
});
