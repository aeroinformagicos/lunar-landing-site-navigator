# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""T-07 fast tests of ``build_crop`` with small synthetic tiles and a local HTTP server.

docs/spec/03_datos_y_fuentes.md §5.3, §5.4 and §10.4. The synthetic tiles keep the real layout
(30° × 45°, float32 kilometres, same names) at 8 pixels per degree instead of 512, so a tile is
345,600 B instead of 1.4 GB. Expected windows, rows and byte ranges are worked out by hand from
the pseudocode of §5.3 and from the catalogue table (04_catalogo_sitios.md §2).
"""

import hashlib
import json
import math
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import pytest

from pipeline.dem.crop import (
    CropError,
    build_crop,
    crop_geometry,
    crop_pieces,
    load_crop,
    tile_bytes,
    tile_name,
)

PPD = 8
TILE_ROWS, TILE_COLS = 30 * PPD, 45 * PPD  # 240 × 360
GLOBAL_COLS = 360 * PPD
ROW_BYTES = TILE_COLS * 4

# Test site: (2° N, 1° W). Its window crosses the equator and the 0°/360° meridian: 4 tiles.
SITE = ("test-site", 2.0, -1.0)
TILES = {  # name -> (band from 60° N, 45° column)
    "SLDEM2015_512_00N_30N_315_360_FLOAT": (1, 7),
    "SLDEM2015_512_00N_30N_000_045_FLOAT": (1, 0),
    "SLDEM2015_512_30S_00S_315_360_FLOAT": (2, 7),
    "SLDEM2015_512_30S_00S_000_045_FLOAT": (2, 0),
}
# Hand-derived window of the site at 8 ppd (§5.3):
#   lat_max = ceil(12·8)/8 = 12°, lat_min = floor(−8·8)/8 = −8°  -> 160 rows
#   dlon = asin(sin 9.893° / cos 2°) + 0.1 = 9.99909°; lon_w = floor(349.00091·8)/8 = 2792/8 = 349°
#   ncols = ceil(2·9.99909·8) + 1 = 161
NROWS, NCOLS, WEST_IDX, TOP_IDX = 160, 161, 2792, 96
# Rows per tile: band 00N_30N (LATMAX 30): l0 = (30 − 12)·8 = 144 … l1 = 239;
#                band 30S_00S (LATMAX 0):  l0 = 0 … l1 = (0 + 8)·8 − 1 = 63.
EXPECTED_RANGES = {
    "SLDEM2015_512_00N_30N_315_360_FLOAT": f"bytes={144 * ROW_BYTES}-{240 * ROW_BYTES - 1}",
    "SLDEM2015_512_00N_30N_000_045_FLOAT": f"bytes={144 * ROW_BYTES}-{240 * ROW_BYTES - 1}",
    "SLDEM2015_512_30S_00S_315_360_FLOAT": f"bytes=0-{64 * ROW_BYTES - 1}",
    "SLDEM2015_512_30S_00S_000_045_FLOAT": f"bytes=0-{64 * ROW_BYTES - 1}",
}
EXPECTED_BYTES = {name: (96 if "00N_30N" in name else 64) * ROW_BYTES for name in TILES}


def _units(global_row, global_col):
    """Synthetic height in crop units (0.5 m) of a pixel of the global 8 ppd grid."""
    return (global_row * 31 + global_col * 17) % 4001 - 2000


def _tile_array(band, column):
    rows = band * TILE_ROWS + np.arange(TILE_ROWS)[:, None]
    cols = column * TILE_COLS + np.arange(TILE_COLS)[None, :]
    return (_units(rows, cols) / 2000.0).astype("<f4")  # kilometres, like the real tiles


def _write_tiles(folder, names=TILES):
    folder.mkdir(parents=True, exist_ok=True)
    for name in names:
        _tile_array(*TILES[name]).tofile(folder / f"{name}.IMG")


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        path = self.server.root / self.path.lstrip("/")
        range_header = self.headers.get("Range")
        self.server.requests.append((self.path.lstrip("/"), range_header))
        if not path.is_file():
            self.send_error(404)
            return
        data = path.read_bytes()
        if range_header and self.server.support_range:
            first, last = (int(x) for x in range_header.removeprefix("bytes=").split("-"))
            body = data[first : last + 1]
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {first}-{last}/{len(data)}")
        else:
            body = data
            self.send_response(200)
        if self.server.truncate_to is not None:
            body = body[: self.server.truncate_to]
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


@pytest.fixture
def tile_server(tmp_path):
    """Local HTTP server with the four synthetic tiles. Yields (base_url, server)."""
    root = tmp_path / "remote"
    _write_tiles(root)
    server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    server.root = root
    server.requests = []
    server.support_range = True
    server.truncate_to = None
    thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.02}, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}", server
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def _build(data_dir, base_url, **kwargs):
    messages = []
    site_id, lat, lon = SITE
    result = build_crop(
        site_id, lat, lon, data_dir, base_url=base_url, ppd=PPD, log=messages.append, **kwargs
    )
    return result, messages


def _expected_crop():
    g_top = 60 * PPD - TOP_IDX
    rows = g_top + np.arange(NROWS)[:, None]
    cols = (WEST_IDX + np.arange(NCOLS)[None, :]) % GLOBAL_COLS
    return _units(rows, cols).astype("<i2")


NO_SERVER = "http://127.0.0.1:9"  # discard port: any request fails


# ---------------------------------------------------------------- window and tiles


def test_blue_ghost_geometry_is_aligned_with_the_512_ppd_grid():
    # §5.3: lat_n = 28.562 -> lat_max = ceil(14623.744)/512 = 14624/512 = 28.5625°;
    # lat_s = 8.562 -> lat_min = floor(4383.744)/512 = 4383/512; dlon = asin(sin 9.893°/cos 18.562°) + 0.1
    # = 10.54180°; lon_w = floor(51.26820·512)/512 = 26249/512; ncols = ceil(10794.807) + 1 = 10796.
    geom = crop_geometry(18.562, 61.810)
    assert (geom.top_idx, geom.bottom_idx, geom.west_idx) == (14624, 4383, 26249)
    assert (geom.nrows, geom.ncols) == (10241, 10796)
    assert geom.lat_max_deg == 28.5625 and geom.lon_west_deg360 == 26249 / 512
    assert (geom.lat_max_deg * 512).is_integer() and (geom.lon_west_deg360 * 512).is_integer()
    # Tile 00N_30N_045_090 (LATMAX 30, LONW 45): l0 = (30 − 28.5625)·512 = 736, l1 = 15360 − 4383 − 1,
    # first column (26249 − 45·512) = 3209. Rows read: 10241 × 92160 B.
    (piece,) = crop_pieces(geom)
    assert piece.name == "SLDEM2015_512_00N_30N_045_090_FLOAT"
    assert (piece.l0, piece.l1, piece.s0, piece.ncols) == (736, 10976, 3209, 10796)
    assert (piece.l1 - piece.l0 + 1) * 92160 == 943_810_560
    assert tile_bytes() == 1_415_577_600


@pytest.mark.parametrize(
    "site,lat,lon,tiles",
    [
        # 04_catalogo_sitios.md §2, column "Teselas SLDEM2015".
        ("blue-ghost-1", 18.562, 61.810, {"00N_30N_045_090"}),
        ("slim", -13.3160, 25.2510, {"30S_00S_000_045"}),
        ("apollo-11", 0.67416, 23.47314, {"00N_30N_000_045", "30S_00S_000_045"}),
        (
            "surveyor-6",
            0.4742,
            -1.4275,
            {"00N_30N_315_360", "30S_00S_315_360", "00N_30N_000_045", "30S_00S_000_045"},
        ),
        ("surveyor-7", -40.9812, -11.5127, {"60S_30S_315_360", "60S_30S_000_045"}),
        (
            "luna-17",
            38.23764,
            -35.00163,
            {"00N_30N_270_315", "00N_30N_315_360", "30N_60N_270_315", "30N_60N_315_360"},
        ),
        (
            "apollo-15",
            26.13239,
            3.63330,
            {"00N_30N_315_360", "00N_30N_000_045", "30N_60N_315_360", "30N_60N_000_045"},
        ),
        ("change-4", -45.4561, 177.5885, {"60S_30S_135_180", "60S_30S_180_225"}),
        ("change-6", -41.6385, -153.9852, {"60S_30S_180_225"}),
        ("luna-9", 7.13, -64.37, {"00N_30N_270_315", "30S_00S_270_315"}),
    ],
)
def test_tiles_of_catalogue_sites(site, lat, lon, tiles):
    pieces = crop_pieces(crop_geometry(lat, lon))
    assert {p.name for p in pieces} == {f"SLDEM2015_512_{t}_FLOAT" for t in tiles}
    geom = crop_geometry(lat, lon)
    assert sum(p.ncols for p in pieces if p.crop_row == 0) == geom.ncols
    assert sum(p.l1 - p.l0 + 1 for p in pieces if p.crop_col == 0) == geom.nrows


def test_tile_names_and_latitude_limits():
    assert tile_name(1, 1) == "SLDEM2015_512_00N_30N_045_090_FLOAT"
    assert tile_name(0, 7) == "SLDEM2015_512_30N_60N_315_360_FLOAT"
    assert tile_name(3, 4) == "SLDEM2015_512_60S_30S_180_225_FLOAT"
    for lat in (60.0, -60.0, -84.79):
        with pytest.raises(ValueError, match="outside SLDEM2015"):
            crop_geometry(lat, 0.0)
    # The window never leaves 60° S – 60° N: a site at 55° N is cut at 60°.
    geom = crop_geometry(55.0, 10.0)
    assert geom.lat_max_deg == 60.0 and all(
        p.name.startswith("SLDEM2015_512_30N_60N") for p in crop_pieces(geom)
    )


def test_synthetic_site_window_matches_hand_calculation():
    geom = crop_geometry(SITE[1], SITE[2], PPD)
    assert (geom.nrows, geom.ncols, geom.west_idx, geom.top_idx) == (NROWS, NCOLS, WEST_IDX, TOP_IDX)
    dlon = math.degrees(math.asin(math.sin(math.radians(9.893)) / math.cos(math.radians(2.0)))) + 0.1
    assert dlon == pytest.approx(9.99909, abs=1e-5)
    assert {p.name for p in crop_pieces(geom)} == set(TILES)


# ---------------------------------------------------------------- local tiles and row ranges


def test_crop_from_local_tiles_has_the_exact_tile_values(tmp_path):
    data_dir = tmp_path / "data"
    _write_tiles(data_dir / "raw" / "sldem2015")
    result, messages = _build(data_dir, NO_SERVER)  # no network needed
    assert messages == [] and not result.skipped
    assert result.sources == dict.fromkeys(TILES, "local")
    assert result.bytes_read == EXPECTED_BYTES  # §5.4.1: (l1 − l0 + 1) × row bytes per tile

    crop = np.fromfile(result.i16_path, dtype="<i2").reshape(NROWS, NCOLS)
    np.testing.assert_array_equal(crop, _expected_crop())  # no resampling: every value is a tile value
    meta = json.loads(result.json_path.read_text(encoding="utf-8"))
    assert meta == result.meta
    assert list(meta) == [
        "site_id",
        "lat_max_deg",
        "lon_west_deg360",
        "ppd",
        "nrows",
        "ncols",
        "scaling_m",
        "source_tiles",
        "sha256",
    ]
    assert (meta["site_id"], meta["lat_max_deg"], meta["lon_west_deg360"]) == ("test-site", 12.0, 349.0)
    assert (meta["ppd"], meta["nrows"], meta["ncols"], meta["scaling_m"]) == (PPD, NROWS, NCOLS, 0.5)
    assert sorted(meta["source_tiles"]) == sorted(TILES)
    assert meta["sha256"] == hashlib.sha256(result.i16_path.read_bytes()).hexdigest()

    # Crop (0, 0) is the tile value at row (LATMAX_T − lat_max)·ppd and column (lon_w − LONW_T)·ppd.
    tile = _tile_array(1, 7)
    assert crop[0, 0] == round(float(tile[(30 - 12) * PPD, (349 - 315) * PPD]) * 2000)

    # Read back as a cylindrical grid: pixel centres map to themselves and heights are units × 0.5 m.
    grid = load_crop(data_dir, "test-site", verify_sha256=True)
    assert (grid.LATMAX, grid.LONW, grid.ppd, grid.nrows, grid.ncols, grid.to_m) == (
        12.0,
        349.0,
        8.0,
        160,
        161,
        0.5,
    )
    for r, c in ((0, 0), (100, 87), (100, 88), (158, 159)):  # columns 87 | 88 straddle 0°/360°
        lat, lon = 12.0 - (r + 0.5) / PPD, 349.0 + (c + 0.5) / PPD
        s, l = grid.pixel_of_latlon(lat, lon)
        assert (s, l) == pytest.approx((c, r), abs=1e-9)
        h, valid = grid.sample_pixels(s, l)
        assert valid and h == pytest.approx(crop[r, c] * 0.5, abs=1e-6)
    del grid


def test_local_and_range_crops_are_identical(tmp_path, tile_server):
    base_url, server = tile_server
    local_dir, range_dir = tmp_path / "with-tiles", tmp_path / "without-tiles"
    _write_tiles(local_dir / "raw" / "sldem2015")
    local, _ = _build(local_dir, NO_SERVER)
    ranged, messages = _build(range_dir, base_url)
    assert messages == []
    assert ranged.sources == dict.fromkeys(TILES, "range")
    assert ranged.bytes_read == EXPECTED_BYTES
    # Only the needed rows were requested, as whole rows, one request per tile.
    assert dict((path.removesuffix(".IMG"), rng) for path, rng in server.requests) == EXPECTED_RANGES
    assert len(server.requests) == 4
    # Identical byte for byte, data and metadata.
    assert ranged.i16_path.read_bytes() == local.i16_path.read_bytes()
    assert ranged.json_path.read_bytes() == local.json_path.read_bytes()


def test_incomplete_local_tile_is_not_used(tmp_path, tile_server):
    base_url, server = tile_server
    data_dir = tmp_path / "data"
    raw = data_dir / "raw" / "sldem2015"
    _write_tiles(raw)
    cut = "SLDEM2015_512_30S_00S_000_045_FLOAT"
    full = (raw / f"{cut}.IMG").read_bytes()
    (raw / f"{cut}.IMG").write_bytes(full[:100_000])  # an interrupted download
    result, messages = _build(data_dir, base_url)
    assert messages == [
        f"Local tile {cut} is incomplete (100000 of 345600 bytes); resume its download or delete it."
    ]
    assert result.sources == {**dict.fromkeys(TILES, "local"), cut: "range"}
    assert server.requests == [(f"{cut}.IMG", EXPECTED_RANGES[cut])]
    np.testing.assert_array_equal(
        np.fromfile(result.i16_path, dtype="<i2").reshape(NROWS, NCOLS), _expected_crop()
    )
    assert (raw / f"{cut}.IMG").stat().st_size == 100_000  # the partial file is left alone


def test_server_without_range_support_still_gives_the_same_crop(tmp_path, tile_server):
    base_url, server = tile_server
    server.support_range = False
    result, messages = _build(tmp_path / "data", base_url)
    assert result.sources == dict.fromkeys(TILES, "full-download")
    assert sorted(messages) == sorted(
        f"Server does not support range requests; downloading full tile {name} (0.0 GB)." for name in TILES
    )
    np.testing.assert_array_equal(
        np.fromfile(result.i16_path, dtype="<i2").reshape(NROWS, NCOLS), _expected_crop()
    )


def test_existing_crop_is_kept_unless_forced(tmp_path, tile_server):
    base_url, server = tile_server
    data_dir = tmp_path / "data"
    first, _ = _build(data_dir, base_url)
    again, _ = _build(data_dir, NO_SERVER)  # no network: the crop on disk is valid
    assert again.skipped and again.meta == first.meta and len(server.requests) == 4
    forced, _ = _build(data_dir, base_url, force=True)
    assert not forced.skipped and len(server.requests) == 8
    # A crop whose data file is cut is rebuilt.
    first.i16_path.write_bytes(first.i16_path.read_bytes()[:1000])
    rebuilt, _ = _build(data_dir, base_url)
    assert not rebuilt.skipped and rebuilt.i16_path.stat().st_size == NROWS * NCOLS * 2


def test_network_failures_are_reported_and_leave_no_crop(tmp_path, tile_server):
    base_url, server = tile_server
    with pytest.raises(CropError, match=r"Network error fetching http://127\.0\.0\.1:9/.*Re-run to resume\."):
        _build(tmp_path / "offline", NO_SERVER, timeout_s=5)
    (server.root / "SLDEM2015_512_30S_00S_000_045_FLOAT.IMG").unlink()  # 404
    with pytest.raises(CropError, match="Network error fetching"):
        _build(tmp_path / "missing", base_url)
    server.truncate_to = 5000  # the connection ends early
    with pytest.raises(CropError, match=r"Size mismatch for SLDEM2015_512_.*: expected \d+, got \d+\."):
        _build(tmp_path / "short", base_url)
    for folder in ("offline", "missing", "short"):
        assert not (tmp_path / folder / "crops" / "test-site.json").exists()
        with pytest.raises(FileNotFoundError):
            load_crop(tmp_path / folder, "test-site")


def test_non_finite_tile_values_are_rejected(tmp_path):
    data_dir = tmp_path / "data"
    raw = data_dir / "raw" / "sldem2015"
    _write_tiles(raw)
    name = "SLDEM2015_512_00N_30N_000_045_FLOAT"
    tile = _tile_array(*TILES[name])
    tile[200, 5] = np.nan
    tile.tofile(raw / f"{name}.IMG")
    with pytest.raises(CropError, match="not valid heights"):
        _build(data_dir, NO_SERVER)
