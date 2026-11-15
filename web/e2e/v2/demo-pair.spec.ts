// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-92: step 2 of Learn shows a clear and true contrast between the demo pair (D-108: demo-a works at
// the landing of the story, demo-b does not; B1 checks the figures). In the v2 (2D) and in ?ui=v1 the
// comparison says, next to the mission verdict, whether the Sun and the Earth are in view *now* against
// the real horizon, so a negative elevation over a dipping horizon is not read as «below the horizon».
import { expect, test, type Page } from '@playwright/test';

async function step2(page: Page, query: string) {
  await page.goto('/' + query);
  await page.getByRole('tab', { name: 'Learn' }).first().click();
  await page.getByRole('button', { name: 'Next', exact: true }).first().click();
  await expect(page.getByText(/^These two sites are .+ apart\. At one, the Sun \(power\) and the Earth \(radio link\) are both in view for most of the mission\. At the other, almost never, and the mission fails\.$/)).toBeVisible({ timeout: 20_000 });
  const table = page.locator('.compare__table');
  await expect(table).toBeVisible({ timeout: 20_000 });
  return table;
}

for (const [name, query] of [
  ['v2, 2D', '?vm=2d'],
  ['v1', '?ui=v1'],
] as const) {
  test(`T-92 · step 2 contrast in the ${name}`, async ({ page }) => {
    const table = await step2(page, query);
    const cells = (row: string) => table.getByRole('row', { name: new RegExp(`^${row}`) }).locator('td');
    await expect(cells('Status')).toHaveText([/Works/, /Doesn't work/], { timeout: 20_000 });
    await expect(cells('Sun now')).toHaveText([/^✓ In view · [\d.]+° above the real horizon$/, /^(✓ In view|✕ Hidden) · /]);
    await expect(cells('Earth now')).toHaveText([/^✓ In view · [\d.]+° above the real horizon$/, /^✕ Hidden · [\d.]+° below the real horizon$/]);
  });
}
