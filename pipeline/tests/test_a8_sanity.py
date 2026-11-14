# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Case A8: geometric sanity checks over all of 2024–2044 (11_validacion.md §4, A8).

Smooth Moon, observer at 0 m, hourly grid of the whole ``main`` segment of the ephemeris table
(2024-01-01T00:00Z to 2045-01-01T00:00Z). Expected, exactly:

- Chang'e 4 (far side): the Earth is always below the horizon;
- (0°, 0°): the Earth is always above 75° of elevation;
- (−90°, 0°): |elevation of the Sun| < 1.6° and |elevation of the Earth| < 7.5°.

On a smooth Moon with the observer at 0 m the horizon is 0° in every azimuth (06 §9), so «above the
horizon» is «elevation > 0».

The grid instants fall on the table samples, where the four-point Lagrange interpolation returns the
sample itself (05 §4.5): the test reads the samples and turns them into elevations with
``azel_from_vector``, like ``sky_at`` (checked at a few instants). Marker ``kernels``: the extreme of
each check is recomputed with SPICE (``azel_spice``).
"""

from __future__ import annotations

import numpy as np
import pytest

from pipeline.common.geo import azel_from_vector
from pipeline.common.timeutil import unix_to_et, unix_to_iso
from pipeline.ephem.interp import site_frame, sky_at
from pipeline.ephem.kernels import load_kernels
from pipeline.ephem.spice_ref import azel_spice
from pipeline.ephem.table import RECORD_BYTES
from pipeline.tests.conftest import KERNELS_SKIP_MSG, kernels_present

# 04_catalogo_sitios.md (contract/sites.catalog.json): Chang'e 4; 11 §4, A8: the other two points.
CHANGE4 = (-45.4561, 177.5885)
SUB_EARTH = (0.0, 0.0)
SOUTH_POLE = (-90.0, 0.0)
# 11 §4, A8: limits, degrees.
EARTH_MIN_EL_SUB_EARTH = 75.0
POLE_SUN_MAX_ABS_EL = 1.6
POLE_EARTH_MAX_ABS_EL = 7.5
# 11 §4, A8: 2024–2044 (the main segment of the table, 05 §4.4).
GRID_FROM, GRID_TO = "2024-01-01T00:00:00Z", "2045-01-01T00:00:00Z"
# 05 §8.4: the table against SPICE, degrees (invariant of A9).
TABLE_VS_SPICE_DEG = 0.001

SOURCE = {"label": "Lunar orbital geometry", "url": ""}


@pytest.fixture(scope="module")
def grid(real_table):
    """Unix times and the Sun and Earth vectors (MOON_ME, km) at every hour of the main segment."""
    seg = next(s for s in real_table.segments if s.id == "main")
    first = seg.byte_offset // RECORD_BYTES
    k = np.arange(1, seg.n - 1)  # valid_from = t0 + step ... valid_to = t0 + step·(n − 2)
    t = seg.t0_unix + k * real_table.step_s
    rows = real_table.data[first + k].astype(np.float64)
    assert unix_to_iso(float(t[0]))[:19] == GRID_FROM[:19] and unix_to_iso(float(t[-1]))[:19] == GRID_TO[:19]
    return t, rows[:, :3], rows[:, 3:]


def elevations(grid, lat: float, lon: float) -> tuple[np.ndarray, np.ndarray]:
    t, sun, earth = grid
    f = site_frame(lat, lon, 0.0)
    _, sun_el, _ = azel_from_vector(sun - f.p, f.e, f.n, f.u)
    _, earth_el, _ = azel_from_vector(earth - f.p, f.e, f.n, f.u)
    return sun_el, earth_el


def test_grid_is_the_table_at_the_samples(real_table, grid):
    t = grid[0]
    for i in (0, 1, 12_345, len(t) // 2, len(t) - 1):
        for lat, lon in (CHANGE4, SUB_EARTH, SOUTH_POLE):
            sky = sky_at(real_table, site_frame(lat, lon, 0.0), float(t[i]))
            sun_el, earth_el = elevations((t[i : i + 1], grid[1][i : i + 1], grid[2][i : i + 1]), lat, lon)
            assert abs(sky["sun"]["el_deg"] - sun_el[0]) < 1e-9
            assert abs(sky["earth"]["el_deg"] - earth_el[0]) < 1e-9


@pytest.fixture(scope="module")
def kernels(kernels_dir):
    if not kernels_present():
        pytest.skip(KERNELS_SKIP_MSG)
    load_kernels(kernels_dir)


def _detail(label: str, limit: float, value: float, ok: bool, below: bool) -> dict:
    margin = (limit - value) if below else (value - limit)
    return {"label": label, "expected": f"{'<' if below else '>'} {limit}", "obtained": round(value, 4),
            "abs_err": round(abs(margin), 4), "unit": "deg", "ok": ok}


@pytest.mark.kernels
def test_a8_sanity(grid, kernels, record_case):
    t = grid[0]
    _, c4_earth = elevations(grid, *CHANGE4)
    _, se_earth = elevations(grid, *SUB_EARTH)
    pole_sun, pole_earth = elevations(grid, *SOUTH_POLE)
    checks = [
        # label, signed elevations, value checked, limit, below (value < limit) or above, site, body, index
        ("Chang'e 4: highest Earth elevation", c4_earth, c4_earth.max(), 0.0, True, CHANGE4, "EARTH",
         c4_earth.argmax()),
        ("(0, 0): lowest Earth elevation", se_earth, se_earth.min(), EARTH_MIN_EL_SUB_EARTH, False, SUB_EARTH,
         "EARTH", se_earth.argmin()),
        ("South pole: largest |Sun elevation|", pole_sun, np.abs(pole_sun).max(), POLE_SUN_MAX_ABS_EL, True,
         SOUTH_POLE, "SUN", np.abs(pole_sun).argmax()),
        ("South pole: largest |Earth elevation|", pole_earth, np.abs(pole_earth).max(), POLE_EARTH_MAX_ABS_EL,
         True, SOUTH_POLE, "EARTH", np.abs(pole_earth).argmax()),
    ]
    details, lines, all_ok = [], [], True
    for label, signed, value, limit, below, (lat, lon), body, i in checks:
        value = float(value)
        ok = value < limit if below else value > limit
        all_ok &= ok
        when = unix_to_iso(float(t[i]))[:19] + "Z"
        details.append(_detail(f"{label} ({when})", limit, value, ok, below))
        # The extreme, recomputed with SPICE at the same instant.
        _, el_spice, _ = azel_spice(body, unix_to_et(float(t[i])), lat, lon, 0.0)
        assert abs(el_spice - float(signed[i])) < TABLE_VS_SPICE_DEG, (label, el_spice, float(signed[i]))
        lines.append(f"{label}: {value:.4f} deg at {when} (SPICE {el_spice:.4f}); limit {limit}")
    obtained = "; ".join(f"{d['label']}: {d['obtained']} deg" for d in details)
    record_case("A8", "pass" if all_ok else "fail",
                "Chang'e 4: Earth always below the horizon. (0, 0): Earth always above 75 deg. "
                "South pole: |Sun elevation| < 1.6 deg and |Earth elevation| < 7.5 deg",
                obtained, "Exact", SOURCE, details,
                f"Smooth Moon, observer at 0 m, every hour from {GRID_FROM} to {GRID_TO} "
                f"({len(t)} instants).")
    print(f"\nA8 ({len(t)} hourly instants):\n  " + "\n  ".join(lines))
    assert all_ok, details
