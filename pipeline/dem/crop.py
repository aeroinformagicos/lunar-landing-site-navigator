# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Per-site crop of SLDEM2015 (±300 km window), built from local tiles or by row ranges.

docs/spec/03_datos_y_fuentes.md §5.3 and §10.4 (decisions D-31 and D-39).

The crop is aligned with the global 512 ppd grid (pixel edges at multiples of 1/512°), so
every crop value is exactly one tile value: no resampling. For each tile the window touches,
the rows come from the full tile in ``<data>/raw/sldem2015/`` if it is there with its exact
size and, if not, from an HTTP ``Range`` request for just those rows. Both paths give the same
bytes. Output: ``<data>/crops/<site_id>.i16`` (int16 little-endian, 0.5 m per unit) and
``<data>/crops/<site_id>.json``.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import urllib.error
import urllib.request
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from pipeline.common.geo import wrap360
from pipeline.dem.grids import CylindricalGrid

# Tiles (03 §5.1 and §10.1). The server accepts range requests.
SLDEM_BASE_URL = "https://imbrium.mit.edu/DATA/SLDEM2015/TILES/FLOAT_IMG"
SLDEM_PPD = 512
TILE_LAT_SPAN_DEG = 30
TILE_LON_SPAN_DEG = 45
SLDEM_LAT_LIMIT_DEG = 60  # SLDEM2015 covers 60° S to 60° N
_BAND_NAMES = ("30N_60N", "00N_30N", "30S_00S", "60S_30S")  # north to south

# Window (03 §5.2 and §5.3): latitude ±10.0°; longitude ±(asin(sin δ / cos φ) + 0.1°), δ = 9.893°.
CROP_HALF_LAT_DEG = 10.0
CROP_DELTA_DEG = 9.893
CROP_LON_MARGIN_DEG = 0.1

# Stored value: round(height_km · 2000) as int16, i.e. 0.5 m per unit.
CROP_UNITS_PER_KM = 2000.0
CROP_SCALING_M = 0.5

_BLOCK_ROWS = 256  # rows converted at a time (bounded memory)


class CropError(RuntimeError):
    """The crop could not be built (network, truncated data, invalid values)."""


@dataclass(frozen=True)
class CropGeometry:
    """Window of a crop in integer pixel units of the global grid of ``ppd`` pixels per degree."""

    ppd: int
    top_idx: int  # lat_max · ppd
    bottom_idx: int  # lat_min · ppd
    west_idx: int  # lon_w · ppd, in [0, 360 · ppd)
    nrows: int
    ncols: int

    @property
    def lat_max_deg(self) -> float:
        return self.top_idx / self.ppd

    @property
    def lat_min_deg(self) -> float:
        return self.bottom_idx / self.ppd

    @property
    def lon_west_deg360(self) -> float:
        return self.west_idx / self.ppd


@dataclass(frozen=True)
class TilePiece:
    """Part of one tile that goes into the crop (all indices 0-based, inclusive rows)."""

    name: str
    l0: int  # first tile row
    l1: int  # last tile row
    s0: int  # first tile column
    crop_row: int  # where (l0, s0) lands in the crop
    crop_col: int
    ncols: int  # number of columns taken


@dataclass(frozen=True)
class CropResult:
    meta: dict  # content of the .json file
    i16_path: Path
    json_path: Path
    bytes_read: dict[str, int]  # tile name -> bytes read (local or range); empty if skipped
    sources: dict[str, str]  # tile name -> 'local' | 'range' | 'full-download'
    skipped: bool  # True if a valid crop was already there


def crop_geometry(lat_deg: float, lon_deg: float, ppd: int = SLDEM_PPD) -> CropGeometry:
    """Window of the crop of a site, aligned outwards with the global grid (literal §5.3)."""
    if abs(lat_deg) >= SLDEM_LAT_LIMIT_DEG:
        raise ValueError(f"Latitude {lat_deg}° is outside SLDEM2015 (|lat| < {SLDEM_LAT_LIMIT_DEG}°)")
    lat_n = min(lat_deg + CROP_HALF_LAT_DEG, float(SLDEM_LAT_LIMIT_DEG))
    lat_s = max(lat_deg - CROP_HALF_LAT_DEG, -float(SLDEM_LAT_LIMIT_DEG))
    ratio = math.sin(math.radians(CROP_DELTA_DEG)) / math.cos(math.radians(lat_deg))
    dlon = math.degrees(math.asin(ratio)) + CROP_LON_MARGIN_DEG
    top_idx = math.ceil(lat_n * ppd)
    bottom_idx = math.floor(lat_s * ppd)
    west_idx = math.floor(float(wrap360(lon_deg - dlon)) * ppd) % (360 * ppd)
    return CropGeometry(
        ppd=ppd,
        top_idx=top_idx,
        bottom_idx=bottom_idx,
        west_idx=west_idx,
        nrows=top_idx - bottom_idx,
        ncols=math.ceil(2 * dlon * ppd) + 1,
    )


def tile_name(band: int, column: int) -> str:
    """Product name of the tile in latitude band ``band`` (0 = 30N_60N) and 45° column ``column``."""
    lon1 = column * TILE_LON_SPAN_DEG
    return f"SLDEM2015_512_{_BAND_NAMES[band]}_{lon1:03d}_{lon1 + TILE_LON_SPAN_DEG:03d}_FLOAT"


def tile_shape(ppd: int = SLDEM_PPD) -> tuple[int, int]:
    return TILE_LAT_SPAN_DEG * ppd, TILE_LON_SPAN_DEG * ppd


def tile_bytes(ppd: int = SLDEM_PPD) -> int:
    """Exact size of a tile file: 1,415,577,600 B at 512 ppd."""
    rows, cols = tile_shape(ppd)
    return rows * cols * 4


def crop_pieces(geom: CropGeometry) -> list[TilePiece]:
    """Tile pieces that make up the window: up to 2 bands × 2 columns, crossing 0°/360° if needed."""
    tile_rows, tile_cols = tile_shape(geom.ppd)
    global_cols = 360 * geom.ppd
    g_top = SLDEM_LAT_LIMIT_DEG * geom.ppd - geom.top_idx  # global row of the first crop row
    g_bottom = g_top + geom.nrows  # exclusive
    col_segments = []  # (tile column, s0, crop column, n)
    c = 0
    while c < geom.ncols:
        gc = (geom.west_idx + c) % global_cols
        column, s0 = divmod(gc, tile_cols)
        n = min(tile_cols - s0, geom.ncols - c)
        col_segments.append((column, s0, c, n))
        c += n
    pieces = []
    for band in range(g_top // tile_rows, (g_bottom - 1) // tile_rows + 1):
        first = max(g_top, band * tile_rows)
        last = min(g_bottom, (band + 1) * tile_rows) - 1
        for column, s0, crop_col, n in col_segments:
            pieces.append(
                TilePiece(
                    name=tile_name(band, column),
                    l0=first - band * tile_rows,
                    l1=last - band * tile_rows,
                    s0=s0,
                    crop_row=first - g_top,
                    crop_col=crop_col,
                    ncols=n,
                )
            )
    return pieces


def _read_exact(stream, nbytes: int, name: str) -> bytes:
    chunks = []
    got = 0
    while got < nbytes:
        chunk = stream.read(min(nbytes - got, 1 << 24))
        if not chunk:
            raise CropError(f"Size mismatch for {name}: expected {nbytes}, got {got}.")
        chunks.append(chunk)
        got += len(chunk)
    return b"".join(chunks)


def _skip(stream, nbytes: int, name: str) -> None:
    left = nbytes
    while left > 0:
        chunk = stream.read(min(left, 1 << 24))
        if not chunk:
            raise CropError(f"Size mismatch for {name}: expected {nbytes}, got {nbytes - left}.")
        left -= len(chunk)


def _iter_rows_local(path: Path, piece: TilePiece, ppd: int) -> Iterator[np.ndarray]:
    tile = np.memmap(path, dtype="<f4", mode="r", shape=tile_shape(ppd))
    try:
        for start in range(piece.l0, piece.l1 + 1, _BLOCK_ROWS):
            yield np.asarray(tile[start : min(start + _BLOCK_ROWS, piece.l1 + 1)])
    finally:
        del tile


def _iter_rows_http(
    url: str, piece: TilePiece, ppd: int, timeout: float, log: Callable[[str], None], sources: dict[str, str]
) -> Iterator[np.ndarray]:
    _, tile_cols = tile_shape(ppd)
    row_bytes = tile_cols * 4
    first = piece.l0 * row_bytes
    last = (piece.l1 + 1) * row_bytes - 1  # whole rows
    request = urllib.request.Request(url, headers={"Range": f"bytes={first}-{last}"})
    try:
        response = urllib.request.urlopen(request, timeout=timeout)
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", exc)
        raise CropError(f"Network error fetching {url}: {reason}. Re-run to resume.") from exc
    with response:
        if response.status == 206:
            sources[piece.name] = "range"
        else:  # 200: the server ignored the Range header and sends the whole tile
            size_gb = tile_bytes(ppd) / 1e9
            log(
                "Server does not support range requests; "
                f"downloading full tile {piece.name} ({size_gb:.1f} GB)."
            )
            sources[piece.name] = "full-download"
            _skip(response, first, piece.name)
        try:
            for start in range(piece.l0, piece.l1 + 1, _BLOCK_ROWS):
                nrows = min(_BLOCK_ROWS, piece.l1 + 1 - start)
                block = _read_exact(response, nrows * row_bytes, piece.name)
                yield np.frombuffer(block, dtype="<f4").reshape(nrows, tile_cols)
        except OSError as exc:
            raise CropError(f"Network error fetching {url}: {exc}. Re-run to resume.") from exc


def _existing_crop(json_path: Path, i16_path: Path, expected: dict) -> dict | None:
    """The stored metadata if a complete crop with this geometry is already on disk."""
    if not (json_path.is_file() and i16_path.is_file()):
        return None
    try:
        meta = json.loads(json_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if any(meta.get(key) != value for key, value in expected.items()):
        return None
    if i16_path.stat().st_size != meta["nrows"] * meta["ncols"] * 2:
        return None
    return meta


def build_crop(
    site_id: str,
    lat_deg: float,
    lon_deg: float,
    data_dir: str | Path,
    *,
    base_url: str = SLDEM_BASE_URL,
    ppd: int = SLDEM_PPD,
    force: bool = False,
    timeout_s: float = 120.0,
    log: Callable[[str], None] = print,
) -> CropResult:
    """Build ``crops/<site_id>.i16`` and ``.json`` for a site with |lat| < 60°.

    Idempotent: a complete crop with the same geometry is kept unless ``force``.
    ``ppd`` exists for the tests (small synthetic tiles); real data are always 512.
    """
    data_dir = Path(data_dir)
    geom = crop_geometry(lat_deg, lon_deg, ppd)
    pieces = crop_pieces(geom)
    source_tiles = list(dict.fromkeys(p.name for p in pieces))
    crops_dir = data_dir / "crops"
    i16_path = crops_dir / f"{site_id}.i16"
    json_path = crops_dir / f"{site_id}.json"
    meta = {
        "site_id": site_id,
        "lat_max_deg": geom.lat_max_deg,
        "lon_west_deg360": geom.lon_west_deg360,
        "ppd": ppd,
        "nrows": geom.nrows,
        "ncols": geom.ncols,
        "scaling_m": CROP_SCALING_M,
        "source_tiles": source_tiles,
    }
    if not force:
        existing = _existing_crop(json_path, i16_path, meta)
        if existing is not None:
            return CropResult(existing, i16_path, json_path, {}, {}, skipped=True)

    full_size = tile_bytes(ppd)
    _, tile_cols = tile_shape(ppd)
    crop = np.empty((geom.nrows, geom.ncols), dtype="<i2")
    bytes_read: dict[str, int] = {}
    sources: dict[str, str] = {}
    # One read per tile: its rows are fetched once and every column segment is cut from them.
    by_tile: dict[str, list[TilePiece]] = {}
    for piece in pieces:
        by_tile.setdefault(piece.name, []).append(piece)
    for name, tile_pieces in by_tile.items():
        first = tile_pieces[0]
        local = data_dir / "raw" / "sldem2015" / f"{name}.IMG"
        use_local = False
        if local.is_file():
            size = local.stat().st_size
            if size == full_size:
                use_local = True
            else:
                log(
                    f"Local tile {name} is incomplete ({size} of {full_size} bytes); "
                    "resume its download or delete it."
                )
        if use_local:
            sources[name] = "local"
            blocks = _iter_rows_local(local, first, ppd)
        else:
            blocks = _iter_rows_http(f"{base_url}/{name}.IMG", first, ppd, timeout_s, log, sources)
        row = first.crop_row
        nbytes = 0
        for block in blocks:
            nbytes += block.shape[0] * tile_cols * 4
            for piece in tile_pieces:
                km = block[:, piece.s0 : piece.s0 + piece.ncols].astype(np.float64)
                units = np.rint(km * CROP_UNITS_PER_KM)
                if not np.all(np.isfinite(units)) or np.abs(units).max() > 32767:
                    raise CropError(f"Tile {name} holds values that are not valid heights")
                crop[row : row + block.shape[0], piece.crop_col : piece.crop_col + piece.ncols] = units
            row += block.shape[0]
        expected = (first.l1 - first.l0 + 1) * tile_cols * 4
        if nbytes != expected:
            raise CropError(f"Size mismatch for {name}: expected {expected}, got {nbytes}.")
        bytes_read[name] = nbytes

    payload = crop.tobytes()
    meta["sha256"] = hashlib.sha256(payload).hexdigest()
    crops_dir.mkdir(parents=True, exist_ok=True)
    json_path.unlink(missing_ok=True)  # the .json marks a complete crop: remove it first
    tmp = i16_path.with_suffix(".i16.part")
    tmp.write_bytes(payload)
    os.replace(tmp, i16_path)
    tmp_json = json_path.with_suffix(".json.part")
    tmp_json.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp_json, json_path)
    return CropResult(meta, i16_path, json_path, bytes_read, sources, skipped=False)


def load_crop(
    data_dir: str | Path, site_id: str, in_memory: bool = False, verify_sha256: bool = False
) -> CylindricalGrid:
    """Open a crop as a cylindrical Grid (LATMAX = lat_max_deg, LONW = lon_west_deg360)."""
    crops_dir = Path(data_dir) / "crops"
    json_path = crops_dir / f"{site_id}.json"
    i16_path = crops_dir / f"{site_id}.i16"
    if not json_path.is_file() or not i16_path.is_file():
        raise FileNotFoundError(f"Missing crop for site {site_id}: {json_path}")
    meta = json.loads(json_path.read_text(encoding="utf-8"))
    shape = (meta["nrows"], meta["ncols"])
    size = i16_path.stat().st_size
    if size != shape[0] * shape[1] * 2:
        raise CropError(f"Size mismatch for {i16_path.name}: expected {shape[0] * shape[1] * 2}, got {size}.")
    if in_memory or verify_sha256:
        data = np.fromfile(i16_path, dtype="<i2").reshape(shape)
        if verify_sha256 and hashlib.sha256(data.tobytes()).hexdigest() != meta["sha256"]:
            raise CropError(f"Checksum mismatch for {i16_path.name}; rebuild the crop.")
    else:
        data = np.memmap(i16_path, dtype="<i2", mode="r", shape=shape)
    return CylindricalGrid(
        "+".join(meta["source_tiles"]),
        meta["lat_max_deg"],
        meta["lon_west_deg360"],
        meta["ppd"],
        shape[0],
        shape[1],
        data=data,
        to_m=meta["scaling_m"],
    )
