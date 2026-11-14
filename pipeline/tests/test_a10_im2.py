# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Case A10 (secondary): the Sun at the planned IM-2 site in March 2025 (11_validacion.md §4, A10).

Site ``im-2-planned`` (84.78° S, 29.13° E). Expected (Horizons, 05 §8.3; tolerances of the T-22 card):

- smooth Moon, observer at 0 m: sunrise of the centre on 4 March at 09:14 UTC (± 2 min) and the Sun
  at 2.46° (± 0.01°) on 6 March at 17:30 UTC (marker ``kernels``: the elevation is also recomputed
  with SPICE);
- with the LOLA polar mask, observer at 2 m: the Sun lower or later (marker ``data``).

A10 is computed and recorded, but it does not go to the validation page, and it does not claim that
the lander waited for sunrise (11 §4).
"""

from __future__ import annotations

import json

import pytest

from pipeline.cli.report import HORIZONS, iso_z
from pipeline.common.timeutil import iso_to_unix, unix_to_et, unix_to_iso
from pipeline.ephem.kernels import load_kernels
from pipeline.ephem.spice_ref import azel_spice
from pipeline.tests.conftest import KERNELS_SKIP_MSG, WEB_DATA, kernels_present
from pipeline.vis.events import find_crossings, sun_margin_fn
from pipeline.vis.sky import evaluate, frame_for, load_mask, smooth_mask

SITE_ID = "im-2-planned"
SITE = (-84.78, 29.13)  # 11 §4, A10
# 05 §8.3 and 11 §4, A10: smooth-Moon sunrise and the elevation of the Sun at the landing time.
SUNRISE = "2025-03-04T09:14:00Z"
SUNRISE_TOL_S = 120  # T-22 card: ± 2 min
LANDING = "2025-03-06T17:30:00Z"
EL_AT_LANDING = 2.46
EL_TOL_DEG = 0.01  # T-22 card: ± 0.01°
OBSERVER_RELIEF_M = 2  # observer height of the masks (07 §1)
# Interval searched: March 2025 (11 §4, A10).
T_A, T_B = "2025-03-01T00:00:00Z", "2025-04-01T00:00:00Z"
TABLE_VS_SPICE_DEG = 0.001  # 05 §8.4


def first_sunrise(table, frame, mask) -> float:
    crossings, _ = find_crossings(sun_margin_fn(table, frame, mask), iso_to_unix(T_A), iso_to_unix(T_B))
    rises = [c["t"] for c in crossings if c["rising"]]
    assert rises, "no sunrise in March 2025"
    return rises[0]


def smooth_result(table) -> tuple[float, float]:
    flat = smooth_mask(0)
    frame = frame_for(*SITE, flat)
    return first_sunrise(table, frame, flat), evaluate(table, frame, flat, iso_to_unix(LANDING)).sun.el_deg


@pytest.fixture(scope="module")
def kernels(kernels_dir):
    if not kernels_present():
        pytest.skip(KERNELS_SKIP_MSG)
    load_kernels(kernels_dir)


@pytest.mark.kernels
def test_a10_smooth_moon(real_table, kernels, record_case):
    sunrise, el = smooth_result(real_table)
    _, el_spice, _ = azel_spice("SUN", unix_to_et(iso_to_unix(LANDING)), *SITE, 0.0)
    assert abs(el - el_spice) < TABLE_VS_SPICE_DEG
    d_t = abs(sunrise - iso_to_unix(SUNRISE))
    d_el = abs(el - EL_AT_LANDING)
    ok_t, ok_el = d_t <= SUNRISE_TOL_S, d_el <= EL_TOL_DEG
    details = [
        {"label": "Smooth Moon, 0 m: sunrise", "expected": SUNRISE, "obtained": iso_z(unix_to_iso(sunrise)),
         "abs_err": d_t / 60.0, "unit": "min", "ok": ok_t},
        {"label": f"Smooth Moon, 0 m: Sun elevation at {LANDING}", "expected": EL_AT_LANDING,
         "obtained": round(el, 6), "abs_err": round(d_el, 6), "unit": "deg", "ok": ok_el},
    ]
    record_case("A10", "pass" if ok_t and ok_el else "fail",
                "Smooth Moon: sunrise 4 March 09:14 UTC; Sun at 2.46 deg on 6 March 17:30 UTC. "
                "With terrain: lower or later",
                f"Smooth Moon: sunrise {iso_z(unix_to_iso(sunrise))}, Sun at {el:.4f} deg",
                "2 min and 0.01 deg", HORIZONS, details, "", part="smooth")
    print(f"\nA10 smooth: sunrise {unix_to_iso(sunrise)} ({d_t:.0f} s), el {el:.6f} deg "
          f"(SPICE {el_spice:.6f}) at {LANDING}")
    assert ok_t and ok_el, details


@pytest.mark.data
def test_a10_with_relief(real_table, record_case):
    doc = json.loads((WEB_DATA / "horizon" / f"{SITE_ID}.json").read_text(encoding="utf-8"))
    if doc["relief"] != "lola_polar":
        pytest.skip(f"{SITE_ID} has no LOLA polar mask (relief {doc['relief']}): make sites")
    mask = load_mask(WEB_DATA, SITE_ID, OBSERVER_RELIEF_M)
    frame = frame_for(*SITE, mask)
    sunrise = first_sunrise(real_table, frame, mask)
    state = evaluate(real_table, frame, mask, iso_to_unix(LANDING))
    smooth_sunrise, smooth_el = smooth_result(real_table)
    later = sunrise > smooth_sunrise
    lower = state.sun.margin_deg < smooth_el
    ok = later or lower
    delay_h = (sunrise - smooth_sunrise) / 3600.0
    details = [
        {"label": f"{doc['relief_label']}, {OBSERVER_RELIEF_M} m: sunrise", "expected": "later than smooth",
         "obtained": iso_z(unix_to_iso(sunrise)), "abs_err": round(abs(delay_h), 3), "unit": "h",
         "ok": later},
        {"label": f"{doc['relief_label']}, {OBSERVER_RELIEF_M} m: Sun margin above the horizon at {LANDING}",
         "expected": f"< {smooth_el:.4f}", "obtained": round(state.sun.margin_deg, 4),
         "abs_err": round(abs(smooth_el - state.sun.margin_deg), 4), "unit": "deg", "ok": lower},
    ]
    record_case("A10", "pass" if ok else "fail",
                "Smooth Moon: sunrise 4 March 09:14 UTC; Sun at 2.46 deg on 6 March 17:30 UTC. "
                "With terrain: lower or later",
                f"With terrain: sunrise {iso_z(unix_to_iso(sunrise))} ({delay_h:+.1f} h), "
                f"Sun {state.sun.margin_deg:.4f} deg above the horizon at {LANDING}",
                "2 min and 0.01 deg", HORIZONS, details,
                f"Terrain {doc['relief_label']}, horizon {state.sun.horizon_deg:.4f} deg toward the Sun "
                "at landing.",
                part="relief")
    print(f"\nA10 relief: sunrise {unix_to_iso(sunrise)} ({delay_h:+.2f} h after smooth), margin "
          f"{state.sun.margin_deg:.4f} deg (horizon {state.sun.horizon_deg:.4f}) at {LANDING}")
    assert ok, details
