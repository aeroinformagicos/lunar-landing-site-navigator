# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Geometry of the eclipse: angular separation and overlap of two discs (07_visibilidad.md §9, §13.5).

Expected values: the table of 07 §13.5, textbook angles, and the overlap area integrated numerically
in this file (strips of the two circles), which does not use the closed formula under test.
"""

from __future__ import annotations

import math

import numpy as np
import pytest

from pipeline.ephem.interp import site_frame, sky_at
from pipeline.vis.eclipse import KINDS, angular_sep, covered_share, eclipse_margin_fns, eclipse_state

# 07 §13.5: apparent radii of the Sun (a) and of the Earth (b) seen from the Moon, degrees.
A = 0.265
B = 0.95


def overlap_share_by_strips(s: float, a: float, b: float, n: int = 200_001) -> float:
    """Share of the disc of radius ``a`` (centre 0) inside the disc of radius ``b`` (centre ``s``).

    Midpoint rule over vertical strips of the small disc: at abscissa x, the common chord is
    2·min(√(a² − x²), √(b² − (x − s)²)).
    """
    x = -a + (np.arange(n) + 0.5) * (2 * a / n)
    half_a = np.sqrt(a * a - x * x)
    half_b = np.sqrt(np.clip(b * b - (x - s) ** 2, 0.0, None))
    return float(np.sum(2 * np.minimum(half_a, half_b)) * (2 * a / n) / (math.pi * a * a))


# ---------------------------------------------------------------- 07 §13.5


def test_none_total_and_the_two_limits():
    assert KINDS == ("none", "partial", "total")
    assert covered_share(1.3, A, B) == ("none", 0.0)
    assert covered_share(0.5, A, B) == ("total", 1.0)
    assert covered_share(A + B, A, B)[1] == 0.0  # s = 1.215: first contact
    assert covered_share(B - A, A, B)[1] == 1.0  # s = 0.685: start of totality
    assert covered_share(0.0, A, B) == ("total", 1.0)


def test_partial_when_the_limb_of_the_earth_crosses_the_centre_of_the_sun():
    kind, covered = covered_share(0.95, A, B)
    assert kind == "partial" and 0.0 < covered < 0.5


def test_covered_decreases_with_the_separation_and_is_continuous_at_the_contacts():
    seps = np.linspace(B - A, A + B, 2001)
    covered = [covered_share(float(s), A, B)[1] for s in seps]
    assert all(0.0 <= c <= 1.0 for c in covered)
    assert all(x > y for x, y in zip(covered, covered[1:], strict=False))
    assert covered_share(B - A + 1e-9, A, B)[1] == pytest.approx(1.0, abs=1e-6)
    assert covered_share(A + B - 1e-9, A, B)[1] == pytest.approx(0.0, abs=1e-6)


@pytest.mark.parametrize("s", [0.7, 0.8, 0.95, 1.0, 1.1, 1.2])
def test_partial_share_equals_the_area_integrated_by_strips(s):
    kind, covered = covered_share(s, A, B)
    assert kind == "partial"
    assert covered == pytest.approx(overlap_share_by_strips(s, A, B), abs=1e-6)


def test_equal_discs_half_overlap_is_the_textbook_lens():
    # Two unit discs one radius apart share 2π/3 − √3/2 of area (the lens of two unit circles).
    kind, covered = covered_share(1.0, 1.0, 1.0)
    assert kind == "partial"
    assert covered == pytest.approx((2 * math.pi / 3 - math.sqrt(3) / 2) / math.pi, abs=1e-12)


# ---------------------------------------------------------------- angular separation (07 §9)


@pytest.mark.parametrize(
    ("p", "q", "expected"),
    [
        ((10.0, 20.0), (10.0, 20.0), 0.0),
        ((0.0, 0.0), (90.0, 0.0), 90.0),
        ((0.0, 0.0), (180.0, 0.0), 180.0),
        ((37.0, 0.0), (211.0, 90.0), 90.0),  # horizon to zenith, any azimuth
        ((0.0, 90.0), (0.0, -90.0), 180.0),
        ((359.9, 0.0), (0.1, 0.0), 0.2),  # across azimuth 0°/360°
        ((120.0, 10.0), (120.0, -5.5), 15.5),  # same azimuth: difference of elevations
        ((0.0, 60.0), (180.0, 60.0), 60.0),  # over the zenith
    ],
)
def test_angular_sep_known_angles(p, q, expected):
    assert angular_sep(*p, *q) == pytest.approx(expected, abs=1e-9)
    assert angular_sep(*q, *p) == pytest.approx(expected, abs=1e-9)


def test_angular_sep_small_angles_and_the_cosine_of_the_elevation():
    # 1° of azimuth at 60° of elevation is about 0.5° of arc (exactly 2·asin(cos 60°·sin 0.5°)).
    expected = 2 * math.degrees(math.asin(0.5 * math.sin(math.radians(0.5))))
    assert angular_sep(100.0, 60.0, 101.0, 60.0) == pytest.approx(expected, abs=1e-12)
    # The haversine keeps its precision for arcseconds.
    assert angular_sep(250.0, 0.0, 250.0, 1e-6) == pytest.approx(1e-6, rel=1e-6)


def test_angular_sep_equals_the_angle_between_unit_vectors():
    rng = np.random.default_rng(9)

    def unit(az, el):
        az, el = math.radians(az), math.radians(el)
        return np.array([math.cos(el) * math.sin(az), math.cos(el) * math.cos(az), math.sin(el)])

    for _ in range(200):
        az1, az2 = rng.uniform(0, 360, 2)
        el1, el2 = rng.uniform(-90, 90, 2)
        u, v = unit(az1, el1), unit(az2, el2)
        angle = math.degrees(math.atan2(np.linalg.norm(np.cross(u, v)), float(u @ v)))
        assert angular_sep(az1, el1, az2, el2) == pytest.approx(angle, abs=1e-9)


# ---------------------------------------------------------------- eclipse_state (07 §9)


def _sky(sun_az, sun_el, earth_az, earth_el, a=A, b=B):
    return {
        "sun": {"az_deg": sun_az, "el_deg": sun_el, "range_km": 1.5e8, "radius_deg": a},
        "earth": {"az_deg": earth_az, "el_deg": earth_el, "range_km": 3.8e5, "radius_deg": b},
    }


def test_eclipse_state_carries_kind_share_and_separation():
    far = eclipse_state(_sky(90.0, 10.0, 270.0, 30.0))
    assert (far.kind, far.covered) == ("none", 0.0) and far.sep_deg == pytest.approx(140.0, abs=1e-9)
    total = eclipse_state(_sky(258.0, 29.0, 258.0, 29.5))
    assert (total.kind, total.covered) == ("total", 1.0) and total.sep_deg == pytest.approx(0.5, abs=1e-9)
    partial = eclipse_state(_sky(258.0, 29.0, 258.0, 29.95))
    assert partial.kind == "partial" and partial.sep_deg == pytest.approx(0.95, abs=1e-9)
    assert partial.covered == pytest.approx(covered_share(0.95, A, B)[1], abs=1e-9)


def test_margins_of_the_eclipse_events_follow_the_state(example_table):
    # 07 §6.2: (sun.radius + earth.radius) − sep and (earth.radius − sun.radius) − sep.
    frame = site_frame(0.0, 0.0, 0.0)
    f_eclipse, f_totality = eclipse_margin_fns(example_table, frame)
    seg = example_table.segments[0]
    rng = np.random.default_rng(13)
    for t in rng.uniform(seg.valid_from_unix, seg.valid_to_unix, 200):
        sky = sky_at(example_table, frame, float(t))
        state = eclipse_state(sky)
        a, b = sky["sun"]["radius_deg"], sky["earth"]["radius_deg"]
        assert b > a  # the Earth is always the bigger disc
        assert f_eclipse(float(t)) == a + b - state.sep_deg
        assert f_totality(float(t)) == b - a - state.sep_deg
        assert (state.kind != "none") == (f_eclipse(float(t)) > 0)
        assert (state.kind == "total") == (f_totality(float(t)) >= 0)
