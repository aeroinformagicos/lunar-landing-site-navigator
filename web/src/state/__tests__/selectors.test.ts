// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-14: F1 and F2 rules: date and coordinate validation with their messages, mission length,
// 4-scenario limit, Link dates, playback at three speeds and keyboard shortcuts (10_interfaz.md §4, §5, §12).
import { beforeEach, describe, expect, it } from 'vitest';
import { exampleJson } from '../../core/__tests__/fixtures';
import { PLAY_SPEEDS } from '../../core/constants';
import { DAY_S, HOUR_S, isoToUnix } from '../../core/time';
import type { SitesFile } from '../../core/types';
import { t } from '../../i18n/t';
import {
  activeScenario,
  advanceCursor,
  cursorBounds,
  groupSites,
  missionTruncated,
  normaliseMissionDays,
  parseCustomCoords,
  parseLanding,
  parseSiteRef,
  shortcutFor,
  siteYear,
  speedLabel,
} from '../selectors';
import { useAppStore } from '../store';

const sitesFile = exampleJson<SitesFile>('sites.json');
const LANDING = isoToUnix('2027-08-01T00:00:00Z');
const get = () => useAppStore.getState();

/** Message the landing field shows for a value (LandingInput). */
function landingMessage(value: string): string | null {
  const r = parseLanding(value);
  return 'error' in r ? (r.error === 'range' ? t('error.range') : t('error.date_invalid')) : null;
}

describe('landing date (F2, 10 §4)', () => {
  it('reads datetime-local values as UTC', () => {
    expect(parseLanding('2027-08-01T00:00')).toEqual({ unix: LANDING });
    expect(parseLanding('1969-07-20T20:17')).toEqual({ unix: isoToUnix('1969-07-20T20:17:00Z') });
    expect(parseLanding('2028-02-29T12:00')).toEqual({ unix: isoToUnix('2028-02-29T12:00:00Z') });
  });

  it('dates outside 1969–1972 and 2024–2044 show the range message', () => {
    for (const v of ['1985-01-01T00:00', '2023-12-31T23:59', '2045-01-01T00:01', '1968-12-31T23:59']) {
      expect(landingMessage(v), v).toBe('Date outside the supported range (1969–1972 and 2024–2044).');
    }
    expect(landingMessage('2044-12-31T23:59')).toBeNull();
    expect(landingMessage('1972-12-31T23:59')).toBeNull();
  });

  it('malformed or impossible dates show the format message', () => {
    for (const v of ['', 'tomorrow', '2027-02-29T00:00', '2027-13-01T00:00', '2027-08-01']) {
      expect(landingMessage(v), v).toBe('Enter a valid date and time (UTC).');
    }
  });

  it('warns when the mission runs past the end of the table', () => {
    expect(missionTruncated(isoToUnix('2044-12-25T00:00:00Z'), 14)).toBe(true);
    expect(missionTruncated(isoToUnix('1972-12-30T00:00:00Z'), 3)).toBe(true);
    expect(missionTruncated(LANDING, 60)).toBe(false);
    expect(t('warn.truncated')).toBe('Mission extends beyond available ephemeris; results truncated.');
  });
});

describe('mission length (F2: 0.5–60 days, step 0.5)', () => {
  it('clamps and rounds to the step', () => {
    expect(normaliseMissionDays(14)).toBe(14);
    expect(normaliseMissionDays(0.1)).toBe(0.5);
    expect(normaliseMissionDays(75)).toBe(60);
    expect(normaliseMissionDays(3.3)).toBe(3.5);
    expect(normaliseMissionDays(Number.NaN)).toBeNull();
  });
});

describe('custom coordinates (F1, 10 §5)', () => {
  const message = (lat: string, lon: string) => {
    const r = parseCustomCoords(lat, lon);
    return 'errors' in r ? r.errors.map((e) => t(e === 'lat' ? 'picker.lat_error' : 'picker.lon_error')) : [];
  };

  it('accepts valid values and turns longitudes above 180 negative', () => {
    expect(parseCustomCoords('-89.5', '45')).toMatchObject({ siteRef: 'custom:-89.5,45', latDeg: -89.5, lonDeg: 45 });
    expect(parseCustomCoords('-85', '300')).toMatchObject({ lonDeg: -60 });
    expect(parseCustomCoords('10', '360')).toMatchObject({ lonDeg: 0 });
    expect(parseCustomCoords('10', '-180')).toMatchObject({ lonDeg: 180 });
  });

  it('shows the field messages for invalid values', () => {
    expect(message('-91', '0')).toEqual(['Latitude must be between −90 and 90.']);
    expect(message('0', '361')).toEqual(['Longitude must be between −180 and 360.']);
    expect(message('', 'abc')).toEqual(['Latitude must be between −90 and 90.', 'Longitude must be between −180 and 360.']);
  });

  it('site references round-trip', () => {
    expect(parseSiteRef('custom:-89.5,45')).toEqual({ kind: 'custom', latDeg: -89.5, lonDeg: 45 });
    expect(parseSiteRef('grid:538,117')).toEqual({ kind: 'grid', i: 538, j: 117 });
    expect(parseSiteRef('blue-ghost-1')).toEqual({ kind: 'catalogue', id: 'blue-ghost-1' });
  });
});

describe('site picker (F1): grouped by type, searchable by name', () => {
  it('groups every site of sites.json', () => {
    const g = groupSites(sitesFile.sites, '');
    expect(g.landed.map((s) => s.id)).toEqual(['blue-ghost-1', 'apollo-11']);
    expect(g.other.map((s) => s.id)).toEqual(['demo-a', 'demo-b']);
    expect(g.candidates).toEqual([]);
  });

  it('searches without case or accents', () => {
    expect(groupSites(sitesFile.sites, 'GHOST').landed.map((s) => s.id)).toEqual(['blue-ghost-1']);
    expect(groupSites(sitesFile.sites, 'ápollo').landed.map((s) => s.id)).toEqual(['apollo-11']);
    const none = groupSites(sitesFile.sites, 'xyz');
    expect(none.landed.length + none.candidates.length + none.other.length).toBe(0);
    expect(t('picker.none', { q: 'xyz' })).toBe('No sites match "xyz".');
  });

  it('shows the landing year', () => {
    expect(siteYear(sitesFile.sites.find((s) => s.id === 'blue-ghost-1')!)).toBe('2025');
    expect(siteYear(sitesFile.sites.find((s) => s.id === 'demo-a')!)).toBe('');
  });
});

describe('scenarios (F1): at most 4, Link dates', () => {
  beforeEach(() => get().init(sitesFile.defaults));

  it('Add scenario stops at 4 and Duplicate copies a card', () => {
    expect(get().duplicateScenario('B')).toBe('C');
    expect(get().scenarios[2]).toMatchObject({ id: 'C', siteRef: 'demo-b' });
    expect(get().addScenario('apollo-11')).toBe('D');
    expect(get().addScenario('demo-a')).toBeNull();
    expect(get().duplicateScenario('A')).toBeNull();
    expect(get().scenarios).toHaveLength(4);
    expect(t('scenario.max')).toBe('Maximum of 4 scenarios');
  });

  it('with Link dates, landing and length apply to all; without, to the active one', () => {
    const later = LANDING + 10 * DAY_S;
    get().setCursor(LANDING + 2 * HOUR_S);
    get().setLanding(later);
    expect(get().scenarios.map((s) => s.landingUnix)).toEqual([later, later]);
    expect(get().cursorUnix).toBe(later + 2 * HOUR_S); // the cursor keeps its offset
    get().setLinkDates(false);
    get().setActiveScenario('B');
    get().setLanding(LANDING);
    get().setMissionDays(3);
    expect(get().scenarios.map((s) => s.landingUnix)).toEqual([later, LANDING]);
    expect(get().scenarios.map((s) => s.missionDays)).toEqual([14, 3]);
    expect(cursorBounds(get())).toEqual({ min: LANDING, max: LANDING + 3 * DAY_S });
  });

  it('shortening the mission pulls the cursor inside it', () => {
    get().setCursor(LANDING + 10 * DAY_S);
    get().setMissionDays(2);
    expect(get().cursorUnix).toBe(LANDING + 2 * DAY_S);
    expect(activeScenario(get()).missionDays).toBe(2);
  });
});

describe('playback at three speeds (F2)', () => {
  it('1 h/s, 6 h/s and 1 d/s advance the cursor by that much per second', () => {
    expect(PLAY_SPEEDS.map(speedLabel)).toEqual(['1 h/s', '6 h/s', '1 d/s']);
    const end = LANDING + 14 * DAY_S;
    expect(advanceCursor(LANDING, PLAY_SPEEDS[0], 1000, end)).toEqual({ cursorUnix: LANDING + HOUR_S, done: false });
    expect(advanceCursor(LANDING, PLAY_SPEEDS[1], 1000, end)).toEqual({ cursorUnix: LANDING + 6 * HOUR_S, done: false });
    expect(advanceCursor(LANDING, PLAY_SPEEDS[2], 500, end)).toEqual({ cursorUnix: LANDING + DAY_S / 2, done: false });
  });

  it('stops at the end of the mission', () => {
    const end = LANDING + DAY_S;
    expect(advanceCursor(end - 10, PLAY_SPEEDS[2], 1000, end)).toEqual({ cursorUnix: end, done: true });
  });

  it('a 14-day mission at 1 d/s plays in 14 s of 60 fps frames', () => {
    const end = LANDING + 14 * DAY_S;
    let c = LANDING;
    let frames = 0;
    for (let done = false; !done; frames++) ({ cursorUnix: c, done } = advanceCursor(c, PLAY_SPEEDS[2], 1000 / 60, end));
    expect(c).toBe(end);
    expect(frames).toBe(14 * 60);
  });
});

describe('keyboard shortcuts (10 §12)', () => {
  it('maps 1–4, Space, [ ] and ?', () => {
    expect(shortcutFor({ key: '1' })).toEqual({ kind: 'tab', tab: 'panorama' });
    expect(shortcutFor({ key: '4' })).toEqual({ kind: 'tab', tab: 'section' });
    expect(shortcutFor({ key: ' ' })).toEqual({ kind: 'play' });
    expect(shortcutFor({ key: '[' })).toEqual({ kind: 'step', seconds: -HOUR_S });
    expect(shortcutFor({ key: ']' })).toEqual({ kind: 'step', seconds: HOUR_S });
    expect(shortcutFor({ key: '?' })).toEqual({ kind: 'help' });
    expect(shortcutFor({ key: 'x' })).toBeNull();
  });

  it('does not steal keys from fields, buttons, tabs or with modifiers', () => {
    expect(shortcutFor({ key: '1', targetTag: 'input' })).toBeNull();
    expect(shortcutFor({ key: ' ', targetTag: 'BUTTON' })).toBeNull();
    expect(shortcutFor({ key: ' ', targetTag: 'DIV', targetRole: 'tab' })).toBeNull();
    expect(shortcutFor({ key: '2', ctrlKey: true })).toBeNull();
    expect(shortcutFor({ key: '2', targetTag: 'BUTTON' })).toEqual({ kind: 'tab', tab: 'timeline' });
  });
});
