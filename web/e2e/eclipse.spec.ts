// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-32 end to end (F13, case B3): Blue Ghost 1 on 14 March 2025 — the timeline marks the eclipse and
// the totality, the panel warns during it and the panorama draws the Earth in front of the Sun.
// Needs the real ephemeris table (T-06); with the example one there is no such eclipse.
import { expect, test } from './v1';

test('Blue Ghost 1, 14 March 2025: band, events, notice and Earth in front', async ({ page, request }) => {
  const manifest = await (await request.get('/data/manifest.json')).json();
  test.skip(manifest.ephemeris.synthetic, 'needs the real ephemeris table');
  await page.goto('/');
  await page.getByRole('article', { name: 'Scenario A' }).getByRole('button', { name: 'Change site' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Blue Ghost Mission 1/ }).click();
  await page.getByLabel('Landing (UTC)').fill('2025-03-14T00:00');
  await page.getByLabel('Landing (UTC)').press('Enter');
  await page.getByLabel('Mission', { exact: true }).fill('1');
  await page.getByLabel('Mission', { exact: true }).press('Enter');
  await page.getByRole('tab', { name: 'Timeline' }).click();
  await expect(page.getByTestId('eclipse-band')).toHaveCount(1, { timeout: 20_000 });
  await expect(page.getByTestId('totality-band')).toHaveCount(1);
  const events = page.getByTestId('eclipse-events');
  // Hidden data table (T-20): one row per event, name and time in separate cells.
  await expect(events.getByRole('row', { name: /Eclipse starts 2025-03-14 05:0[01] UTC/ })).toHaveCount(1);
  await expect(events.getByRole('row', { name: /Totality starts 2025-03-14 06:1[78] UTC/ })).toHaveCount(1);
  await expect(events.getByRole('row', { name: /Totality ends 2025-03-14 08:3[45] UTC/ })).toHaveCount(1);
  await expect(events.getByRole('row', { name: /Eclipse ends 2025-03-14 09:5[12] UTC/ })).toHaveCount(1);
  // Cursor to 07:30 UTC: seven hours and three steps of 10 min.
  await page.getByLabel('Time within mission').focus();
  for (let i = 0; i < 45; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByText('Day 0, 07:30 · 2025-03-14 07:30 UTC')).toBeVisible();
  await expect(page.getByTestId('eclipse-notice')).toHaveText(/Eclipse in progress: Earth covers 100 % of the Sun/);
  await page.getByRole('tab', { name: 'Panorama' }).click();
  await expect(page.getByTestId('disc-earth').first()).toHaveAttribute('fill', 'var(--c-bg)');
});
