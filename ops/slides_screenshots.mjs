// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Screenshots for the presentation slides, taken from the published app (T-94).
// Not part of `make test-all`: it reads the live site and never fails the build.
//
//   node ops/slides_screenshots.mjs [--url https://aeroinformagicos-llsn.pages.dev] [--out docs/handoff/T-94/slides]
//
// Uses the Microsoft Edge or Google Chrome installed on the machine when there is one, otherwise Playwright's
// Chromium (`cd web && npx playwright install chromium`). Each shot is independent: if one step fails (a button
// renamed after a merge, a slow network) it is reported and the script goes on with the next one.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'web', 'package.json'));
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = opt('url', 'https://aeroinformagicos-llsn.pages.dev').replace(/\/$/, '');
const OUT = resolve(ROOT, opt('out', 'docs/handoff/T-94/slides'));
const DESKTOP = { width: 1920, height: 1080 };
const PHONE = { width: 390, height: 844 };

async function launch() {
  const launchArgs = ['--enable-unsafe-swiftshader'];
  for (const channel of ['msedge', 'chrome', undefined]) {
    try {
      return await chromium.launch({ channel, args: launchArgs });
    } catch {
      // try the next browser
    }
  }
  throw new Error('No browser found: install Edge or Chrome, or run `cd web && npx playwright install chromium`.');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Opens the app at `path`, closes the welcome card and waits for the scene to settle. */
async function openApp(browser, path = '/', viewport = DESKTOP, extra = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, ...extra });
  const page = await context.newPage();
  await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 90_000 });
  const explore = page.getByRole('button', { name: /Explore on my own/ });
  if (await explore.count()) await explore.first().click();
  await sleep(4000);
  return page;
}

const button = (page, name) => page.getByRole('button', { name }).first();
const tab = (page, name) => page.getByRole('tab', { name }).first();

const shots = [
  ['01-entry-3d', async (b) => openApp(b)],
  ['02-entry-2d', async (b) => {
    const page = await openApp(b);
    await page.getByRole('radio', { name: '2D' }).click();
    await sleep(2500);
    return page;
  }],
  ['03-learn-step2-pair', async (b) => {
    const page = await openApp(b);
    await tab(page, /^Learn$/).click();
    await sleep(3000);
    await button(page, /^Next$/).click();
    await sleep(4000);
    return page;
  }],
  ['04-terrain-profile-site-B', async (b) => {
    const page = await openApp(b);
    await button(page, /^B · /).click();
    await sleep(2000);
    await tab(page, /^Terrain profile$/i).click();
    await sleep(3000);
    const earth = button(page, /^Toward Earth$/);
    if (await earth.count()) {
      await earth.click();
      await sleep(2500);
    }
    return page;
  }],
  ['05-replan', async (b) => {
    const page = await openApp(b);
    await tab(page, /^Plan$/).click();
    await sleep(2500);
    await tab(page, /^Replan$/i).click();
    await sleep(6000);
    return page;
  }],
  ['06-map-sun-earth', async (b) => {
    const page = await openApp(b);
    await tab(page, /^Map$/i).click();
    await sleep(8000);
    await button(page, /^Sun \+ Earth$/).click();
    await sleep(6000);
    return page;
  }],
  ['07-find-best-site', async (b) => {
    const page = await openApp(b);
    await tab(page, /^Map$/i).click();
    await sleep(8000);
    await button(page, /^Find the best site$/).click();
    await sleep(2000);
    const search = button(page, /^Search$/);
    if (await search.count()) {
      await search.click();
      const result = page.getByText(/^Best:|No point in the selected area/).first();
      await result.waitFor({ timeout: 60_000 }).catch(() => {});
      await result.scrollIntoViewIfNeeded().catch(() => {});
      await sleep(1500);
    }
    return page;
  }],
  ['08-validation', async (b) => {
    const page = await openApp(b);
    await page.getByRole('link', { name: /^Validation$/ }).first().click();
    await sleep(5000);
    return page;
  }],
  ['09-phone-390x844', async (b) => openApp(b, '/', PHONE, { deviceScaleFactor: 2, isMobile: true, hasTouch: true })],
];

const browser = await launch();
mkdirSync(OUT, { recursive: true });
console.log(`Browser ${browser.version()} · ${BASE} → ${OUT}`);
let failed = 0;
for (const [name, take] of shots) {
  let page;
  try {
    page = await take(browser);
    await page.screenshot({ path: join(OUT, `${name}.png`) });
    console.log(`  ok   ${name}.png`);
  } catch (err) {
    failed += 1;
    console.log(`  FAIL ${name}: ${String(err.message).split('\n')[0]}`);
  } finally {
    if (page) await page.context().close();
  }
}
await browser.close();
console.log(failed ? `${failed} of ${shots.length} screenshots failed.` : `All ${shots.length} screenshots taken.`);
process.exitCode = failed ? 1 : 0;
