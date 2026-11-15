// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-63 (15_interfaz_v2.md §8; 10_interfaz.md §12; 14_ux_malaga.md §6, §8, §9) on the v2, now the
// default: every control has a name, ids are unique, the keyboard reaches every zone in order with a
// skip link, 44 px targets on phones, no horizontal scroll at 200 % zoom, the red flags of 14 §8, and
// a single filled primary action on Explore.
import { expect, test, type Page } from '@playwright/test';

const RED_FLAGS = /\b(undefined|NaN|null|lorem|TODO)\b|\[object Object\]/;

async function openV2(page: Page) {
  await page.goto('/?vm=2d'); // the default interface is the v2 (T-63)
  await expect(page.locator('.v2')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.figure--sunlight .figure__value')).toBeVisible({ timeout: 20_000 });
}

test.use({ storageState: { cookies: [], origins: [{ origin: 'http://localhost:4173', localStorage: [{ name: 'llsn.welcome.closed', value: '1' }] }] } });

test('every control has an accessible name, ids are unique, html has a language', async ({ page }) => {
  await openV2(page);
  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, a[href], input, select, [role="tab"], [role="radio"], [role="slider"]')]
      .filter((e) => e.getClientRects().length > 0)
      .filter((e) => {
        const labelled = e.getAttribute('aria-labelledby')?.split(' ').some((id) => document.getElementById(id)?.textContent?.trim());
        const label = (e as HTMLInputElement).labels?.[0]?.textContent?.trim();
        return !(e.getAttribute('aria-label')?.trim() || labelled || label || e.textContent?.trim() || e.getAttribute('title'));
      })
      .map((e) => e.outerHTML.slice(0, 80)),
  );
  expect(unnamed).toEqual([]);
  const dupes = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
    return ids.filter((id, i) => ids.indexOf(id) !== i);
  });
  expect(dupes).toEqual([]);
  expect(await page.getAttribute('html', 'lang')).toBe('en');
  // Charts are images with a name.
  for (const img of await page.locator('svg[role="img"]').all()) expect(await img.getAttribute('aria-label')).toBeTruthy();
});

test('keyboard: skip link first, then brand, pills, mode, switch, panels, stage, time bar — focus always visible', async ({ page }) => {
  await openV2(page);
  await page.locator('body').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main view' })).toBeFocused();
  const seen: string[] = [];
  const hidden: string[] = [];
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      const visible = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2;
      return { name: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 120), visible };
    });
    if (!r) continue;
    seen.push(r.name);
    if (!r.visible) hidden.push(r.name);
  }
  const at = (re: RegExp) => seen.findIndex((s) => re.test(s));
  expect(at(/^Lunar Sightline/)).toBeGreaterThanOrEqual(0);
  expect(at(/^A · /)).toBeGreaterThan(at(/^Lunar Sightline/));
  expect(at(/^Explore$/)).toBeGreaterThan(at(/^A · /));
  expect(at(/^Play$/)).toBeGreaterThan(at(/^Explore$/));
  expect(hidden).toEqual([]);
});

test('red flags of 14 §8 and one filled primary action on Explore', async ({ page }) => {
  await openV2(page);
  const lines = (await page.locator('body').innerText()).split('\n').filter((l) => RED_FLAGS.test(l));
  expect(lines).toEqual([]);
  await expect(page.locator('.btn--primary:visible')).toHaveCount(1);
  await expect(page.locator('.btn--primary:visible')).toHaveAttribute('aria-label', /^(Play|Pause)$/);
});

test.describe('phone 390 × 844 (touch)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('every target at least 44 × 44 px; no horizontal scroll', async ({ page }) => {
    await openV2(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.v2 button, .v2 a[href], .v2 [role="tab"], .v2 [role="radio"], .v2 select')]
        .filter((e) => e.getClientRects().length > 0 && !e.closest('.visually-hidden') && !e.classList.contains('timeline__event') && !e.classList.contains('v2-skip'))
        .map((e) => ({ n: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30), b: e.getBoundingClientRect() }))
        .filter((r) => r.b.width < 43.5 || r.b.height < 43.5)
        .map((r) => `${r.n} ${Math.round(r.b.width)}×${Math.round(r.b.height)}`),
    );
    expect(small).toEqual([]);
  });
});

test.describe('200 % zoom of a 1280 × 720 screen (640 × 360 CSS px)', () => {
  test.use({ viewport: { width: 640, height: 360 } });
  test('no horizontal scroll; the time controls stay reachable', async ({ page }) => {
    await openV2(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeInViewport();
  });
});
