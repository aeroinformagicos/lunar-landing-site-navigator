// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-30 end to end (F15, 10_interfaz.md §11): Learn walks the seven steps with `Next`, each showing its
// view; keys ← → work; the end offers `Explore it yourself` and `Restart`.
import { expect, test } from '@playwright/test';

test('the seven steps with Next, then Explore it yourself', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('article', { name: 'Scenario A' })).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  const count = page.getByTestId('story-count');
  const text = page.getByTestId('story-text');
  const next = () => page.getByRole('button', { name: 'Next' }).click();

  await expect(count).toHaveText('1 / 7');
  await expect(text).toContainText("At the Moon's south pole");
  await expect(page.locator('.pano__view')).toBeVisible({ timeout: 20_000 });

  await next();
  await expect(count).toHaveText('2 / 7');
  await expect(text).toHaveText(/^These two sites are \d+ (m|km) apart\./);
  await expect(page.locator('.compare__table')).toBeVisible({ timeout: 20_000 });

  await next();
  await expect(count).toHaveText('3 / 7');
  // Example demo-b has no profile (the real sites will): the Cross-section tab is what matters here.
  await expect(page.getByRole('tab', { name: 'Cross-section' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('article', { name: 'Scenario B' })).toHaveAttribute('aria-current', 'true');
  await expect(text).toHaveText(/^Here is why: a ridge \d+ (m|km) away blocks the Sun\./);

  await next();
  await expect(count).toHaveText('4 / 7');
  await expect(page.locator('.replan__matrix thead th.replan__active')).toHaveText('+12 d', { timeout: 5_000 });
  await expect(page.locator('.replan__matrix tbody tr')).toHaveCount(2);
  await expect(page.locator('[data-cell^="0-"]')).toHaveCount(13);

  await next();
  await expect(count).toHaveText('5 / 7');
  await expect(page.getByText('Ranking for landing 2027-08-13 00:00 UTC')).toBeVisible();

  await next();
  await expect(count).toHaveText('6 / 7');
  await expect(text).toContainText('Near the equator a lunar day lasts two Earth weeks.');
  await expect(page.getByRole('article', { name: 'Scenario A' })).toContainText('Blue Ghost 1');
  await expect(page.locator('.timeline__plot')).toBeVisible({ timeout: 20_000 });

  await next();
  await expect(count).toHaveText('7 / 7');
  await expect(page.getByRole('heading', { name: 'How we know the numbers are right' })).toBeVisible();

  await next();
  await page.getByRole('button', { name: 'Explore it yourself' }).click();
  await expect(page.getByRole('tab', { name: 'Explore' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('article', { name: 'Scenario B' })).toContainText('Demo B');
  await expect(page.getByTestId('story-count')).toHaveCount(0);
});

test('keys → and ← move through the story; Restart goes back to step 1', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('article', { name: 'Scenario A' })).toBeVisible();
  await page.getByRole('tab', { name: 'Learn' }).click();
  // Focus off the mode selector (its arrows change the mode), then the story owns ← →.
  await page.getByTestId('story-text').click();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('story-count')).toHaveText('2 / 7');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('story-count')).toHaveText('1 / 7');
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Restart' }).click();
  await expect(page.getByTestId('story-count')).toHaveText('1 / 7');
});
