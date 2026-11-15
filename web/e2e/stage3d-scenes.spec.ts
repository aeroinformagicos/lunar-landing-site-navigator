// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-73 end to end (16_vista_3d.md §15.2 repeated with the profile scene and the map layer on): the
// profile, horizon-ring and smooth-Moon scenes (§2.1, §4.2–§4.4), the fade between scenes (§7.4), the
// projected layers (§9) and on-demand rendering (§12.1). WebGL 2 by software; captures of each scene
// go to docs/handoff/.
import { expect, test, type Page } from '@playwright/test';

const HANDOFF = '../docs/handoff/';
const NOTICE = 'The 3D view is not available on this device. Showing the 2D view.';
const FORBIDDEN = /undefined|NaN|\bnull\b|lorem|TODO|grid:|demo-a|blue-ghost/;
const DAY = 86_400;
/** Blue Ghost 1 landing (B2, 11_validacion.md): a catalogue site off the polar mesh with a profile. */
const BG1 = { s: 'blue-ghost-1', l: Date.UTC(2025, 2, 2, 8, 34) / 1000, d: 14, h: 2 };
const APOLLO11 = { s: 'apollo-11', l: Date.UTC(1969, 6, 20, 20, 0) / 1000, d: 3, h: 2 };

const stage = (page: Page) => page.locator('.stage3d');
const readout = (page: Page) => page.locator('.stage3d__readout');

type Sc = { s: string; l: number; d: number; h: number };
/** Share link (F16) of a few scenarios, the cursor one day after the first landing, in the 3D view. */
function link(sc: Sc[], cursor = sc[0].l + DAY): string {
  const state = { v: 1, m: 'explore', t: 'panorama', f: 'sun', c: cursor, sc };
  return `/?ui=v2&test3d=1#s=${Buffer.from(JSON.stringify(state), 'utf8').toString('base64url')}`;
}

async function open3d(page: Page, url: string, scene: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url);
  await expect(page.locator(`.stage3d[data-state="ready"][data-scene="${scene}"]`)).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => Number(await stage(page).getAttribute('data-frames')), { timeout: 10_000 }).toBeGreaterThan(1);
}

function hook<T>(page: Page, name: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(([n, a]) => (window as unknown as Record<string, Record<string, (...x: unknown[]) => unknown>>).__stage3d[n as string](...(a as unknown[])), [name, args] as const) as Promise<T>;
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

/** Buttons of the 3D view under 44 × 44 px (14 §6). */
function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.stage3d button')]
      .filter((e) => e.getClientRects().length > 0 && !e.closest('[hidden]'))
      .map((e) => ({ name: (e.getAttribute('aria-label') || e.textContent || '').trim(), b: e.getBoundingClientRect() }))
      .filter((r) => r.b.width < 43.5 || r.b.height < 43.5)
      .map((r) => `${r.name} ${Math.round(r.b.width)}×${Math.round(r.b.height)}`),
  );
}

test.describe('profile scene (case b): Blue Ghost 1', () => {
  test('E1 · the reconstructed terrain renders with its relief line, pin and description', async ({ page }) => {
    await open3d(page, link([BG1]), 'profile');
    expect(await canvasSpread(page)).toBeGreaterThan(4);
    await expect(page.getByText(/^3D terrain: reconstructed from the horizon profile · Figures: /)).toBeVisible();
    await expect(page.getByText('Illustrative 3D shading. All figures come from the horizon calculation.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Scenario A: Blue Ghost/ })).toBeVisible();
    await expect(page.locator('.stage3d__pin-status')).toHaveText(/[✓✕] Sun .*[✓✕] Earth /s);
    await expect(page.locator('#stage3d-desc')).toContainText('reconstructed from its horizon profile');
    // No map layer outside the polar scene, and no polar-only places in Go to.
    await expect(page.getByRole('button', { name: /^Overlay/ })).toHaveCount(0);
    await stage(page).focus();
    await page.keyboard.press('Home');
    await page.waitForTimeout(1500);
    await stage(page).screenshot({ path: `${HANDOFF}T-73-profile.png` });
  });

  test('E1 b · the radial shadow pass on the GPU agrees with the TypeScript reference', async ({ page }) => {
    await open3d(page, link([BG1]).replace('test3d=1', 'test3d=1&q=alto'), 'profile');
    const r = await hook<{ agree: number; maxDiff: number; kind: string } | null>(page, 'compareShadow', 300);
    expect(r).not.toBeNull();
    expect(r!.kind).toBe('radial');
    expect(r!.agree).toBeGreaterThanOrEqual(0.98);
  });

  test('E2 · the keyboard orbits and zooms; Recenter goes back', async ({ page }) => {
    await open3d(page, link([BG1]), 'profile');
    const before = await stage(page).getAttribute('data-camera');
    await stage(page).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('+');
    await expect.poll(() => stage(page).getAttribute('data-camera')).not.toBe(before);
    await expect(page.getByRole('tab', { name: 'Horizon' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: 'Recenter' }).click();
    await expect.poll(() => stage(page).getAttribute('data-camera')).toBe(before);
  });

  test('E3 · Ground on the profile mesh reads like the 2D view', async ({ page }) => {
    await open3d(page, link([BG1]), 'profile');
    await page.getByRole('button', { name: 'Ground', exact: true }).click();
    await expect(stage(page)).toHaveAttribute('data-mode', 'ground');
    await expect(readout(page)).toHaveText(/^Az [\d.]+° · El -?[\d.]+° · Horizon -?[\d.]+°$/);
    const text3d = (await readout(page).textContent())!;
    const [az3d, , hor3d] = [...text3d.matchAll(/-?[\d.]+/g)].map((m) => Number(m[0]));
    await page.waitForTimeout(800);
    await stage(page).screenshot({ path: `${HANDOFF}T-73-profile-ground.png` });
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

  test('E4 · 2D and back keeps the profile scene', async ({ page }) => {
    await open3d(page, link([BG1]), 'profile');
    await page.getByRole('radio', { name: '2D' }).click();
    await expect(stage(page)).toHaveCount(0);
    await expect(page.locator('.v2-scene')).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press('v');
    await expect(page.locator('.stage3d[data-state="ready"][data-scene="profile"]')).toBeVisible({ timeout: 30_000 });
  });

  test('E6 · a lost context in the profile scene falls back to 2D', async ({ page }) => {
    await open3d(page, link([BG1]), 'profile');
    await page.evaluate(() => {
      const gl = document.querySelector<HTMLCanvasElement>('.stage3d__canvas')!.getContext('webgl2')!;
      gl.getExtension('WEBGL_lose_context')!.loseContext();
    });
    await expect(page.getByRole('status').filter({ hasText: NOTICE })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.v2-scene')).toBeVisible({ timeout: 20_000 });
  });

  test('E7 · outside the polar scene a click on the terrain does not change the site', async ({ page }) => {
    await open3d(page, link([BG1]), 'profile');
    await stage(page).focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
    await expect(page.getByRole('button', { name: /^Scenario A: Blue Ghost/ })).toBeVisible();
    await expect(page.locator('.stage3d__controls').getByText('This area has not been computed yet.')).toHaveCount(0);
  });

  test('E8 · 44 px targets and no forbidden text in the profile scene', async ({ page }) => {
    await open3d(page, link([BG1]), 'profile');
    expect(await smallTargets(page)).toEqual([]);
    expect(await stage(page).innerText()).not.toMatch(FORBIDDEN);
  });
});

test('ring scene (case c): without the profile, the horizon ring from the mask', async ({ page }) => {
  await page.route('**/profile/blue-ghost-1.bin.gz', (r) => r.fulfill({ status: 404, body: '' }));
  await open3d(page, link([BG1]), 'ring');
  await expect(page.getByText(/^3D terrain: horizon ring only · Figures: /)).toBeVisible();
  // A data error moves one scene down and says so, with Retry (§2.1); never the 2D view.
  await expect(page.locator('.stage3d__controls').getByText('3D terrain could not be loaded.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  expect(await canvasSpread(page)).toBeGreaterThan(2);
  await expect(page.locator('#stage3d-desc')).toContainText('Only the horizon ring');
  expect(await stage(page).innerText()).not.toMatch(FORBIDDEN);
  await page.getByRole('button', { name: 'Ground', exact: true }).click();
  await expect(readout(page)).toHaveText(/^Az [\d.]+° · El -?[\d.]+° · Horizon -?[\d.]+°$/);
  await page.waitForTimeout(800);
  await stage(page).screenshot({ path: `${HANDOFF}T-73-ring.png` });
});

test('smooth Moon (case d): Apollo 11 shows the sphere with the red notice', async ({ page }) => {
  await open3d(page, link([APOLLO11]), 'smooth');
  const line = page.locator('.stage3d__relief').first();
  await expect(line).toHaveText('▲ Smooth Moon (no terrain)');
  await expect(line).toHaveClass(/stage3d__relief--red/);
  await expect(page.getByText(/^No terrain data here — smooth Moon\./)).toBeVisible();
  await expect(page.locator('#stage3d-desc')).toContainText('There is no terrain here: a smooth Moon.');
  expect(await stage(page).innerText()).not.toMatch(FORBIDDEN);
  await stage(page).screenshot({ path: `${HANDOFF}T-73-smooth.png` });
});

test('polar site without the DEM falls to its profile scene, never to 2D', async ({ page }) => {
  await page.route('**/map/dem_500m.bin.gz', (r) => r.fulfill({ status: 404, body: '' }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?ui=v2&test3d=1');
  await expect(page.locator('.stage3d[data-state="ready"][data-scene="profile"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.stage3d__controls').getByText('3D terrain could not be loaded.')).toBeVisible();
  await expect(page.getByRole('radio', { name: '3D' })).toHaveAttribute('aria-checked', 'true');
});

test('Go to another scene fades to black and mounts it (§7.4)', async ({ page }) => {
  const demoA = { s: 'demo-a', l: BG1.l, d: 14, h: 2 };
  await open3d(page, link([demoA, BG1]), 'polar');
  await page.getByRole('button', { name: 'Go to…' }).click();
  await page.getByRole('group', { name: 'Places to go to' }).getByRole('button', { name: /^B · Blue Ghost/ }).click();
  await expect(page.locator('.stage3d__fade--on')).toHaveCount(1, { timeout: 2_000 });
  await expect(page.locator('.stage3d[data-state="ready"][data-scene="profile"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.stage3d__fade--on')).toHaveCount(0, { timeout: 5_000 });
  await expect(page.getByRole('button', { name: /^Scenario B: Blue Ghost/ })).toHaveAttribute('aria-pressed', 'true');
});

test.describe('projected map layers (§9)', () => {
  test('Sunlight on the terrain with its legend; the map view shows the same layer; None hides it', async ({ page }) => {
    await open3d(page, '/?ui=v2&test3d=1', 'polar');
    await expect(stage(page)).toHaveAttribute('data-overlay', 'none');
    await page.getByRole('button', { name: /^Overlay/ }).click();
    const menu = page.getByRole('group', { name: 'Map layer on the terrain' });
    await expect(menu.getByRole('button', { name: 'None' })).toHaveAttribute('aria-pressed', 'true');
    await menu.getByRole('button', { name: 'Sunlight' }).click();
    await expect(stage(page)).toHaveAttribute('data-overlay', 'sun', { timeout: 20_000 });
    const legend = page.getByRole('group', { name: 'Map layer on the terrain: Sunlight' });
    await expect(legend).toContainText('Share of time (%)');
    await expect(legend).toContainText('Sun or Earth centre above the real horizon, observer at 2 m');
    await expect(legend).toContainText(/Period: .+ · change it in the Map view/);
    await expect(legend.locator('.stage3d__ramp span')).toHaveCount(11);
    expect(await smallTargets(page)).toEqual([]);
    expect(await stage(page).innerText()).not.toMatch(FORBIDDEN);
    // The description changes at most every 10 s (§13).
    await expect(page.locator('#stage3d-desc')).toContainText('coloured by the map layer Sunlight', { timeout: 15_000 });
    await page.waitForTimeout(500);
    await stage(page).screenshot({ path: `${HANDOFF}T-73-overlay.png` });
    // E2 and E7 with the layer on: the camera moves and a click still picks a mesh point.
    await stage(page).focus();
    const before = await stage(page).getAttribute('data-camera');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => stage(page).getAttribute('data-camera')).not.toBe(before);
    await hook(page, 'focusMap', -200_000 + 460.5 * 500, 184_000 - 410.5 * 500);
    await page.waitForTimeout(500);
    await stage(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: /^Scenario A: Nearest mesh point: / })).toBeVisible({ timeout: 20_000 });
    await expect(stage(page)).toHaveAttribute('data-overlay', 'sun');
    // The layer chosen in 3D is the map's layer (setMapLayer).
    await page.getByRole('tab', { name: 'Map' }).click();
    await expect(page.getByRole('group', { name: 'Layer' }).getByRole('button', { name: 'Sunlight' })).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 });
    await page.getByRole('tab', { name: 'Horizon' }).click();
    await expect(stage(page)).toHaveAttribute('data-overlay', 'sun', { timeout: 30_000 });
    await page.getByRole('button', { name: /^Overlay/ }).click();
    await page.getByRole('group', { name: 'Map layer on the terrain' }).getByRole('button', { name: 'None' }).click();
    await expect(stage(page)).toHaveAttribute('data-overlay', 'none');
    await expect(page.getByRole('group', { name: /^Map layer on the terrain: / })).toHaveCount(0);
  });

  test('Earth contact and Sun + Earth use their own ramps', async ({ page }) => {
    await open3d(page, '/?ui=v2&test3d=1', 'polar');
    for (const [name, band] of [
      ['Earth contact', 'earth'],
      ['Sun + Earth', 'both'],
    ] as const) {
      await page.getByRole('button', { name: /^Overlay/ }).click();
      await page.getByRole('group', { name: 'Map layer on the terrain' }).getByRole('button', { name }).click();
      await expect(stage(page)).toHaveAttribute('data-overlay', band, { timeout: 20_000 });
      await expect(page.getByRole('group', { name: `Map layer on the terrain: ${name}` })).toBeVisible();
    }
  });
});

test('on-demand rendering: no frames at rest (§12.1)', async ({ page }) => {
  await open3d(page, '/?ui=v2&test3d=1', 'polar');
  await page.mouse.move(5, 5);
  await page.waitForTimeout(2500);
  const a = Number(await stage(page).getAttribute('data-frames'));
  await page.waitForTimeout(1500);
  const b = Number(await stage(page).getAttribute('data-frames'));
  expect(b - a).toBeLessThanOrEqual(1);
});
