# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Visible fraction of a disc (07_visibilidad.md §4 and §13.2).

The expected values are those of the exact circular segment: with a flat horizon H and
δ = (H − el_c)/ρ, the fraction is f = (acos δ − δ·√(1 − δ²))/π.
"""

from __future__ import annotations

import math

import pytest

from pipeline.horizon.law import N_AZ
from pipeline.vis.discs import ANY_COLUMNS, DISC_STRIPS, MIN_COS_EL, disc_any, disc_fraction
from pipeline.vis.sky import formula_mask, horizon_at, make_mask

# 07 §13.2: apparent radii used in the table (Sun 0.265°, Earth 0.95°).
RHO_SUN = 0.265
RHO_EARTH = 0.95
# 07 §13.2: tolerance of the 32 strips against the exact segment.
SEGMENT_TOL = 0.003


def exact_segment(delta: float) -> float:
    return (math.acos(delta) - delta * math.sqrt(1 - delta * delta)) / math.pi


def test_constants_of_the_specification():
    assert DISC_STRIPS == 32 and MIN_COS_EL == 0.05
    assert ANY_COLUMNS == (-0.8, -0.4, 0.0, 0.4, 0.8)


@pytest.mark.parametrize(
    ("mask_id", "az_c", "el_c", "rho", "expected", "tol"),
    [
        ("flat:0", 0.0, 0.0, RHO_SUN, 0.5, 1e-12),
        ("flat:0", 0.0, +0.265, RHO_SUN, 1.0, 1e-12),
        ("flat:0", 0.0, -0.265, RHO_SUN, 0.0, 1e-12),
        ("flat:0", 0.0, -0.1325, RHO_SUN, 0.195501, SEGMENT_TOL),  # (1.047198 − 0.433013)/π
        ("flat:0", 0.0, +0.1325, RHO_SUN, 0.804499, SEGMENT_TOL),
        ("tilt:0.3", 180.0, 0.0, RHO_EARTH, 0.5, 1e-9),  # symmetry
    ],
)
def test_disc_fraction_table(mask_id, az_c, el_c, rho, expected, tol):
    assert disc_fraction(formula_mask(mask_id), az_c, el_c, rho) == pytest.approx(expected, abs=tol)


def test_disc_fraction_follows_the_exact_segment_for_any_delta():
    flat = formula_mask("flat:0.5")
    worst = 0.0
    for i in range(-100, 101):
        delta = i / 100
        f = disc_fraction(flat, 123.4, 0.5 - delta * RHO_SUN, RHO_SUN)
        assert 0.0 <= f <= 1.0
        worst = max(worst, abs(f - exact_segment(delta)))
    assert worst < SEGMENT_TOL


def test_disc_fraction_decreases_as_the_disc_sinks():
    mask = formula_mask("sine:1,3")
    previous = 1.0
    for i in range(0, 401):
        f = disc_fraction(mask, 40.0, 2.0 - i * 0.01, RHO_EARTH)
        assert 0.0 <= f <= previous + 1e-9
        previous = f
    assert previous == 0.0


def test_shortcuts_when_the_disc_clears_every_horizon():
    mask = formula_mask("sine:1,3")  # horizon between −1° and +1°
    assert disc_fraction(mask, 77.0, 1.0 + RHO_SUN, RHO_SUN) == 1.0
    assert disc_fraction(mask, 77.0, -1.0 - RHO_SUN, RHO_SUN) == 0.0
    # 07 §10: body near the zenith, any azimuth.
    assert disc_fraction(mask, 0.0, 89.99, RHO_SUN) == 1.0
    assert disc_fraction(mask, 359.99, -89.99, RHO_SUN) == 0.0


def test_azimuth_is_periodic():
    mask = formula_mask("sine:1,3")
    for az in (0.0, 0.1, 359.9, 180.0):
        a = disc_fraction(mask, az, 0.2, RHO_EARTH)
        assert disc_fraction(mask, az + 360.0, 0.2, RHO_EARTH) == pytest.approx(a, abs=1e-9)
        assert disc_fraction(mask, az - 360.0, 0.2, RHO_EARTH) == pytest.approx(a, abs=1e-9)
    # A disc that straddles azimuth 0°/360°, where tilt:0.3 jumps from +0.3° to −0.3°.
    tilt = formula_mask("tilt:0.3")
    assert 0.0 < disc_fraction(tilt, 0.0, 0.0, RHO_EARTH) < 1.0


def test_one_strip_is_the_centre_criterion_of_the_horizon_through_the_centre():
    # With K = 1 the only strip is the central chord: horizon through the centre gives 0.5.
    assert disc_fraction(formula_mask("flat:0"), 10.0, 0.0, RHO_SUN, 1) == 0.5
    # More strips converge to the exact segment.
    errors = [abs(disc_fraction(formula_mask("flat:0"), 10.0, -0.1325, RHO_SUN, k) - exact_segment(0.5))
              for k in (8, 32, 128)]
    assert errors[0] > errors[1] > errors[2]


def test_cos_el_floor_limits_the_azimuth_spread_near_the_zenith():
    # A wall 89° high over azimuths 180°–360°, nothing elsewhere. At el_c = 88°, cos(el) = 0.035 is
    # below the floor of 0.05, so the outermost strip (x = ρ·31/32) is ρ·(31/32)/0.05 = 18.4° of
    # azimuth away from the centre, not the 26.4° of the true geometry.
    el = [89.0 if j >= 360 else 0.0 for j in range(N_AZ)]
    nan = [math.nan] * N_AZ
    wall = make_mask(0.0, 0.0, el, nan, nan, nan, nan)
    # Centre 20° before the wall: no strip reaches it (the true spread would).
    assert disc_fraction(wall, 160.0, 88.0, RHO_EARTH) == pytest.approx(1.0, abs=1e-12)
    # Centre 18° before the wall: the outermost strip is behind it.
    assert disc_fraction(wall, 162.0, 88.0, RHO_EARTH) < 0.999


def test_disc_any():
    flat = formula_mask("flat:0").el

    def hor(az):
        return horizon_at(flat, az)

    # Upper limb above the horizon although the centre is below it.
    assert disc_any(hor, 100.0, -0.2, RHO_SUN)
    assert not disc_any(hor, 100.0, -RHO_SUN, RHO_SUN)  # tangent from below: not strictly above
    assert not disc_any(hor, 100.0, -0.3, RHO_SUN)
    assert disc_any(hor, 100.0, 5.0, RHO_SUN)
    # Only a side column sees the disc: a narrow notch in a 5° wall, at the azimuth of column q = +0.8.
    notch_az = 100.0 + 0.8 * RHO_EARTH  # el_c = 0, so cos(el) = 1

    def notch(az):
        return -5.0 if abs(az - notch_az) < 0.01 else 5.0

    assert disc_any(notch, 100.0, 0.0, RHO_EARTH)
    assert not disc_any(lambda az: 5.0, 100.0, 0.0, RHO_EARTH)
