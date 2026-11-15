// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-61 (15_interfaz_v2.md): the v2 shell behind `?ui=v2`: brand, pills, stage and figures of the demo
// pair; floating panels fold and unfold with the mouse and `Esc`; the 3D / 2D switch and `V`; without
// the 3D module, the 2D view; `?ui=v1` is still the current interface; no page scroll on desktop.
import { expect, test, type Page } from '@playwright/test';
import { sitesInfo } from '../data';

async function openV2(page: Page, query = '?ui=v2') {
  await page.goto('/' + query);
  await expect(page.locator('.v2')).toBeVisible({ timeout: 20_000 });
}

test('brand, motto, scenario pills, stage and figures of the demo pair', async ({ page, request }) => {
  const { pair } = await sitesInfo(request);
  await openV2(page);
  await expect(page.getByRole('link', { name: 'Lunar Landing Site Navigator' })).toBeVisible();
  await expect(page.getByText('Lunar Sightline', { exact: true })).toBeVisible();
  await expect(page.getByText('When will your landing site see the Sun and Earth?')).toBeVisible();
  const pills = page.getByRole('group', { name: 'Scenarios' });
  await expect(pills.getByRole('button', { name: `A · ${pair[0].short_name}` })).toHaveAttribute('aria-pressed', 'true');
  await expect(pills.getByRole('button', { name: `B · ${pair[1].short_name}` })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#main-view')).toBeVisible();
  await expect(page.locator('.figure--sunlight .figure__value')).toHaveText(/^[\d.]+ h · (\d+|<1|>99) %$/, { timeout: 20_000 });
  await expect(page.getByTestId('status-chip')).toHaveText(/^(✓ Works|! Tight|⊗ Not suitable)$/);
  await expect(page.getByRole('tab', { name: 'Horizon' })).toHaveAttribute('aria-selected', 'true');
  // Picking pill B makes B the active scenario everywhere.
  await pills.getByRole('button', { name: `B · ${pair[1].short_name}` }).click();
  await expect(page.getByRole('heading', { name: 'Now at site B' })).toBeVisible();
});

test('floating panels fold and unfold with the mouse and Esc', async ({ page }) => {
  await openV2(page);
  const now = page.getByRole('region', { name: 'Now at site A' });
  await expect(now).toBeVisible();
  await page.getByRole('button', { name: 'Collapse Now at site A' }).click();
  await expect(now).toHaveCount(0);
  await page.getByRole('button', { name: 'Open Now at site A' }).click();
  await expect(now).toBeVisible();

  await page.getByRole('button', { name: /^Open Setup · / }).click();
  const setup = page.getByRole('region', { name: 'Setup' });
  await expect(setup.getByLabel('Landing (UTC)')).toBeVisible();
  await expect(setup.getByLabel('Longest night allowed (h)')).toHaveValue('24');
  await setup.getByLabel('Landing (UTC)').focus();
  await page.keyboard.press('Escape');
  await expect(setup).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Open Setup · / })).toBeFocused();

  await page.getByRole('button', { name: 'Open Sites' }).click();
  await expect(page.getByRole('region', { name: 'Sites' }).getByRole('article', { name: 'Scenario A' })).toBeVisible();
});

test('3D / 2D switch: text labels, V shortcut, 2D without the 3D module or WebGL 2', async ({ page }) => {
  await openV2(page);
  const toggle = page.getByRole('radiogroup', { name: 'View mode' });
  await expect(toggle.getByRole('radio', { name: '3D' })).toBeVisible();
  const stage = page.locator('#main-view');
  const has3d = await toggle.getByRole('radio', { name: '3D' }).isEnabled();
  if (!has3d) {
    // This build or browser cannot show 3D: the 2D view, and V keeps it.
    await expect(toggle.getByRole('radio', { name: '2D' })).toHaveAttribute('aria-checked', 'true');
    await expect(stage).toHaveAttribute('data-view-mode', '2d');
    await page.locator('body').press('v');
    await expect(stage).toHaveAttribute('data-view-mode', '2d');
    await expect(page.locator('.v2-scene')).toBeVisible({ timeout: 20_000 });
  } else {
    // 3D by default on a capable desktop (contract); V switches both ways.
    await expect(toggle.getByRole('radio', { name: '3D' })).toHaveAttribute('aria-checked', 'true');
    await page.locator('body').press('v');
    await expect(toggle.getByRole('radio', { name: '2D' })).toHaveAttribute('aria-checked', 'true');
    await page.locator('body').press('v');
    await expect(toggle.getByRole('radio', { name: '3D' })).toHaveAttribute('aria-checked', 'true');
  }
  // The switch belongs to the Horizon view only.
  await page.getByRole('tab', { name: 'Timeline' }).click();
  await expect(toggle).toHaveCount(0);
  await expect(page.locator('.timeline__plot')).toBeVisible({ timeout: 20_000 });
});

test('the view mode travels in the shared link (vm)', async ({ page }) => {
  await openV2(page);
  await page.getByRole('button', { name: 'Forward 1 hour' }).click();
  await expect.poll(() => page.url()).toMatch(/#s=/);
  const json = await page.evaluate(() => {
    const b64 = location.hash.slice(3).replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
  });
  expect(['3d', '2d']).toContain(json.vm);
});

test('the v2 is the default since T-63; ?ui=v1 keeps the previous interface', async ({ page }) => {
  await page.goto('/?ui=v1');
  await expect(page.getByRole('link', { name: 'Lunar Landing Site Navigator' })).toBeVisible();
  await expect(page.locator('.v2')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Panorama' })).toBeVisible();
  await page.goto('/');
  await expect(page.locator('.v2')).toBeVisible({ timeout: 20_000 });
});

for (const [w, h] of [
  [1280, 720],
  [1440, 900],
] as const) {
  test(`no page scroll and Play visible at ${w} × ${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openV2(page);
    await expect(page.locator('.figure--sunlight .figure__value')).toBeVisible({ timeout: 20_000 });
    const scroll = await page.evaluate(() => [document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight]);
    expect(scroll).toEqual([0, 0]);
    const play = (await page.getByRole('button', { name: 'Play', exact: true }).boundingBox())!;
    expect(play.y + play.height).toBeLessThanOrEqual(h);
    // The right panel stays above the time bar.
    const panel = (await page.getByRole('region', { name: 'Now at site A' }).boundingBox())!;
    expect(panel.y + panel.height).toBeLessThanOrEqual(play.y);
  });
}
