// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Case B1 (11_validacion.md; 07_visibilidad.md §12.5; T-37): five scenarios in the interface, cursor
// at landing + 1 d, observer at 2 m. What the screen shows (elevations, margins, % of disc, hours,
// longest night, next events) must match the Python reference: the `metrics` block of
// `tests/golden/core_vectors.json` (written by T-26), within `B1_deg` and `B1_min` of
// `tests/golden/tolerances.json`.
//
// The screen rounds (07 §12.6): a figure passes when the interval of values that print as it overlaps
// the reference ± tolerance. Degrees print with 2 decimals, so the half step (0.005°) is already
// inside 0.01°; hours print with 1 decimal (or whole hours from 100 h) and percentages as integers,
// so their half step is added to the tolerance. A time percentage gets the tolerance of its hours
// (B1_min over the mission length); the disc percentage gets the fraction tolerance of §12.4 (10⁻⁶).
//
// Fields read from each `metrics` case (names of 07 §7; layout proposed in decision D-90):
//   site_id, observer_height_m, landing_unix, mission_days, cursor_unix,
//   sun_el_deg, sun_margin_deg, sun_disc_pct, earth_el_deg, earth_margin_deg,
//   sun_hours, sun_pct, earth_hours, earth_pct, longest_night_h,
//   next_sun_event, next_earth_event: { kind, t_unix } with t_unix null if none in 60 days.
// Without the file or its `metrics` block every test is skipped; with the block, a scenario that is
// not in it fails. `LLSN_CORE_VECTORS` points at another file (a candidate before A1 approves it).
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const DAY = 86_400;
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const VECTORS = process.env.LLSN_CORE_VECTORS ?? `${ROOT}tests/golden/core_vectors.json`;
const tolerances = JSON.parse(readFileSync(`${ROOT}tests/golden/tolerances.json`, 'utf8')) as Record<string, number>;
const TOL_DEG = tolerances.B1_deg;
const TOL_S = tolerances.B1_min * 60;
/** Fraction tolerance of 07 §12.4, as a percentage. */
const TOL_DISC_PCT = 1e-6 * 100;

interface NextEvent {
  kind: string;
  t_unix: number | null;
}
interface MetricsCase {
  site_id: string;
  observer_height_m: number;
  landing_unix: number;
  mission_days: number;
  cursor_unix: number;
  sun_el_deg: number;
  sun_margin_deg: number;
  sun_disc_pct: number;
  earth_el_deg: number;
  earth_margin_deg: number;
  sun_hours: number;
  sun_pct: number;
  earth_hours: number;
  earth_pct: number;
  longest_night_h: number;
  next_sun_event: NextEvent;
  next_earth_event: NextEvent;
}
const FIELDS: (keyof MetricsCase)[] = [
  'sun_el_deg', 'sun_margin_deg', 'sun_disc_pct', 'earth_el_deg', 'earth_margin_deg', 'sun_hours', 'sun_pct',
  'earth_hours', 'earth_pct', 'longest_night_h', 'next_sun_event', 'next_earth_event',
];

const metricsBlock: MetricsCase[] | null = (() => {
  if (!existsSync(VECTORS)) return null;
  const block = (JSON.parse(readFileSync(VECTORS, 'utf8')) as Record<string, unknown>).metrics;
  return Array.isArray(block) ? (block as MetricsCase[]) : null;
})();

/** The five scenarios of B1; the fifth is the initial scenario of the demo (scenario A, sites.json defaults). */
const SCENARIOS: { name: string; site?: string; landing?: string; days?: number }[] = [
  { name: '(1) Blue Ghost 1', site: 'blue-ghost-1', landing: '2025-03-02T08:34:00Z', days: 14 },
  { name: '(2) IM-2', site: 'im-2', landing: '2025-03-06T17:30:00Z', days: 10 },
  { name: '(3) Malapert Massif', site: 'region-malapert-massif', landing: '2027-08-01T00:00:00Z', days: 14 },
  { name: '(4) Apollo 11', site: 'apollo-11', landing: '1969-07-20T20:00:00Z', days: 3 },
  { name: '(5) initial demo scenario' },
];

// ---- Reading the screen (formats of 07 §12.6 and 10 §6.6) ----------------------------------

function num(text: string): number {
  return Number(text.replace('−', '-'));
}

function match(text: string, re: RegExp): RegExpExecArray {
  const m = re.exec(text);
  if (!m) throw new Error(`"${text}" does not match ${re}`);
  return m;
}

function expectDeg(text: string, re: RegExp, expected: number, what: string) {
  const shown = num(match(text, re)[1]);
  expect(Math.abs(shown - expected), `${what}: shown ${text}, reference ${expected}`).toBeLessThanOrEqual(TOL_DEG + 1e-9);
}

/** `123.4 h` (step 0.1 h) or `355 h` (step 1 h, from 100 h). */
function expectHours(text: string, expected: number, what: string) {
  const v = match(text, /^(\d+(?:\.\d)?) h$/)[1];
  const half = v.includes('.') ? 0.05 : 0.5;
  expect(Math.abs(num(v) - expected), `${what}: shown ${text}, reference ${expected} h`).toBeLessThanOrEqual(half + TOL_S / 3600 + 1e-9);
}

/** `45 %`, `<1 %` (0 < v < 0.5) or `>99 %` (99.5 ≤ v < 100). */
function expectPct(text: string, expected: number, tol: number, what: string) {
  const [lo, hi] = text === '<1 %' ? [0, 0.5] : text === '>99 %' ? [99.5, 100] : ((v) => [v - 0.5, v + 0.5])(num(match(text, /^(\d+) %$/)[1]));
  const ok = expected + tol >= lo && expected - tol <= hi && (text !== '<1 %' || expected + tol > 0) && (text !== '>99 %' || expected - tol < 100);
  expect(ok, `${what}: shown ${text}, reference ${expected} %`).toBe(true);
}

const WORD: Record<string, string> = { sunrise: 'Sunrise', sunset: 'Sunset', earthrise: 'Earthrise', earthset: 'Earthset' };

/** `Sunset in 4d 12h 52m`, `Sunset in 05m 10s` or `No sunset in the next 60 days` (07 §7). */
function expectCountdown(text: string, expected: NextEvent, cursor: number, what: string) {
  const word = WORD[expected.kind];
  if (expected.t_unix === null) {
    expect(text, what).toBe(`No ${word.charAt(0).toLowerCase()}${word.slice(1)} in the next 60 days`);
    return;
  }
  const m = match(text, /^(\w+) in (?:(\d+)d (\d\d)h (\d\d)m|(\d\d)m (\d\d)s)$/);
  expect(m[1], `${what}: kind`).toBe(word);
  // The panel rounds to the second and then drops the seconds (≥ 1 h): the true wait lies in [lo, hi].
  const [lo, hi] = m[2] !== undefined
    ? ((min) => [min * 60 - 0.5, min * 60 + 59.5])(num(m[2]) * 1440 + num(m[3]) * 60 + num(m[4]))
    : ((s) => [s - 0.5, s + 0.5])(num(m[5]) * 60 + num(m[6]));
  const wait = expected.t_unix - cursor;
  expect(wait >= lo - TOL_S && wait <= hi + TOL_S, `${what}: shown ${text}, reference in ${wait} s`).toBe(true);
}

// ---- The test -------------------------------------------------------------------------------

function linkOf(site: string, landing: number, days: number, cursor: number): string {
  const state = { v: 1, m: 'explore', t: 'panorama', f: 'sun', c: cursor, sc: [{ s: site, l: landing, d: days, h: 2 }] };
  return `/#s=${Buffer.from(JSON.stringify(state), 'utf8').toString('base64url')}`;
}

async function text(page: Page, locator: ReturnType<Page['locator']>): Promise<string> {
  await expect(locator).toBeVisible({ timeout: 30_000 });
  // One line: the v2 keeps the share of a figure in a visually hidden span, which innerText puts on its own line.
  return (await locator.innerText()).replace(/\s+/g, ' ').trim();
}

test.describe('B1: panel figures equal the Python reference', () => {
  test.skip(metricsBlock === null, `no "metrics" block in ${VECTORS} yet (T-26 writes it)`);

  for (const sc of SCENARIOS) {
    for (const ui of ['v1', 'v2'] as const) {
      test(`B1 ${sc.name}, cursor at landing + 1 d (${ui})`, async ({ page, request }) => {
        const manifest = await (await request.get('/data/manifest.json')).json();
        test.skip(manifest.ephemeris.synthetic, 'B1 needs the real ephemeris table');
        const sites = await (await request.get('/data/sites.json')).json();
        const site = sc.site ?? (sites.defaults.demo_pair[0] as string);
        const landing = Date.parse(sc.landing ?? sites.defaults.demo_landing_utc) / 1000;
        const days = sc.days ?? (sites.defaults.demo_mission_days as number);
        const cursor = landing + DAY;
        const info = sites.sites.find((s: { id: string }) => s.id === site);
        expect(info, `${site} in sites.json`).toBeTruthy();

        const ref = metricsBlock!.find(
          (c) => c.site_id === site && c.landing_unix === landing && c.mission_days === days && c.cursor_unix === cursor && (c.observer_height_m ?? 2) === 2,
        );
        expect(ref, `metrics block has no case for ${site}, landing ${landing}, ${days} d, cursor ${cursor}, 2 m`).toBeTruthy();
        const missing = FIELDS.filter((f) => ref![f] === undefined);
        expect(missing, `fields missing in the metrics case of ${site}`).toEqual([]);
        const where = `${sc.name} (${ui})`;

        const link = linkOf(site, landing, days, cursor);
        if (ui === 'v1') {
          await page.goto(link.replace('/#', '/?ui=v1#'));
          await expect(page.getByRole('article', { name: 'Scenario A' })).toContainText(info.short_name);
          const now = page.getByRole('region', { name: 'Now' });
          expectDeg(await text(page, now.getByText(/^Sun elevation /)), /^Sun elevation ([−-]?\d+\.\d\d)°$/, ref!.sun_el_deg, `${where} Sun elevation`);
          expectPct(match(await text(page, now.getByText(/^Solar disc visible /)), /^Solar disc visible (.+)$/)[1], ref!.sun_disc_pct, TOL_DISC_PCT, `${where} disc`);
          const earth = await text(page, now.getByText(/^Earth elevation /));
          expectDeg(earth, /^Earth elevation ([−-]?\d+\.\d\d)° /, ref!.earth_el_deg, `${where} Earth elevation`);
          expectDeg(earth, /\(margin ([+−-]\d+\.\d\d)°\)$/, ref!.earth_margin_deg, `${where} Earth margin`);
          // The Sun's margin is in the panorama readout, with the focus on the Sun.
          expectDeg(await text(page, page.getByTestId('margin')), /^Margin: ([+−-]\d+\.\d\d)°$/, ref!.sun_margin_deg, `${where} Sun margin`);
        } else {
          // v2 (15_interfaz_v2.md): the 2D stage, the pills and the Now at site panel.
          await page.goto(link.replace('/#', '/?ui=v2&vm=2d#'));
          await expect(page.getByRole('group', { name: 'Scenarios' })).toContainText(`A · ${info.short_name}`);
          const row = (label: string) => page.locator('.v2-dl__row', { has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('dd');
          expectDeg(await text(page, row('Sun elevation')), /^([−-]?\d+\.\d\d)°$/, ref!.sun_el_deg, `${where} Sun elevation`);
          expectPct(await text(page, row('Solar disc visible')), ref!.sun_disc_pct, TOL_DISC_PCT, `${where} disc`);
          const earth = (await text(page, row('Earth elevation'))).replace(/\s+/g, ' ');
          expectDeg(earth, /^([−-]?\d+\.\d\d)°/, ref!.earth_el_deg, `${where} Earth elevation`);
          expectDeg(earth, /margin ([+−-]\d+\.\d\d)°$/, ref!.earth_margin_deg, `${where} Earth margin`);
        }

        const tolPct = (TOL_S / 3600 / (days * 24)) * 100;
        const [sunH, sunP] = (await text(page, page.locator('.figure--sunlight .figure__value'))).split(' · ');
        expectHours(sunH, ref!.sun_hours, `${where} sun hours`);
        expectPct(sunP, ref!.sun_pct, tolPct, `${where} sun %`);
        const [earthH, earthP] = (await text(page, page.locator('.figure--earth_link .figure__value'))).split(' · ');
        expectHours(earthH, ref!.earth_hours, `${where} Earth hours`);
        expectPct(earthP, ref!.earth_pct, tolPct, `${where} Earth %`);
        expectHours(await text(page, page.locator('.figure--longest_night .figure__value')), ref!.longest_night_h, `${where} longest night`);

        expectCountdown(await text(page, page.getByTestId('sun-countdown')), ref!.next_sun_event, cursor, `${where} next Sun event`);
        expectCountdown(await text(page, page.getByTestId('earth-countdown')), ref!.next_earth_event, cursor, `${where} next Earth event`);

        if (ui === 'v2') {
          // The Sun's margin is in Horizon detail (focus on the Sun); opening it folds the telemetry.
          await page.getByRole('button', { name: 'Horizon detail' }).click();
          expectDeg((await text(page, page.getByTestId('margin'))).replace(/\s+/g, ' '), /([+−-]\d+\.\d\d)°$/, ref!.sun_margin_deg, `${where} Sun margin`);
        }
      });
    }
  }
});
