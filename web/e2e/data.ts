// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// What the end-to-end tests need to know about the data being served (example or real, T-21):
// the demo pair from `sites.json.defaults`, any site by id, the replan candidates, and a site with a
// mask but no profile if there is one. The tests read it instead of assuming the example data.
import type { APIRequestContext } from '@playwright/test';

export interface SiteRow {
  id: string;
  name: string;
  short_name: string;
  relief: string;
  relief_label: string;
  has_mask: boolean;
  has_profile: boolean;
  replan_candidate: boolean;
}

export interface SitesInfo {
  pair: [SiteRow, SiteRow];
  /** Demo landing of `sites.json.defaults` (Unix seconds), and a `YYYY-MM-DD HH:MM` formatter. */
  landingUnix: number;
  utc(unix: number): string;
  byId(id: string): SiteRow;
  candidates: SiteRow[];
  maskWithoutProfile: SiteRow | undefined;
}

export async function sitesInfo(request: APIRequestContext): Promise<SitesInfo> {
  const json = (await (await request.get('/data/sites.json')).json()) as { defaults: { demo_pair: [string, string]; demo_landing_utc: string }; sites: SiteRow[] };
  const byId = (id: string) => {
    const s = json.sites.find((x) => x.id === id);
    if (!s) throw new Error(`site ${id} not served`);
    return s;
  };
  return {
    pair: [byId(json.defaults.demo_pair[0]), byId(json.defaults.demo_pair[1])],
    landingUnix: Date.parse(json.defaults.demo_landing_utc) / 1000,
    utc,
    byId,
    candidates: json.sites.filter((s) => s.replan_candidate),
    maskWithoutProfile: json.sites.find((s) => s.relief !== 'smooth' && s.has_mask && !s.has_profile),
  };
}

/** `YYYY-MM-DD HH:MM` in UTC, as the interface prints dates (10 §7). */
export function utc(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(0, 16).replace('T', ' ');
}

export const HOUR = 3600;
export const DAY = 86_400;

/** Escape a site name for a RegExp. */
export function re(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
