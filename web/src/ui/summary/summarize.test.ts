// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-17: one test per branch of the three template tables of 10_interfaz.md §8, the 16 compass points,
// and the numbers of the sentences are the panel's.
import { describe, expect, it } from 'vitest';
import type { Blocker } from '../../core/horizon';
import type { Assessment } from '../../core/requirements';
import { isoToUnix } from '../../core/time';
import type { SkyState } from '../../core/visibility';
import { formatHours, formatPct } from '../common/format';
import { compassWord, distanceWords, relativeHeight, sentenceNext, sentenceNow, sentenceVerdict, summarize, type SummaryInput } from './summarize';

const T = isoToUnix('2025-03-16T10:00:00Z');

function body(elDeg: number, azDeg: number, visible: boolean) {
  return { azDeg, elDeg, rangeKm: 1, radiusDeg: 0.27, horizonDeg: 0, marginDeg: visible ? 1 : -1, visible };
}

function state(sunUp: boolean, earthUp: boolean, over: Partial<{ sunEl: number; earthEl: number; disc: number; covered: number }> = {}): SkyState {
  const disc = over.disc ?? (sunUp ? 1 : 0);
  return {
    tUnix: T,
    // Hidden bodies default to just above the smooth horizon (−0.0869°) but under the terrain.
    sun: { ...body(over.sunEl ?? (sunUp ? 1.2149 : 0.3), 270, sunUp), discFraction: disc, litFraction: disc },
    earth: body(over.earthEl ?? (earthUp ? 5.8 : 0.4), 90, earthUp),
    both: sunUp && earthUp,
    eclipse: over.covered ? { kind: over.covered >= 1 ? 'total' : 'partial', covered: over.covered } : { kind: 'none', covered: 0 },
  };
}

const blocker = (azDeg: number, distM: number, heightM: number): Blocker => ({ azDeg, elDeg: 1, distM, latDeg: 0, lonDeg: 0, heightM });
const go: Assessment = { status: 'go', checks: { sunAtLanding: true, earthAtLanding: true, nightOk: true }, longestNightH: 7.46, bothPct: 50, reasons: [] };

function input(over: Partial<SummaryInput> = {}): SummaryInput {
  return {
    state: state(true, true),
    nextSun: { kind: 'sunset', tUnix: T + 4 * 86400 + 12 * 3600 + 52 * 60 },
    nextEarth: { kind: 'earthset', tUnix: T + 10 * 86400 },
    missionEndUnix: T + 14 * 86400,
    missionDays: 14,
    sunPct: 93.4,
    earthPct: 60.2,
    assessment: go,
    maxNightHours: 24,
    marginalEarthMarginDeg: 1,
    blockerSun: blocker(270, 41_230, 1000),
    blockerEarth: blocker(95, 812, -500),
    site: { heightM: -930, smooth: false, smoothElDeg: -0.0869 },
    ...over,
  };
}

describe('sentence 1: now', () => {
  it('Sun and Earth visible', () => {
    expect(sentenceNow(input())).toBe(
      'The Sun is 1.21° above the horizon and the Earth is in view: power and a direct link to Earth are both available.',
    );
  });

  it('Sun visible, Earth hidden by terrain', () => {
    expect(sentenceNow(input({ state: state(true, false) }))).toBe(
      'The Sun is up, but the Earth is hidden behind terrain 810 m to the east: no direct link to Earth.',
    );
  });

  it('Earth visible, Sun hidden by terrain higher than the site', () => {
    expect(sentenceNow(input({ state: state(false, true) }))).toBe(
      'The Earth is in view, but the Sun is hidden behind terrain 41 km to the west, 1,930 m higher than the site.',
    );
  });

  it('… without `{rise}` when the blocker is lower or unknown (mesh point)', () => {
    expect(sentenceNow(input({ state: state(false, true), blockerSun: blocker(270, 41_230, -1200) }))).toBe(
      'The Earth is in view, but the Sun is hidden behind terrain 41 km to the west.',
    );
    expect(sentenceNow(input({ state: state(false, true), blockerSun: blocker(270, 41_230, Number.NaN) }))).toMatch(/to the west\.$/);
  });

  it('neither visible', () => {
    expect(sentenceNow(input({ state: state(false, false) }))).toBe('Neither the Sun nor the Earth is visible from here right now.');
  });

  it('partly visible Sun adds the disc share', () => {
    expect(sentenceNow(input({ state: state(true, true, { disc: 0.62 }) }))).toMatch(/ Only 62 % of the solar disc clears the terrain\.$/);
    expect(sentenceNow(input({ state: state(false, true, { disc: 0.4 }) }))).toMatch(/ Only 40 % of the solar disc clears the terrain\.$/);
  });

  it('smooth Moon: «the lunar horizon» instead of terrain, distance and direction', () => {
    const smooth = { heightM: 0, smooth: true, smoothElDeg: -0.0869 };
    expect(sentenceNow(input({ state: state(false, true, { sunEl: 0.1 }), site: smooth }))).toBe(
      'The Earth is in view, but the Sun is hidden behind the lunar horizon.',
    );
  });

  it('a body below the smooth horizon is «below the lunar horizon» (terrain is not the cause)', () => {
    expect(sentenceNow(input({ state: state(true, false, { earthEl: -43.2 }) }))).toBe(
      'The Sun is up, but the Earth is below the lunar horizon: no direct link to Earth.',
    );
    expect(sentenceNow(input({ state: state(false, true, { sunEl: -5 }) }))).toBe(
      'The Earth is in view, but the Sun is below the lunar horizon.',
    );
  });

  it('eclipse adds the covered share', () => {
    expect(sentenceNow(input({ state: state(true, true, { covered: 0.43 }) }))).toMatch(/ The Earth is covering 43 % of the Sun \(eclipse\)\.$/);
  });
});

describe('sentence 2: what comes next', () => {
  it('Sun up and sunset before the end of the mission', () => {
    expect(sentenceNext(input())).toBe('Sunset comes in 4d 12h 52m, at 2025-03-20 22:52 UTC.');
  });

  it('Sun up and no sunset before the end', () => {
    expect(sentenceNext(input({ nextSun: { kind: 'sunset', tUnix: T + 20 * 86400 }, nextEarth: null }))).toBe('The Sun stays up for the rest of the mission.');
    expect(sentenceNext(input({ nextSun: { kind: 'sunset', tUnix: null }, nextEarth: null }))).toBe('The Sun stays up for the rest of the mission.');
  });

  it('no Sun and a sunrise within 60 days', () => {
    const i = input({ state: state(false, true), nextSun: { kind: 'sunrise', tUnix: T + 3 * 86400 + 4 * 3600 + 46 * 60 } });
    expect(sentenceNext(i)).toBe('Sunrise comes in 3d 04h 46m.');
  });

  it('no Sun and no sunrise within 60 days', () => {
    expect(sentenceNext(input({ state: state(false, true), nextSun: { kind: 'sunrise', tUnix: null }, nextEarth: null }))).toBe(
      'The Sun does not rise here in the next 60 days.',
    );
  });

  it('adds the Earth event when it comes before the next solar event', () => {
    const lost = input({ nextEarth: { kind: 'earthset', tUnix: T + 86400 + 12 * 3600 + 17 * 60 } });
    expect(sentenceNext(lost)).toBe('Sunset comes in 4d 12h 52m, at 2025-03-20 22:52 UTC. Earth link is lost in 1d 12h 17m.');
    const back = input({ state: state(true, false), nextEarth: { kind: 'earthrise', tUnix: T + 3600 * 2 } });
    expect(sentenceNext(back)).toMatch(/ Earth link returns in 0d 02h 00m\.$/);
    const none = input({ nextSun: { kind: 'sunset', tUnix: null }, nextEarth: { kind: 'earthset', tUnix: T + 5 * 86400 } });
    expect(sentenceNext(none)).toBe('The Sun stays up for the rest of the mission. Earth link is lost in 5d 00h 00m.');
  });

  it('… and not when it comes later', () => {
    expect(sentenceNext(input())).not.toMatch(/Earth link/);
  });
});

describe('sentence 3: verdict', () => {
  it('go', () => {
    expect(sentenceVerdict(input())).toBe(
      'For a 14-day mission landing at this time, this site works: 93 % sunlight, 60 % Earth link, longest night 7.5 h.',
    );
  });

  it('marginal, each reason and several joined with «and»', () => {
    const m = (reasons: Assessment['reasons'], night = 20) =>
      sentenceVerdict(input({ missionDays: 3.5, assessment: { ...go, status: 'marginal', reasons, longestNightH: night } }));
    expect(m(['sun_partly_hidden'])).toBe('This site works for a 3.5-day mission, but with little margin: the Sun is partly hidden at landing.');
    expect(m(['earth_low'])).toBe('This site works for a 3.5-day mission, but with little margin: the Earth is less than 1° above the terrain at landing.');
    expect(m(['night_near_limit'])).toBe('This site works for a 3.5-day mission, but with little margin: the longest night (20.0 h) is close to the limit.');
    expect(m(['sun_partly_hidden', 'earth_low'])).toMatch(/at landing and the Earth is less than/);
  });

  it('no_go, each reason and several joined with «and»', () => {
    const n = (reasons: Assessment['reasons']) =>
      sentenceVerdict(input({ assessment: { ...go, status: 'no_go', reasons, longestNightH: 355.2 } }));
    expect(n(['no_sun_at_landing'])).toBe('This site does not work for a 14-day mission landing at this time: no Sun at landing.');
    expect(n(['no_earth_at_landing'])).toBe('This site does not work for a 14-day mission landing at this time: no Earth link at landing.');
    expect(n(['night_too_long'])).toBe('This site does not work for a 14-day mission landing at this time: a night of 355 h exceeds the 24 h limit.');
    expect(n(['no_sun_at_landing', 'night_too_long'])).toBe(
      'This site does not work for a 14-day mission landing at this time: no Sun at landing and a night of 355 h exceeds the 24 h limit.',
    );
  });
});

describe('words and numbers', () => {
  it('16 compass points, rounding half up', () => {
    const expected = [
      'north', 'north-northeast', 'northeast', 'east-northeast', 'east', 'east-southeast', 'southeast', 'south-southeast',
      'south', 'south-southwest', 'southwest', 'west-southwest', 'west', 'west-northwest', 'northwest', 'north-northwest',
    ];
    expected.forEach((w, k) => expect(compassWord(k * 22.5)).toBe(w));
    expect(compassWord(11.24)).toBe('north');
    expect(compassWord(11.25)).toBe('north-northeast');
    expect(compassWord(354)).toBe('north');
    expect(compassWord(-90)).toBe('west');
    expect(compassWord(720 + 180)).toBe('south');
  });

  it('distances and relative heights', () => {
    expect(distanceWords(812)).toBe('810 m');
    expect(distanceWords(41_230)).toBe('41 km');
    expect(relativeHeight(1000, -930)).toBe(1930);
    expect(relativeHeight(Number.NaN, 0)).toBeNull();
  });

  it('the numbers of the sentences are the panel’s', () => {
    const i = input();
    const [now, , verdict] = summarize(i);
    expect(verdict).toContain(formatPct(i.sunPct)); // panel: `312 h · 93 %`
    expect(verdict).toContain(formatPct(i.earthPct));
    expect(verdict).toContain(formatHours(i.assessment.longestNightH)); // panel: `Longest night 7.5 h`
    expect(now).toContain(`${i.state.sun.elDeg.toFixed(2)}°`); // panel: `Sun elevation 1.21°`
  });
});
