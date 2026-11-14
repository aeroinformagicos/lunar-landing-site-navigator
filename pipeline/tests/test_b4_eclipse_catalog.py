# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Case B4: solar eclipses seen from (0°, 0°) in 2025–2030 against the NASA lunar eclipse catalogue.

11_validacion.md §5, B4. Site (0°, 0°), smooth Moon, observer at 0 m, 2025-01-01 to 2031-01-01:
the intervals in which the Earth covers part of the Sun, searched with the eclipse events of the
product (07 §9: ``eclipse_timeline``, scan step of 10 min and bisection to 1 s). Expected:

(a) every detected interval contains the time of greatest eclipse of one row of
    ``tests/golden/eclipses_nasa.csv`` (± 3 h);
(b) the 6 total eclipses of the table are detected with a total phase;
(c) there are no more than 14 intervals.

Scanning six years every 10 min with the scalar reference would take minutes, so the hourly samples
of the ephemeris table (exact nodes, as in A8) first pick the hours where the two discs are within
:data:`SCREEN_MARGIN_DEG` of touching, and ``eclipse_timeline`` then runs on each of those stretches,
widened by :data:`SEARCH_PAD_S` on both sides. The Sun moves about 0.51°/h against the Earth in the
lunar sky (360° per synodic month), so no eclipse of 10 min or more can slip between two samples.

Marker ``kernels``: the catalogue gives the greatest eclipse in dynamical time (TD); SPICE converts it
to UTC (TD = TDB to better than 2 ms), and the kind of each interval at its mid point is recomputed
with SPICE alone (``azel_spice``), without the table.
"""

from __future__ import annotations

import csv
import math

import numpy as np
import pytest
import spiceypy

from pipeline.cli.report import ESPENAK
from pipeline.common.constants import R_EARTH_KM, R_SUN_KM
from pipeline.common.geo import azel_from_vector
from pipeline.common.timeutil import iso_to_unix, unix_to_et, unix_to_iso
from pipeline.ephem.interp import site_frame
from pipeline.ephem.kernels import load_kernels
from pipeline.ephem.spice_ref import azel_spice
from pipeline.ephem.table import RECORD_BYTES
from pipeline.tests.conftest import KERNELS_SKIP_MSG, REPO_ROOT, kernels_present
from pipeline.vis.eclipse import angular_sep, covered_share
from pipeline.vis.events import eclipse_timeline

GOLDEN = REPO_ROOT / "tests" / "golden"

# 11 §5, B4: input and expected values.
SITE = (0.0, 0.0)
T_FROM, T_TO = "2025-01-01T00:00:00Z", "2031-01-01T00:00:00Z"
MATCH_S = 3 * 3600  # (a) ± 3 h around the greatest eclipse
N_TOTAL = 6  # (b)
MAX_INTERVALS = 14  # (c)

# Screening of the hourly samples (see the module docstring; decision D-113).
SCREEN_MARGIN_DEG = 1.0  # two hours of the Sun's motion against the Earth
SEARCH_PAD_S = 2 * 3600


def catalogue() -> list[dict]:
    with open(GOLDEN / "eclipses_nasa.csv", newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def td_to_unix(date: str, td: str) -> float:
    """Unix time (UTC) of a dynamical time of the catalogue. Needs the leap-second kernel."""
    et = float(spiceypy.str2et(f"{date} {td} TDB"))
    naive = iso_to_unix(f"{date}T{td}Z")
    return naive + (et - unix_to_et(naive))


def candidate_stretches(t: np.ndarray, hit: np.ndarray, pad_s: float) -> list[tuple[float, float]]:
    """Stretches [first − pad, last + pad] of the runs of ``hit``, merged where they overlap."""
    out: list[list[float]] = []
    for i in np.flatnonzero(hit):
        a, b = float(t[i]) - pad_s, float(t[i]) + pad_s
        if out and a <= out[-1][1]:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return [(a, b) for a, b in out]


def test_candidate_stretches_merge_overlaps():
    t = np.arange(10) * 3600.0
    hit = np.array([0, 1, 1, 0, 0, 0, 0, 0, 1, 0], dtype=bool)
    assert candidate_stretches(t, hit, 7200) == [(-3600.0, 14400.0), (21600.0, 36000.0)]
    assert candidate_stretches(t, np.zeros(10, dtype=bool), 7200) == []


@pytest.fixture(scope="module")
def kernels(kernels_dir):
    if not kernels_present():
        pytest.skip(KERNELS_SKIP_MSG)
    load_kernels(kernels_dir)


def screen(real_table) -> list[tuple[float, float]]:
    """Stretches of the period to search: hours where the discs are within the margin of touching."""
    seg = next(s for s in real_table.segments if s.id == "main")
    first = seg.byte_offset // RECORD_BYTES
    k0 = int((iso_to_unix(T_FROM) - seg.t0_unix) // real_table.step_s)
    k1 = int((iso_to_unix(T_TO) - seg.t0_unix) // real_table.step_s)
    assert 1 <= k0 and k1 <= seg.n - 2, "2025-2030 must be inside the valid part of the table"
    k = np.arange(k0, k1 + 1)
    t = seg.t0_unix + k * real_table.step_s
    rows = real_table.data[first + k].astype(np.float64)
    f = site_frame(*SITE, 0.0)
    sun_az, sun_el, sun_km = azel_from_vector(rows[:, :3] - f.p, f.e, f.n, f.u)
    earth_az, earth_el, earth_km = azel_from_vector(rows[:, 3:] - f.p, f.e, f.n, f.u)
    a = np.degrees(np.arcsin(R_SUN_KM / sun_km))
    b = np.degrees(np.arcsin(R_EARTH_KM / earth_km))
    d_az, a1, a2 = np.radians(earth_az - sun_az), np.radians(sun_el), np.radians(earth_el)
    h = np.sin((a2 - a1) / 2) ** 2 + np.cos(a1) * np.cos(a2) * np.sin(d_az / 2) ** 2
    sep = np.degrees(2 * np.arcsin(np.minimum(1.0, np.sqrt(h))))
    stretches = candidate_stretches(t, sep < a + b + SCREEN_MARGIN_DEG, SEARCH_PAD_S)
    lo, hi = iso_to_unix(T_FROM), iso_to_unix(T_TO)
    return [(max(lo, x), min(hi, y)) for x, y in stretches]


def spice_kind(t: float) -> str:
    et = unix_to_et(t)
    sun_az, sun_el, sun_km = azel_spice("SUN", et, *SITE, 0.0)
    earth_az, earth_el, earth_km = azel_spice("EARTH", et, *SITE, 0.0)
    s = angular_sep(sun_az, sun_el, earth_az, earth_el)
    a = math.degrees(math.asin(R_SUN_KM / sun_km))
    b = math.degrees(math.asin(R_EARTH_KM / earth_km))
    return covered_share(s, a, b)[0]


@pytest.mark.kernels
def test_b4_eclipses_at_0_0_against_the_nasa_catalogue(real_table, kernels, record_case):
    rows = catalogue()
    assert len(rows) == 14 and sum(r["type"] == "total" for r in rows) == N_TOTAL
    greatest = [td_to_unix(r["date"], r["td_greatest"]) for r in rows]
    frame = site_frame(*SITE, 0.0)

    intervals = []  # (start, end, has totality, totality start, totality end)
    for a, b in screen(real_table):
        tl = eclipse_timeline(real_table, frame, a, b)
        for w in tl.windows:
            # The pad keeps every window away from the stretch borders (else the screen was too tight).
            assert not (w.open_start or w.open_end), (unix_to_iso(a), unix_to_iso(b))
            tot = [x for x in tl.totality if w.start_unix <= x.start_unix and x.end_unix <= w.end_unix]
            intervals.append((w.start_unix, w.end_unix, tot))

    # (a) each interval contains the greatest eclipse of a catalogue row, ± 3 h.
    details, matched = [], {}
    for start, end, tot in intervals:
        near = [i for i, g in enumerate(greatest) if start - MATCH_S <= g <= end + MATCH_S]
        row = rows[near[0]] if near else None
        if near:
            matched.setdefault(near[0], []).append((start, end, tot))
        mid = (start + end) / 2
        kind = "total" if tot else "partial"
        # SPICE alone, without the table: an eclipse at the mid point, total in a total interval.
        k_spice = spice_kind(mid)
        assert k_spice != "none" and (k_spice == "total" or not tot), (unix_to_iso(mid), k_spice)
        details.append({
            "label": f"Interval {unix_to_iso(start)[:16]}Z to {unix_to_iso(end)[11:16]}Z ({kind})",
            "expected": "Contains a catalogue maximum (+/- 3 h)",
            "obtained": f"{row['date']} {row['type']} eclipse" if row else "no catalogue eclipse",
            "abs_err": None, "unit": "", "ok": bool(near)})
    ok_a = all(d["ok"] for d in details)

    # (b) the six total eclipses are detected with a total phase.
    missing_total = []
    for i, r in enumerate(rows):
        if r["type"] != "total":
            continue
        found = any(tot for _, _, tot in matched.get(i, []))
        if not found:
            missing_total.append(r["date"])
        details.append({"label": f"Total eclipse of {r['date']}", "expected": "Detected with totality",
                        "obtained": "detected with totality" if found else "not detected as total",
                        "abs_err": None, "unit": "", "ok": found})
    ok_b = not missing_total

    # (c) no more than 14 intervals.
    ok_c = len(intervals) <= MAX_INTERVALS
    details.append({"label": "Number of intervals", "expected": f"<= {MAX_INTERVALS}",
                    "obtained": len(intervals), "abs_err": None, "unit": "", "ok": ok_c})

    n_total = sum(1 for _, _, tot in intervals if tot)
    unmatched = len(rows) - len(matched)
    ok = ok_a and ok_b and ok_c
    record_case(
        "B4", "pass" if ok else "fail",
        "Every detected interval contains a catalogue maximum; the 6 total eclipses are total",
        f"{len(intervals)} intervals, {n_total} with totality; "
        f"{len(matched)} of the {len(rows)} catalogue eclipses seen from (0, 0)",
        "Same date", ESPENAK, details,
        f"Site (0, 0), smooth Moon, observer at 0 m, {T_FROM[:10]} to {T_TO[:10]}, 10-min scan. "
        f"{unmatched} partial or penumbral lunar eclipses leave (0, 0) outside the Earth's shadow "
        "or penumbra, as expected. Catalogue times in TD converted to UTC with SPICE.")
    lines = [f"{d['label']}: {d['obtained']} ({'ok' if d['ok'] else 'FAIL'})" for d in details]
    print("\nB4:\n  " + "\n  ".join(lines))
    assert ok_a, [d for d in details if not d["ok"]]
    assert ok_b, missing_total
    assert ok_c, len(intervals)
