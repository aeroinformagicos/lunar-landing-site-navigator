# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Compact horizon masks for the optimal-site worker (F32): ``compact/regions.bin.gz`` and
``compact/overview.bin.gz``.

docs/spec/09_contrato_datos.md §11 and docs/spec/08_mapa_polar.md §10. Each point keeps 180
azimuths every 2°; the value of bin ``b`` is the maximum of the full 720-azimuth mask of the cube
over the window of ±1° around ``2·b`` degrees, ``el_q[b] = max(q[(4b + m) mod 720], m = −2…2)``.
The horizon is therefore conservative: never lower than the full one at those five azimuths.

- ``regions``: the mesh cells whose centre lies in the box of one of the candidate regions
  (04 §3, D-28); 10 252 points with the catalog boxes. Every one must be in the cube.
- ``overview``: one cell out of 4 in each direction (i, j = 0, 4, 8, …), 188 × 168 = 31 584 points
  with the whole cube; points whose chunk is not computed yet are left out (``n_points`` says how
  many there are).

Points go in mesh order: row ``j`` downwards, then column ``i`` to the right.
"""

from __future__ import annotations

import struct
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from pipeline.horizon import cube
from pipeline.horizon.law import N_AZ

MAGIC = b"LLSNCMP1"
HEADER = struct.Struct("<8s2HIHHfH6x")  # 32 bytes (09 §11)
N_AZ_COMPACT = 180  # 09 §11
STEP_CDEG = 200  # azimuth step in hundredths of a degree (09 §11)
WINDOW = 2  # full-mask azimuths on each side of 4·b: 2 × 0.5° = ±1° (09 §11)
AZ_RATIO = N_AZ // N_AZ_COMPACT  # 4 full azimuths per compact bin
OVERVIEW_STEP = 4  # one point out of 4 in each direction (09 §11)
REGION_NONE = 255  # point outside every region (09 §11)
BYTES_PER_POINT = 8 + 2 * N_AZ_COMPACT  # 368
SOURCES = ("regions", "overview")


def compact_bytes_of(n_points: int) -> int:
    """Uncompressed size of a file of ``n_points`` points: ``32 + 368·n`` (09 §11)."""
    return HEADER.size + BYTES_PER_POINT * n_points


def file_name(source: str) -> str:
    if source not in SOURCES:
        raise ValueError(f"Unknown compact source {source!r}; expected one of {SOURCES}")
    return f"{source}.bin.gz"


def compact_dir_of(out_dir: str | Path) -> Path:
    """``<out>/heavy/compact`` (02 §9, 09 §11)."""
    return Path(out_dir) / "heavy" / "compact"


# ---------------------------------------------------------------------------------------------
# Compaction of a full mask
# ---------------------------------------------------------------------------------------------


def compact_q(q) -> np.ndarray:
    """``int16 [..., 720] -> int16 [..., 180]``: maximum over ``(4b + m) mod 720``, ``m = −2…2``."""
    q = np.asarray(q, dtype=np.int16)
    if q.shape[-1] != N_AZ:
        raise ValueError(f"Full mask with {q.shape[-1]} azimuths, expected {N_AZ}")
    centres = AZ_RATIO * np.arange(N_AZ_COMPACT)
    idx = (centres[:, None] + np.arange(-WINDOW, WINDOW + 1)[None, :]) % N_AZ  # [180, 5]
    return q[..., idx].max(axis=-1)


# ---------------------------------------------------------------------------------------------
# Point sets
# ---------------------------------------------------------------------------------------------


@dataclass
class PointSet:
    i: np.ndarray  # int64 [n], mesh column
    j: np.ndarray  # int64 [n], mesh row
    region: np.ndarray  # uint8 [n], index in map/regions.json or 255


def region_index_grid(boxes: Mapping[str, tuple[float, float, float, float]]) -> np.ndarray:
    """uint8 [NY, NX]: index (order of ``boxes``, that of map/regions.json) of the region whose box
    holds the cell centre, edges included; 255 outside every box. Raises if two boxes share a cell."""
    if len(boxes) >= REGION_NONE:
        raise ValueError(f"{len(boxes)} regions do not fit a uint8 index")
    jj, ii = np.meshgrid(np.arange(cube.NY), np.arange(cube.NX), indexing="ij")
    x, y = cube.cell_centre_xy(ii, jj)
    grid = np.full((cube.NY, cube.NX), REGION_NONE, dtype=np.uint8)
    for k, (region_id, (x0, y0, x1, y1)) in enumerate(boxes.items()):
        inside = (x >= x0) & (x <= x1) & (y >= y0) & (y <= y1)
        if (grid[inside] != REGION_NONE).any():
            raise ValueError(f"Region {region_id} overlaps another region box")
        grid[inside] = k
    return grid


def region_points(boxes: Mapping[str, tuple[float, float, float, float]] | None = None) -> PointSet:
    """Cells of the candidate region boxes (default: the catalog), in mesh order."""
    grid = region_index_grid(cube.region_boxes() if boxes is None else boxes)
    j, i = np.nonzero(grid != REGION_NONE)  # row-major: j, then i
    return PointSet(i=i.astype(np.int64), j=j.astype(np.int64), region=grid[j, i])


def overview_points(boxes: Mapping[str, tuple[float, float, float, float]] | None = None) -> PointSet:
    """One cell out of 4 in each direction (188 × 168), in mesh order, with their region index."""
    grid = region_index_grid(cube.region_boxes() if boxes is None else boxes)
    jj, ii = np.meshgrid(
        np.arange(0, cube.NY, OVERVIEW_STEP), np.arange(0, cube.NX, OVERVIEW_STEP), indexing="ij"
    )
    i, j = ii.ravel().astype(np.int64), jj.ravel().astype(np.int64)
    return PointSet(i=i, j=j, region=grid[j, i])


# ---------------------------------------------------------------------------------------------
# Building the file
# ---------------------------------------------------------------------------------------------


class MissingPoints(ValueError):
    """Some points of a set that must be complete are not in the cube."""


@dataclass
class CompactResult:
    data: bytes  # uncompressed bytes of the file
    n_points: int
    n_missing: int  # points of the set left out (not in the cube)
    law: str | None
    chunks_read: int


def _contract_major_minor() -> tuple[int, int]:
    major, minor, *_ = (int(v) for v in cube.contract_version().split("."))
    return major, minor


def encode_compact(
    i, j, height_m, region, el_q, law: str, version: tuple[int, int] | None = None
) -> bytes:
    """Uncompressed bytes of a compact file (09 §11). ``el_q`` is int16 [n, 180]."""
    i = np.asarray(i, dtype="<u2")
    n = i.size
    el_q = np.asarray(el_q, dtype="<i2").reshape(n, N_AZ_COMPACT)
    major, minor = _contract_major_minor() if version is None else version
    header = HEADER.pack(
        MAGIC, major, minor, n, N_AZ_COMPACT, STEP_CDEG, cube.EL_SCALE_DEG, cube.LAW_IDS[law]
    )
    data = (
        header
        + i.tobytes()
        + np.asarray(j, dtype="<u2").tobytes()
        + np.asarray(height_m, dtype="<i2").tobytes()
        + np.asarray(region, dtype=np.uint8).tobytes()
        + bytes(n)
        + el_q.tobytes()
    )
    assert len(data) == compact_bytes_of(n)
    return data


def build_compact(
    points: PointSet,
    read_chunk: Callable[[int, int], cube.DecodedChunk | None],
    require_all: bool = True,
) -> CompactResult:
    """Compact masks of ``points`` from the cube chunks returned by ``read_chunk(row, col)``.

    ``read_chunk`` returns None for a chunk that is not computed. With ``require_all`` a missing
    point raises :class:`MissingPoints`; otherwise it is left out. Every chunk read must have been
    computed with the same law, which goes to the header.
    """
    rows, cols, p = cube.chunk_of_cell(points.i, points.j)
    n = points.i.size
    keep = np.zeros(n, dtype=bool)
    height = np.zeros(n, dtype=np.int16)
    el_q = np.zeros((n, N_AZ_COMPACT), dtype=np.int16)
    laws: set[str] = set()
    chunks_read = 0
    chunk_keys = np.unique(np.stack([rows, cols], axis=1), axis=0)
    for row, col in chunk_keys:
        sel = np.nonzero((rows == row) & (cols == col))[0]
        chunk = read_chunk(int(row), int(col))
        if chunk is None:
            continue
        chunks_read += 1
        laws.add(chunk.law)
        pp = p[sel]
        ok = chunk.computed[pp]
        sel, pp = sel[ok], pp[ok]
        keep[sel] = True
        height[sel] = chunk.height_m[pp]
        el_q[sel] = compact_q(chunk.el_q[pp])
    if len(laws) > 1:
        raise ValueError(f"The cube mixes laws {sorted(laws)}: recompute it with one law")
    n_missing = int(n - keep.sum())
    if require_all and n_missing:
        missing = sorted({(int(r), int(c)) for r, c in zip(rows[~keep], cols[~keep], strict=True)})
        shown = ", ".join(f"c_{r:02d}_{c:02d}" for r, c in missing[:10])
        more = f" and {len(missing) - 10} more" if len(missing) > 10 else ""
        raise MissingPoints(
            f"{n_missing} of {n} points are not in the cube (chunks {shown}{more}): run make cube first"
        )
    law = laws.pop() if laws else None
    data = encode_compact(
        points.i[keep], points.j[keep], height[keep], points.region[keep], el_q[keep],
        law or cube.DEFAULT_LAW,
    )
    return CompactResult(
        data=data, n_points=int(keep.sum()), n_missing=n_missing, law=law, chunks_read=chunks_read
    )


def cube_reader(cube_dir: str | Path) -> Callable[[int, int], cube.DecodedChunk | None]:
    """``read_chunk`` for :func:`build_compact` from ``cube/``: only chunks marked in ``done.bin``."""
    cube_dir = Path(cube_dir)
    done = cube.read_done(cube_dir)

    def read(row: int, col: int) -> cube.DecodedChunk | None:
        if not done[row, col]:
            return None
        return cube.read_chunk(cube_dir, row, col)

    return read


def write_compact(compact_dir: str | Path, source: str, result: CompactResult) -> Path:
    """Compress (gzip of one member, no name or time) and write atomically."""
    path = Path(compact_dir) / file_name(source)
    cube._write_atomic(path, cube.gzip_bytes(result.data))
    return path


def run_compact(
    cube_dir: str | Path, compact_dir: str | Path, source: str, boxes=None
) -> tuple[Path, CompactResult]:
    """Build and write ``compact/<source>.bin.gz``. ``regions`` must be complete; ``overview`` not."""
    file_name(source)  # validates the source
    points = region_points(boxes) if source == "regions" else overview_points(boxes)
    result = build_compact(points, cube_reader(cube_dir), require_all=source == "regions")
    return write_compact(compact_dir, source, result), result
