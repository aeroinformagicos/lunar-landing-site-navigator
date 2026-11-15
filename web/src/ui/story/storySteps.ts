// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Guided story (10_interfaz.md §11, F15): seven steps, each applying an exact application state built
// from `sites.json.defaults`, so the demo is reproducible and whoever presents only presses `Next`.
// Pure: `apply` returns the state; the overlay writes it to the store and runs the timed effects.
import { DEFAULT_OBSERVER_HEIGHT_M, R_MOON_KM } from '../../core/constants';
import { DAY_S, isoToUnix } from '../../core/time';
import type { Site, SiteDefaults } from '../../core/types';
import { DEFAULT_REQUIREMENTS, type AppState, type Scenario } from '../../state/store';

export const STORY_LENGTH = 7;
/** Step 4: the launch slips 12 days. */
export const SLIP_DAYS = 12;
/** Step 1 plays at 6 h/s for 4 s, then pauses. */
export const STEP1_PLAY_S = 4;
export const STEP1_SPEED = 21_600;

export interface StoryContext {
  defaults: SiteDefaults;
  sites: readonly Site[];
  /** The map view (T-29) and the heavy origin exist; otherwise step 6 uses its variant (§11). */
  hasMap: boolean;
  /** `{blockerDist}` of step 3, from the data (`41 km`); null while unknown. */
  blockerDistM: number | null;
}

/** What a step shows beyond the store: the route and the replanning view details. */
export interface StoryView {
  route: 'main' | 'validation';
  /** Step 4: reduced matrix (2 rows, 13 columns) with the active column animated to +12 d. */
  replan?: { compact: true; columnFrom: number; columnTo: number; highlightRank: boolean };
  /** Step 1: play for this many seconds, then pause (skipped with reduced motion). */
  playForS?: number;
}

export interface StoryStep {
  /** Seconds of the 60 s script (§11). */
  seconds: [number, number];
  apply(ctx: StoryContext): Partial<AppState>;
  view(ctx: StoryContext): StoryView;
  text(ctx: StoryContext): string;
}

/** Great-circle distance between two sites, metres. */
export function siteDistanceM(a: { lat_deg: number; lon_deg: number }, b: { lat_deg: number; lon_deg: number }): number {
  const DEG = Math.PI / 180;
  const p1 = a.lat_deg * DEG;
  const p2 = b.lat_deg * DEG;
  const dp = p2 - p1;
  const dl = (b.lon_deg - a.lon_deg) * DEG;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R_MOON_KM * 1000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** `830 m` below 1 km (to 10 m), otherwise `41 km` (§11). */
export function storyDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${Math.round(m / 1000)} km`;
}

function landing(ctx: StoryContext): number {
  return isoToUnix(ctx.defaults.demo_landing_utc);
}

function pair(ctx: StoryContext, landingUnix = landing(ctx)): Scenario[] {
  const [a, b] = ctx.defaults.demo_pair;
  const base = { landingUnix, missionDays: ctx.defaults.demo_mission_days, observerHeightM: DEFAULT_OBSERVER_HEIGHT_M } as const;
  return [
    { id: 'A', siteRef: a, ...base },
    { id: 'B', siteRef: b, ...base },
  ];
}

/** State shared by every step: Learn mode, demo pair, default requirements, nothing playing. */
function base(ctx: StoryContext, step: number): Partial<AppState> {
  const t = landing(ctx);
  return {
    mode: 'learn',
    storyStep: step,
    scenarios: pair(ctx),
    activeScenarioId: 'A',
    cursorUnix: t,
    playing: false,
    playSpeed: STEP1_SPEED,
    tab: 'panorama',
    focusBody: 'sun',
    showSmooth: false,
    comparing: false,
    linkDates: true,
    requirements: { ...DEFAULT_REQUIREMENTS },
  };
}

const main = (): StoryView => ({ route: 'main' });

function siteById(ctx: StoryContext, id: string): Site | undefined {
  return ctx.sites.find((s) => s.id === id);
}

export const storySteps: StoryStep[] = [
  {
    seconds: [0, 8],
    apply: (ctx) => ({ ...base(ctx, 0), playing: true }),
    view: () => ({ route: 'main', playForS: STEP1_PLAY_S }),
    text: () =>
      "At the Moon's south pole the Sun never climbs more than a few degrees. Here it skims the horizon — and the terrain decides who gets light.",
  },
  {
    seconds: [8, 18],
    apply: (ctx) => ({ ...base(ctx, 1), comparing: true }),
    view: main,
    text: (ctx) => {
      const [a, b] = ctx.defaults.demo_pair.map((id) => siteById(ctx, id));
      const d = a && b ? storyDistance(siteDistanceM(a, b)) : 'a short distance';
      // True for any pair of D-108 (A ≥ 60 % of the mission with both, B ≤ 10 % and no_go); the former
      // «The other has neither» was false for the published pair: B has the Sun at landing (T-92).
      return `These two sites are ${d} apart. At one, the Sun (power) and the Earth (radio link) are both in view for most of the mission. At the other, almost never, and the mission fails.`;
    },
  },
  {
    seconds: [18, 27],
    apply: (ctx) => ({ ...base(ctx, 2), activeScenarioId: 'B', tab: 'section', focusBody: 'sun' }),
    view: main,
    text: (ctx) =>
      `Here is why: a ridge ${ctx.blockerDistM !== null ? storyDistance(ctx.blockerDistM) : 'nearby'} away blocks the Sun. Every answer comes with its reason.`,
  },
  {
    seconds: [27, 37],
    apply: (ctx) => ({ ...base(ctx, 3), tab: 'replan' }),
    view: () => ({ route: 'main', replan: { compact: true, columnFrom: 0, columnTo: SLIP_DAYS, highlightRank: false } }),
    text: () => 'Now the launch slips 12 days. Same site, new date — and it no longer works.',
  },
  {
    seconds: [37, 46],
    apply: (ctx) => {
      const t = landing(ctx) + SLIP_DAYS * DAY_S;
      return { ...base(ctx, 4), tab: 'replan', scenarios: pair(ctx, t), cursorUnix: t };
    },
    view: () => ({ route: 'main', replan: { compact: true, columnFrom: 0, columnTo: 0, highlightRank: true } }),
    text: () => "The tool ranks NASA's candidate regions for the new date and proposes an alternative in seconds.",
  },
  {
    seconds: [46, 53],
    apply: (ctx) => {
      if (ctx.hasMap) return { ...base(ctx, 5), tab: 'map', mapLayer: 'both', mapPeriod: ctx.defaults.demo_landing_utc.slice(0, 7) };
      const bg = siteById(ctx, 'blue-ghost-1');
      const t = bg?.landing_utc ? isoToUnix(bg.landing_utc) : landing(ctx);
      return {
        ...base(ctx, 5),
        tab: 'timeline',
        scenarios: [{ id: 'A', siteRef: bg?.id ?? ctx.defaults.demo_pair[0], landingUnix: t, missionDays: ctx.defaults.demo_mission_days, observerHeightM: DEFAULT_OBSERVER_HEIGHT_M }],
        cursorUnix: t,
      };
    },
    view: main,
    text: (ctx) =>
      ctx.hasMap
        ? 'Or let it search: the best spot for sunlight and Earth contact, anywhere near the pole.'
        : 'Near the equator a lunar day lasts two Earth weeks. At the pole, light can last months — or never come.',
  },
  {
    seconds: [53, 60],
    apply: (ctx) => base(ctx, 6),
    view: () => ({ route: 'validation' }),
    text: () =>
      "Every number is checked: against JPL Horizons, the eclipse Blue Ghost saw from the Moon, and NASA's illumination maps.",
  },
];

/** `Explore it yourself`: back to Explore with A and B as at the start. */
export function exploreState(ctx: StoryContext): Partial<AppState> {
  return { ...base(ctx, 0), mode: 'explore', storyStep: null };
}

/** The replanning details of a step (they do not depend on the data). */
export function replanViewForStep(step: number | null): StoryView['replan'] {
  if (step === null || step < 0 || step >= STORY_LENGTH) return undefined;
  const ctx = { defaults: { demo_pair: ['a', 'b'], demo_landing_utc: '2027-08-01T00:00:00Z', demo_mission_days: 14 }, sites: [], hasMap: false, blockerDistM: null } as StoryContext;
  return storySteps[step].view(ctx).replan;
}
