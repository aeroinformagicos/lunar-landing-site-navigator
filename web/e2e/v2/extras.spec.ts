// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-90: the aerospace engineers' proposals done overnight (docs/handoff/T-90.md), in the v2 shell.
import { expect, test, type Page } from '@playwright/test';

async function openV2(page: Page, query = '?ui=v2&vm=2d') {
  await page.goto('/' + query);
  await expect(page.locator('.v2')).toBeVisible({ timeout: 20_000 });
}

test('(3) Now at site says what the elevations and the margin are measured from', async ({ page }) => {
  await openV2(page);
  const now = page.getByRole('region', { name: 'Now at site A' });
  await expect(now.getByText('Elevation: above the flat horizon (smooth Moon). Margin: above the real horizon.')).toBeVisible({ timeout: 20_000 });
  await expect(now.locator('.v2-dl__sub')).toHaveText(/^margin [+−-]\d+\.\d\d°$/);
});

test('(7) Link dates explains that it moves every scenario to the same date', async ({ page }) => {
  await openV2(page);
  await page.getByRole('button', { name: /^Open Setup · / }).click();
  const box = page.getByRole('checkbox', { name: 'Link dates' });
  await expect(box).toBeChecked();
  await expect(box).toHaveAccessibleDescription(/every scenario \(A, B…\) gets the same landing date/);
  await box.uncheck();
  await expect(box).toHaveAccessibleDescription(/only the active scenario changes its date/);
  await expect(page.locator('#link-dates-help')).toBeVisible();
});

test('(8) what a mode is for shows only on hover (D-184), and each mode tab carries it as a description', async ({ page }) => {
  await openV2(page);
  const help = page.locator('.v2-modes__help');
  await expect(help).toHaveCount(0);
  await page.getByRole('tab', { name: 'Plan' }).hover();
  await expect(help).toHaveText('Compare sites and dates against your mission requirements.');
  await page.getByRole('tab', { name: 'Learn' }).hover();
  await expect(help).toHaveText(/^A 60-second guided tour/);
  await page.mouse.move(10, 500);
  await expect(help).toHaveCount(0);
  await page.getByRole('tab', { name: 'Plan' }).click();
  await page.mouse.move(10, 500);
  await expect(help).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Explore' })).toHaveAccessibleDescription(/^See when one site has sunlight and a direct line to Earth/);
  await expect(page.getByRole('tab', { name: 'Learn' })).toHaveAccessibleDescription(/^A 60-second guided tour/);
});

test('(4) requirements: explained as editable team defaults, and reachable from the Now panel', async ({ page }) => {
  await openV2(page);
  const now = page.getByRole('region', { name: 'Now at site A' });
  await now.getByRole('button', { name: 'Change requirements' }).click();
  await expect(page.getByRole('heading', { name: 'Requirements' })).toBeVisible();
  await expect(page.getByText(/Team defaults, not mission rules: change them here or in Replan/)).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Sun at landing' })).toBeFocused();
  const night = page.getByRole('spinbutton', { name: 'Longest night allowed (h)' });
  await night.fill('48');
  await expect(now.getByText('No night over 48 h')).toBeVisible();
});

test('(5) Replan says what to set, what the columns and icons mean, and answers "when can I land here?"', async ({ page }) => {
  await openV2(page);
  await page.getByRole('tab', { name: 'Plan' }).click();
  await page.getByRole('tab', { name: 'Replan' }).click();
  await expect(page.getByText(/Each column is a later landing: \+0 is the planned date \(.* UTC\), \+1 d one day later/)).toBeVisible();
  await expect(page.locator('.replan__legend')).toContainText("✓ Works · ! Tight · ⊗ Not suitable · – no data");
  await expect(page.getByRole('columnheader', { name: /^When can I land here\?/ })).toBeVisible();
  await expect(page.getByTestId('next-window').first()).toHaveText(/^(Next valid landing window: .* UTC \(.*\)|No valid landing window in the next 90 days\.)$/, { timeout: 30_000 });
});

test('(2) map: the opacity shows its value up to 100 % and is off with the None layer', async ({ page }) => {
  await openV2(page);
  await page.getByRole('tab', { name: 'Map' }).click();
  const slider = page.getByRole('slider', { name: 'Opacity' });
  await expect(slider).toBeEnabled({ timeout: 20_000 });
  await slider.focus();
  await page.keyboard.press('End');
  await expect(slider).toHaveValue('100'); // D-152: 0–100 scale
  await expect(slider).toHaveAttribute('aria-valuetext', '100 %');
  await expect(page.locator('.map__opacity-value')).toHaveText('100 %');
  await page.getByRole('button', { name: 'None', exact: true }).click();
  await expect(slider).toBeDisabled();
});

test('(6) each open scenario says, in the Sites panel, whether its mission works with its date and the requirements', async ({ page }) => {
  await openV2(page);
  await page.getByRole('button', { name: /^Open Sites/ }).click();
  const card = (id: string) => page.getByRole('article', { name: `Scenario ${id}` });
  await expect(card('A').getByRole('button', { name: /· (Works|Tight|Not suitable)$/ })).toBeVisible({ timeout: 30_000 });
  await expect(card('B').getByRole('button', { name: /· (Works|Tight|Not suitable)$/ })).toBeVisible({ timeout: 30_000 });
  // It follows the requirements: with every requirement off and a 400 h night, A works.
  await page.getByRole('button', { name: /^Open Setup · / }).click();
  await page.getByRole('checkbox', { name: 'Sun at landing' }).uncheck();
  await page.getByRole('checkbox', { name: 'Earth contact at landing' }).uncheck();
  await page.getByRole('spinbutton', { name: 'Longest night allowed (h)' }).fill('400');
  await page.getByRole('button', { name: /^Open Sites/ }).click();
  await expect(card('A').getByRole('button', { name: /· Works$/ })).toBeVisible();
});

test('(9) Find the best site from the Sites panel opens the tool on the map; the 3D view says a terrain point can be picked', async ({ page }) => {
  await openV2(page);
  await page.getByRole('button', { name: /^Open Sites/ }).click();
  await page.getByRole('button', { name: 'Find the best site' }).click();
  await expect(page.getByRole('tab', { name: 'Map' })).toHaveAttribute('aria-selected', 'true');
  const toggle = page.getByRole('region', { name: 'Best site' }).getByRole('button', { name: 'Find the best site' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true', { timeout: 20_000 });
  await expect(toggle).toBeFocused();
});

test('(9) the 3D polar scene says that a click on the terrain computes that point', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?ui=v2&test3d=1');
  await expect(page.locator('.stage3d[data-state="ready"][data-scene="polar"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Click the terrain (or press Enter on the centre cross) to compute that point as the site.')).toBeVisible();
});

test('(1) the story dims what the step does not talk about, and step 1 starts the Sun cycle again', async ({ page }) => {
  await openV2(page);
  await page.getByRole('tab', { name: 'Learn' }).click();
  await expect(page.locator('.v2[data-story-step="0"]')).toHaveCount(1);
  await expect(page.locator('.v2-brand')).toHaveCSS('opacity', '0.3');
  await expect(page.locator('.v2-time')).toHaveCSS('opacity', '1');
  // Elapsed hours of the cursor from the landing, read from `Day n, hh:mm`.
  const hours = async () => {
    const m = /Day (\d+), (\d\d):(\d\d)/.exec((await page.locator('.v2-readout').textContent()) ?? '');
    return m ? Number(m[1]) * 24 + Number(m[2]) + Number(m[3]) / 60 : Number.NaN;
  };
  await expect.poll(hours, { timeout: 6_000 }).toBeGreaterThan(10);
  await expect.poll(hours, { timeout: 6_000, intervals: [100] }).toBeLessThan(6); // back to the start
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.v2[data-story-step="1"]')).toHaveCount(1);
  await expect(page.locator('.v2-time')).toHaveCSS('opacity', '0.3');
});
