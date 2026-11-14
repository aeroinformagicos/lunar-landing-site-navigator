# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""T-28 fast tests: comparison with the NASA AVGVISIB maps (08_mapa_polar.md §8; case B7; 09 §7.1).

Synthetic NASA products (DN linear in the pixel indices) stand in for N1-N4: the resampling, the
metrics, the record of case B7 and the two figures are checked without the 330 MB of real products
(their reading is checked in ``test_nasa_read.py``, marked ``data``).
"""

import io
import json
import math

import numpy as np
import pytest

from pipeline.dem.grids import grid_from_label
from pipeline.dem.pds_label import parse_label
from pipeline.horizon import cube
from pipeline.layers import compare_nasa as cn
from pipeline.layers import layers as lay
from pipeline.tests.test_layers import expected_dn, synthetic_products

LABELS = cn.REPO_ROOT / "pipeline" / "tests" / "fixtures" / "labels"
NY, NX = 672, 752


@pytest.fixture(scope="module")
def products():
    return synthetic_products()


@pytest.fixture(scope="module")
def nasa(products):
    return cn.mesh_dn_sums(products)


def test_pixel_that_contains_the_point():
    # 03 §6: the centre of Shackleton is pixel (2656.67, 2635.22) of the 60 m products.
    n1 = grid_from_label(parse_label(LABELS / "AVGVISIB_85S_060M_201608.LBL"))
    s, l = cn.pixel_index(n1, 7690.0, -6403.0)
    assert (int(s), int(l)) == (2657, 2635)
    # Halfway between two pixel centres rounds up (half up): s = 4.5 -> 5, 4.49 -> 4.
    g = synthetic_products().inner["sun"]
    for s_frac, expected in ((4.5, 5), (4.49, 4), (4.51, 5)):
        x = (s_frac - g.N / 2 + 0.5) * g.S
        assert int(cn.pixel_index(g, x, 0.0)[0]) == expected


def test_window_mean_and_product_choice(products, nasa):
    # The 3 × 3 mean of a linear function is its value at the centre pixel; N1/N2 inside ±151.5 km.
    pct = nasa.pct()
    for i, j in ((0, 0), (399, 367), (751, 671), (60, 600), (700, 100)):
        x, y = (float(v) for v in cube.cell_centre_xy(i, j))
        assert nasa.inner[j, i] == (abs(x) <= 151_500 and abs(y) <= 151_500)
        for b, body in enumerate(("sun", "earth")):
            assert nasa.valid[b, j, i]
            assert pct[b, j, i] == pytest.approx(expected_dn(products, body, x, y) * 0.004, abs=1e-9)
    assert nasa.valid.all()
    # Inside: about 289 000 cells within 85° S would be the circle; the N1/N2 square is |x|,|y| ≤ 151.5 km.
    x, y = cn.mesh_xy()
    assert int(nasa.inner.sum()) == int(((np.abs(x) <= 151_500) & (np.abs(y) <= 151_500)).sum())


def test_window_outside_the_image_or_out_of_range_is_not_valid(products):
    g = products.inner["sun"]
    edge = (g.N / 2 - 0.5) * g.S  # centre of the last column: its window leaves the image
    _, ok = cn.window_sums(g, np.array([edge, edge - g.S]), np.array([0.0, 0.0]))
    assert ok.tolist() == [False, True]
    bad = g.data.copy()
    bad[155, 155] = -5  # below DERIVED_MINIMUM
    g2 = type(g)("bad", g.N, g.S, data=bad, to_m=g.to_m)
    _, ok = cn.window_sums(g2, np.array([0.0]), np.array([0.0]))
    assert not ok[0]


def test_metrics_by_hand():
    m = cn.metrics(np.array([10.0, 20.0, 30.0, 40.0]), np.array([12.0, 18.0, 35.0, 60.0]))
    d = np.array([-2.0, 2.0, -5.0, -20.0])
    assert m["n"] == 4
    assert m["bias_pts"] == pytest.approx(d.mean())
    assert m["mae_pts"] == pytest.approx(np.abs(d).mean())
    assert m["rmse_pts"] == pytest.approx(math.sqrt((d * d).mean()))
    assert m["within_10_pct"] == pytest.approx(75.0)
    assert m["r"] == pytest.approx(np.corrcoef([10, 20, 30, 40], [12, 18, 35, 60])[0, 1])
    assert cn.metrics(np.array([]), np.array([]))["r"] is None
    assert cn.metrics(np.array([5.0, 5.0]), np.array([1.0, 2.0]))["r"] is None  # no spread


def ours_from(nasa, noise_pts=0.0, flip=False, missing=None, seed=3):
    """mean186_any units built from the NASA values (+ noise); 255 where ``missing``."""
    pct = nasa.pct()
    if flip:
        pct = 100.0 - pct
    rng = np.random.default_rng(seed)
    v = np.clip(np.floor((pct + rng.normal(0, noise_pts, pct.shape)) / 0.4 + 0.5), 0, 250).astype(np.uint8)
    if missing is not None:
        v[:, missing] = 255
    return v


def test_compare_close_maps_pass_b7(nasa):
    missing = np.zeros((NY, NX), bool)
    missing[:300, :] = True  # half of the cube not computed yet
    comp = cn.compare(ours_from(nasa, noise_pts=2.0, missing=missing), nasa)
    expected_inner = int((nasa.inner & ~missing).sum())
    for body in ("sun", "earth"):
        m = comp.metrics[body]["85S"]
        assert m["n"] == expected_inner and m["r"] > 0.95 and abs(m["bias_pts"]) < 0.5
        assert m["mae_pts"] == pytest.approx(2.0 * math.sqrt(2 / math.pi), rel=0.1)  # E|N(0, 2)|
        assert comp.metrics[body]["all"]["n"] == int((~missing).sum())
    case = cn.case_b7(comp)
    assert case["case_id"] == "B7" and case["status"] == "pass" and case["tolerance"] == "r > 0.9"
    assert [d["ok"] for d in case["details"]] == [True, None, True, None]
    assert "Sun: r = " in case["obtained"] and "Earth: r = " in case["obtained"]
    assert case["source"]["url"] == "https://pgda.gsfc.nasa.gov/products/69"


def test_compare_opposite_maps_fail_b7_and_empty_is_skipped(nasa):
    assert cn.case_b7(cn.compare(ours_from(nasa, flip=True), nasa))["status"] == "fail"
    nothing = cn.case_b7(cn.compare(np.full((2, NY, NX), 255, np.uint8), nasa))
    assert nothing["status"] == "skipped" and "make layers" in nothing["note"]


def test_b7_is_recorded_for_the_report(tmp_path, nasa):
    from pipeline.cli import report

    path = report.write_case(tmp_path, **cn.case_b7(cn.compare(ours_from(nasa, noise_pts=1.0), nasa)))
    assert path.name == "B7.json"
    built = report.build_report(tmp_path, tmp_path / "no_manual.json", tmp_path / "web", commit="test")
    b7 = next(c for c in built["cases"] if c["id"] == "B7")
    assert b7["status"] == "pass" and len(b7["details"]) == 4
    a7b7 = next(h for h in built["headline"] if h["id"] == "A7B7")
    assert any(r["label"].startswith("B7: Sun, Pearson r") for r in a7b7["rows"])


def test_figures_follow_09_7_1(tmp_path, nasa):
    from PIL import Image

    missing = np.zeros((NY, NX), bool)
    missing[600:, :100] = True
    ours = ours_from(nasa, noise_pts=3.0, missing=missing)
    ours[0, 10, 10] = min(250, int(ours[0, 10, 10]) + 100)  # +40 points: beyond the +30 of the scale
    comp = cn.compare(ours, nasa)
    paths = cn.write_figures(tmp_path, comp)
    assert [p.name for p in paths] == ["a7b7_scatter.png", "a7b7_diff_map.png"]
    for p, size, mode in zip(paths, ((1200, 600), (752, 672)), ("RGB", "RGBA"), strict=True):
        assert p.stat().st_size <= 300_000
        with Image.open(p) as im:
            assert (im.format, im.size, im.mode) == ("PNG", size, mode)
    with Image.open(paths[1]) as im:
        px = np.asarray(im)
    assert px[650, 50, 3] == 0  # not compared: transparent
    assert px[10, 10, 3] == 255 and tuple(px[10, 10, :3]) == cn.C_POS  # saturates at +30 points
    diff = comp.ours_pct[0] - comp.nasa_pct[0]
    j, i = np.argwhere(np.abs(diff) < 0.01)[0]
    assert tuple(px[j, i, :3]) == cn.C_MID  # zero difference: the neutral colour


def test_diverging_colours():
    c = cn.diff_colours(np.array([-30.0, -60.0, 0.0, 30.0, 15.0, 2.4, -2.4, 13.0, 17.4]))
    assert [tuple(v) for v in c[:4]] == [cn.C_NEG, cn.C_NEG, cn.C_MID, cn.C_POS]
    assert all(min(a, b) <= v <= max(a, b) for v, a, b in zip(c[4], cn.C_MID, cn.C_POS, strict=True))
    # Classes of 5 points: |diff| < 2.5 is neutral; 13 and 17.4 fall in the class of 15.
    assert tuple(c[5]) == tuple(c[6]) == cn.C_MID
    assert tuple(c[7]) == tuple(c[8]) == tuple(c[4])


def test_read_any_layer_refuses_plan_b(tmp_path, products):
    with pytest.raises(FileNotFoundError):
        cn.read_any_layer(tmp_path / "layers")
    lay.write_nasa_layers(tmp_path, products)
    with pytest.raises(ValueError, match="plan B"):
        cn.read_any_layer(tmp_path / "layers")
    doc = json.loads((tmp_path / "layers" / "layers.json").read_text(encoding="utf-8"))
    doc["source"] = "computed"
    (tmp_path / "layers" / "layers.json").write_text(json.dumps(doc), encoding="utf-8")
    assert cn.read_any_layer(tmp_path / "layers").shape == (2, NY, NX)


def test_png_budget_is_enforced():
    from PIL import Image

    noise = np.random.default_rng(0).integers(0, 255, (600, 1200, 3), dtype=np.uint8)
    with pytest.raises(ValueError, match="300000"):
        cn._png(Image.fromarray(noise, "RGB"))
    assert len(cn._png(Image.new("RGB", (10, 10)), max_bytes=10_000)) < 10_000
    assert io.BytesIO  # keep the import used by readers of this file
