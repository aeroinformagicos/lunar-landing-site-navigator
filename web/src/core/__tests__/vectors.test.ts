// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Shared Python → TypeScript vectors (07_visibilidad.md §12). Reads tests/golden/core_vectors.json
// (written by `python -m pipeline.cli core-vectors`) and runs each block that exists; the rest are
// skipped. Tolerances of §12.4. Expected layout (proposed in docs/handoff/T-13.md, snake_case):
//
//   { "sky":           [{ lat_deg, lon_deg, height_m, t_unix, sun: {az_deg, el_deg, range_km, radius_deg}, earth: {…} }],
//     "horizon_at":    [{ mask, az_deg, el_deg }],
//     "disc_fraction": [{ mask, az_c, el_c, rho, fraction }],
//     "evaluate":      [{ site_id, t_unix, observer_height_m, sun: {…, horizon_deg, margin_deg, visible,
//                         disc_fraction, lit_fraction}, earth: {…}, both }],
//     "events":        [{ site_id, observer_height_m, t_a, t_b, events: [{ t_unix, kind }] }],
//     "metrics":       [{ site_id, observer_height_m, landing_unix, mission_days, cursor_unix,
//                         sun_hours, earth_hours, both_hours, longest_night_h, longest_link_gap_h,
//                         sun_el_max_deg, sun_el_min_deg }],
//     "assess":        [{ site_id, observer_height_m, landing_unix, mission_days, requirements?: {need_sun_at_landing,
//                         need_earth_at_landing, max_night_hours, marginal_earth_margin_deg, marginal_sun_fraction},
//                         status, reasons }],
//     "replan_row":    [{ site_id, observer_height_m, t0, delta_s, mission_days, statuses: [31 × status | null] }],
//     "rank":          [{ landing_unix, mission_days, site_ids: [ordered, replan_candidate sites] }] }
//
// `mask` is a formula id (`flat:0`, `tilt:0.3`, `sine:1,3`…) or a published site id.
import { describe, expect, it } from 'vitest';
import { findEvents } from '../events';
import { siteFrame, skyAt } from '../frames';
import { formulaMask, horizonAt, maskFromFile, smoothMask, type Mask } from '../horizon';
import { missionMetrics } from '../metrics';
import { rankCandidates } from '../ranking';
import { assess, replanRow, type Requirements } from '../requirements';
import type { HorizonFile, SitesFile } from '../types';
import { discFraction, evaluate, frameFor } from '../visibility';
import { realTable, repoFile } from './fixtures';

const TOL_DEG = 1e-6;
const TOL_FRAC = 1e-6;
const TOL_KM = 1e-3;
const TOL_S = 1;
const TOL_H = 0.001;

const DEFAULT_REQ: Requirements = { needSunAtLanding: true, needEarthAtLanding: true, maxNightHours: 24, marginalEarthMarginDeg: 1, marginalSunFraction: 1 };

function reqOf(r: unknown): Requirements {
  const x = r as Record<string, number | boolean> | undefined;
  if (!x) return DEFAULT_REQ;
  return {
    needSunAtLanding: x.need_sun_at_landing as boolean,
    needEarthAtLanding: x.need_earth_at_landing as boolean,
    maxNightHours: x.max_night_hours as number,
    marginalEarthMarginDeg: x.marginal_earth_margin_deg as number,
    marginalSunFraction: x.marginal_sun_fraction as number,
  };
}

type Case = Record<string, unknown>;

const raw = repoFile('tests/golden/core_vectors.json');
const vectors: Record<string, Case[]> = raw ? JSON.parse(new TextDecoder().decode(raw)) : {};
const table = realTable();

function json<T>(path: string): T {
  return JSON.parse(new TextDecoder().decode(repoFile(path)!)) as T;
}

const sites = raw && table ? json<SitesFile>('web/public/data/sites.json').sites : [];

function siteOf(id: string) {
  const s = sites.find((x) => x.id === id);
  if (!s) throw new Error(`Site ${id} not in sites.json`);
  return s;
}

function maskOf(id: string, observerHeightM = 2): Mask {
  if (/^(flat|tilt|sine):/.test(id)) return formulaMask(id);
  const site = siteOf(id);
  if (site.relief === 'smooth' || !site.has_mask) return smoothMask(observerHeightM, site.lat_deg, site.lon_deg);
  return maskFromFile(json<HorizonFile>(`web/public/data/horizon/${id}.json`), observerHeightM)!;
}

const close = (a: number, b: number, tol: number, what: string) => expect(Math.abs(a - b), what).toBeLessThanOrEqual(tol);
const azDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

function block(name: string, needsTable: boolean, run: (c: Case, i: number) => void) {
  const cases = vectors[name];
  const ready = Array.isArray(cases) && (!needsTable || table !== null);
  it.skipIf(!ready)(`${name} (${ready ? cases.length : 0} cases)`, () => cases.forEach(run));
}

describe('core_vectors.json (07 §12)', () => {
  block('horizon_at', false, (c, i) => {
    close(horizonAt(maskOf(c.mask as string).elDeg, c.az_deg as number), c.el_deg as number, TOL_DEG, `#${i}`);
  });

  block('disc_fraction', false, (c, i) => {
    const f = discFraction(maskOf(c.mask as string), c.az_c as number, c.el_c as number, c.rho as number);
    close(f, c.fraction as number, TOL_FRAC, `#${i}`);
  });

  block('sky', true, (c, i) => {
    const s = skyAt(table!, siteFrame(c.lat_deg as number, c.lon_deg as number, c.height_m as number), c.t_unix as number);
    for (const body of ['sun', 'earth'] as const) {
      const e = c[body] as Record<string, number>;
      expect(azDiff(s[body].azDeg, e.az_deg), `#${i} ${body} az`).toBeLessThanOrEqual(TOL_DEG);
      close(s[body].elDeg, e.el_deg, TOL_DEG, `#${i} ${body} el`);
      close(s[body].rangeKm, e.range_km, TOL_KM, `#${i} ${body} range`);
      close(s[body].radiusDeg, e.radius_deg, TOL_DEG, `#${i} ${body} radius`);
    }
  });

  block('evaluate', true, (c, i) => {
    const site = siteOf(c.site_id as string);
    const mask = maskOf(site.id, c.observer_height_m as number);
    const s = evaluate(table!, frameFor(site.lat_deg, site.lon_deg, mask), mask, c.t_unix as number);
    for (const body of ['sun', 'earth'] as const) {
      const e = c[body] as Record<string, number | boolean>;
      close(s[body].horizonDeg, e.horizon_deg as number, TOL_DEG, `#${i} ${body} horizon`);
      close(s[body].marginDeg, e.margin_deg as number, TOL_DEG, `#${i} ${body} margin`);
      expect(s[body].visible, `#${i} ${body} visible`).toBe(e.visible);
    }
    const sun = c.sun as Record<string, number>;
    close(s.sun.discFraction, sun.disc_fraction, TOL_FRAC, `#${i} disc`);
    close(s.sun.litFraction, sun.lit_fraction, TOL_FRAC, `#${i} lit`);
    expect(s.both, `#${i} both`).toBe(c.both);
  });

  block('events', true, (c, i) => {
    const site = siteOf(c.site_id as string);
    const mask = maskOf(site.id, c.observer_height_m as number);
    const got = findEvents(table!, frameFor(site.lat_deg, site.lon_deg, mask), mask, c.t_a as number, c.t_b as number);
    const exp = c.events as { t_unix: number; kind: string }[];
    expect(got.map((e) => e.kind), `#${i}`).toEqual(exp.map((e) => e.kind));
    got.forEach((e, k) => close(e.tUnix, exp[k].t_unix, TOL_S, `#${i} event ${k}`));
  });

  block('metrics', true, (c, i) => {
    const site = siteOf(c.site_id as string);
    const mask = maskOf(site.id, c.observer_height_m as number);
    const m = missionMetrics(
      table!,
      frameFor(site.lat_deg, site.lon_deg, mask),
      mask,
      { landingUnix: c.landing_unix as number, missionDays: c.mission_days as number },
      c.cursor_unix as number,
    );
    close(m.sunHours, c.sun_hours as number, TOL_H, `#${i} sun_hours`);
    close(m.earthHours, c.earth_hours as number, TOL_H, `#${i} earth_hours`);
    close(m.bothHours, c.both_hours as number, TOL_H, `#${i} both_hours`);
    close(m.longestNightH, c.longest_night_h as number, TOL_H, `#${i} longest_night_h`);
    close(m.longestLinkGapH, c.longest_link_gap_h as number, TOL_H, `#${i} longest_link_gap_h`);
    close(m.sunElMaxDeg, c.sun_el_max_deg as number, TOL_DEG, `#${i} sun_el_max_deg`);
    close(m.sunElMinDeg, c.sun_el_min_deg as number, TOL_DEG, `#${i} sun_el_min_deg`);
  });

  /** Assessment of a site for a landing (07 §8.2): status and reasons identical. */
  function assessOf(siteId: string, h: number, landing: number, days: number, req: Requirements) {
    const site = siteOf(siteId);
    const mask = maskOf(site.id, h);
    const frame = frameFor(site.lat_deg, site.lon_deg, mask);
    const m = missionMetrics(table!, frame, mask, { landingUnix: landing, missionDays: days }, landing);
    return { a: assess(evaluate(table!, frame, mask, landing), m, req), m };
  }

  block('assess', true, (c, i) => {
    const { a } = assessOf(c.site_id as string, c.observer_height_m as number, c.landing_unix as number, c.mission_days as number, reqOf(c.requirements));
    expect(a.status, `#${i}`).toBe(c.status);
    expect(a.reasons, `#${i}`).toEqual(c.reasons);
  });

  block('replan_row', true, (c, i) => {
    const site = siteOf(c.site_id as string);
    const mask = maskOf(site.id, c.observer_height_m as number);
    const row = replanRow(table!, frameFor(site.lat_deg, site.lon_deg, mask), mask, c.t0 as number, c.delta_s as number, c.mission_days as number, DEFAULT_REQ);
    expect(row.map((x) => x.status), `#${i}`).toEqual(c.statuses);
  });

  block('rank', true, (c, i) => {
    const rows = sites
      .filter((s) => s.replan_candidate)
      .map((s) => {
        const { a, m } = assessOf(s.id, 2, c.landing_unix as number, c.mission_days as number, DEFAULT_REQ);
        return { siteId: s.id, name: s.short_name, assessment: a, sunPct: m.sunPct, earthPct: m.earthPct };
      });
    expect(rankCandidates(rows).map((r) => r.siteId), `#${i}`).toEqual(c.site_ids);
  });
});
