// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-20 end to end (10_interfaz.md §3.2, §12, §14; case B9, automatic part): mobile profile
// 390 × 844 without horizontal scroll, 44 × 44 px targets, keyboard-only walk through the five
// regions, chart descriptions, hidden data tables, text sizes and 200 % zoom.
import { expect, test, type Page } from '@playwright/test';

const VIEW_TABS = ['Panorama', 'Timeline', 'Map', 'Terrain profile'];

async function open(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('article', { name: 'Scenario A' })).toBeVisible();
  await expect(page.getByTestId('status-chip')).toBeVisible({ timeout: 20_000 });
}

async function openTab(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click();
  await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#main-view .data-state--loading')).toHaveCount(0, { timeout: 20_000 });
}

/** Horizontal page scroll in CSS pixels (0 when the page fits). */
function horizontalScroll(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** Visible controls smaller than 44 × 44 px; a checkbox counts with its label (10 §12). */
function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, a[href], input, select, [role="tab"]')]
      .filter((e) => e.getClientRects().length > 0 && !e.closest('.visually-hidden'))
      .map((e) => {
        const hit = (e as HTMLInputElement).type === 'checkbox' ? (e.closest('label') ?? e) : e;
        const b = hit.getBoundingClientRect();
        return { name: (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 30), w: b.width, h: b.height };
      })
      .filter((r) => r.w < 43.5 || r.h < 43.5)
      .map((r) => `${r.name} ${Math.round(r.w)}×${Math.round(r.h)}`),
  );
}

test.describe('mobile profile 390 × 844 (10 §3.2)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('Explore: every tab without horizontal scroll and with 44 px targets', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('link', { name: 'Moon Site Navigator' })).toBeVisible();
    for (const name of VIEW_TABS) {
      await openTab(page, name);
      expect(await horizontalScroll(page), name).toBe(0);
      expect(await smallTargets(page), name).toEqual([]);
    }
    // The scenario cards scroll sideways inside their own row, not the page.
    const row = await page.locator('.scenario-list').evaluate((e) => getComputedStyle(e).overflowX);
    expect(row).toBe('auto');
  });

  test('layout: view 55 % high, figures in three columns, time bar fixed and not covering the page', async ({ page }) => {
    await open(page);
    const view = await page.locator('#main-view').boundingBox();
    expect(view!.width).toBeGreaterThan(390 - 2 * 16 - 1); // full width inside the 16 px gutters
    expect(view!.height).toBeGreaterThanOrEqual(0.55 * 844 - 1);
    const tops = await page.locator('.figure').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(tops).toHaveLength(3);
    expect(new Set(tops).size).toBe(1);
    // Panel below the view, plain summary below the figures.
    const panel = await page.locator('.app__right').boundingBox();
    expect(panel!.y).toBeGreaterThan(view!.y + view!.height - 1);
    await expect(page.locator('#plain-summary')).toBeVisible();

    const bar = page.locator('.time-controls');
    await expect(bar).toHaveCSS('position', 'fixed');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const barTop = (await bar.boundingBox())!.y;
    expect(barTop + (await bar.boundingBox())!.height).toBeLessThanOrEqual(844 + 1);
    const footerBottom = await page.locator('.app__footer').evaluate((e) => e.getBoundingClientRect().bottom);
    expect(footerBottom).toBeLessThanOrEqual(barTop + 1);
  });

  test('Learn: the story without horizontal scroll', async ({ page }) => {
    await open(page);
    await page.getByRole('tab', { name: 'Learn', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();
    expect(await horizontalScroll(page)).toBe(0);
    expect(await smallTargets(page)).toEqual([]);
  });
});

test.describe('desktop 1280 × 720', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('keyboard only: header → scenarios → tabs → view → panel, visible focus, change tab and move the cursor', async ({ page }) => {
    await open(page);
    await page.locator('body').focus();
    const regions: string[] = [];
    const noOutline: string[] = [];
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press('Tab');
      const r = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const s = getComputedStyle(el);
        const region = el.closest('.app__header')
          ? 'header'
          : el.closest('.app__left')
            ? 'scenarios'
            : el.closest('.tabs')
              ? 'tabs'
              : el.closest('#main-view')
                ? 'view'
                : el.closest('.app__right')
                  ? 'panel'
                  : 'other';
        return { region, outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`, el: el.outerHTML.slice(0, 80) };
      });
      if (!r) continue;
      if (regions.at(-1) !== r.region) regions.push(r.region);
      if (r.region !== 'other' && r.outline !== 'solid 2px rgb(240, 228, 66)') noOutline.push(`${r.el} → ${r.outline}`);
      if (r.region === 'panel') break;
    }
    expect(regions.filter((x) => x !== 'other')).toEqual(['header', 'scenarios', 'tabs', 'view', 'panel']);
    expect(noOutline).toEqual([]); // 2 px #F0E442 (10 §12)

    // Only the keyboard: reach the selected tab, → selects Timeline, Tab enters it, → moves the cursor.
    await page.locator('body').focus();
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(() => document.activeElement?.getAttribute('role') === 'tab' && !!document.activeElement.closest('.tabs'))) break;
    }
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: 'Timeline' })).toBeFocused();
    const before = await page.locator('.time-controls__readout').textContent();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('slider', { name: /Timeline of Sun and Earth elevation/ })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.time-controls__readout')).not.toHaveText(before ?? '');
    await expect(page.locator('.time-controls__readout')).toContainText('Day 0, 00:10');
  });

  test('screen readers: every chart is described by the plain summary and the hidden data tables', async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
    for (const name of VIEW_TABS) {
      await openTab(page, name);
      const charts = await page.evaluate(() =>
        [...document.querySelectorAll('#main-view [role="img"], #main-view [role="slider"]')]
          .filter((e) => !e.closest('[aria-hidden="true"]'))
          .map((e) => ({
            label: e.getAttribute('aria-label') ?? '',
            ids: (e.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean),
          })),
      );
      const main = charts.filter((c) => c.label && !c.label.startsWith('360°')); // the strip is a control
      expect(main.length, name).toBeGreaterThan(0);
      for (const c of main) {
        expect(c.ids, `${name}: ${c.label}`).toEqual(expect.arrayContaining(['plain-summary', 'chart-data']));
        for (const id of c.ids) await expect(page.locator(`[id="${id}"]`), `${name}: #${id}`).toHaveCount(1);
      }
    }
    const data = page.locator('#chart-data');
    await expect(data).toHaveClass(/visually-hidden/);
    await expect(data.locator('table')).toHaveCount(2);
    await expect(data.locator('caption')).toHaveCount(2);
    await expect(data.getByRole('columnheader', { name: 'Time (UTC)' })).toHaveCount(1);
    expect(await data.locator('tbody tr').count()).toBeGreaterThan(0);
  });

  test('names, ids, text size and live region', async ({ page }) => {
    await open(page);
    for (const name of VIEW_TABS) {
      await openTab(page, name);
      const issues = await page.evaluate(() => {
        const out: string[] = [];
        for (const e of document.querySelectorAll<HTMLElement>('button, a[href], input, select, [role="tab"], [role="slider"]')) {
          const named =
            e.getAttribute('aria-label') ||
            e.getAttribute('aria-labelledby') ||
            e.textContent?.trim() ||
            (e as HTMLInputElement).labels?.length ||
            e.getAttribute('title');
          if (!named) out.push(`no name: ${e.outerHTML.slice(0, 60)}`);
        }
        const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
        for (const id of new Set(ids.filter((x, i) => ids.indexOf(x) !== i))) out.push(`duplicate id: ${id}`);
        for (const e of document.querySelectorAll<HTMLElement>('body *')) {
          if (e.closest('.visually-hidden, [aria-hidden="true"], svg')) continue;
          const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
          if (own && parseFloat(getComputedStyle(e).fontSize) < 12) out.push(`text below 12 px: ${e.className}`);
        }
        return out;
      });
      expect(issues, name).toEqual([]);
    }
    // Countdowns are announced politely from one hidden region; the readouts do not chatter.
    await expect(page.locator('.app__right [aria-live="polite"]')).toHaveCount(1);
    await expect(page.locator('.time-controls__readout')).toHaveAttribute('aria-live', 'off');
  });
});

test.describe('zoom 200 % and tablet width', () => {
  // A 1280 × 720 screen at 200 % zoom lays out as 640 × 360 CSS pixels.
  for (const vp of [
    { width: 640, height: 360 },
    { width: 800, height: 1000 },
  ]) {
    test(`${vp.width} × ${vp.height}: no horizontal scroll in any tab`, async ({ page }) => {
      await page.setViewportSize(vp);
      await open(page);
      for (const name of VIEW_TABS) {
        await openTab(page, name);
        expect(await horizontalScroll(page), name).toBe(0);
      }
    });
  }
});
