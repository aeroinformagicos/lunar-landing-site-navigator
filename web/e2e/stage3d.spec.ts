// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-71 end to end (16_vista_3d.md §15.2: E1, E2, E4 partial, E5, E6, E8) on the served data, with
// WebGL 2 by software (`--enable-unsafe-swiftshader`, playwright.config.ts). Until the v2 shell
// (T-61) mounts it, the 3D view replaces the panorama with `?ui=v2&vm=3d` (§10.5). Checks use the
// view's state and statistics, not exact pixels: software rendering differs between machines.
import { expect, test, type Page } from '@playwright/test';

const URL3D = '/?ui=v2&vm=3d&test3d=1';
const HANDOFF = '../docs/handoff/';

const stage = (page: Page) => page.locator('.stage3d');

async function open3d(page: Page, extra = '') {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(URL3D + extra);
  await expect(page.locator('.stage3d[data-state="ready"]')).toBeVisible({ timeout: 30_000 });
  // The first frames after the terrain arrives.
  await expect.poll(async () => Number(await stage(page).getAttribute('data-frames')), { timeout: 10_000 }).toBeGreaterThan(1);
}

/** Standard deviation of the luminance of the WebGL canvas (0 = a flat colour). */
function canvasSpread(page: Page): Promise<number> {
  return page.evaluate(() => {
    const src = document.querySelector<HTMLCanvasElement>('.stage3d__canvas')!;
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 100;
    const g = c.getContext('2d')!;
    g.drawImage(src, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let s = 0;
    let s2 = 0;
    const n = d.length / 4;
    for (let k = 0; k < d.length; k += 4) {
      const y = 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2];
      s += y;
      s2 += y * y;
    }
    return Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2));
  });
}

test('E1 · the polar scene renders with its pins, notice and relief line', async ({ page }) => {
  await open3d(page);
  expect(await canvasSpread(page)).toBeGreaterThan(4);
  await expect(page.getByRole('img', { name: /^3D view of the lunar surface around / })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Scenario A: / })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Scenario A: / })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Illustrative 3D shading. All figures come from the horizon calculation.')).toBeVisible();
  await expect(page.getByText(/^3D terrain: LOLA polar 500 m · Figures: /)).toBeVisible();
  // The active pin carries the core's state: icon and word for the Sun and the Earth.
  await expect(page.locator('.stage3d__pin-status')).toHaveText(/[✓✕] Sun .*[✓✕] Earth /s);
  await expect(page.locator('#stage3d-desc')).toHaveText(/^3D view centred on site A, /);
  await stage(page).screenshot({ path: `${HANDOFF}T-71-3d.png` });
});

test('E1 · the GPU shadow pass agrees with the TypeScript reference', async ({ page }) => {
  await open3d(page, '&q=alto');
  const r = await page.evaluate(() => (window as unknown as { __stage3d: { compareShadow(n: number): { agree: number; maxDiff: number } | null } }).__stage3d.compareShadow(300));
  expect(r).not.toBeNull();
  expect(r!.agree).toBeGreaterThanOrEqual(0.98);
  // Handoff capture at the full quality tier, three days on, framed toward the Sun again.
  const slider = page.getByRole('slider', { name: 'Time within mission' });
  await slider.focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('PageUp');
  await stage(page).focus();
  await page.keyboard.press('Home');
  await page.waitForTimeout(2500);
  await stage(page).screenshot({ path: `${HANDOFF}T-71-3d-alto.png` });
});

test('E2 · keyboard orbits the camera without firing the global shortcuts', async ({ page }) => {
  await open3d(page);
  const before = await stage(page).getAttribute('data-camera');
  await stage(page).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('+');
  await expect.poll(() => stage(page).getAttribute('data-camera')).not.toBe(before);
  const [h0, , d0] = before!.split(',').map(Number);
  await expect.poll(async () => Number((await stage(page).getAttribute('data-camera'))!.split(',')[0])).toBeCloseTo((h0 + 5) % 360, 0);
  expect(Number((await stage(page).getAttribute('data-camera'))!.split(',')[2])).toBeLessThan(d0);
  await expect(page.getByRole('tab', { name: 'Panorama' })).toHaveAttribute('aria-selected', 'true');
  // Recenter goes back to the initial framing.
  await page.getByRole('button', { name: 'Recenter' }).click();
  await expect.poll(() => stage(page).getAttribute('data-camera')).toBe(before);
});

test('E4 · leaving the view and coming back keeps the 3D view working', async ({ page }) => {
  await open3d(page);
  await page.getByRole('tab', { name: 'Timeline' }).click();
  await expect(stage(page)).toHaveCount(0);
  await page.getByRole('tab', { name: 'Panorama' }).click();
  await expect(page.locator('.stage3d[data-state="ready"]')).toBeVisible({ timeout: 30_000 });
  // The 2D panorama itself (the other side of the 3D/2D switch of T-61), for the handoff capture.
  await page.goto('/');
  await expect(page.locator('.pano__view')).toBeVisible({ timeout: 20_000 });
  await page.locator('#main-view').screenshot({ path: `${HANDOFF}T-71-to-2d.png` });
});

test('E5 · without WebGL 2 the 2D view is shown with a plain notice', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type === 'webgl2') return null;
      return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof orig;
  });
  await page.goto(URL3D);
  await expect(page.getByTestId('stage3d-fallback')).toHaveText('The 3D view is not available on this device. Showing the 2D view.', { timeout: 20_000 });
  await expect(page.locator('.pano__view')).toBeVisible({ timeout: 20_000 });
  expect(await page.locator('body').innerText()).not.toMatch(/undefined|NaN|\bnull\b/);
});

test('E6 · a lost WebGL context that does not come back falls back to 2D', async ({ page }) => {
  await open3d(page);
  await page.evaluate(() => {
    const gl = document.querySelector<HTMLCanvasElement>('.stage3d__canvas')!.getContext('webgl2')!;
    gl.getExtension('WEBGL_lose_context')!.loseContext();
  });
  await expect(page.getByTestId('stage3d-fallback')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.pano__view')).toBeVisible({ timeout: 20_000 });
});

test('E8 · 44 px targets, help and no forbidden text with the 3D view', async ({ page }) => {
  await open3d(page);
  await page.getByRole('button', { name: '3D controls help' }).click();
  await expect(page.getByRole('region', { name: 'How to move the camera' })).toBeVisible();
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.stage3d button')]
      .filter((e) => e.getClientRects().length > 0)
      .map((e) => ({ name: (e.getAttribute('aria-label') || e.textContent || '').trim(), b: e.getBoundingClientRect() }))
      .filter((r) => r.b.width < 43.5 || r.b.height < 43.5)
      .map((r) => `${r.name} ${Math.round(r.b.width)}×${Math.round(r.b.height)}`),
  );
  expect(small).toEqual([]);
  expect(await stage(page).innerText()).not.toMatch(/undefined|NaN|\bnull\b|lorem|TODO|grid:|demo-a/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'How to move the camera' })).toHaveCount(0);
});
