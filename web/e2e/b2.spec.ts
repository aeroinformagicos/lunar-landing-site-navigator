// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Case B2 (11_validacion.md; 07_visibilidad.md §13.7; T-37): Blue Ghost 1, base landing
// 2025-03-02T08:34Z, 14 days, observer at 2 m, default requirements. Expected (07 §13.7):
//   0       → go                       (the real mission: 14 days of light)
//   +14 d   → no_go, night_too_long    (the Sun sets that same day; the night lasts about 14.8 days)
//   +29.5 d → go                       (one synodic month later the geometry repeats)
// The scenario is opened from a shared link (10 §10) in Plan › Replan. +0 and +14 d are read in the
// matrix with the `1 day` step (columns 0 and 14); +29.5 d is not a column of any step (31 columns,
// 07 §8.3), so it is a scenario whose landing is base + 29.5 d, read in its column 0 and in the
// panel's status chip. Needs the real ephemeris table (T-06) and the published Blue Ghost 1 mask (T-09).
import { expect, test, type Page } from '@playwright/test';

const SITE = 'blue-ghost-1';
const BASE = Date.parse('2025-03-02T08:34:00Z') / 1000;
const DAY = 86_400;

type Ui = 'v1' | 'v2';
const UIS: Ui[] = ['v1', 'v2'];

function linkOf(landingUnix: number, ui: Ui): string {
  const state = { v: 1, m: 'plan', t: 'replan', sc: [{ s: SITE, l: landingUnix, d: 14, h: 2 }] };
  return `/?ui=${ui}${ui === 'v2' ? '&vm=2d' : ''}#s=${Buffer.from(JSON.stringify(state), 'utf8').toString('base64url')}`;
}

/** The scenario card: always on screen in v1; in v2 it lives in the Sites panel (15 §5.1). */
async function scenarioCard(page: Page, ui: Ui) {
  if (ui === 'v2' && (await page.getByRole('button', { name: 'Open Sites' }).count()) > 0) await page.getByRole('button', { name: 'Open Sites' }).click();
  return page.getByRole('article', { name: 'Scenario A' });
}

async function openReplan(page: Page, landingUnix: number, ui: Ui) {
  await page.goto(linkOf(landingUnix, ui));
  await expect(page.getByRole('tab', { name: 'Replan' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: '1 day', exact: true }).click();
  await expect(page.locator('[data-cell="0-30"]')).toBeVisible({ timeout: 30_000 });
}

test.beforeEach(async ({ request }) => {
  const manifest = await (await request.get('/data/manifest.json')).json();
  test.skip(manifest.ephemeris.synthetic, 'B2 needs the real ephemeris table');
  const sites = await (await request.get('/data/sites.json')).json();
  const site = sites.sites.find((s: { id: string }) => s.id === SITE);
  test.skip(!site?.has_mask, 'B2 needs the published Blue Ghost 1 horizon mask');
});

for (const ui of UIS) {
test(`B2: Blue Ghost 1 works at the real landing and fails 14 days later (night too long) (${ui})`, async ({ page }) => {
  await openReplan(page, BASE, ui);
  if (ui === 'v1') await expect(page.getByRole('article', { name: 'Scenario A' })).toContainText('Blue Ghost 1');
  else await expect(page.getByRole('group', { name: 'Scenarios' })).toContainText('A · Blue Ghost 1');
  await expect(page.locator('.replan__matrix thead th').nth(15)).toHaveText('+14 d');

  // Delay 0: the real mission.
  await expect(page.locator('[data-cell="0-0"]')).toHaveAttribute('aria-label', 'A · Blue Ghost 1, landing 2025-03-02 08:34 UTC: Works');
  // Delay +14 d: does not work.
  const late = page.locator('[data-cell="0-14"]');
  await expect(late).toHaveAttribute('aria-label', "A · Blue Ghost 1, landing 2025-03-16 08:34 UTC: Not suitable");

  // The reason is the night: the Sun is still up at landing and the longest night fails.
  await late.click();
  await expect(page.getByTestId('cell-detail')).toHaveText(/^A · Blue Ghost 1 · Landing 2025-03-16 08:34 UTC · Sun ✓ · Earth [✓✕] · Longest night [\d.]+ h ✕$/);
  // The click set that landing in the scenario: the panel's full chip agrees with the matrix.
  await expect(await scenarioCard(page, ui)).toContainText('Landing 2025-03-16 08:34 UTC');
  await expect(page.getByTestId('status-chip')).toHaveText("⊗ Not suitable");
  await expect(page.getByRole('list', { name: 'Requirements' }).getByRole('listitem').filter({ hasText: 'No night over 24 h' })).toContainText('✕');
});

test(`B2: Blue Ghost 1 works again 29.5 days later (one synodic month) (${ui})`, async ({ page }) => {
  await openReplan(page, BASE + 29.5 * DAY, ui);
  await expect(page.locator('[data-cell="0-0"]')).toHaveAttribute('aria-label', 'A · Blue Ghost 1, landing 2025-03-31 20:34 UTC: Works');
  await expect(page.getByTestId('status-chip')).toHaveText('✓ Works');
  await expect(await scenarioCard(page, ui)).toContainText('Landing 2025-03-31 20:34 UTC');
});
}
