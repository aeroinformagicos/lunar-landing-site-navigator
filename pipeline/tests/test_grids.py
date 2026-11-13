# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""T-07 fast tests: geometry helpers, PDS labels, grids, bilinear sampling and DemStack.

Expected values come from docs/spec/03_datos_y_fuentes.md (tables of §3.1, §3.4, §4.1, §4.4,
§5.1, §6 and §7), never from the code under test.
"""

from pathlib import Path

import numpy as np
import pytest

from pipeline.common.constants import R_MOON_KM, R_MOON_M
from pipeline.common.geo import (
    latlon_height_of_position_km,
    latlon_of_unit,
    site_position_km,
    unit_vector,
    wrap180,
    wrap360,
)
from pipeline.dem.grids import (
    CylindricalGrid,
    PolarSouthGrid,
    SyntheticGrid,
    grid_from_label,
    read_pds_image,
)
from pipeline.dem.pds_label import LabelError, parse_label, parse_label_text
from pipeline.dem.stack import (
    RELIEF_LABELS,
    DemDataMissing,
    DemStack,
    lola_polar_plan,
    stack_for_site,
)

LABELS = Path(__file__).parent / "fixtures" / "labels"
MEAN_EARTH = "MEAN EARTH/POLAR AXIS OF DE421"


# ---------------------------------------------------------------- geo (03 §3.4, 00 §3)


def test_wrap_ranges():
    assert wrap180(180.0) == 180.0
    assert wrap180(-180.0) == 180.0
    assert wrap180(190.0) == -170.0
    assert wrap180(-153.9852) == -153.9852
    assert wrap360(-1.0) == 359.0
    assert wrap360(360.0) == 0.0
    assert wrap360(-1e-17) == 0.0
    np.testing.assert_allclose(wrap360(np.array([-64.37, 291.2, 720.5])), [295.63, 291.2, 0.5])
    lon = np.linspace(-1000, 1000, 4001)
    assert np.all((wrap180(lon) > -180) & (wrap180(lon) <= 180))
    assert np.all((wrap360(lon) >= 0) & (wrap360(lon) < 360))


def test_site_position_blue_ghost_hand_check():
    # 03 §3.4: Blue Ghost 1 (18.56° N, 61.81° E, h = 0) -> (778.06, 1451.68, 553.01) km;
    # Horizons gives Dxy = 1647.03931 km and Dz = 553.01019 km for that site.
    p = site_position_km(18.56, 61.81, 0.0)
    np.testing.assert_allclose(p, [778.06, 1451.68, 553.01], atol=0.006)
    assert np.hypot(p[0], p[1]) == pytest.approx(1647.03931, abs=1e-5)
    assert p[2] == pytest.approx(553.01019, abs=1e-5)


def test_position_round_trip_and_poles():
    rng = np.random.default_rng(7)
    lat = rng.uniform(-90, 90, 500)
    lon = rng.uniform(-179.999, 180, 500)
    h = rng.uniform(-9000, 11000, 500)
    lat2, lon2, h2 = latlon_height_of_position_km(site_position_km(lat, lon, h))
    np.testing.assert_allclose(lat2, lat, atol=1e-10)
    np.testing.assert_allclose(lon2, lon, atol=1e-9)
    np.testing.assert_allclose(h2, h, atol=1e-6)
    np.testing.assert_allclose(unit_vector(-90.0, 0.0), [0, 0, -1], atol=1e-15)
    np.testing.assert_allclose(unit_vector(0.0, 90.0), [0, 1, 0], atol=1e-15)
    assert np.linalg.norm(site_position_km(0.0, 0.0, 2000.0)) == pytest.approx(R_MOON_KM + 2.0)
    lat0, lon0 = latlon_of_unit(np.array([-1.0, 0.0, 0.0]))
    assert (lat0, lon0) == (0.0, 180.0)


# ---------------------------------------------------------------- labels (03 §4.1, §5.1, §6)

POLAR_LABELS = {
    # name: (N, RECORD_BYTES, DN min, DN max, MAP_SCALE m, MAP_RESOLUTION, offset px, lat max, bytes)
    "LDEM_80S_40M": (15200, 30400, -14593, 14054, 40.0, 758.084, 7599.5, -80.0, 462_080_000),
    "LDEM_75S_120M": (7624, 15248, -15526, 14050, 120.0, 252.695, 3811.5, -75.0, 116_250_752),
    "LDEM_60S_120M": (15520, 31040, -18255, 14050, 120.0, 252.695, 7759.5, -60.0, 481_740_800),
}


@pytest.mark.parametrize("name", POLAR_LABELS)
def test_lola_polar_labels(name):
    n, record_bytes, dn_min, dn_max, scale, resolution, offset, lat_max, size = POLAR_LABELS[name]
    lab = parse_label(LABELS / f"{name}.LBL")
    assert lab.image_file == f"{name}.IMG"
    assert (lab.lines, lab.line_samples, lab.file_records, lab.record_bytes) == (n, n, n, record_bytes)
    assert (lab.sample_type, lab.sample_bits, lab.dtype) == ("LSB_INTEGER", 16, "<i2")
    assert (lab.unit, lab.scaling_factor, lab.offset, lab.to_m) == ("METER", 0.5, 1_737_400.0, 0.5)
    assert (lab.minimum, lab.maximum) == (dn_min, dn_max)
    assert lab.map_projection_type == "POLAR STEREOGRAPHIC"
    assert (lab.map_scale_m, lab.map_resolution) == (scale, resolution)
    assert (lab.line_projection_offset, lab.sample_projection_offset) == (offset, offset)
    assert (lab.center_latitude, lab.center_longitude) == (-90.0, 0.0)
    assert (lab.minimum_latitude, lab.maximum_latitude) == (-90.0, lat_max)
    assert lab.westernmost_longitude is None  # 'N/A' in the label
    assert lab.coordinate_system_name == MEAN_EARTH
    assert lab.a_axis_radius_km == R_MOON_KM
    assert lab.image_bytes == size


SLDEM_LABELS = {
    # tile: (MINIMUM km, MAXIMUM km, MAXIMUM_LATITUDE, WESTERNMOST_LONGITUDE)
    "00N_30N_045_090": (-5.567, 3.360, 30.0, 45.0),
    "30S_00S_000_045": (-4.944, 4.832, 0.0, 0.0),
    "60S_30S_180_225": (-8.719, 6.541, -30.0, 180.0),
}


@pytest.mark.parametrize("tile", SLDEM_LABELS)
def test_sldem_labels(tile):
    vmin, vmax, lat_max, lon_west = SLDEM_LABELS[tile]
    lab = parse_label(LABELS / f"SLDEM2015_512_{tile}_FLOAT.LBL")
    assert lab.image_file == f"SLDEM2015_512_{tile}_FLOAT.IMG"
    assert (lab.lines, lab.line_samples, lab.record_bytes) == (15360, 23040, 92160)
    assert (lab.sample_type, lab.sample_bits, lab.dtype) == ("PC_REAL", 32, "<f4")
    assert (lab.unit, lab.scaling_factor, lab.offset) == ("KILOMETER", 1.0, 1737.4)
    assert lab.to_m == 1000.0
    assert (lab.minimum, lab.maximum) == (vmin, vmax)
    assert lab.map_projection_type == "SIMPLE CYLINDRICAL"
    assert lab.map_resolution == 512.0
    assert lab.map_scale_m == pytest.approx(59.2252938)
    assert (lab.center_latitude, lab.center_longitude) == (0.0, 180.0)
    assert (lab.maximum_latitude, lab.westernmost_longitude) == (lat_max, lon_west)
    assert lab.coordinate_system_name == MEAN_EARTH
    assert lab.image_bytes == 1_415_577_600


ILLUM_LABELS = {
    # name: (N, SCALING_FACTOR, OFFSET, DN min, DN max, MAP_SCALE m, offset px, bytes)
    "AVGVISIB_85S_060M_201608": (5058, 0.00004, 0.0, 0, 22111, 60.0, 2528.5, 51_166_728),
    "AVGVISIB_85S_060M_201608_EARTH": (5058, 0.00004, 0.0, 0, 25000, 60.0, 2528.5, 51_166_728),
    "AVGVISIB_75S_120M_201608": (7624, 0.00004, 0.0, 0, 22397, 120.0, 3811.5, 116_250_752),
    "AVGVISIB_75S_120M_201608_EARTH": (7624, 0.00004, 0.0, 0, 25000, 120.0, 3811.5, 116_250_752),
    "LPSR_85S_060M_201608": (5058, 0.000025, 0.5, -20000, 20000, 60.0, 2528.5, 51_166_728),
}


@pytest.mark.parametrize("name", ILLUM_LABELS)
def test_illumination_labels(name):
    n, scaling, offset, dn_min, dn_max, scale, px_offset, size = ILLUM_LABELS[name]
    lab = parse_label(LABELS / f"{name}.LBL")
    assert (lab.lines, lab.line_samples, lab.dtype) == (n, n, "<i2")
    assert (lab.unit, lab.scaling_factor, lab.offset) == ("NONE", scaling, offset)
    assert (lab.minimum, lab.maximum) == (dn_min, dn_max)
    assert (lab.map_scale_m, lab.sample_projection_offset) == (scale, px_offset)
    assert lab.image_bytes == size
    grid = grid_from_label(lab)  # same projection as the DEMs
    assert (grid.kind, grid.N, grid.S) == ("polar_south", n, scale)


def test_n2_label_latitude_erratum_is_harmless():
    # 03 §6: the label of N2 says MINIMUM_LATITUDE = 90; the projection is that of N1.
    n1 = parse_label(LABELS / "AVGVISIB_85S_060M_201608.LBL")
    n2 = parse_label(LABELS / "AVGVISIB_85S_060M_201608_EARTH.LBL")
    assert n2.minimum_latitude == 90.0
    g1, g2 = grid_from_label(n1), grid_from_label(n2)
    assert (g1.N, g1.S) == (g2.N, g2.S)


def test_label_errors():
    text = (LABELS / "LDEM_80S_40M.LBL").read_text(encoding="latin-1")
    with pytest.raises(LabelError, match="missing LINES"):
        parse_label_text(text.replace("    LINES ", "    XLINES "))
    with pytest.raises(LabelError, match="RECORD_BYTES"):
        parse_label_text(text.replace("= 30400", "= 30401"))
    bad_type = parse_label_text(text.replace("LSB_INTEGER", "MSB_INTEGER"))
    with pytest.raises(LabelError, match="Unsupported sample type"):
        _ = bad_type.dtype
    with pytest.raises(LabelError, match="unsupported MAP_PROJECTION_TYPE"):
        grid_from_label(parse_label_text(text.replace("POLAR STEREOGRAPHIC", "MERCATOR")))
    with pytest.raises(LabelError, match="not a square south polar"):
        grid_from_label(parse_label_text(text.replace("= 7599.5 <pix>", "= 7600.5 <pix>")))


# ---------------------------------------------------------------- polar stereographic (03 §3.1)


def _polar(name):
    return grid_from_label(parse_label(LABELS / f"{name}.LBL"))


@pytest.mark.parametrize(
    "name,axis_lat,corner_lat",
    [
        ("LDEM_80S_40M", -80.00, -75.89),
        ("LDEM_75S_120M", -75.00, -68.9),
        ("LDEM_60S_120M", -60.00, -48.49),
        ("AVGVISIB_85S_060M_201608", -85.00, -82.9),
    ],
)
def test_polar_coverage_table(name, axis_lat, corner_lat):
    # 03 §3.1 table: latitude reached on the axes and at the corners (outer pixel edges).
    g = _polar(name)
    lat_axis, lon_axis = g.latlon_of_pixel(g.N - 0.5, g.N / 2 - 0.5)
    lat_corner, lon_corner = g.latlon_of_pixel(g.N - 0.5, -0.5)
    assert lat_axis == pytest.approx(axis_lat, abs=0.006)
    assert lat_corner == pytest.approx(corner_lat, abs=0.06)
    assert lon_axis == pytest.approx(90.0)  # 90° E extends to the right
    assert lon_corner == pytest.approx(45.0)


def test_polar_orientation_and_label_formulas():
    g = _polar("LDEM_80S_40M")
    lab = g.label
    # Longitude 0 extends straight up from the centre; 90 E to the right.
    s, l = g.pixel_of_latlon(-89.0, 0.0)
    assert s == pytest.approx(lab.sample_projection_offset) and l < lab.line_projection_offset
    s, l = g.pixel_of_latlon(-89.0, 90.0)
    assert l == pytest.approx(lab.line_projection_offset) and s > lab.sample_projection_offset
    # The pole is the centre of the image, between the four central pixels.
    np.testing.assert_allclose(g.pixel_of_latlon(-90.0, 0.0), (7599.5, 7599.5))
    np.testing.assert_allclose(g.latlon_of_pixel(7599.5, 7599.5), (-90.0, 0.0))
    # Label convention: x = (s − SAMPLE_PROJECTION_OFFSET)·MAP_SCALE,
    # y = (LINE_PROJECTION_OFFSET − l)·MAP_SCALE.
    s = np.array([0.0, 100.25, 7599.5, 15199.0])
    l = np.array([0.0, 9000.75, 7599.5, 15199.0])
    x, y = g.xy_of_pixel(s, l)
    np.testing.assert_allclose(x, (s - lab.sample_projection_offset) * lab.map_scale_m)
    np.testing.assert_allclose(y, (lab.line_projection_offset - l) * lab.map_scale_m)


def test_shackleton_pixel():
    # 03 §4.4: (−89.67°, 129.78° E) -> x = +7.690 km, y = −6.403 km; P1 pixel (7791.75, 7759.58).
    # 03 §6: in the 60 m products, (2656.67, 2635.22).
    p1 = _polar("LDEM_80S_40M")
    s, l = p1.pixel_of_latlon(-89.67, 129.78)
    x, y = p1.xy_of_pixel(s, l)
    assert (x, y) == pytest.approx((7690.0, -6403.0), abs=1.0)
    assert (s, l) == pytest.approx((7791.75, 7759.58), abs=0.02)
    n1 = _polar("AVGVISIB_85S_060M_201608")
    assert n1.pixel_of_latlon(-89.67, 129.78) == pytest.approx((2656.67, 2635.22), abs=0.02)


@pytest.mark.parametrize("name", ["LDEM_80S_40M", "LDEM_75S_120M", "LDEM_60S_120M"])
def test_polar_round_trips(name):
    g = _polar(name)
    rng = np.random.default_rng(11)
    s = rng.uniform(-0.5, g.N - 0.5, 2000)
    l = rng.uniform(-0.5, g.N - 0.5, 2000)
    lat, lon = g.latlon_of_pixel(s, l)
    s2, l2 = g.pixel_of_latlon(lat, lon)  # pixel -> lat/lon -> pixel
    assert np.abs(s2 - s).max() < 1e-6 and np.abs(l2 - l).max() < 1e-6
    s3, l3 = g.pixel_of_unit(unit_vector(lat, lon))  # lat/lon -> vector -> pixel (rational form)
    assert np.abs(s3 - s).max() < 1e-6 and np.abs(l3 - l).max() < 1e-6
    lat4, lon4 = latlon_of_unit(g.unit_of_pixel(s, l))  # pixel -> vector -> lat/lon
    np.testing.assert_allclose(lat4, lat, atol=1e-9)
    np.testing.assert_allclose(wrap180(lon4 - lon), 0.0, atol=1e-7)


def test_polar_north_pole_is_outside():
    g = PolarSouthGrid("flat", 64, 40.0, data=np.zeros((64, 64), dtype="<i2"), to_m=0.5)
    h, valid = g.height_m(np.array([[0.0, 0.0, 1.0], [0.0, 0.0, -1.0]]))
    assert list(valid) == [False, True]
    assert np.isnan(h[0]) and h[1] == 0.0


# ---------------------------------------------------------------- simple cylindrical (03 §3.2)


def test_cylindrical_label_values_reproduced():
    g = grid_from_label(parse_label(LABELS / "SLDEM2015_512_00N_30N_045_090_FLOAT.LBL"))
    lab = g.label
    assert (g.kind, g.LATMAX, g.LONW, g.ppd, g.nrows, g.ncols) == (
        "cylindrical",
        30.0,
        45.0,
        512.0,
        15360,
        23040,
    )
    # 03 §3: pixel s = 0 is 45.00098° (45° + half a pixel) and l = 0 is 29.99902°.
    lat, lon = g.latlon_of_pixel(0, 0)
    assert lon == pytest.approx(45.00098, abs=5e-6)
    assert lat == pytest.approx(29.99902, abs=5e-6)
    assert lon == 45.0 + 0.5 / 512 and lat == 30.0 - 0.5 / 512
    # Label convention: lon = CENTER_LONGITUDE + (s − SAMPLE_PROJECTION_OFFSET)/MAP_RESOLUTION, etc.
    s = np.array([0.0, 1234.5, 23039.0])
    l = np.array([0.0, 777.25, 15359.0])
    lat, lon = g.latlon_of_pixel(s, l)
    np.testing.assert_allclose(
        lon, lab.center_longitude + (s - lab.sample_projection_offset) / lab.map_resolution
    )
    np.testing.assert_allclose(lat, (lab.line_projection_offset - l) / lab.map_resolution)
    # One pixel is 1/512° = 59.2253 m at the equator (MAP_SCALE of the label).
    assert g.res_m == pytest.approx(lab.map_scale_m, abs=1e-3)


@pytest.mark.parametrize(
    "lat_max,lon_west", [(30.0, 45.0), (0.0, 315.0), (-30.0, 180.0), (12.5625, 350.26171875)]
)
def test_cylindrical_round_trips(lat_max, lon_west):
    # The last case is a crop that crosses 0°/360°: columns use wrap360(lon − LONW).
    g = CylindricalGrid("t", lat_max, lon_west, 512, 15360, 23040)
    rng = np.random.default_rng(5)
    s = rng.uniform(-0.5, g.ncols - 0.5, 2000)
    l = rng.uniform(-0.5, g.nrows - 0.5, 2000)
    lat, lon = g.latlon_of_pixel(s, l)
    assert np.all((lon > -180) & (lon <= 180))
    s2, l2 = g.pixel_of_latlon(lat, lon)
    assert np.abs(s2 - s).max() < 1e-6 and np.abs(l2 - l).max() < 1e-6
    s3, l3 = g.pixel_of_unit(unit_vector(lat, lon))
    assert np.abs(s3 - s).max() < 1e-6 and np.abs(l3 - l).max() < 1e-6
    # The same longitude given as λ or λ ± 360° lands on the same pixel.
    s4, _ = g.pixel_of_latlon(lat, lon + 360.0)
    assert np.abs(s4 - s).max() < 1e-6


# ---------------------------------------------------------------- bilinear (03 §3.3)


def _plane_m(s, l):
    return 300.0 + 20.0 * s - 14.0 * l  # metres


def _plane_grid(dtype="<f8", to_m=1.0):
    nrows, ncols = 50, 60
    l, s = np.mgrid[0:nrows, 0:ncols]
    data = (_plane_m(s, l) / to_m).astype(dtype)
    return CylindricalGrid("plane", 10.0, 20.0, 16, nrows, ncols, data=data, to_m=to_m)


@pytest.mark.parametrize("dtype,to_m,atol", [("<f8", 1.0, 1e-9), ("<f4", 1000.0, 1e-3), ("<i2", 0.5, 1e-9)])
def test_bilinear_is_exact_on_a_plane(dtype, to_m, atol):
    # Same three encodings as the real products: metres, float32 kilometres and int16 half metres.
    g = _plane_grid(dtype, to_m)
    rng = np.random.default_rng(3)
    s = rng.uniform(0, g.ncols - 1.000001, 5000)
    l = rng.uniform(0, g.nrows - 1.000001, 5000)
    h, valid = g.sample_pixels(s, l)
    assert valid.all()
    np.testing.assert_allclose(h, _plane_m(s, l), rtol=0, atol=atol)


def test_bilinear_pixel_centres_and_shapes():
    g = _plane_grid("<i2", 0.5)
    h, valid = g.sample_pixels(7.0, 3.0)  # a pixel centre returns the stored value
    assert valid and h == g.data[3, 7] * 0.5
    s = np.arange(12, dtype=float).reshape(3, 4)
    h, valid = g.sample_pixels(s, s)  # any shape
    assert h.shape == (3, 4) and valid.all()
    # Through unit vectors: the centre of pixel (s, l) = (20, 30).
    h, valid = g.height_m(g.unit_of_pixel(20.0, 30.0))
    assert valid and h == pytest.approx(g.data[30, 20] * 0.5, abs=1e-6)


def test_bilinear_nodata_outside_and_invalid_neighbours():
    g = _plane_grid("<f8")
    last_s, last_l = g.ncols - 1, g.nrows - 1
    s = np.array([-0.001, 0.0, last_s - 1e-9, last_s, last_s + 0.5, 5.0, 5.0, 5.0, np.nan])
    l = np.array([5.0, 0.0, last_l - 1e-9, 5.0, 5.0, -0.001, last_l, 1e9, 5.0])
    h, valid = g.sample_pixels(s, l)
    # Literal §3.3: s0 + 1 > ncols − 1 is NODATA, so the last centre itself is outside.
    assert list(valid) == [False, True, True, False, False, False, False, False, False]
    assert np.isnan(h[~valid]).all() and np.isfinite(h[valid]).all()

    g.data[10, 10] = np.nan  # not finite
    g.data[20, 20] = 20_000.5  # outside [−20000, +20000] m
    g.data[30, 30] = -20_000.0  # the limit itself is valid
    s = np.array([9.5, 10.5, 12.5, 19.5, 20.0, 30.5])
    l = np.array([9.5, 10.5, 10.5, 20.5, 19.0, 30.5])
    _, valid = g.sample_pixels(s, l)
    assert list(valid) == [False, False, True, False, False, True]


def test_polar_height_through_unit_vectors():
    # A plane in map coordinates is linear in pixels: bilinear reproduces it at any point.
    n, scale = 400, 120.0
    g0 = PolarSouthGrid("geom", n, scale)
    l, s = np.mgrid[0:n, 0:n]
    x, y = g0.xy_of_pixel(s, l)
    g = PolarSouthGrid("plane", n, scale, data=1000 + 0.05 * x - 0.03 * y)
    rng = np.random.default_rng(2)
    lat = rng.uniform(-90, -89.3, 3000)
    lon = rng.uniform(-180, 180, 3000)
    h, valid = g.height_m(unit_vector(lat, lon))
    r = 2 * R_MOON_M * np.tan(np.radians(90 + lat) / 2)  # 03 §3.1
    expected = 1000 + 0.05 * r * np.sin(np.radians(lon)) - 0.03 * r * np.cos(np.radians(lon))
    assert valid.all()
    np.testing.assert_allclose(h, expected, atol=1e-6)


def test_read_pds_image_small_file(tmp_path):
    # A real label shrunk to an 8 × 8 image, with its .IMG next to it.
    text = (LABELS / "LDEM_80S_40M.LBL").read_text(encoding="latin-1")
    text = text.replace("15200", "8").replace("30400", "16").replace("7599.5", "3.5")
    (tmp_path / "LDEM_80S_40M.LBL").write_text(text, encoding="latin-1", newline="")
    dn = (np.arange(64, dtype="<i2") * 100 - 3000).reshape(8, 8)
    dn.tofile(tmp_path / "LDEM_80S_40M.IMG")
    for in_memory in (False, True):
        g = read_pds_image(tmp_path / "LDEM_80S_40M.LBL", in_memory=in_memory)
        assert (g.name, g.kind, g.N, g.S, g.to_m, g.res_m) == (
            "LDEM_80S_40M",
            "polar_south",
            8,
            40.0,
            0.5,
            40.0,
        )
        np.testing.assert_array_equal(np.asarray(g.data), dn)
        h, valid = g.sample_pixels(2.0, 5.0)  # first row of the file is the top row of the image
        assert valid and h == dn[5, 2] * 0.5
        h, valid = g.height_m(unit_vector(-90.0, 0.0))  # the pole: mean of the four central pixels
        assert valid and h == pytest.approx(dn[3:5, 3:5].mean() * 0.5)
        del g
    (tmp_path / "LDEM_80S_40M.IMG").write_bytes(b"\0" * 100)
    with pytest.raises(LabelError, match=r"Size mismatch for LDEM_80S_40M.IMG: expected 128, got 100\."):
        read_pds_image(tmp_path / "LDEM_80S_40M.LBL")
    (tmp_path / "LDEM_80S_40M.IMG").unlink()
    with pytest.raises(FileNotFoundError):
        read_pds_image(tmp_path / "LDEM_80S_40M.LBL")


# ---------------------------------------------------------------- SyntheticGrid (06 §10)


def test_synthetic_grid():
    centre = unit_vector(0.0, 0.0)

    def height(u):  # 100 m per degree of angular distance to (0°, 0°)
        return 100.0 * np.degrees(np.arccos(np.clip(u @ centre, -1, 1)))

    g = SyntheticGrid(height)
    assert g.kind == "synthetic"
    u = unit_vector(np.array([[0.0, 3.0], [0.0, -4.0]]), np.array([[0.0, 0.0], [5.0, 0.0]]))
    h, valid = g.height_m(u)
    assert h.shape == (2, 2) and valid.all()
    np.testing.assert_allclose(h, [[0.0, 300.0], [500.0, 400.0]], atol=1e-6)

    limited = SyntheticGrid(height, valid_fn=lambda u: u @ centre > np.cos(np.radians(3.5)))
    h, valid = limited.height_m(u)
    assert valid.tolist() == [[True, True], [False, False]] and np.isnan(h[1]).all()

    holes = SyntheticGrid(lambda u: np.where(u[..., 2] > 0.01, np.nan, 25_000.0 * (u[..., 2] < -0.01)))
    _, valid = holes.height_m(u)  # NaN and out-of-range heights are "no data"
    assert valid.tolist() == [[True, False], [True, False]]

    flat = SyntheticGrid(lambda u: 0.0)  # a constant is broadcast
    h, valid = flat.height_m(u)
    assert h.shape == (2, 2) and valid.all() and not h.any()


# ---------------------------------------------------------------- DemStack (03 §7)


def test_relief_labels_are_the_exact_contract_texts():
    assert RELIEF_LABELS == (
        "LOLA polar 40 m + 120 m",
        "LOLA polar 120 m",
        "LOLA 120 m",
        "SLDEM2015 59 m",
        "Smooth Moon (no terrain)",
    )


def test_stack_uses_first_valid_grid_without_blending():
    fine = PolarSouthGrid("fine", 100, 40.0, data=np.full((100, 100), 200, dtype="<i2"), to_m=0.5)  # ±2 km
    coarse = PolarSouthGrid(
        "coarse", 100, 120.0, data=np.full((100, 100), -600, dtype="<i2"), to_m=0.5
    )  # ±6 km
    stack = DemStack([fine, coarse], "LOLA polar 40 m + 120 m")

    def at(x_m, y_m):  # unit vector of a map point (inverse of 03 §3.1)
        r = np.hypot(x_m, y_m)
        lat = -90 + np.degrees(2 * np.arctan(r / (2 * R_MOON_M)))
        return unit_vector(lat, np.degrees(np.arctan2(x_m, y_m)))

    u = np.stack([at(0.0, 0.0), at(1500.0, -1000.0), at(3000.0, 0.0), at(-5000.0, 5000.0), at(7000.0, 0.0)])
    h, valid, index = stack.height_m(u)
    assert index.tolist() == [0, 0, 1, 1, -1]
    assert valid.tolist() == [True, True, True, True, False]
    np.testing.assert_array_equal(h[:4], [100.0, 100.0, -300.0, -300.0])
    assert np.isnan(h[4])
    # Any leading shape, and a single vector.
    h2, valid2, index2 = stack.height_m(u.reshape(5, 1, 3))
    assert h2.shape == valid2.shape == index2.shape == (5, 1)
    assert stack.height_m(at(3000.0, 0.0)) == (-300.0, True, 1)
    h1, ok1, i1 = stack.height_m(at(7000.0, 0.0))
    assert np.isnan(h1) and ok1 is False and i1 == -1
    # A hole in the first grid falls through to the second one.
    holed = PolarSouthGrid("holed", 100, 40.0, data=np.full((100, 100), np.nan), to_m=1.0)
    assert DemStack([holed, coarse], "x").height_m(at(0.0, 0.0)) == (-300.0, True, 1)


@pytest.mark.parametrize(
    "site,lat,lon,needs_p3,label",
    [
        # 04 §2 and §4: IM-1 is inside P1 (4 km from its north edge) and its 300 km circle leaves P2.
        ("im-1", -80.13, 1.44, True, "LOLA polar 40 m + 120 m"),
        ("im-2", -84.7906, 29.1957, False, "LOLA polar 40 m + 120 m"),
        ("shackleton-floor", -89.67, 129.78, False, "LOLA polar 40 m + 120 m"),
        ("val-899s", -89.9, 0.0, False, "LOLA polar 40 m + 120 m"),
        ("region-peak-near-cabeus-b", -83.6, -68.7, True, "LOLA polar 40 m + 120 m"),
        # Hypothetical polar site outside the P1 square (y = 2R·tan(7°) = 426.6 km > 304 km).
        ("outside-p1", -76.0, 0.0, True, "LOLA polar 120 m"),
    ],
)
def test_lola_polar_plan(site, lat, lon, needs_p3, label):
    assert lola_polar_plan(lat, lon) == (needs_p3, label)


def test_stack_for_site_dispatch(tmp_path):
    assert stack_for_site("smooth", "val-equator", 0.0, 0.0, tmp_path) is None
    with pytest.raises(ValueError, match="Unknown relief"):
        stack_for_site("lola", "x", 0.0, 0.0, tmp_path)
    for relief, lat in (("lola_polar", -89.9), ("lola_60s", -69.3741), ("sldem2015", 18.562)):
        with pytest.raises(DemDataMissing):
            stack_for_site(relief, "some-site", lat, 0.0, tmp_path)
