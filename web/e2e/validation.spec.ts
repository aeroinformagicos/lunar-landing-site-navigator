// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-23 end to end (F9, 10_interfaz.md §6.7) on the example report (e2e/fixtures, T-82): three headline
// cards (JPL Horizons, the Blue Ghost 1 eclipse and the NASA maps; decision D-95) with prediction,
// fact, tolerance, linked source and state; the retired A3 stays in the full table; the full table
// unfolds and each row expands; a mismatch is shown; without a report, the message.
import { exampleReport, expect, test, type Page } from './example';

async function openValidation(page: Page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Validation' }).click();
  await expect(page.getByRole('heading', { name: 'How we know the numbers are right' })).toBeVisible();
}

test('three headline cards with prediction, fact, tolerance, source and state', async ({ page }) => {
  await openValidation(page);
  await expect(page.locator('article.headline')).toHaveCount(3);
  const a1 = page.getByRole('article', { name: /Sun and Earth positions vs JPL Horizons/ });
  await expect(a1).toContainText('Match');
  await expect(a1.getByRole('row', { name: /Earth elevation, Blue Ghost 1, 2025-03-14 06:00 UTC/ })).toContainText('28.916');
  await expect(a1.getByRole('link', { name: 'JPL Horizons' })).toHaveAttribute('href', 'https://ssd.jpl.nasa.gov/horizons/');
  const b3 = page.getByRole('article', { name: /Total solar eclipse seen by Blue Ghost 1/ });
  await expect(b3).toContainText('Match');
  await expect(b3.getByRole('columnheader', { name: 'Predicted' })).toBeVisible();
  await expect(b3.getByRole('row', { name: /Eclipse starts/ })).toContainText('05:01 UTC');
  await expect(b3).toContainText('5 min');
  await expect(b3.getByRole('link', { name: 'Firefly Aerospace, Blue Ghost Mission 1 updates' })).toHaveAttribute('href', 'https://fireflyspace.com/?p=3379');
  // A3 is retired (decision D-95): no card.
  await expect(page.getByRole('article', { name: /Sunset seen by Blue Ghost 1/ })).toHaveCount(0);
  const a7 = page.getByRole('article', { name: /south pole maps vs NASA/ });
  await expect(a7).toContainText('Pending');
  await expect(a7).toContainText(/Computed tonight/);
  await expect(a7).toContainText("NASA counts a point as lit when any part of the Sun's or Earth's disc is visible");
  await expect(page.getByText(/^[\d,]+ values checked against JPL Horizons · largest difference 0\.\d+°$/)).toBeVisible();
  await expect(page.getByText(/^Rise and set times are only as accurate as the terrain map\./)).toBeVisible();
  await expect(page.getByText(/^Generated from the automated test report · commit \w+$/)).toBeVisible();
});

test('the full table unfolds, each row expands, and the retired A3 says why', async ({ page }) => {
  await openValidation(page);
  await page.getByRole('button', { name: /^Show all checks \(\d+\)$/ }).click();
  const table = page.locator('#all-checks');
  for (const h of ['ID', 'Check', 'Expected', 'Obtained', 'Tolerance', 'Source', 'Status']) {
    await expect(table.getByRole('columnheader', { name: h, exact: true }).first()).toBeVisible();
  }
  const toggle = page.getByRole('button', { name: 'Details of A1', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#case-A1')).toContainText('apollo-11 sun el 2025-03-14T06:00Z');
  await expect(table.getByRole('row').filter({ has: page.getByRole('button', { name: 'Details of A3', exact: true }) })).toContainText('Skipped');
  await page.getByRole('button', { name: 'Details of A3', exact: true }).click();
  await expect(page.locator('#case-A3')).toContainText('Retired (decision D-95)');
  await page.getByRole('button', { name: 'Hide all checks' }).click();
  await expect(table).toHaveCount(0);
});

test('a mismatch is shown with its difference and note, not hidden', async ({ page }) => {
  await page.route('**/validation_report.json', async (route) => {
    const r = exampleReport();
    const b3 = r.headline.find((h) => h.id === 'B3')!;
    b3.status = 'fail';
    b3.rows[0].ok = false;
    b3.rows[0].observed = '05:20 UTC';
    b3.note = 'Off by 19 min.';
    await route.fulfill({ json: r });
  });
  await openValidation(page);
  const b3 = page.getByRole('article', { name: /Total solar eclipse/ });
  await expect(b3).toContainText('Mismatch');
  await expect(b3.getByRole('row', { name: /Eclipse starts/ })).toContainText('05:20 UTC');
  await expect(b3).toContainText('Off by 19 min.');
});

test('without a report: message', async ({ page }) => {
  await page.route('**/validation_report.json', (route) => route.fulfill({ status: 404, body: 'Not found' }));
  await openValidation(page);
  await expect(page.getByText('Validation report not available in this build.')).toBeVisible();
  await page.getByRole('link', { name: /Back to the app/ }).click();
  await expect(page.getByRole('article', { name: 'Scenario A' })).toBeVisible();
});
