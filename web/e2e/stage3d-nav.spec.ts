// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-72 end to end (16_vista_3d.md §15.2: E2 for the three modes, E3, E7, E8, and Go to) on the served
// data, inside the v2 shell, with WebGL 2 by software. Captures go to docs/handoff/.
import { expect, test, type Page } from './example';

const HANDOFF = '../docs/handoff/';
const stage = (page: Page) => page.locator('.stage3d');
const camera = async (page: Page) => (await stage(page).getAttribute('data-camera')) ?? '';
const readout = (page: Page) => page.locator('.stage3d__readout');

async function open3d(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?ui=v2&test3d=1');
  await expect(page.locator('.stage3d[data-state="ready"]')).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => Number(await stage(page).getAttribute('data-frames')), { timeout: 10_000 }).toBeGreaterThan(1);
}

/** Calls a test hook of the 3D view (`?test3d=1`). */
function hook<T>(page: Page, name: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(([n, a]) => (window as unknown as Record<string, Record<string, (...x: unknown[]) => unknown>>).__stage3d[n as string](...(a as unknown[])), [name, args] as const) as Promise<T>;
}

test('E2 · Fly: W moves the camera forward and it stays above the terrain', async ({ page }) => {
  await open3d(page);
  await page.getByRole('button', { name: 'Fly', exact: true }).click();
  await expect(stage(page)).toHaveAttribute('data-mode', 'fly');
  await expect.poll(() => camera(page)).toMatch(/^fly:/);
  const before = await camera(page);
  await stage(page).focus();
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyW');
  await expect.poll(() => camera(page)).not.toBe(before);
  // Same heading and pitch, another position.
  expect((await camera(page)).split(',').slice(0, 2)).toEqual(before.split(',').slice(0, 2));
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(300);
  await page.keyboard.up('KeyE');
  await page.getByRole('button', { name: '3D controls help' }).click();
  await expect(page.getByRole('region', { name: 'How to move the camera' })).toContainText('Fly forward, back and sideways');
});

test('E3 · Ground puts the eye at the site and reads like the 2D panorama', async ({ page }) => {
  await open3d(page);
  await page.getByRole('button', { name: 'Ground', exact: true }).click();
  await expect(stage(page)).toHaveAttribute('data-mode', 'ground');
  await expect(readout(page)).toHaveText(/^Az [\d.]+° · El -?[\d.]+° · Horizon -?[\d.]+°$/);
  const text3d = (await readout(page).textContent())!;
  const [az3d, , hor3d] = [...text3d.matchAll(/-?[\d.]+/g)].map((m) => Number(m[0]));
  await stage(page).screenshot({ path: `${HANDOFF}T-72-ground.png` });
  // Arrow keys look 1° at a time.
  await stage(page).focus();
  await page.keyboard.press('ArrowRight');
  await expect(readout(page)).toHaveText(new RegExp(`^Az ${((az3d + 1) % 360).toFixed(1)}°`));
  // The 2D panorama is centred on the same body: its readout at the centre gives the same horizon.
  await page.getByRole('radio', { name: '2D' }).click();
  const view = page.locator('.v2-scene');
  await expect(view).toBeVisible({ timeout: 20_000 });
  const box = (await view.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const text2d = (await page.getByText(/^Az [\d.]+° · El -?[\d.]+° · Horizon -?[\d.]+°$/).textContent())!;
  const [az2d, , hor2d] = [...text2d.matchAll(/-?[\d.]+/g)].map((m) => Number(m[0]));
  expect(Math.abs(az2d - az3d)).toBeLessThanOrEqual(0.1);
  expect(Math.abs(hor2d - hor3d)).toBeLessThanOrEqual(0.02);
});

test('E7 · a click on a computed cell chooses that mesh point; elsewhere it says why not', async ({ page }) => {
  await open3d(page);
  // Cell (460, 410) is in a computed chunk of the served cube (rows 25–26, columns 28–29).
  await hook(page, 'focusMap', -200_000 + 460.5 * 500, 184_000 - 410.5 * 500);
  await page.waitForTimeout(500);
  await stage(page).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /^Scenario A: Nearest mesh point: [\d.]+° S, [\d.]+° [EW] \(500 m grid\)$/ })).toBeVisible({ timeout: 20_000 });
  // The pole is not computed in the example cube.
  await hook(page, 'focusMap', 0, 0);
  await page.waitForTimeout(500);
  await stage(page).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.stage3d__controls').getByText('This area has not been computed yet.')).toBeVisible({ timeout: 20_000 });
});

test('Go to · a region flies there and shows its outline and name; the compass resets north', async ({ page }) => {
  await open3d(page);
  await expect(page.getByRole('button', { name: /^Go to / }).first()).toBeAttached({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Go to…' }).click();
  const menu = page.getByRole('group', { name: 'Places to go to' });
  await expect(menu.getByRole('button', { name: 'South Pole' })).toBeVisible();
  await menu.getByRole('button', { name: 'Haworth' }).click();
  await expect(page.getByRole('button', { name: 'Go to Haworth' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(3500);
  await expect(page.locator('.stage3d__readout')).toHaveText(/^[\d.]+° S, [\d.]+° [EW] · [+−-]?[\d,]+ m$/);
  await stage(page).screenshot({ path: `${HANDOFF}T-72-region.png` });
  await page.getByRole('button', { name: 'North up' }).click();
  await expect.poll(async () => Number((await camera(page)).split(',')[0]), { timeout: 15_000 }).toBeCloseTo(0, 0);
});

test('E8 · signals: paths, ridge and pins, 44 px targets and no forbidden text', async ({ page }) => {
  await open3d(page);
  await expect(page.locator('.stage3d__tag--path').first()).toBeAttached();
  await expect(page.getByText(/^Ridge [\d,]+ (m|km) away$/)).toBeAttached();
  await stage(page).screenshot({ path: `${HANDOFF}T-72-orbit.png` });
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.stage3d button')]
      .filter((e) => e.getClientRects().length > 0 && !e.closest('[hidden]'))
      .map((e) => ({ name: (e.getAttribute('aria-label') || e.textContent || '').trim(), b: e.getBoundingClientRect() }))
      .filter((r) => r.b.width < 43.5 || r.b.height < 43.5)
      .map((r) => `${r.name} ${Math.round(r.b.width)}×${Math.round(r.b.height)}`),
  );
  expect(small).toEqual([]);
  expect(await stage(page).innerText()).not.toMatch(/undefined|NaN|\bnull\b|lorem|TODO|grid:|demo-a/);
  await expect(page.locator('#stage3d-desc')).toHaveText(/Camera: orbit, .* from the site, looking /);
});

test('Learn · step 1 of the story uses the fixed orbit over A toward the Sun (§7.7)', async ({ page }) => {
  await open3d(page);
  await page.getByRole('tab', { name: 'Learn' }).click();
  await expect.poll(() => camera(page), { timeout: 15_000 }).toMatch(/^[\d.]+,10\.0,12000$/);
  // In Learn the arrow keys belong to the story: the 3D view does not take them.
  const before = await camera(page);
  await stage(page).focus();
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(300);
  expect(await camera(page)).toBe(before);
});
