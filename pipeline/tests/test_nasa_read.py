# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""T-28 reading checks of the NASA illumination products (03_datos_y_fuentes.md §6).

Marked ``data`` (``make test-all``): they read N1-N5 from ``$LLSN_DATA_DIR/raw/nasa_illum``. Size,
DN range equal to the label, N5 only ±20000, and the centre of Shackleton (permanent shadow): 0 in
N1 and +20000 in N5 (03 §6). Then the resampling of compare-nasa on the real products.
"""

import numpy as np
import pytest

from pipeline.dem.grids import read_pds_image
from pipeline.layers import compare_nasa as cn

pytestmark = pytest.mark.data

# 03 §6: name -> (bytes, DERIVED_MINIMUM, DERIVED_MAXIMUM) of the label.
PRODUCTS = {
    "AVGVISIB_85S_060M_201608": (51_166_728, 0, 22_111),  # N1
    "AVGVISIB_85S_060M_201608_EARTH": (51_166_728, 0, 25_000),  # N2
    "AVGVISIB_75S_120M_201608": (116_250_752, 0, 22_397),  # N3
    "AVGVISIB_75S_120M_201608_EARTH": (116_250_752, 0, 25_000),  # N4
    "LPSR_85S_060M_201608": (51_166_728, -20_000, 20_000),  # N5
}
SHACKLETON_PX_60M = (2656.67, 2635.22)  # (s, l) of (−89.67°, 129.78° E) in the 60 m products (03 §6)
# Measured in T-28 against the statements of 03 §6 (reported in docs/handoff/T-28.md; not decided here):
N3_MAX_FOUND = "N3: largest DN in the file is 22396, the label says DERIVED_MAXIMUM = 22397"
N5_ZEROS_FOUND = "N5: 5 interior pixels of 25 583 364 hold DN 0 (value 0.5), besides -20000 and +20000"


def _grid(require_data, name):
    lbl = require_data(f"raw/nasa_illum/{name}.LBL")
    require_data(f"raw/nasa_illum/{name}.IMG")
    return read_pds_image(lbl)


N3 = "AVGVISIB_75S_120M_201608"


@pytest.mark.parametrize(
    "name", [pytest.param(n, marks=pytest.mark.xfail(reason=N3_MAX_FOUND, strict=True)) if n == N3 else n
             for n in PRODUCTS]
)
def test_size_and_dn_range(require_data, name):
    size, dn_min, dn_max = PRODUCTS[name]
    g = _grid(require_data, name)
    assert g.data.nbytes == size and g.data.dtype.str == "<i2"
    assert (g.label.minimum, g.label.maximum) == (dn_min, dn_max)
    assert dn_min <= int(g.data.min()) and int(g.data.max()) <= dn_max  # what compare-nasa relies on
    assert (int(g.data.min()), int(g.data.max())) == (dn_min, dn_max)


@pytest.mark.xfail(reason=N5_ZEROS_FOUND, strict=True)
def test_lpsr_has_only_two_values(require_data):
    g = _grid(require_data, "LPSR_85S_060M_201608")
    assert set(np.unique(g.data).tolist()) == {-20_000, 20_000}


def test_shackleton_is_in_permanent_shadow(require_data):
    n1 = _grid(require_data, "AVGVISIB_85S_060M_201608")
    n5 = _grid(require_data, "LPSR_85S_060M_201608")
    s, l = n1.pixel_of_latlon(-89.67, 129.78)
    assert (s, l) == pytest.approx(SHACKLETON_PX_60M, abs=0.02)
    s, l = round(s), round(l)
    assert int(n1.data[l, s]) == 0  # never lit
    assert int(n5.data[l, s]) == 20_000  # permanently shadowed region


def test_resampling_of_the_real_products(require_data, llsn_data_dir):
    for name in (*cn.N85.values(), *cn.N75.values()):
        require_data(f"raw/nasa_illum/{name}.IMG")
    nasa = cn.mesh_dn_sums(cn.open_products(llsn_data_dir))
    assert nasa.valid.all()  # N3/N4 cover the whole mesh (±457 km)
    pct = nasa.pct()
    assert (pct >= 0).all() and (pct <= 100).all()
    # Shackleton cell (i = 415, j = 380, 08 §11): its 3 × 3 window of 60 m is in the dark crater floor.
    assert pct[0, 380, 415] == pytest.approx(0.0, abs=1.0)
    # The Earth is seen more on the near side (0° E, top of the map) than on the far side (bottom).
    assert np.nanmean(pct[1, :100, 300:450]) > np.nanmean(pct[1, -100:, 300:450])
