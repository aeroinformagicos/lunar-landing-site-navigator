// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// T-12: ENU basis and azimuth/elevation (05_efemerides.md §3, §5, §8.2), and time helpers.
import { describe, expect, it } from 'vitest';
import { R_EARTH_KM, R_MOON_KM, R_SUN_KM } from '../constants';
import { angularRadiusDeg, azelFromVector, enuBasis, normAz, siteFrame, sitePositionKm, type Vec3 } from '../frames';
import { formatUtc, isoToUnix, unixToIso } from '../time';

const TOL_DEG = 1e-9;
const TOL_KM = 1e-6;

/** az/el of the Moon-centred vector V seen from (lat, lon, h). */
function azel(lat: number, lon: number, h: number, V: Vec3) {
  const f = siteFrame(lat, lon, h);
  return azelFromVector(V[0] - f.p[0], V[1] - f.p[1], V[2] - f.p[2], f);
}

function close(a: number, b: number, tol: number) {
  expect(Math.abs(a - b)).toBeLessThan(tol);
}

function closeVec(a: Vec3, b: Vec3) {
  a.forEach((x, i) => close(x, b[i], 1e-15));
}

describe('ENU basis computed by hand (05 §8.2)', () => {
  it('(0°, 0°): E = (0, 1, 0), N = (0, 0, 1), U = (1, 0, 0)', () => {
    const b = enuBasis(0, 0);
    closeVec(b.e, [0, 1, 0]);
    closeVec(b.n, [0, 0, 1]);
    closeVec(b.u, [1, 0, 0]);
    closeVec(sitePositionKm(0, 0, 0), [R_MOON_KM, 0, 0]);
  });

  it('(0°, 0°) toward (2737.4, 1000, 0): az 90°, el 45°, 1414.2136 km', () => {
    const r = azel(0, 0, 0, [2737.4, 1000, 0]);
    close(r.azDeg, 90, TOL_DEG);
    close(r.elDeg, 45, TOL_DEG);
    close(r.rangeKm, Math.SQRT2 * 1000, TOL_KM);
  });

  it('(0°, 0°) toward (1737.4, 0, 1000): az 0°, el 0°', () => {
    const r = azel(0, 0, 0, [1737.4, 0, 1000]);
    close(r.azDeg, 0, TOL_DEG);
    close(r.elDeg, 0, TOL_DEG);
  });

  it('(−90°, 0°): U = (0, 0, −1), N = (1, 0, 0), E = (0, 1, 0)', () => {
    const b = enuBasis(-90, 0);
    closeVec(b.u, [0, 0, -1]);
    closeVec(b.n, [1, 0, 0]);
    closeVec(b.e, [0, 1, 0]);
  });

  it('(−90°, 0°) toward (5000, 0, −1737.4): az 0°, el 0°', () => {
    const r = azel(-90, 0, 0, [5000, 0, -1737.4]);
    close(r.azDeg, 0, TOL_DEG);
    close(r.elDeg, 0, TOL_DEG);
  });

  it('(−90°, 0°) toward (0, 5000, −1737.4): az 90°, el 0°', () => {
    const r = azel(-90, 0, 0, [0, 5000, -1737.4]);
    close(r.azDeg, 90, TOL_DEG);
    close(r.elDeg, 0, TOL_DEG);
  });

  it('(−90°, 0°) toward (0, 0, −2737.4): el 90°, az 0° (zenith convention)', () => {
    const r = azel(-90, 0, 0, [0, 0, -2737.4]);
    close(r.elDeg, 90, TOL_DEG);
    expect(r.azDeg).toBe(0);
  });

  it('(45°, 90°) toward p + 100·U: el 90°', () => {
    const f = siteFrame(45, 90, 0);
    closeVec(f.u, [0, Math.SQRT1_2, Math.SQRT1_2]);
    const r = azelFromVector(100 * f.u[0], 100 * f.u[1], 100 * f.u[2], f);
    close(r.elDeg, 90, TOL_DEG);
    close(r.rangeKm, 100, TOL_KM);
  });

  it('height in metres raises the site radius in km', () => {
    closeVec(sitePositionKm(0, 0, 2100), [R_MOON_KM + 2.1, 0, 0]);
  });
});

describe('azimuth range', () => {
  it('normAz maps to [0, 360)', () => {
    expect(normAz(-90)).toBe(270);
    expect(normAz(360)).toBe(0);
    expect(normAz(-0)).toBe(0);
    expect(normAz(-1e-15)).toBeLessThan(360);
    expect(normAz(725)).toBe(5);
  });

  it('west is 270°', () => {
    close(azel(0, 0, 0, [2737.4, -1000, 0]).azDeg, 270, TOL_DEG);
  });
});

describe('apparent disc size (05 §5)', () => {
  it('matches the Horizons diameters of the Sun and the Earth', () => {
    close(2 * angularRadiusDeg(R_SUN_KM, 1.4911789075e8) * 3600, 1924.638, 0.01);
    close(2 * angularRadiusDeg(R_EARTH_KM, 400_571.6086) * 3600, 6568.817, 0.01);
  });
});

describe('time', () => {
  it('converts ISO UTC and back', () => {
    expect(isoToUnix('2027-08-01T00:00:00Z')).toBe(1_817_078_400);
    expect(isoToUnix('1970-01-01T00:00Z')).toBe(0);
    expect(isoToUnix('1969-07-20T20:17:40.5Z')).toBe(-14_182_939.5);
    expect(unixToIso(1_817_078_400)).toBe('2027-08-01T00:00:00Z');
    expect(unixToIso(-31_539_600)).toBe('1968-12-31T23:00:00Z');
  });

  it('handles leap years with Date, not by hand', () => {
    expect(isoToUnix('2028-03-01T00:00:00Z') - isoToUnix('2028-02-29T00:00:00Z')).toBe(86_400);
    expect(() => isoToUnix('2027-02-29T00:00:00Z')).toThrow(RangeError);
  });

  it('rejects second 60 and other formats', () => {
    for (const bad of ['2016-12-31T23:59:60Z', '2027-08-01 00:00:00', '2027-08-01T00:00:00+02:00', 'soon']) {
      expect(() => isoToUnix(bad)).toThrow(RangeError);
    }
  });

  it('formats as `2027-08-04 14:20 UTC`', () => {
    expect(formatUtc(isoToUnix('2027-08-04T14:20:29Z'))).toBe('2027-08-04 14:20 UTC');
    expect(formatUtc(isoToUnix('2027-08-04T14:20:31Z'))).toBe('2027-08-04 14:21 UTC');
  });
});
