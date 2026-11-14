// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-23 end to end (F9, 10_interfaz.md §6.7) on the example report: three headline cards with
// prediction, fact, tolerance, linked source and state; the full table unfolds and each row expands;
// a mismatch is shown; without a report, the message.
import { expect, test, type Page } from '@playwright/test';

async function openValidation(page: Page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Validation' }).click();
  await expect(page.getByRole('heading', { name: 'How we know the numbers are right' })).toBeVisible();
}

test('three headline cards with prediction, fact, tolerance, source and state', async ({ page }) => {
  await openValidation(page);
  const b3 = page.getByRole('article', { name: /Total solar eclipse seen by Blue Ghost 1/ });
  await expect(b3).toContainText('Match');
  await expect(b3.getByRole('columnheader', { name: 'Predicted' })).toBeVisible();
  await expect(b3.getByRole('row', { name: /Eclipse starts/ })).toContainText('05:01 UTC');
  await expect(b3).toContainText('5 min');
  await expect(b3.getByRole('link', { name: 'Firefly Aerospace, Blue Ghost Mission 1 updates' })).toHaveAttribute('href', 'https://fireflyspace.com/?p=3379');
  await expect(page.getByRole('article', { name: /Sunset seen by Blue Ghost 1/ })).toContainText('Pending');
  const a7 = page.getByRole('article', { name: /south pole maps vs NASA/ });
  await expect(a7).toContainText('Pending');
  await expect(a7).toContainText("NASA counts a point as lit when any part of the Sun's or Earth's disc is visible");
  await expect(page.getByText('256 values checked against JPL Horizons · largest difference 0.00004°')).toBeVisible();
  await expect(page.getByText('Generated from the automated test report · commit example')).toBeVisible();
});

test('the full table unfolds and each row expands with its details', async ({ page }) => {
  await openValidation(page);
  await page.getByRole('button', { name: 'Show all checks (4)' }).click();
  const table = page.locator('#all-checks');
  for (const h of ['ID', 'Check', 'Expected', 'Obtained', 'Tolerance', 'Source', 'Status']) {
    await expect(table.getByRole('columnheader', { name: h, exact: true }).first()).toBeVisible();
  }
  await expect(table.getByRole('row', { name: /A5/ })).toContainText('Manual');
  const toggle = page.getByRole('button', { name: 'Details of A1' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#case-A1')).toContainText('apollo-11 sun el 2025-03-14T06:00Z');
  await expect(page.locator('#case-A1')).toContainText('0.000007 deg');
  await page.getByRole('button', { name: 'Details of B1' }).click();
  await expect(page.locator('#case-B1')).toContainText('Not run in the example data.');
  await page.getByRole('button', { name: 'Hide all checks' }).click();
  await expect(table).toHaveCount(0);
});

test('a mismatch is shown with its difference and note, not hidden', async ({ page }) => {
  await page.route('**/validation_report.json', async (route) => {
    const res = await route.fetch();
    const r = await res.json();
    r.headline[0].status = 'fail';
    r.headline[0].rows[0].ok = false;
    r.headline[0].rows[0].observed = '05:20 UTC';
    r.headline[0].note = 'Off by 19 min.';
    await route.fulfill({ response: res, json: r });
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
