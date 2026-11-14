// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Plain-language summary (10_interfaz.md §8, F18): one to three sentences built from templates, in
// this order: what is happening now, what comes next, verdict. Pure; one test per template branch.
// The numbers use the same formatters as the panel so both always say the same.
import type { Blocker } from '../../core/horizon';
import type { NextEvent } from '../../core/metrics';
import type { Assessment, ReasonCode } from '../../core/requirements';
import type { SkyState } from '../../core/visibility';
import { formatCountdown, formatHours, formatPct, formatUtc } from '../common/format';

/** 16 compass points (10 §8). */
const POINTS = [
  'north', 'north-northeast', 'northeast', 'east-northeast',
  'east', 'east-southeast', 'southeast', 'south-southeast',
  'south', 'south-southwest', 'southwest', 'west-southwest',
  'west', 'west-northwest', 'northwest', 'north-northwest',
];

/** Direction in words from an azimuth: the nearest of 16 points (round half up, 07 §12.7). */
export function compassWord(azDeg: number): string {
  const a = ((azDeg % 360) + 360) % 360;
  return POINTS[Math.floor(a / 22.5 + 0.5) % 16];
}

/** `800 m` below 1 km (to 10 m), otherwise `41 km`. */
export function distanceWords(distM: number): string {
  return distM < 1000 ? `${Math.round(distM / 10) * 10} m` : `${Math.round(distM / 1000)} km`;
}

/** Height of the blocking point above the site, rounded to 10 m; null if unknown (mesh point, NaN). */
export function relativeHeight(blkHeightM: number, siteHeightM: number): number | null {
  if (!Number.isFinite(blkHeightM)) return null;
  return Math.round((blkHeightM - siteHeightM) / 10) * 10;
}

/** `1.21` (elevation with 2 decimals, 07 §12.6). */
function deg2(x: number): string {
  return x.toFixed(2);
}

export interface SummaryInput {
  /** State at the cursor. */
  state: SkyState;
  /** Next events from the cursor (60 days, 07 §7). */
  nextSun: NextEvent | null;
  nextEarth: NextEvent | null;
  /** Landing + mission. */
  missionEndUnix: number;
  missionDays: number;
  sunPct: number;
  earthPct: number;
  assessment: Assessment;
  maxNightHours: number;
  marginalEarthMarginDeg: number;
  blockerSun: Blocker;
  blockerEarth: Blocker;
  site: {
    heightM: number;
    /** Smooth Moon (no terrain): «terrain … to the …» becomes «the lunar horizon». */
    smooth: boolean;
    /** Elevation of the smooth horizon for the observer height (`smooth_el_deg`). */
    smoothElDeg: number;
  };
}

/** «hidden behind terrain 41 km to the west, 1,930 m higher than the site» and its variants. */
function hiddenPhrase(bodyElDeg: number, b: Blocker, input: SummaryInput, withRise: boolean): string {
  if (bodyElDeg <= input.site.smoothElDeg) return 'below the lunar horizon';
  if (input.site.smooth) return 'hidden behind the lunar horizon';
  const where = Number.isFinite(b.distM) ? `${distanceWords(b.distM)} to the ${compassWord(b.azDeg)}` : `to the ${compassWord(b.azDeg)}`;
  let rise = '';
  if (withRise) {
    const h = relativeHeight(b.heightM, input.site.heightM);
    if (h !== null && h > 0) rise = `, ${h.toLocaleString('en-US')} m higher than the site`;
  }
  return `hidden behind terrain ${where}${rise}`;
}

/** Sentence 1: the situation at the cursor (10 §8, first table). */
export function sentenceNow(input: SummaryInput): string {
  const { sun, earth, eclipse } = input.state;
  let s: string;
  if (sun.visible && earth.visible) {
    s = `The Sun is ${deg2(sun.elDeg)}° above the horizon and the Earth is in view: power and a direct link to Earth are both available.`;
  } else if (sun.visible) {
    s = `The Sun is up, but the Earth is ${hiddenPhrase(earth.elDeg, input.blockerEarth, input, false)}: no direct link to Earth.`;
  } else if (earth.visible) {
    s = `The Earth is in view, but the Sun is ${hiddenPhrase(sun.elDeg, input.blockerSun, input, true)}.`;
  } else {
    s = 'Neither the Sun nor the Earth is visible from here right now.';
  }
  if (sun.discFraction > 0 && sun.discFraction < 1) s += ` Only ${formatPct(sun.discFraction * 100)} of the solar disc clears the terrain.`;
  if (eclipse.kind !== 'none') s += ` The Earth is covering ${formatPct(eclipse.covered * 100)} of the Sun (eclipse).`;
  return s;
}

/** Sentence 2: what comes next (10 §8, second table; the first row that holds). */
export function sentenceNext(input: SummaryInput): string {
  const t = input.state.tUnix;
  const sunUp = input.state.sun.visible;
  const ns = input.nextSun;
  let s: string;
  if (sunUp && ns?.tUnix != null && ns.tUnix <= input.missionEndUnix) {
    s = `Sunset comes in ${formatCountdown(ns.tUnix - t)}, at ${formatUtc(ns.tUnix)}.`;
  } else if (sunUp) {
    s = 'The Sun stays up for the rest of the mission.';
  } else if (ns?.tUnix != null) {
    s = `Sunrise comes in ${formatCountdown(ns.tUnix - t)}.`;
  } else {
    s = 'The Sun does not rise here in the next 60 days.';
  }
  const ne = input.nextEarth;
  if (ne?.tUnix != null && (ns?.tUnix == null || ne.tUnix < ns.tUnix)) {
    s += ` Earth contact ${ne.kind === 'earthset' ? 'is lost' : 'returns'} in ${formatCountdown(ne.tUnix - t)}.`;
  }
  return s;
}

/** What the verdict needs (the comparison table shows only this sentence, 10 §8). */
export type VerdictInput = Pick<SummaryInput, 'assessment' | 'missionDays' | 'sunPct' | 'earthPct' | 'maxNightHours' | 'marginalEarthMarginDeg'>;

function reasonText(r: ReasonCode, input: VerdictInput): string {
  const night = formatHours(input.assessment.longestNightH);
  switch (r) {
    case 'no_sun_at_landing':
      return 'no Sun at landing';
    case 'no_earth_at_landing':
      return 'no Earth contact at landing';
    case 'night_too_long':
      return `a night of ${night} exceeds the ${input.maxNightHours} h limit`;
    case 'sun_partly_hidden':
      return 'the Sun is partly hidden at landing';
    case 'earth_low':
      return `the Earth is less than ${input.marginalEarthMarginDeg}° above the terrain at landing`;
    case 'night_near_limit':
      return `the longest night (${night}) is close to the limit`;
  }
}

/** Sentence 3: the verdict (10 §8, third table). Several reasons are joined with «and». */
export function sentenceVerdict(input: VerdictInput): string {
  const a = input.assessment;
  const d = String(input.missionDays); // `14`, `3.5`
  const reasons = a.reasons.map((r) => reasonText(r, input)).join(' and ');
  if (a.status === 'go') {
    return `For a ${d}-day mission landing at this time, this site works: ${formatPct(input.sunPct)} sunlight, ${formatPct(input.earthPct)} Earth contact, longest night ${formatHours(a.longestNightH)}.`;
  }
  if (a.status === 'marginal') return `This site works for a ${d}-day mission, but with little margin: ${reasons}.`;
  return `This site does not work for a ${d}-day mission landing at this time: ${reasons}.`;
}

/** The three sentences (Explore shows all three; the comparison table only the third). */
export function summarize(input: SummaryInput): string[] {
  return [sentenceNow(input), sentenceNext(input), sentenceVerdict(input)];
}
