// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-17 end to end (F18): the plain summary shows three sentences in the panel and its numbers are the
// panel's.
import { expect, test } from './v1';

test('three plain sentences with the panel numbers', async ({ page }) => {
  await page.goto('/');
  const summary = page.getByRole('region', { name: 'Plain summary' });
  await expect(summary.locator('p')).toHaveCount(3, { timeout: 20_000 });
  const [now, next, verdict] = await summary.locator('p').allInnerTexts();
  expect(now).toMatch(/^(The Sun is|The Earth is in view|Neither the Sun)/);
  expect(next).toMatch(/^(Sunset comes in|The Sun stays up|Sunrise comes in|The Sun does not rise)/);
  expect(verdict).toMatch(/^(For a 14-day mission|This site works for a 14-day|This site does not work for a 14-day)/);
  const panelSun = await page.locator('.figure--sunlight .figure__value').innerText(); // `259 h · 77 %`
  const pct = panelSun.split(' · ')[1];
  if (verdict.startsWith('For a')) expect(verdict).toContain(`${pct} sunlight`);
  // Moving the cursor updates the summary.
  await page.getByLabel('Time within mission').focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('PageUp');
  await expect(summary.locator('p').nth(1)).not.toHaveText(next);
});
