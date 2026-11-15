// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-93 (D-123): the «Power & comms» reading of the figures. The switch is accessible, the estimate
// notice and its assumptions are always in sight, editing the load changes the battery in proportion
// (battery = load × longest night) and the Earth link hours equal the Earth contact figure with a 0°
// minimum (same definition, CLAUDE.md §2).
import { expect, test } from '@playwright/test';

test('T-93 · Power & comms: switch, notice, assumptions and figures that follow them', async ({ page }) => {
  await page.goto('/?vm=2d');
  await expect(page.locator('.figure--earth_link .figure__value')).toHaveText(/^[\d.]+ h · /, { timeout: 20_000 });
  const earthH = Number((await page.locator('.figure--earth_link .figure__value').innerText()).split(' ')[0]);

  const sw = page.getByRole('group', { name: 'What the figures show' });
  await expect(sw.getByRole('button', { name: 'Sun & Earth visibility' })).toHaveAttribute('aria-pressed', 'true');
  await sw.getByRole('button', { name: 'Power & comms' }).click();
  await expect(sw.getByRole('button', { name: 'Power & comms' })).toHaveAttribute('aria-pressed', 'true');

  const power = page.getByRole('group', { name: 'Power and communications estimate for the mission' });
  await expect(power).toBeVisible();
  await expect(page.getByRole('note').filter({ hasText: /^⚠ ?Estimate, not a mission design/ })).toBeVisible();
  await expect(page.getByTestId('power-energy')).toContainText('kWh/day');

  // Link hours with a 0° minimum = the Earth contact figure (both rounded to 0.1 h).
  const linkH = Number((await page.getByTestId('power-link').locator('.v2-fig__value').innerText()).replace(/\s*h$/, ''));
  expect(Math.abs(linkH - earthH)).toBeLessThanOrEqual(0.4);

  const battery = async () => Number((await page.getByTestId('power-battery').locator('.v2-fig__value').innerText()).replace(/\s*kWh$/, ''));
  const b100 = await battery();
  await page.getByRole('button', { name: 'Edit assumptions' }).click();
  const dialog = page.getByRole('dialog', { name: 'Assumptions of the estimate' });
  await dialog.getByLabel('Load at night (W)').fill('400');
  await expect(page.getByTestId('power-battery')).toContainText('at 400 W');
  const b400 = await battery();
  if (b100 > 0) expect(b400 / b100).toBeCloseTo(4, 1);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('note').filter({ hasText: '400 W load at night' })).toBeVisible();

  // Back to the visibility reading: the usual figures again.
  await sw.getByRole('button', { name: 'Sun & Earth visibility' }).click();
  await expect(page.locator('.figure--sunlight .figure__value')).toBeVisible();
});
