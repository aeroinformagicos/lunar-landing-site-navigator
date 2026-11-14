# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""T-09: site catalog, site masks on disk, profile-csv, the site batch, regions and publish.

docs/spec/04_catalogo_sitios.md §6-§7, 06_horizonte.md §5, §8, §10.8 and 09_contrato_datos.md
§3.1, §4-§6, §8.2. The fast tests use an analytic terrain (``SyntheticGrid``); the tests marked
``data`` use the real DEMs of $LLSN_DATA_DIR and are skipped without them. Expected values come
from the specification (tables of 04, hand figures of the card), never from the code under test.
"""

from __future__ import annotations

import csv
import gzip
import io
import json
import math
import shutil
from pathlib import Path

import numpy as np
import pytest

from pipeline.cli import contract_check
from pipeline.common.catalog import (
    CATALOG_FIELDS,
    PIPELINE_FIELDS,
    batch_order,
    catalog_regions,
    default_catalog,
    load_catalog,
    sites_by_id,
)
from pipeline.dem.grids import SyntheticGrid
from pipeline.dem.stack import P1_NAME, DemDataMissing, DemStack
from pipeline.horizon import cube, site_mask
from pipeline.horizon.engine_ref import horizon_mask
from pipeline.horizon.profile import decode_profile

REPO_ROOT = Path(__file__).resolve().parents[2]
EXAMPLES = REPO_ROOT / "contract" / "examples" / "data"
R = 1_737_400.0

# --- 04 §2-§4: what the catalog must hold -------------------------------------------------------
N_LANDINGS, N_REGIONS, N_VALIDATION = 27, 9, 5
SLDEM_LAT_MAX_DEG = 50.1  # 04 §7: the 300 km circle fits in SLDEM2015
# 04 §3: x and y of each region (metres, rounded to 10 m in the table).
REGION_XY_M = {
    "de-gerlache-rim-2": (-49_310, 23_410),
    "haworth": (-37_610, 89_480),
    "malapert-massif": (-420, 121_340),
    "mons-mouton": (73_330, 118_740),
    "mons-mouton-plateau": (88_060, 148_900),
    "nobile-rim-1": (84_570, 111_020),
    "nobile-rim-2": (155_770, 94_340),
    "peak-near-cabeus-b": (-181_000, 70_570),
    "slater-plain": (69_140, -49_310),
}
# 04 §6, in this order.
FIRST_BATCH = [
    "region-de-gerlache-rim-2", "region-haworth", "region-malapert-massif", "region-mons-mouton",
    "region-mons-mouton-plateau", "region-nobile-rim-1", "region-nobile-rim-2",
    "region-peak-near-cabeus-b", "region-slater-plain",
    "im-2", "change-7-candidate", "shackleton-floor", "blue-ghost-1", "apollo-11",
]
SECOND_BATCH = ["val-899s", "im-2-planned", "demo-a", "demo-b"]
THIRD_BATCH = ["apollo-17", "slim", "chandrayaan-3", "change-4", "change-6", "im-1"]


def placeholder_entry(site: dict) -> dict:
    """A sites.json entry with plausible pipeline fields, to validate catalog sites against the schema."""
    smooth = site["relief"] == "smooth"
    entry = {k: site[k] for k in CATALOG_FIELDS}
    entry.update(
        height_m=None if smooth else 0.0,
        relief_label="Smooth Moon (no terrain)" if smooth else "LOLA 120 m",
        has_mask=not smooth,
        has_profile=not smooth,
    )
    return entry


# ---------------------------------------------------------------------------------------------
# Catalog (04 §7)
# ---------------------------------------------------------------------------------------------


@pytest.fixture(scope="module")
def catalog() -> dict:
    return default_catalog()


def test_catalog_counts_and_unique_ids(catalog):
    types = [s["type"] for s in catalog["sites"]]
    assert types.count("landing") == N_LANDINGS
    assert types.count("candidate_region") == N_REGIONS
    assert types.count("validation") == N_VALIDATION
    ids = [s["id"] for s in catalog["sites"]]
    assert len(ids) == len(set(ids))
    assert len(catalog["regions"]) == N_REGIONS


def test_catalog_sites_validate_against_the_sites_schema(catalog):
    doc = {
        "contract_version": catalog["contract_version"],
        "defaults": catalog["defaults"],
        "sites": [placeholder_entry(s) for s in catalog["sites"]],
    }
    assert contract_check.schema_errors("sites", doc) == []
    for site in catalog["sites"]:
        assert set(site) == set(CATALOG_FIELDS), site["id"]
        assert not set(site) & set(PIPELINE_FIELDS)
        assert -180.0 < site["lon_deg"] <= 180.0


def test_catalog_relief_follows_latitude(catalog):
    for s in catalog["sites"]:
        lat = s["lat_deg"]
        if s["relief"] == "lola_polar":
            assert lat <= -75.0, s["id"]
        elif s["relief"] == "lola_60s":
            assert -75.0 < lat <= -60.0, s["id"]
        elif s["relief"] == "sldem2015":
            assert abs(lat) <= SLDEM_LAT_MAX_DEG, s["id"]
    assert sum(s["relief"] == "sldem2015" for s in catalog["sites"]) == 24
    assert [s["id"] for s in catalog["sites"] if s["relief"] == "smooth"] == ["val-equator"]


def test_catalog_default_demo_pair_is_the_main_pair(catalog):
    # 04 §5.1: the pair chosen by A1 (case A11, T-31) is demo-a and demo-b, type demo, not a replan candidate.
    d = catalog["defaults"]
    assert (d["demo_pair"], d["demo_mission_days"]) == (["demo-a", "demo-b"], 14)
    by_id = sites_by_id(catalog)
    for site_id in d["demo_pair"]:
        assert (by_id[site_id]["type"], by_id[site_id]["replan_candidate"]) == ("demo", False)
    # The reserve pair of 04 §5.2 stays in the catalog.
    assert {"change-7-candidate", "shackleton-floor"} <= set(by_id)


def test_catalog_spot_values(catalog):
    by_id = sites_by_id(catalog)
    bg = by_id["blue-ghost-1"]
    assert (bg["lat_deg"], bg["lon_deg"], bg["landing_utc"]) == (18.562, 61.81, "2025-03-02T08:34:00Z")
    assert by_id["slim"]["landing_utc"] == "2024-01-19T15:20:00Z"
    assert (by_id["shackleton-floor"]["lat_deg"], by_id["shackleton-floor"]["lon_deg"]) == (-89.67, 129.78)
    assert (by_id["im-2"]["lat_deg"], by_id["im-2"]["lon_deg"]) == (-84.7906, 29.1957)
    assert by_id["chandrayaan-3"]["relief"] == "lola_60s"
    for s in catalog["sites"]:
        if s["type"] == "candidate_region":
            assert s["replan_candidate"] and s["region_id"] == s["id"].removeprefix("region-")
            assert "Artemis" not in s["name"] + s["note"]  # 04 §1, §3


def test_regions_match_the_table_and_fit_in_the_mesh(catalog):
    regions = catalog_regions(catalog)
    assert [r[0] for r in regions] == list(REGION_XY_M)
    doc = site_mask.regions_doc(catalog)
    assert contract_check.schema_errors("regions", doc) == []
    half_x = (cube.X_MIN_M, cube.X_MIN_M + cube.NX * cube.CELL_M)
    y_range = (cube.Y_MAX_M - cube.NY * cube.CELL_M, cube.Y_MAX_M)
    for r in doc["regions"]:
        x_tab, y_tab = REGION_XY_M[r["id"]]
        assert abs(r["x_m"] - x_tab) <= 10 and abs(r["y_m"] - y_tab) <= 10, r["id"]
        x0, y0, x1, y1 = r["box_m"]
        assert x1 - x0 == pytest.approx(1000 * r["size_km"])
        assert half_x[0] <= x0 < x1 <= half_x[1] and y_range[0] <= y0 < y1 <= y_range[1], r["id"]
        assert r["site_id"] == f"region-{r['id']}"


def test_cube_regions_come_from_the_catalog(catalog):
    # Decision D-52: one source for the region table.
    assert cube.REGIONS == catalog_regions(catalog)


def test_batch_order(catalog):
    order = batch_order(catalog)
    assert len(order) == len(catalog["sites"]) == len(set(order))
    n1, n2, n3 = len(FIRST_BATCH), len(SECOND_BATCH), len(THIRD_BATCH)
    assert order[:n1] == FIRST_BATCH
    assert order[n1 : n1 + n2] == SECOND_BATCH
    assert order[n1 + n2 : n1 + n2 + n3] == THIRD_BATCH
    by_id = sites_by_id(catalog)
    rest = order[n1 + n2 + n3 :]
    landings = [s for s in rest if by_id[s]["type"] == "landing"]
    assert rest[: len(landings)] == landings
    dates = [by_id[s]["landing_date"] for s in landings]
    assert dates == sorted(dates)
    assert rest[len(landings) :] == ["val-equator"]


def test_load_catalog_rejects_repeated_ids(tmp_path, catalog):
    bad = json.loads(json.dumps(catalog))
    bad["sites"].append(dict(bad["sites"][0]))
    path = tmp_path / "c.json"
    path.write_text(json.dumps(bad), encoding="utf-8")
    with pytest.raises(ValueError, match="repeated"):
        load_catalog(path)


# ---------------------------------------------------------------------------------------------
# One site on synthetic terrain
# ---------------------------------------------------------------------------------------------

SITE = {
    "id": "synthetic-site", "name": "Synthetic site", "short_name": "Synthetic", "type": "validation",
    "lat_deg": 10.0, "lon_deg": 20.0, "mission": None, "operator": None, "landing_utc": None,
    "landing_date": None, "relief": "sldem2015", "observer_heights_m": [10, 2], "replan_candidate": False,
    "region_id": None, "source": {"label": "test", "url": ""}, "note": "",
}


def arc_m(u, centre):
    return R * np.arctan2(np.linalg.norm(np.cross(u, centre), axis=-1), u @ centre)


def unit(lat, lon):
    phi, lam = math.radians(lat), math.radians(lon)
    return np.array([math.cos(phi) * math.cos(lam), math.cos(phi) * math.sin(lam), math.sin(phi)])


def synthetic_stack(site=SITE, reach_m=None) -> DemStack:
    """Two gaussian hills near the site; optionally valid only within ``reach_m`` of it."""
    c0 = unit(site["lat_deg"], site["lon_deg"])
    h1, h2 = unit(site["lat_deg"] + 0.5, site["lon_deg"]), unit(site["lat_deg"], site["lon_deg"] + 1.0)

    def height(u):
        return (
            -1500.0
            + 3000.0 * np.exp(-(arc_m(u, h1) ** 2) / (2 * 4000.0**2))
            + 1500.0 * np.exp(-(arc_m(u, h2) ** 2) / (2 * 8000.0**2))
        )

    valid = None if reach_m is None else (lambda u: arc_m(u, c0) <= reach_m)
    return DemStack([SyntheticGrid(height, valid, name="SYNTH_A")], "SLDEM2015 59 m")


@pytest.fixture(scope="module")
def mask():
    return horizon_mask(SITE["lat_deg"], SITE["lon_deg"], synthetic_stack(), [2.0, 10.0])


def test_horizon_doc_follows_the_contract(mask):
    doc = site_mask.horizon_doc(SITE, mask)
    assert contract_check.schema_errors("horizon", doc) == []
    assert [m["observer_height_m"] for m in doc["masks"]] == [2, 10]
    assert doc["smooth_el_deg"] == {"2": -0.0869, "10": -0.1944}  # 09 §5
    assert doc["max_dist_m"] == 299_879  # last distance of the law `full`, 299 878.9 m (06 §3)
    assert doc["profile"] == {"file": "profile/synthetic-site.bin.gz", "n_bins": 512, "observer_height_m": 2}
    m0 = doc["masks"][0]
    for key, decimals in (("el_deg", 4), ("blk_lat_deg", 5), ("blk_lon_deg", 5), ("blk_height_m", 1)):
        assert all(round(v, decimals) == v for v in m0[key]), key
    assert all(isinstance(v, int) for v in m0["dist_m"])
    assert doc["stats"]["min_el_deg"] == min(m0["el_deg"]) and doc["stats"]["max_el_deg"] == max(m0["el_deg"])
    assert doc["site_height_m"] == round(mask.site_height_m, 1)


def test_observer_heights_put_2_m_first():
    assert site_mask.observer_heights(SITE) == [2.0, 10.0]
    with pytest.raises(ValueError):
        site_mask.observer_heights({**SITE, "observer_heights_m": [10]})


def test_rounded_longitude_stays_in_range():
    assert site_mask._lon(-179.999996) == 180.0
    assert site_mask._lon(180.0) == 180.0
    assert math.copysign(1.0, site_mask._num(-0.00001, 4)) == 1.0


def test_site_files_are_repeatable_byte_for_byte(tmp_path, mask):
    a = site_mask.write_site_outputs(tmp_path / "a", SITE, mask)
    again = horizon_mask(SITE["lat_deg"], SITE["lon_deg"], synthetic_stack(), [2.0, 10.0])
    b = site_mask.write_site_outputs(tmp_path / "b", SITE, again)
    for pa, pb in zip(a, b, strict=True):
        assert pa.read_bytes() == pb.read_bytes(), pa.name
    profile = decode_profile(gzip.decompress(a[1].read_bytes()))
    assert profile.law == "full" and profile.observer_height_m == 2.0
    assert profile.site_height_m == pytest.approx(mask.site_height_m, abs=1e-3)
    assert np.array_equal(profile.height_m, mask.profile)


@pytest.mark.parametrize("j", [0, 90, 180, 359, 540, 719])
def test_profile_csv_maximum_is_the_mask_elevation(mask, j):
    text = site_mask.profile_csv_text(SITE, synthetic_stack(), 0.5 * j)
    rows = list(csv.DictReader(io.StringIO(text)))
    assert list(rows[0]) == ["i", "dist_m", "lat_deg", "lon_deg", "height_m", "el_deg", "grid"]
    assert len(rows) == 3709 and [int(r["i"]) for r in rows[:3]] == [0, 1, 2]
    best = max(rows, key=lambda r: float(r["el_deg"]))
    # The CSV keeps 6 decimals, the mask is exact: they agree to well within the 4 decimals of the file.
    assert float(best["el_deg"]) == pytest.approx(mask.masks[0].el_deg[j], abs=1e-6)
    assert float(best["dist_m"]) == pytest.approx(mask.masks[0].dist_m[j], abs=1e-3)
    assert best["grid"] == "SYNTH_A"


def test_profile_csv_leaves_invalid_samples_empty():
    text = site_mask.profile_csv_text(SITE, synthetic_stack(reach_m=50_000.0), 45.0)
    rows = list(csv.DictReader(io.StringIO(text)))
    far = [r for r in rows if float(r["dist_m"]) > 50_100.0]
    assert far and all(r["height_m"] == r["el_deg"] == r["grid"] == "" for r in far)


# ---------------------------------------------------------------------------------------------
# Batch, sites.json and publish
# ---------------------------------------------------------------------------------------------


def small_catalog(catalog) -> dict:
    """Three real catalog entries: a landing with relief, one whose data are missing, a smooth one."""
    by_id = sites_by_id(catalog)
    sites = [dict(by_id["blue-ghost-1"]), dict(by_id["apollo-11"]), dict(by_id["val-equator"])]
    return {"contract_version": "1.0.0", "defaults": {**catalog["defaults"],
            "demo_pair": ["blue-ghost-1", "apollo-11"]}, "sites": sites, "regions": []}


def flat_stack() -> DemStack:
    """Flat terrain at -1000 m: the batch tests check bookkeeping, not the terrain (and run fast)."""
    grid = SyntheticGrid(lambda u: np.full(u.shape[:-1], -1000.0), name="SYNTH_FLAT")
    return DemStack([grid], "SLDEM2015 59 m")


class Factory:
    """Flat relief for blue-ghost-1; apollo-11 has no crop. Counts the calls."""

    def __init__(self):
        self.calls = []

    def __call__(self, site):
        self.calls.append(site["id"])
        if site["id"] == "apollo-11":
            raise DemDataMissing("Missing crop for site apollo-11")
        return flat_stack()


def test_batch_writes_sites_json_and_skips_existing(tmp_path, catalog):
    cat = small_catalog(catalog)
    light = tmp_path / "light"
    factory = Factory()
    seen = []
    results = site_mask.run_batch(cat, light, factory, after_site=seen.append, progress=lambda _: None)
    assert factory.calls == ["blue-ghost-1", "apollo-11"]  # batch order; smooth needs no stack
    assert [r.site_id for r in seen] == ["blue-ghost-1", "apollo-11", "val-equator"]
    doc = json.loads((light / "sites.json").read_text(encoding="utf-8"))
    assert contract_check.schema_errors("sites", doc) == []
    entries = {s["id"]: s for s in doc["sites"]}
    bg, ap, eq = entries["blue-ghost-1"], entries["apollo-11"], entries["val-equator"]
    assert bg["has_mask"] and bg["has_profile"] and bg["relief"] == "sldem2015"
    horizon = json.loads((light / "horizon" / "blue-ghost-1.json").read_text(encoding="utf-8"))
    assert bg["height_m"] == horizon["site_height_m"]  # 04 §7
    assert bg["relief_label"] == horizon["relief_label"]
    for e in (ap, eq):
        assert (e["relief"], e["relief_label"], e["height_m"], e["has_mask"], e["has_profile"]) == (
            "smooth", "Smooth Moon (no terrain)", None, False, False)
    assert not (light / "horizon" / "apollo-11.json").exists()
    assert results["apollo-11"].status == "smooth_fallback" and results["val-equator"].status == "smooth"
    assert [s["id"] for s in doc["sites"]] == ["blue-ghost-1", "apollo-11", "val-equator"]  # catalog order

    before = (light / "horizon" / "blue-ghost-1.json").read_bytes()
    again = Factory()
    results = site_mask.run_batch(cat, light, again, progress=lambda _: None)
    assert again.calls == ["apollo-11"]  # blue-ghost-1 kept; apollo-11 tried again (data may have arrived)
    assert results["blue-ghost-1"].status == "kept"
    assert json.loads((light / "sites.json").read_text(encoding="utf-8")) == doc
    forced = Factory()
    site_mask.run_batch(cat, light, forced, only=["blue-ghost-1"], force=True, progress=lambda _: None)
    assert forced.calls == ["blue-ghost-1"]
    assert (light / "horizon" / "blue-ghost-1.json").read_bytes() == before


def test_existing_files_of_a_moved_site_are_recomputed(tmp_path, catalog):
    cat = small_catalog(catalog)
    light = tmp_path / "light"
    site_mask.run_batch(cat, light, Factory(), only=["blue-ghost-1"], progress=lambda _: None)
    cat["sites"][0]["lat_deg"] = 18.6  # A2 corrects the coordinates
    factory = Factory()
    site_mask.run_batch(cat, light, factory, only=["blue-ghost-1"], progress=lambda _: None)
    assert factory.calls == ["blue-ghost-1"]


def test_batch_rejects_unknown_ids(tmp_path, catalog):
    with pytest.raises(KeyError):
        site_mask.run_batch(small_catalog(catalog), tmp_path, Factory(), only=["nowhere"])


def web_copy(tmp_path: Path) -> Path:
    """A web data folder with the example ephemeris and the example demo masks."""
    web = tmp_path / "web"
    web.mkdir()
    for rel in ("ephemeris.bin", "ephemeris.meta.json", "horizon/demo-a.json", "profile/demo-a.bin.gz"):
        (web / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(EXAMPLES / rel, web / rel)
    return web


def test_publish_writes_a_valid_web_folder(tmp_path, catalog):
    cat = small_catalog(catalog)
    light = tmp_path / "light"
    site_mask.run_batch(cat, light, Factory(), progress=lambda _: None)
    web = web_copy(tmp_path)
    manifest = site_mask.publish(light, web, git_commit="abc1234", generated_utc="2026-11-14T12:00:00Z")
    assert manifest == {
        "contract_version": "1.1.0", "generated_utc": "2026-11-14T12:00:00Z", "git_commit": "abc1234",
        "sites": 3, "ephemeris": {"file": "ephemeris.bin", "bytes": 5_260_176, "synthetic": True},
        "has_validation_report": False,
    }
    assert not (web / "horizon" / "demo-a.json").exists() and not (web / "profile" / "demo-a.bin.gz").exists()
    assert (web / "horizon" / "blue-ghost-1.json").read_bytes() == (
        light / "horizon" / "blue-ghost-1.json").read_bytes()
    checked, errors = contract_check.check_dir(web)
    assert checked == 6 and errors == []


def test_publish_needs_the_ephemeris(tmp_path, catalog):
    light = tmp_path / "light"
    site_mask.run_batch(small_catalog(catalog), light, Factory(), progress=lambda _: None)
    with pytest.raises(site_mask.PublishError, match="ephem"):
        site_mask.publish(light, tmp_path / "empty")


# ---------------------------------------------------------------------------------------------
# Real data (06 §10.8; card T-09)
# ---------------------------------------------------------------------------------------------

REAL_SITES = ("shackleton-floor", "im-2", "region-malapert-massif")


@pytest.fixture(scope="module")
def real_masks(llsn_data_dir):
    lbl = llsn_data_dir / "raw" / "lola" / f"{P1_NAME}.LBL"
    if not lbl.is_file():
        pytest.skip("LOLA polar DEMs not found; run make data-fetch")
    by_id = sites_by_id(default_catalog())
    factory = site_mask.default_stack_factory(llsn_data_dir)
    out = {}
    for site_id in REAL_SITES:
        mask, reason = site_mask.compute_site(by_id[site_id], factory)
        assert mask is not None, reason
        out[site_id] = mask
    return out


@pytest.mark.data
def test_shackleton_floor_sees_a_high_rim(real_masks):
    # Floor of a 4.1 km deep crater of ~10.5 km radius: the rim stands at about 21° (card T-09).
    assert real_masks["shackleton-floor"].stats["min_el_deg"] > 10.0


@pytest.mark.data
@pytest.mark.parametrize("site_id", REAL_SITES)
def test_real_masks_are_sane_and_follow_the_contract(real_masks, site_id):
    mask = real_masks[site_id]
    site = sites_by_id(default_catalog())[site_id]
    doc = site_mask.horizon_doc(site, mask)
    assert contract_check.schema_errors("horizon", doc) == []
    el = mask.masks[0].el_deg
    assert el.shape == (720,) and np.all(np.isfinite(el))
    assert mask.stats["min_el_deg"] >= -6.0 and mask.stats["max_el_deg"] <= 45.0  # 06 §10.8
    assert mask.relief_label == "LOLA polar 40 m + 120 m"


@pytest.mark.data
def test_real_site_files_are_repeatable(tmp_path, llsn_data_dir, real_masks):
    site = sites_by_id(default_catalog())["im-2"]
    a = site_mask.write_site_outputs(tmp_path / "a", site, real_masks["im-2"])
    mask, _ = site_mask.compute_site(site, site_mask.default_stack_factory(llsn_data_dir))
    b = site_mask.write_site_outputs(tmp_path / "b", site, mask)
    for pa, pb in zip(a, b, strict=True):
        assert pa.read_bytes() == pb.read_bytes(), pa.name


@pytest.mark.data
@pytest.mark.parametrize("az", [0.0, 120.0, 240.0])  # the azimuths of case A5 (11 §4)
def test_real_profile_csv_matches_the_mask(llsn_data_dir, real_masks, az):
    site = sites_by_id(default_catalog())["region-malapert-massif"]
    stack = site_mask.default_stack_factory(llsn_data_dir)(site)
    text = site_mask.profile_csv_text(site, stack, az)
    rows = [r for r in csv.DictReader(io.StringIO(text)) if r["el_deg"]]
    best = max(float(r["el_deg"]) for r in rows)
    assert best == pytest.approx(real_masks["region-malapert-massif"].masks[0].el_deg[int(az * 2)], abs=1e-6)
