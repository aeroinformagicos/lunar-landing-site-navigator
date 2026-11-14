// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-29 end to end (F11, minimal version of 12_tareas.md §11) on the example heavy origin: layers,
// legend, pointer readout, click → `Nearest mesh point…` scenario, «not computed», zoom with buttons
// and keys, plan B label, and no heavy origin.
import { expect, test, type Page } from './example';

/** Screen point of the centre of cell (i, j) with the initial fit. */
async function cellPoint(page: Page, i: number, j: number) {
  const box = (await page.locator('.map__canvas').boundingBox())!;
  const base = Math.min(box.width / 752, box.height / 672);
  return { x: box.x + (box.width - 752 * base) / 2 + (i + 0.5) * base, y: box.y + (box.height - 672 * base) / 2 + (j + 0.5) * base };
}

async function openMap(page: Page) {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Map' }).click();
  await expect(page.locator('.map__canvas')).toBeVisible({ timeout: 20_000 });
}

test('layers, period, legend and readout (F11)', async ({ page }) => {
  await openMap(page);
  for (const l of ['Sunlight', 'Earth contact', 'Sun + Earth', 'None']) await expect(page.getByRole('button', { name: l, exact: true })).toBeVisible();
  await expect(page.getByText('Share of time (%)', { exact: false })).toBeVisible();
  await expect(page.getByText('Sun or Earth centre above the real horizon, observer at 2 m')).toBeVisible();
  await expect(page.getByText('Polar stereographic · 500 m grid')).toBeVisible();
  await page.getByLabel('Year').selectOption('2028');
  await page.getByLabel('Month').selectOption('03');
  await expect(page.getByRole('button', { name: '18.6-year mean' })).toHaveAttribute('aria-pressed', 'false');
  const p = await cellPoint(page, 470, 425);
  await page.mouse.move(p.x, p.y);
  await expect(page.getByTestId('map-readout')).toHaveText(/^\d+\.\d\d° S, \d+\.\d\d° E · [+−][\d,]+ m · Sun \d+ % · Earth \d+ % · Both \d+ %$/);
});

test('a click on a computed cell creates the mesh-point scenario; elsewhere, «not computed»', async ({ page }) => {
  await openMap(page);
  let p = await cellPoint(page, 470, 425);
  await page.mouse.click(p.x, p.y);
  const card = page.getByRole('article', { name: 'Scenario A' });
  await expect(card).toContainText('Mesh point');
  await expect(card).toContainText(/Nearest mesh point: \d+\.\d{3}° S, \d+\.\d{3}° E \(500 m grid\)/);
  await expect(page.locator('.figure--sunlight .figure__value')).toHaveText(/ h · /, { timeout: 20_000 });
  p = await cellPoint(page, 200, 200);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByText('This area has not been computed yet.')).toBeVisible();
});

test('zoom buttons and keyboard (+, arrows, Enter on the centre cross)', async ({ page }) => {
  await openMap(page);
  const canvas = page.locator('.map__canvas');
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(canvas).toHaveAttribute('data-zoom', '2');
  await canvas.focus();
  await page.keyboard.press('-');
  await expect(canvas).toHaveAttribute('data-zoom', '1');
  await page.keyboard.press('+');
  await expect(canvas).toHaveAttribute('data-zoom', '2');
  await page.keyboard.press('Enter'); // centre cell is not computed in the example cube
  await expect(page.getByText('This area has not been computed yet.')).toBeVisible();
});

test('plan B is labelled; without the heavy origin, the message', async ({ page }) => {
  await page.route('**/layers/layers.json', async (route) => {
    const res = await route.fetch();
    const j = await res.json();
    await route.fulfill({ response: res, json: { ...j, source: 'nasa_avgvisib' } });
  });
  await openMap(page);
  await expect(page.getByText('NASA average illumination (Mazarico et al. 2011) — not our computation')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sun + Earth', exact: true })).toBeDisabled();
  await page.unroute('**/layers/layers.json');
  await page.route('**/map/grid.json', (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto('/?fresh');
  await page.getByRole('tab', { name: 'Map' }).click();
  await expect(page.getByText('Map data is not available in this build.')).toBeVisible({ timeout: 20_000 });
});
