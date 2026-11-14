// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-53 (14_ux_malaga.md §9): the welcome card shows on a first visit without state in the URL and
// not with a shared link; the demo flow of §2 never shows `undefined`, `NaN`, `null`, `lorem` or `TODO`,
// and every button in it is at least 44 × 44 px.
import { expect, test, type Page } from './v1';

test.use({ storageState: { cookies: [], origins: [] } });

const RED_FLAGS = /\b(undefined|NaN|null|lorem|TODO)\b|\[object Object\]/;

async function redFlags(page: Page): Promise<string[]> {
  const text = await page.locator('body').innerText();
  return text.split('\n').filter((l) => RED_FLAGS.test(l));
}

async function smallButtons(page: Page): Promise<string[]> {
  // The flow's actions: every `Button` and the mode and view tabs. Matrix cells and timeline markers
  // have their own touch sizes (T-20) and are left to `a11y.spec.ts`.
  return page.locator('.btn, [role="tab"]').evaluateAll((els) =>
    els
      .filter((e) => e.getClientRects().length > 0 && !e.closest('.visually-hidden'))
      .map((e) => ({ name: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30), b: e.getBoundingClientRect() }))
      .filter((r) => r.b.width < 43.5 || r.b.height < 43.5)
      .map((r) => `${r.name} ${Math.round(r.b.width)}×${Math.round(r.b.height)}`),
  );
}

test('first visit: purpose line and welcome card; the tour opens Learn step 1', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Compare Moon landing sites and dates by when the Sun (power) and Earth (radio contact) are above the real horizon.')).toBeVisible();
  const card = page.getByTestId('welcome');
  await expect(card).toBeVisible();
  await expect(page.getByRole('article', { name: 'Scenario B' })).toBeVisible(); // the demo pair is loaded behind it
  await page.getByRole('button', { name: 'Take the 60-second tour' }).click();
  await expect(page.getByTestId('story-count')).toHaveText('1 / 7');
  await expect(page.getByRole('tab', { name: 'Learn' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Exit tour' }).click();
  await page.goto('/');
  await expect(page.getByRole('article', { name: 'Scenario A' })).toBeVisible();
  await expect(card).toHaveCount(0); // closed once: it does not come back
});

test('Explore on my own closes the card; a shared link never shows it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore on my own' }).click();
  await expect(page.getByTestId('welcome')).toHaveCount(0);
  await expect(page.locator('.pano__view')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Forward 1 hour' }).click(); // the initial state keeps a clean URL
  await expect.poll(() => page.url()).toMatch(/#s=/); // the fragment now carries the state (F16)
  const shared = page.url();
  await page.evaluate(() => localStorage.clear());
  await page.goto('about:blank');
  await page.goto(shared);
  await expect(page.getByRole('article', { name: 'Scenario A' })).toBeVisible();
  await expect(page.getByTestId('welcome')).toHaveCount(0);
});

test('red flags and target sizes along the demo flow (14 §2, §8)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Take the 60-second tour' }).click();
  for (let step = 1; step <= 7; step++) {
    await expect(page.getByTestId('story-count')).toHaveText(`${step} / 7`);
    await page.waitForTimeout(400);
    expect(await redFlags(page), `step ${step}`).toEqual([]);
    expect(await smallButtons(page), `step ${step}`).toEqual([]);
    if (step < 7) await page.getByRole('button', { name: 'Next' }).click();
  }
  await page.getByRole('button', { name: 'Try it yourself' }).click();
  await expect(page.getByRole('tab', { name: 'Explore' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.pano__view')).toBeVisible({ timeout: 20_000 });
  expect(await redFlags(page)).toEqual([]);
  expect(await smallButtons(page)).toEqual([]);
  // One filled primary action on the Explore screen: Play.
  await expect(page.locator('.btn--primary:visible')).toHaveCount(1);
  await expect(page.locator('.btn--primary:visible')).toHaveText(/Play|Pause/);
});

test('Validation has Back to the app', async ({ page }) => {
  await page.goto('/#/validation');
  await expect(page.getByTestId('welcome')).toHaveCount(0);
  await page.getByRole('link', { name: /Back to the app/ }).click();
  await expect(page.locator('.app__body')).toBeVisible();
});
