// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-18 end to end (F12, 10_interfaz.md §6.3) on the example data: profile toward the chosen body with
// the line of sight, horizon line and blocking point; ranges; the cursor changes the azimuth; smooth
// Moon; site without profile; profile download error with Retry.
import { expect, test, type Page } from './v1';
import { re, sitesInfo } from './data';

async function openSection(page: Page) {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Terrain profile' }).click();
}

test('profile, line of sight, horizon line and blocking point (F12)', async ({ page }) => {
  await openSection(page);
  await expect(page.getByTestId('terrain')).toBeAttached({ timeout: 20_000 });
  await expect(page.getByTestId('sight-line')).toBeAttached();
  await expect(page.getByTestId('horizon-line')).toBeAttached();
  await expect(page.getByTestId('sphere')).toBeAttached();
  await expect(page.getByTestId('blocker-label')).toHaveText(/^Blocking point: \d+\.\d km away, [\d,]+ m (above|below) the site$/);
  await expect(page.getByTestId('exaggeration')).toHaveText(/^Vertical exaggeration ×\d+$/);
  await expect(page.getByTestId('centre-text')).toHaveText(/^Sun centre is \d+\.\d\d° (above|below) the terrain here\.$/);
  await expect(page.getByRole('img', { name: 'Terrain cross-section toward the Sun' })).toBeVisible();
});

test('Toward Earth, ranges and the cursor', async ({ page }) => {
  await openSection(page);
  await expect(page.getByTestId('terrain')).toBeAttached({ timeout: 20_000 });
  const sun = await page.getByTestId('terrain').getAttribute('d');
  await page.getByRole('button', { name: 'Toward Earth' }).click();
  await expect(page.getByRole('img', { name: 'Terrain cross-section toward the Earth' })).toBeVisible();
  await expect(page.getByTestId('centre-text')).toHaveText(/^Earth centre is/);
  await page.getByRole('button', { name: 'Toward Sun' }).click();
  await page.getByRole('button', { name: 'Full 300 km' }).click();
  await expect(page.locator('.section__svg text', { hasText: /^(250|300) km$/ }).first()).toBeAttached();
  await page.getByRole('button', { name: 'Fit to blocker' }).click();
  // Moving the cursor changes the azimuth, so the profile changes.
  await page.getByLabel('Time within mission').focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('PageUp');
  await expect(page.getByTestId('terrain')).not.toHaveAttribute('d', sun!);
});

test('smooth Moon draws only the sphere', async ({ page }) => {
  await openSection(page);
  await page.getByRole('article', { name: 'Scenario A' }).getByRole('button', { name: 'Change site' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Apollo 11/ }).click();
  await page.getByLabel('Landing (UTC)').fill('1969-07-21T00:00');
  await expect(page.getByText('Smooth Moon: the horizon is the lunar sphere, 2.6 km away.')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('sphere')).toBeAttached();
  await expect(page.getByTestId('terrain')).toHaveCount(0);
  await expect(page.getByTestId('blocker')).toHaveCount(0);
});

test('a site without a profile and a download error', async ({ page, request }) => {
  const info = await sitesInfo(request);
  await openSection(page);
  if (info.maskWithoutProfile) {
    await page.getByRole('article', { name: 'Scenario A' }).getByRole('button', { name: 'Change site' }).click();
    await page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${re(info.maskWithoutProfile.name)}`) }).click();
    await expect(page.getByText('Terrain profile unavailable.')).toBeVisible({ timeout: 20_000 });
  }
  // Scenario A of the demo pair has a profile; a failed download shows the message with Retry.
  test.skip(!info.pair[0].has_profile, 'the first demo site has no profile');
  await page.route(`**/profile/${info.pair[0].id}.bin.gz`, (route) => route.abort());
  await page.goto('/?fresh');
  await page.getByRole('tab', { name: 'Terrain profile' }).click();
  await expect(page.getByText('Terrain profile unavailable.')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
});
