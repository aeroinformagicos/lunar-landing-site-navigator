# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""SPICE kernels, time conversions, the `spkcpo` reference and the shielding of the frame.

docs/spec/05_efemerides.md §2, §3, §8.1, §8.3, §8.5 and §8.6; 03_datos_y_fuentes.md §2.
Expected values come from the specification and from tests/golden/horizons_smoke.csv (JPL Horizons).
This is the only place of the repository, with the other test directories, where the forbidden
frames IAU_MOON and MOON_PA may be named: the tests below prove why they are forbidden.
"""

from __future__ import annotations

import csv
import subprocess
from pathlib import Path

import numpy as np
import pytest
import spiceypy
from spiceypy.utils.exceptions import SpiceyError

from pipeline.common.constants import ABCORR, FRAME
from pipeline.common.geo import azel_from_vector, enu_basis, site_position_km
from pipeline.common.timeutil import iso_to_unix, unix_to_et, unix_to_iso, utc_iso_to_et
from pipeline.ephem.kernels import KERNEL_FILES, KernelMissing, default_kernels_dir, load_kernels
from pipeline.ephem.spice_ref import azel_spice
from pipeline.tests.conftest import KERNELS, KERNELS_SKIP_MSG, REPO_ROOT, kernels_present

SMOKE_CSV = REPO_ROOT / "tests" / "golden" / "horizons_smoke.csv"
SMOKE_COLUMNS = [
    "case", "site_id", "lat_deg", "lon_deg", "alt_km", "target", "utc",
    "az_deg", "el_deg", "ang_diam_arcsec", "range_km",
]  # fmt: skip

# 05 §8.3: tolerance of the reference function against Horizons, azimuth and elevation.
HORIZONS_TOL_DEG = 0.0005
# 03 §2: numerical check written in the frame kernel itself. ET = 2022 SEP 30 TDB, geometric.
TF_ET = 717768000.0
TF_EARTH_ME_KM = (374008.654, -23435.970, 10141.334)
TF_EARTH_PA_KM = (373997.028, -23558.987, 10284.057)
TF_TOL_KM = 0.001
# 05 §8.5: measured figures of the plan, maximum |Δ elevation| over every hour of 2025.
ME_VS_PA = [
    ("im-2-planned", -84.78, 29.13, 0.0227),
    ("blue-ghost-1", 18.56, 61.81, 0.0156),
]
ME_VS_PA_TOL_DEG = 0.002
ME_VS_PA_MIN_DEG = 0.010
# naif0012.tls: TDB − UTC = 32.184 s (DELTET/DELTA_T_A) + 37 s (DELTET/DELTA_AT since 2017-01-01),
# plus a periodic term of amplitude 1.657 ms (DELTET/K).
TDB_MINUS_UTC_S = 69.184
TDB_PERIODIC_TOL_S = 0.002


@pytest.fixture(scope="module")
def kernels(kernels_dir):
    if not kernels_present():
        pytest.skip(KERNELS_SKIP_MSG)
    load_kernels(kernels_dir)


def _smoke_rows() -> list[dict[str, str]]:
    with SMOKE_CSV.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


# ---------------------------------------------------------------- time (05 §2), no kernels needed


def test_iso_to_unix_segment_starts_and_leap_years():
    # 05 §4.2: first samples of the two segments of the table.
    assert iso_to_unix("2023-12-31T23:00:00Z") == 1704063600.0
    assert iso_to_unix("1968-12-31T23:00:00Z") == -31539600.0
    assert iso_to_unix("1970-01-01T00:00:00Z") == 0.0
    # 05 §4.2: 21 years with 6 leap years = 7671 days; 1969-1973 = 1461 days.
    assert iso_to_unix("2045-01-01T00:00:00Z") - iso_to_unix("2024-01-01T00:00:00Z") == 7671 * 86400
    assert iso_to_unix("1973-01-01T00:00:00Z") - iso_to_unix("1969-01-01T00:00:00Z") == 1461 * 86400
    # 05 §2: 2028-02-29T12:00:00Z exists.
    assert iso_to_unix("2028-02-29T12:00:00Z") - iso_to_unix("2028-02-28T12:00:00Z") == 86400
    assert iso_to_unix("2028-03-01T00:00:00Z") - iso_to_unix("2028-02-29T12:00:00Z") == 43200
    # Seconds and fractions are optional.
    assert iso_to_unix("2025-03-16T18:15Z") == iso_to_unix("2025-03-16T18:15:00Z")
    assert iso_to_unix("2025-03-16T18:15:00.250Z") == iso_to_unix("2025-03-16T18:15:00Z") + 0.25


@pytest.mark.parametrize(
    "bad",
    [
        "2027-02-29T12:00:00Z",  # not a leap year
        "2025-03-14T06:00:60Z",  # second 60 is not representable in Unix time
        "2025-03-14T06:00:00",  # no Z
        "2025-03-14 06:00:00Z",
        "2025-13-01T00:00:00Z",
        "2025-03-14T24:00:00Z",
        "",
        None,
    ],
)
def test_invalid_instants_are_rejected(bad):
    with pytest.raises(ValueError, match="Invalid UTC instant"):
        iso_to_unix(bad)
    with pytest.raises(ValueError, match="Invalid UTC instant"):
        utc_iso_to_et(bad)


def test_unix_to_iso_round_trip_and_negative_times():
    assert unix_to_iso(1704063600) == "2023-12-31T23:00:00.000000Z"
    assert unix_to_iso(-31539600) == "1968-12-31T23:00:00.000000Z"  # before 1970 (apollo segment)
    assert unix_to_iso(0.5) == "1970-01-01T00:00:00.500000Z"
    assert unix_to_iso(iso_to_unix("2028-02-29T12:00:00Z")) == "2028-02-29T12:00:00.000000Z"
    rng = np.random.default_rng(5)
    for t in rng.integers(-31539600, 2366841600, 200):
        assert iso_to_unix(unix_to_iso(int(t))) == float(t)
    for bad in (float("nan"), float("inf")):
        with pytest.raises(ValueError, match="Invalid Unix time"):
            unix_to_iso(bad)


# ---------------------------------------------------------------- kernels (05 §2, §8.1)


def test_default_kernels_dir_follows_the_environment(monkeypatch, tmp_path):
    monkeypatch.setenv("LLSN_DATA_DIR", str(tmp_path))
    assert default_kernels_dir() == tmp_path / "kernels"
    monkeypatch.delenv("LLSN_DATA_DIR")
    assert default_kernels_dir() == Path("data") / "kernels"


def test_kernel_list_is_the_four_of_the_specification():
    assert KERNEL_FILES == (
        "naif0012.tls", "de440.bsp", "moon_pa_de440_200625.bpc", "moon_de440_250416.tf",
    )  # fmt: skip
    assert set(KERNEL_FILES) == set(KERNELS)


def test_missing_kernel_message(tmp_path):
    with pytest.raises(KernelMissing) as err:
        load_kernels(tmp_path)
    assert str(err.value) == "Missing SPICE kernel: naif0012.tls. Run `make data-fetch`."
    (tmp_path / "naif0012.tls").write_text("")
    with pytest.raises(KernelMissing, match=r"Missing SPICE kernel: de440\.bsp\. Run `make data-fetch`\."):
        load_kernels(tmp_path)


@pytest.mark.kernels
def test_exactly_four_kernels_loaded(kernels, kernels_dir):
    assert spiceypy.ktotal("ALL") == 4
    loaded = [Path(spiceypy.kdata(i, "ALL")[0]).name for i in range(4)]
    assert loaded == list(KERNEL_FILES)
    # Loading again does not add anything.
    load_kernels(kernels_dir)
    assert spiceypy.ktotal("ALL") == 4
    # Anything else in the pool is unloaded: reload from a clean pool gives four again.
    spiceypy.kclear()
    assert spiceypy.ktotal("ALL") == 0
    load_kernels(kernels_dir)
    assert spiceypy.ktotal("ALL") == 4


@pytest.mark.kernels
def test_frame_kernel_own_check_value(kernels):
    state, _ = spiceypy.spkezr("EARTH", TF_ET, FRAME, "NONE", "MOON")
    np.testing.assert_allclose(state[:3], TF_EARTH_ME_KM, atol=TF_TOL_KM, rtol=0)
    # The same check in the principal-axes frame gives other numbers: the frames are not the same.
    state_pa, _ = spiceypy.spkezr("EARTH", TF_ET, "MOON_PA", "NONE", "MOON")
    np.testing.assert_allclose(state_pa[:3], TF_EARTH_PA_KM, atol=TF_TOL_KM, rtol=0)


@pytest.mark.kernels
def test_utc_to_et(kernels):
    # 03 §2: ET = 717768000.0 is 2022 SEP 30 00:00:00 TDB.
    et = utc_iso_to_et("2022-09-30T00:00:00Z")
    assert et == pytest.approx(TF_ET + TDB_MINUS_UTC_S, abs=TDB_PERIODIC_TOL_S)
    # After the last leap second of the kernel (2017-01-01) SPICE keeps 37 s (05 §2).
    for iso in ("2025-03-14T06:00:00Z", "2028-02-29T12:00:00Z", "2044-12-31T23:00:00Z"):
        elapsed = iso_to_unix(iso) - iso_to_unix("2022-09-30T00:00:00Z")
        assert utc_iso_to_et(iso) == pytest.approx(et + elapsed, abs=2 * TDB_PERIODIC_TOL_S)
        assert unix_to_et(iso_to_unix(iso)) == utc_iso_to_et(iso)
    # Before 1970 (apollo segment): an hour of Unix time is an hour of ephemeris time.
    t0 = iso_to_unix("1968-12-31T23:00:00Z")
    assert unix_to_et(t0 + 3600) - unix_to_et(t0) == pytest.approx(3600.0, abs=1e-5)


# ---------------------------------------------------------------- reference against Horizons (05 §8.3)


def test_smoke_file_has_the_15_rows_of_the_specification():
    rows = _smoke_rows()
    assert list(rows[0].keys()) == SMOKE_COLUMNS
    assert len(rows) == 15
    assert {r["target"] for r in rows} == {"sun", "earth"}
    assert [(r["site_id"], r["target"]) for r in rows].count(("val-899s-2100m", "sun")) == 5
    for r in rows:
        assert r["utc"].endswith("Z")
        assert -180.0 < float(r["lon_deg"]) <= 180.0
        assert 0.0 <= float(r["az_deg"]) < 360.0
        iso_to_unix(r["utc"])


@pytest.mark.kernels
def test_reference_against_horizons_smoke_rows(kernels):
    worst_az = worst_el = worst_rng = 0.0
    for r in _smoke_rows():
        az, el, rng = azel_spice(
            r["target"].upper(), utc_iso_to_et(r["utc"]),
            float(r["lat_deg"]), float(r["lon_deg"]), 1000.0 * float(r["alt_km"]),
        )  # fmt: skip
        d_az = abs((az - float(r["az_deg"]) + 540.0) % 360.0 - 180.0)
        d_el = abs(el - float(r["el_deg"]))
        worst_az, worst_el = max(worst_az, d_az), max(worst_el, d_el)
        assert d_az < HORIZONS_TOL_DEG, (r, az)
        assert d_el < HORIZONS_TOL_DEG, (r, el)
        if r["range_km"]:  # reported, not asserted: the specification gives no tolerance for it
            worst_rng = max(worst_rng, abs(rng - float(r["range_km"])))
    print(
        f"\nazel_spice vs Horizons, 15 rows: max |d az| = {worst_az:.2e} deg, "
        f"max |d el| = {worst_el:.2e} deg, max |d range| = {worst_rng:.3f} km"
    )


@pytest.mark.kernels
def test_reference_rejects_other_targets(kernels):
    with pytest.raises(ValueError, match="Unknown target"):
        azel_spice("MARS", 0.0, 0.0, 0.0, 0.0)


@pytest.mark.kernels
def test_sunset_at_blue_ghost_on_a_smooth_moon(kernels):
    # 05 §8.3: on a smooth Moon the centre of the Sun sets between 20:10 and 20:11 UTC.
    _, el_before, _ = azel_spice("SUN", utc_iso_to_et("2025-03-16T20:10:00Z"), 18.56, 61.81, 0.0)
    _, el_after, _ = azel_spice("SUN", utc_iso_to_et("2025-03-16T20:11:00Z"), 18.56, 61.81, 0.0)
    assert el_before > 0.0 > el_after
    seconds = el_before / (el_before - el_after) * 60.0
    assert seconds == pytest.approx(39.0, abs=1.0)


# ---------------------------------------------------------------- MOON_ME against MOON_PA (05 §8.5)


def _elevations_in_frame(target: str, ets, lat_deg: float, lon_deg: float, frame: str) -> np.ndarray:
    """Same computation as ``azel_spice`` with ``frame`` as the frame of the site and of the output."""
    pos = site_position_km(lat_deg, lon_deg, 0.0)
    vectors = np.array(
        [spiceypy.spkcpo(target, et, frame, "OBSERVER", ABCORR, pos, "MOON", frame)[0][:3] for et in ets]
    )
    return azel_from_vector(vectors, *enu_basis(lat_deg, lon_deg))[1]


@pytest.fixture(scope="module")
def hours_of_2025_et(kernels) -> list[float]:
    t0 = iso_to_unix("2025-01-01T00:00:00Z")
    hours = int((iso_to_unix("2026-01-01T00:00:00Z") - t0) // 3600)
    assert hours == 8760
    return [unix_to_et(t0 + 3600.0 * k) for k in range(hours)]


@pytest.mark.kernels
@pytest.mark.parametrize(("site_id", "lat", "lon", "expected_max"), ME_VS_PA)
def test_mean_earth_frame_differs_from_principal_axes(hours_of_2025_et, site_id, lat, lon, expected_max):
    ets = hours_of_2025_et
    worst = 0.0
    for target in ("SUN", "EARTH"):
        el_me = np.array([azel_spice(target, et, lat, lon, 0.0)[1] for et in ets])
        el_pa = _elevations_in_frame(target, ets, lat, lon, "MOON_PA")
        worst = max(worst, float(np.max(np.abs(el_me - el_pa))))
        # The helper is the reference function when it is given the project frame.
        np.testing.assert_array_equal(_elevations_in_frame(target, ets[::730], lat, lon, FRAME), el_me[::730])
    print(f"\n{site_id}: max |d elevation| MOON_ME vs MOON_PA over 2025 = {worst:.5f} deg")
    assert worst > ME_VS_PA_MIN_DEG  # fails if somebody "unifies" the frames
    assert worst == pytest.approx(expected_max, abs=ME_VS_PA_TOL_DEG)


# ---------------------------------------------------------------- IAU_MOON fails (05 §8.6)


@pytest.mark.kernels
def test_iau_moon_cannot_be_evaluated(kernels):
    with pytest.raises(SpiceyError):
        spiceypy.pxform("IAU_MOON", "J2000", 0.0)
    with pytest.raises(SpiceyError):
        spiceypy.spkpos("SUN", 0.0, "IAU_MOON", "LT+S", "MOON")
    # The project frame does work with the same four kernels.
    spiceypy.pxform(FRAME, "J2000", 0.0)
    assert spiceypy.ktotal("ALL") == 4


def _is_test_file(rel: str) -> bool:
    return rel.startswith("pipeline/tests/") or "/__tests__/" in rel


def test_forbidden_frames_only_named_in_tests():
    # 05 §8.6: grep -R "IAU_MOON\|MOON_PA" pipeline/ web/src/ only matches test code (decision D-67).
    out = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "--", "pipeline", "web/src"],
        cwd=REPO_ROOT, capture_output=True, text=True, check=True, encoding="utf-8",
    ).stdout  # fmt: skip
    offenders = []
    for rel in out.splitlines():
        path = REPO_ROOT / rel
        if not path.is_file() or _is_test_file(rel):
            continue
        text = path.read_bytes().decode("utf-8", errors="ignore")
        if "IAU_MOON" in text or "MOON_PA" in text:
            offenders.append(rel)
    assert not offenders, f"Forbidden frame named outside the tests: {offenders}"
