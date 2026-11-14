# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""T-31: choice of the demo pair (04_catalogo_sitios.md §5.1) with synthetic data.

The expected values come from 04 §5.1 (thresholds, distance, months, relaxations) and from the
planted data of each test, never from the code under test.
"""

from __future__ import annotations

import gzip
import json

import numpy as np
import pytest

from pipeline.common.catalog import default_catalog
from pipeline.common.timeutil import iso_to_unix
from pipeline.horizon import cube
from pipeline.layers import layers as lay
from pipeline.tests.conftest import WEB_DATA
from pipeline.vis import demo
from pipeline.vis.sky import load_mask

DAY = 86400
MONTHS = demo.month_ids()


def test_months_and_offsets():
    assert MONTHS[0] == "2027-01" and MONTHS[-1] == "2028-12" and len(MONTHS) == 24
    # 1000 m = 2 cells: (±1,0), (0,±1), (±1,±1), (±2,0), (0,±2); (2,1) is 1118 m.
    off = demo.pair_offsets(1000)
    assert len(off) == 12
    assert (2, 0) in off and (1, 1) in off and (2, 1) not in off
    assert (4, 0) in demo.pair_offsets(2000) and (4, 1) not in demo.pair_offsets(2000)


def _region_box(region_id: str) -> tuple[float, float, float, float]:
    return cube.region_boxes()[region_id]


def _layers_with_background(units: int = 100) -> np.ndarray:
    """All cells 255 (no cube) except the region boxes at ``units`` (40 % by default)."""
    both = np.full((len(MONTHS), cube.NY, cube.NX), lay.NODATA, dtype=np.uint8)
    for box in cube.region_boxes().values():
        i0, i1, j0, j1 = demo.box_cells(box)
        both[:, j0 : j1 + 1, i0 : i1 + 1] = units
    return both


def _centre_cell(region_id: str) -> tuple[int, int]:
    i0, i1, j0, j1 = demo.box_cells(_region_box(region_id))
    return (i0 + i1) // 2, (j0 + j1) // 2


def test_box_cells_holds_the_centres():
    box = _region_box("haworth")
    i0, i1, j0, j1 = demo.box_cells(box)
    x, y = cube.cell_centre_xy(np.array([i0, i1]), np.array([j0, j1]))
    assert box[0] <= x.min() and x.max() <= box[2] and box[1] <= y.min() and y.max() <= box[3]
    # The next cell out is outside the box.
    xo, _ = cube.cell_centre_xy(i1 + 1, j0)
    assert xo > box[2]


def test_finds_the_planted_pair():
    both = _layers_with_background()
    i, j = _centre_cell("haworth")
    m = MONTHS.index("2027-08")
    both[m, j, i] = 200  # A: 80 %
    both[m, j, i + 1] = 10  # B: 4 %, 500 m east
    pairs = demo.find_pairs(both, MONTHS, cube.region_boxes())
    assert len(pairs) == 1
    p = pairs[0]
    assert (p.region_id, p.month, p.a, p.b) == ("haworth", "2027-08", (i, j), (i + 1, j))
    assert (p.both_a_pct, p.both_b_pct, p.score_pct, p.distance_m) == (80.0, 4.0, 76.0, 500.0)


def test_thresholds_distance_nodata_and_regions():
    both = _layers_with_background()
    i, j = _centre_cell("haworth")
    m = MONTHS.index("2027-03")
    both[m, j, i], both[m, j, i + 1] = 150, 25  # exactly 60 % and 10 %: qualifies
    both[m, j + 6, i], both[m, j + 6, i + 1] = 149, 0  # 59.6 %: no
    both[m, j + 9, i], both[m, j + 9, i + 1] = 250, 26  # 10.4 %: no
    both[m, j - 6, i], both[m, j - 6, i + 3] = 250, 0  # 1500 m: only with the 2000 m relaxation
    k = MONTHS.index("2027-04")
    both[k, j - 9, i], both[k, j - 9, i + 1] = 255, 0  # A without data
    # Outside every region box: never.
    both[m, 5, 5], both[m, 5, 6] = 250, 0
    pairs = demo.find_pairs(both, MONTHS, cube.region_boxes())
    assert [(p.a, p.b, p.score_pct) for p in pairs] == [((i, j), (i + 1, j), 50.0)]
    wide = demo.find_pairs(both, MONTHS, cube.region_boxes(), 2000)
    got = [(p.a, p.b, p.score_pct, p.distance_m) for p in wide]
    assert ((i, j - 6), (i + 3, j - 6), 100.0, 1500.0) in got


def test_best_month_is_kept_and_ties_take_the_earliest():
    both = _layers_with_background()
    i, j = _centre_cell("haworth")
    for mid, ua in (("2027-02", 200), ("2027-05", 220), ("2027-09", 220)):
        k = MONTHS.index(mid)
        both[k, j, i], both[k, j + 1, i] = ua, 0
    pairs = demo.find_pairs(both, MONTHS, cube.region_boxes())
    assert [(p.month, p.score_pct) for p in pairs] == [("2027-05", 88.0)]


def test_five_pairs_from_distinct_regions_first():
    both = _layers_with_background()
    m = MONTHS.index("2028-01")
    regions = list(cube.region_boxes())
    i, j = _centre_cell(regions[0])
    # Region 0: three pairs better than anything else; regions 1-3: one pair each.
    for d, ua in enumerate((250, 245, 240)):
        both[m, j + 3 * d, i], both[m, j + 3 * d, i + 1] = ua, 0
    for r, ua in zip(regions[1:4], (200, 190, 180), strict=True):
        ii, jj = _centre_cell(r)
        both[m, jj, ii], both[m, jj, ii + 1] = ua, 0
    chosen = demo.select_pairs(demo.find_pairs(both, MONTHS, cube.region_boxes()))
    assert [(p.region_id, p.score_pct) for p in chosen] == [
        (regions[0], 100.0), (regions[0], 98.0), (regions[1], 80.0), (regions[2], 76.0), (regions[3], 72.0),
    ]


def test_search_times_and_delays():
    t = demo.search_times("2027-02")
    assert len(t) == 28 * 4 and t[0] == iso_to_unix("2027-02-01T00:00:00Z")
    assert t[-1] == iso_to_unix("2027-02-28T18:00:00Z")
    assert demo.delays_s(0) == [12 * DAY]
    relaxed = demo.delays_s(1)
    assert len(relaxed) == 25 and relaxed[0] == 12 * DAY
    assert min(relaxed) == 10 * DAY and max(relaxed) == 16 * DAY


def _stub(table: dict[tuple[str, float], str], default: str = "no_go"):
    return lambda key, t: table.get((key, t), default)


def test_find_landing_strict():
    t0, t1 = 0.0, 6 * 3600.0
    d = 12 * DAY
    st = {
        ("a", t0): "go", ("b", t0): "no_go", ("a", t0 + d): "go",  # A still go after 12 d: no
        ("a", t1): "go", ("b", t1): "no_go",
        ("alt1", t1 + d): "marginal", ("alt2", t1 + d): "go",
    }
    got = demo.find_landing(_stub(st), "a", "b", ["alt1", "alt2"], [t0, t1], 0)
    assert got == demo.Landing(t1, d, "alt2", 0)
    # B marginal never counts as the bad site.
    st[("b", t1)] = "marginal"
    assert demo.find_landing(_stub(st), "a", "b", ["alt1", "alt2"], [t1], 2) is None


def test_relaxations_in_order():
    t = 0.0
    d14 = 14 * DAY
    st = {("a", t): "go", ("b", t): "no_go", ("a", 12 * DAY): "go", ("alt", d14): "go"}
    assert demo.find_landing(_stub(st), "a", "b", ["alt"], [t], 0) is None
    assert demo.find_landing(_stub(st), "a", "b", ["alt"], [t], 1) == demo.Landing(t, d14, "alt", 1)
    st[("a", t)] = "marginal"
    assert demo.find_landing(_stub(st), "a", "b", ["alt"], [t], 1) is None
    assert demo.find_landing(_stub(st), "a", "b", ["alt"], [t], 2) == demo.Landing(t, d14, "alt", 2)


def _write_month_layers(layers_dir, both: np.ndarray, source: str = "computed") -> None:
    layers_dir.mkdir(parents=True)
    (layers_dir / "layers.json").write_text(json.dumps({"source": source}), encoding="utf-8")
    zeros = np.zeros((cube.NY, cube.NX), dtype=np.uint8)
    for k, mid in enumerate(MONTHS):
        data = np.stack([zeros, zeros, both[k]]).tobytes()
        (layers_dir / f"{mid}.bin.gz").write_bytes(gzip.compress(data, compresslevel=1))


def test_read_both_band(tmp_path):
    both = _layers_with_background()
    i, j = _centre_cell("haworth")
    both[MONTHS.index("2028-12"), j, i] = 7
    _write_month_layers(tmp_path / "layers", both)
    got = demo.read_both_band(tmp_path / "layers", MONTHS)
    assert np.array_equal(got, both)
    _write_month_layers(tmp_path / "nasa", both, "nasa_avgvisib")
    with pytest.raises(ValueError, match="computed"):
        demo.read_both_band(tmp_path / "nasa", MONTHS)
    (tmp_path / "layers" / "2027-06.bin.gz").unlink()
    with pytest.raises(FileNotFoundError, match="2027-06"):
        demo.read_both_band(tmp_path / "layers", MONTHS)


def _flat_doc(site: dict, el: float, label: str = "synthetic") -> dict:
    n = 720
    m = {"el_deg": [el] * n, "dist_m": [3000] * n, "blk_lat_deg": [site["lat_deg"]] * n,
         "blk_lon_deg": [site["lon_deg"]] * n, "blk_height_m": [1234.0] * n}
    return {"site_height_m": 0.0, "relief_label": label, "dem_stack": ["SYN"], "law": "full",
            "masks": [{"observer_height_m": h, **m} for h in (2, 10)]}


def test_pick_demo_end_to_end(real_table, monkeypatch):
    """Planted pair in the layers, flat synthetic masks (A open, B behind a 30° wall) and a planted
    landing time: the file says who blocks B and why."""
    catalog = default_catalog()
    both = _layers_with_background()
    i, j = _centre_cell("haworth")
    both[MONTHS.index("2027-08"), j, i], both[MONTHS.index("2027-08"), j + 1, i] = 230, 5

    def mask_fn(site):
        return _flat_doc(site, -10.0 if site["id"].endswith("-a") else 30.0), ""

    alts = [{"site": s, "mask": load_mask(WEB_DATA, s["id"], 2), "relief_label": "LOLA polar 40 m + 120 m"}
            for s in catalog["sites"] if s["id"] in ("region-haworth", "region-nobile-rim-1")]
    t_land = iso_to_unix("2027-08-03T06:00:00Z")
    seen = {}

    def planted(status, a, b, alternatives, times, level):
        seen.update(a=a, b=b, alternatives=list(alternatives), n_times=len(list(times)), level=level)
        return demo.Landing(t_land, 12 * DAY, alternatives[0], level)

    monkeypatch.setattr(demo, "find_landing", planted)
    profiles = []
    doc = demo.pick_demo(both, MONTHS, catalog, real_table, mask_fn, alts, log=lambda _l: None,
                         profile_fn=lambda site, az: profiles.append((site["id"], az)) or f"{site['id']}.csv")
    # The alternative of A's own region is left out; the month has 31 · 4 landing times.
    assert seen == {"a": "cand1-a", "b": "cand1-b", "alternatives": ["region-nobile-rim-1"], "n_times": 124,
                    "level": 0}
    assert doc["relaxation_level"] == 0 and doc["pairs_found"] == {"1000": 1}
    c = doc["candidates"][0]
    assert (c["region_id"], c["month"]) == ("haworth", "2027-08")
    assert (c["score_pct"], c["distance_m"]) == (90.0, 500.0)
    assert c["landing_utc"] == "2027-08-03T06:00:00Z" and c["replan_utc"] == "2027-08-15T06:00:00Z"
    assert c["a"]["relief_label"] == "synthetic" and c["a"]["law"] == "full"
    # B is behind a 30° wall: no Sun at landing, and the blocker is the wall sample.
    b = c["assess"]["b_at_landing"]
    assert b["status"] == "no_go" and "no_sun_at_landing" in b["reasons"]
    bp = c["blocking"]
    assert bp["body"] == "sun" and bp["horizon_b_deg"] == 30.0 and bp["visible_b"] is False
    assert bp["horizon_a_deg"] == -10.0 and bp["visible_a"] is True
    assert bp["blocker"]["dist_m"] == 3000 and bp["blocker"]["height_m"] == 1234.0
    assert "Sun" in c["cause"] and "500 m away" in c["cause"]
    assert [p[0] for p in profiles] == ["demo-cand1-a", "demo-cand1-b"]
    assert profiles[0][1] == bp["blocker"]["az_deg"]
    json.dumps(doc)  # serialisable


def test_pick_demo_relaxes_distance_when_nothing_fits(real_table, monkeypatch):
    catalog = default_catalog()
    both = _layers_with_background()
    i, j = _centre_cell("haworth")
    k = MONTHS.index("2027-08")
    both[k, j, i], both[k, j, i + 1] = 230, 5  # 500 m
    both[k, j + 5, i], both[k, j + 5, i + 4] = 230, 5  # 2000 m
    levels = []

    def never(status, a, b, alternatives, times, level):
        levels.append((a, level))
        return None

    monkeypatch.setattr(demo, "find_landing", never)
    doc = demo.pick_demo(both, MONTHS, catalog, real_table, lambda s: (_flat_doc(s, 0.0), ""), [],
                         log=lambda _l: None)
    assert levels == [("cand1-a", 0), ("cand1-a", 1), ("cand1-a", 2), ("cand2-a", 3), ("cand3-a", 3)]
    assert doc["relaxation_level"] is None
    assert [c["max_pair_dist_m"] for c in doc["candidates"]] == [1000.0, 2000.0, 2000.0]
    assert all(c["landing_utc"] is None for c in doc["candidates"])


def test_cli_without_layers(tmp_path):
    from pipeline.cli.__main__ import main

    assert main(["--data-dir", str(tmp_path), "pick-demo"]) == 1
    assert "pick-demo" in (tmp_path / "out" / "logs" / "pick-demo.log").read_text(encoding="utf-8")
