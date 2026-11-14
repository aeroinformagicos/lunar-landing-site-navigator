# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Horizon cube: map mesh, priority plan, chunk encoding, atomic files and cost measurement.

docs/spec/08_mapa_polar.md §1-§4 and docs/spec/09_contrato_datos.md §10. The cube holds the
720-azimuth horizon of every point of the south pole mesh (500 m cells), in chunks of 16 x 16
cells. The engine is ``pipeline.horizon.engine_torch``; this module does not import PyTorch at
import time, so the mesh, the plan and the encoding work without it.
"""

from __future__ import annotations

import gzip
import io
import json
import math
import os
import struct
import time
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from pipeline.common.constants import R_MOON_M
from pipeline.dem.stack import polar_xy_m
from pipeline.horizon.law import N_AZ, law_n_samples, law_params

# --- Mesh (08 §1.2, decision D-13; the same values go to map/grid.json, 09 §8.1) ---
CELL_M = 500.0
NX = 752
NY = 672
X_MIN_M = -200_000.0
Y_MAX_M = 184_000.0
CHUNK = 16  # cells per chunk side
N_CHUNK_COLS = 47
N_CHUNK_ROWS = 42
CHUNKS_TOTAL = N_CHUNK_ROWS * N_CHUNK_COLS  # 1974
POINTS_PER_CHUNK = CHUNK * CHUNK  # 256
POINTS_TOTAL = NX * NY  # 505 344

# --- Chunk file (09 §10.2) ---
CUBE_MAGIC = b"LLSNCUB1"
CONTRACT_MAJOR = 1
CONTRACT_MINOR = 0
LAW_IDS = {"full": 1, "fast": 2}
EL_SCALE_DEG = 0.01
EL_Q_MAX = 32767
DIST_CODE_BASE_M = 20.0
DIST_CODE_RATIO = 1.04
HEIGHT_NODATA = -32768  # height_m of a point that was not computed
HEADER = struct.Struct("<8s8HfI")  # 32 bytes
CHUNK_BYTES = HEADER.size + 2 * POINTS_PER_CHUNK + 3 * POINTS_PER_CHUNK * N_AZ  # 553 504
GZIP_LEVEL = 6
DEFAULT_OBSERVER_HEIGHT_M = 2.0

# --- Priority plan (08 §2) ---
REGION_MARGIN_M = 2000.0  # level 1: chunks that cut a region box enlarged by 2 km
LEVEL2_LAT_DEG = -88.0
LEVEL3_LAT_DEG = -85.0
# Candidate regions: id, latitude, longitude (degrees) and side (km), from 04_catalogo_sitios.md §3.
# The boxes are squares centred on the published point and aligned with the map axes (D-28).
# Temporary copy (decision D-52): T-09 creates contract/sites.catalog.json, the single source.
REGIONS = (
    ("de-gerlache-rim-2", -88.2, -64.6, 11.0),
    ("haworth", -86.8, -22.8, 17.0),
    ("malapert-massif", -86.0, -0.2, 12.0),
    ("mons-mouton", -85.4, 31.7, 9.0),
    ("mons-mouton-plateau", -84.3, 30.6, 38.0),
    ("nobile-rim-1", -85.4, 37.3, 11.0),
    ("nobile-rim-2", -84.0, 58.8, 11.0),
    ("peak-near-cabeus-b", -83.6, -68.7, 11.0),
    ("slater-plain", -87.2, 125.5, 11.0),
)

# --- Cost measurement (08 §4): the four fixed chunks, as (row, col) ---
BENCH_CHUNKS = ((23, 25), (4, 36), (14, 2), (41, 0))
BENCH_LAWS = ("full", "fast")
# Block sizes compared by the measurement (samples per block; the result does not depend on it).
BENCH_SWEEP_RINGS = (128, 64, 32, 16)
BENCH_SWEEP_POINTS = 64  # points of the first chunk used by that comparison, law `fast`

REPO_ROOT = Path(__file__).resolve().parents[2]


# ---------------------------------------------------------------------------------------------
# Mesh
# ---------------------------------------------------------------------------------------------


def cell_centre_xy(i, j):
    """Map coordinates (metres) of the centre of cell (i, j): i to the right, j downwards."""
    x = X_MIN_M + (np.asarray(i, dtype=np.float64) + 0.5) * CELL_M
    y = Y_MAX_M - (np.asarray(j, dtype=np.float64) + 0.5) * CELL_M
    return x, y


def cell_of_xy(x_m, y_m):
    """Cell (i, j) that contains a map point. It may fall outside [0, NX) x [0, NY)."""
    i = np.floor((np.asarray(x_m, dtype=np.float64) - X_MIN_M) / CELL_M).astype(np.int64)
    j = np.floor((Y_MAX_M - np.asarray(y_m, dtype=np.float64)) / CELL_M).astype(np.int64)
    return i, j


def chunk_of_cell(i, j):
    """(chunk_row, chunk_col, p) of cell (i, j); ``p = 16·r + c`` is the index inside the chunk."""
    i = np.asarray(i, dtype=np.int64)
    j = np.asarray(j, dtype=np.int64)
    return j // CHUNK, i // CHUNK, CHUNK * (j % CHUNK) + (i % CHUNK)


def check_chunk(row: int, col: int) -> None:
    if not (0 <= row < N_CHUNK_ROWS and 0 <= col < N_CHUNK_COLS):
        raise ValueError(f"Chunk ({row}, {col}) outside {N_CHUNK_ROWS} rows x {N_CHUNK_COLS} columns")


def chunk_cells(row: int, col: int) -> tuple[np.ndarray, np.ndarray]:
    """Cells (i, j) of the 256 points of a chunk, in the order of the file (p = 16·r + c)."""
    check_chunk(row, col)
    p = np.arange(POINTS_PER_CHUNK)
    return col * CHUNK + p % CHUNK, row * CHUNK + p // CHUNK


@dataclass
class Frames:
    """Unit vector and local basis of some mesh points (08 §1.2), in MOON_ME, float64."""

    u0: np.ndarray  # [P, 3], towards the point
    east: np.ndarray  # [P, 3]
    north: np.ndarray  # [P, 3]
    lat_deg: np.ndarray  # [P]
    lon_deg: np.ndarray  # [P], (-180, 180]


def frames_of_xy(x_m, y_m) -> Frames:
    """From map coordinates to direction and local basis, without inverse trigonometry (08 §1.2).

    Not defined at the exact pole (ρ = 0): no cell has its centre there.
    """
    x = np.atleast_1d(np.asarray(x_m, dtype=np.float64))
    y = np.atleast_1d(np.asarray(y_m, dtype=np.float64))
    rho = np.hypot(x, y)
    c = 2.0 * np.arctan(rho / (2.0 * R_MOON_M))  # colatitude from the south pole
    sin_c, cos_c = np.sin(c), np.cos(c)
    xr, yr = x / rho, y / rho
    zero = np.zeros_like(rho)
    lon = np.degrees(np.arctan2(x, y))
    return Frames(
        u0=np.stack([sin_c * yr, sin_c * xr, -cos_c], axis=-1),
        east=np.stack([-xr, yr, zero], axis=-1),
        north=np.stack([cos_c * yr, cos_c * xr, sin_c], axis=-1),
        lat_deg=-90.0 + np.degrees(c),
        lon_deg=np.where(lon <= -180.0, 180.0, lon),
    )


def chunk_frames(row: int, col: int) -> Frames:
    """Frames of the 256 points of a chunk, in the order of the file."""
    return frames_of_xy(*cell_centre_xy(*chunk_cells(row, col)))


# ---------------------------------------------------------------------------------------------
# Priority plan
# ---------------------------------------------------------------------------------------------


def region_boxes() -> dict[str, tuple[float, float, float, float]]:
    """``box_m = (x0, y0, x1, y1)`` of each candidate region, in map metres, with every decimal."""
    boxes = {}
    for region_id, lat, lon, size_km in REGIONS:
        x, y = polar_xy_m(lat, lon)
        half = size_km * 500.0
        boxes[region_id] = (x - half, y - half, x + half, y + half)
    return boxes


def _rho_of_lat(lat_deg: float) -> float:
    """Map radius (metres) of a parallel."""
    return 2.0 * R_MOON_M * math.tan(math.radians(90.0 + lat_deg) / 2.0)


@dataclass(frozen=True)
class PlanEntry:
    index: int  # position in the ordered list (the one ``--shard k/n`` uses)
    row: int
    col: int
    level: int  # 1 … 4


def build_plan() -> list[PlanEntry]:
    """The 1974 chunks ordered by priority (08 §2).

    Level 1: chunks that cut a region box enlarged by 2 km. Level 2: some cell centre at
    latitude <= -88°. Level 3: some cell centre at latitude <= -85°. Level 4: the rest.
    Inside a level, by increasing distance from the chunk centre to the pole.
    """
    boxes = list(region_boxes().values())
    rho2, rho3 = _rho_of_lat(LEVEL2_LAT_DEG), _rho_of_lat(LEVEL3_LAT_DEG)
    side = CHUNK * CELL_M
    rows = []
    for row in range(N_CHUNK_ROWS):
        for col in range(N_CHUNK_COLS):
            x0 = X_MIN_M + col * side
            y1 = Y_MAX_M - row * side
            x1, y0 = x0 + side, y1 - side
            cuts_region = any(
                x0 < bx1 + REGION_MARGIN_M
                and x1 > bx0 - REGION_MARGIN_M
                and y0 < by1 + REGION_MARGIN_M
                and y1 > by0 - REGION_MARGIN_M
                for bx0, by0, bx1, by1 in boxes
            )
            min_rho = float(np.hypot(*cell_centre_xy(*chunk_cells(row, col))).min())
            if cuts_region:
                level = 1
            elif min_rho <= rho2:
                level = 2
            elif min_rho <= rho3:
                level = 3
            else:
                level = 4
            rows.append((level, math.hypot((x0 + x1) / 2.0, (y0 + y1) / 2.0), row, col))
    rows.sort()
    return [PlanEntry(k, row, col, level) for k, (level, _, row, col) in enumerate(rows)]


def plan_levels(plan: Sequence[PlanEntry]) -> list[dict]:
    """Chunks and points of each level."""
    out = []
    for level in (1, 2, 3, 4):
        n = sum(1 for e in plan if e.level == level)
        out.append({"level": level, "chunks": n, "points": n * POINTS_PER_CHUNK})
    return out


def write_plan(path: str | Path) -> list[PlanEntry]:
    """Write ``plan.json`` (internal file, not part of the contract) and return the plan."""
    plan = build_plan()
    doc = {
        "grid": {
            "cell_m": CELL_M,
            "nx": NX,
            "ny": NY,
            "x_min_m": X_MIN_M,
            "y_max_m": Y_MAX_M,
            "chunk": CHUNK,
        },
        "region_margin_m": REGION_MARGIN_M,
        "chunks_total": len(plan),
        "levels": plan_levels(plan),
        "chunks": [{"index": e.index, "row": e.row, "col": e.col, "level": e.level} for e in plan],
    }
    _write_atomic(Path(path), json.dumps(doc, separators=(",", ":")).encode("ascii"))
    return plan


# ---------------------------------------------------------------------------------------------
# Encoding (09 §10.2)
# ---------------------------------------------------------------------------------------------


def quantize_el(el_deg) -> np.ndarray:
    """``q = clamp(round(el_deg / 0.01), -32767, 32767)`` as int16."""
    q = np.rint(np.asarray(el_deg, dtype=np.float64) / EL_SCALE_DEG)
    return np.clip(q, -EL_Q_MAX, EL_Q_MAX).astype(np.int16)


def el_delta_of_q(q) -> np.ndarray:
    """Differences along the azimuth (last axis) with int16 arithmetic, which wraps around."""
    q = np.asarray(q, dtype=np.int16)
    delta = q.copy()
    delta[..., 1:] = q[..., 1:] - q[..., :-1]
    return delta


def q_of_el_delta(delta) -> np.ndarray:
    """Inverse of :func:`el_delta_of_q`: cumulative sum in int16 (``Int16Array`` in the web)."""
    return np.cumsum(np.asarray(delta, dtype=np.int16), axis=-1, dtype=np.int16)


def dist_code_of_m(dist_m) -> np.ndarray:
    """``code = clamp(round(ln(dist_m / 20) / ln 1.04), 0, 255)`` as uint8."""
    d = np.maximum(np.asarray(dist_m, dtype=np.float64), 1e-9)
    code = np.rint(np.log(d / DIST_CODE_BASE_M) / math.log(DIST_CODE_RATIO))
    return np.clip(code, 0, 255).astype(np.uint8)


def dist_m_of_code(code) -> np.ndarray:
    return DIST_CODE_BASE_M * DIST_CODE_RATIO ** np.asarray(code, dtype=np.float64)


def _observer_cm(observer_height_m: float) -> int:
    cm = round(observer_height_m * 100.0)
    if not 0 <= cm <= 65535:
        raise ValueError(f"Observer height {observer_height_m} m does not fit the chunk header")
    return cm


def encode_chunk(
    row: int,
    col: int,
    law: str,
    height_m,
    el_deg,
    dist_m,
    computed=None,
    observer_height_m: float = DEFAULT_OBSERVER_HEIGHT_M,
) -> bytes:
    """Uncompressed bytes of a chunk (553 504 B).

    ``height_m`` [256], ``el_deg`` and ``dist_m`` [256, 720]; ``computed`` [256] marks the points
    that hold a result (default: all). A point that is not computed gets -32768 and zeros.
    """
    check_chunk(row, col)
    height_m = np.asarray(height_m, dtype=np.float64).reshape(POINTS_PER_CHUNK)
    el_deg = np.asarray(el_deg, dtype=np.float64).reshape(POINTS_PER_CHUNK, N_AZ)
    dist_m = np.asarray(dist_m, dtype=np.float64).reshape(POINTS_PER_CHUNK, N_AZ)
    if computed is None:
        computed = np.ones(POINTS_PER_CHUNK, dtype=bool)
    computed = np.asarray(computed, dtype=bool).reshape(POINTS_PER_CHUNK)
    if not (np.isfinite(height_m[computed]).all() and np.isfinite(el_deg[computed]).all()):
        raise ValueError(f"Chunk ({row}, {col}): non-finite value in a computed point")

    height = np.full(POINTS_PER_CHUNK, HEIGHT_NODATA, dtype="<i2")
    height[computed] = np.clip(np.rint(height_m[computed]), -EL_Q_MAX, EL_Q_MAX)
    q = np.zeros((POINTS_PER_CHUNK, N_AZ), dtype=np.int16)
    q[computed] = quantize_el(el_deg[computed])
    code = np.zeros((POINTS_PER_CHUNK, N_AZ), dtype=np.uint8)
    code[computed] = dist_code_of_m(dist_m[computed])
    header = HEADER.pack(
        CUBE_MAGIC,
        CONTRACT_MAJOR,
        CONTRACT_MINOR,
        row,
        col,
        CHUNK,
        N_AZ,
        LAW_IDS[law_params(law).name],
        _observer_cm(observer_height_m),
        EL_SCALE_DEG,
        int(computed.sum()),
    )
    data = header + height.tobytes() + el_delta_of_q(q).astype("<i2").tobytes() + code.tobytes()
    assert len(data) == CHUNK_BYTES
    return data


@dataclass
class DecodedChunk:
    row: int
    col: int
    law: str
    observer_height_m: float
    n_computed: int
    computed: np.ndarray  # bool [256]
    height_m: np.ndarray  # int16 [256]; -32768 where not computed
    el_deg: np.ndarray  # float64 [256, 720]
    dist_m: np.ndarray  # float64 [256, 720]
    el_q: np.ndarray  # int16 [256, 720]
    dist_code: np.ndarray  # uint8 [256, 720]


def decode_chunk(data: bytes) -> DecodedChunk:
    """Read the uncompressed bytes of a chunk. Raises ValueError if they do not follow 09 §10.2."""
    if len(data) != CHUNK_BYTES:
        raise ValueError(f"Chunk of {len(data)} B, expected {CHUNK_BYTES}")
    magic, major, _minor, row, col, n_side, n_az, law_id, obs_cm, el_scale, n_computed = HEADER.unpack_from(
        data
    )
    laws = {v: k for k, v in LAW_IDS.items()}
    if (
        magic != CUBE_MAGIC
        or major != CONTRACT_MAJOR
        or n_side != CHUNK
        or n_az != N_AZ
        or law_id not in laws
        or abs(el_scale - EL_SCALE_DEG) > 1e-6
        or row >= N_CHUNK_ROWS
        or col >= N_CHUNK_COLS
    ):
        raise ValueError("Chunk header does not follow the contract")
    o = HEADER.size
    height = np.frombuffer(data, dtype="<i2", count=POINTS_PER_CHUNK, offset=o)
    o += 2 * POINTS_PER_CHUNK
    delta = np.frombuffer(data, dtype="<i2", count=POINTS_PER_CHUNK * N_AZ, offset=o)
    o += 2 * POINTS_PER_CHUNK * N_AZ
    code = np.frombuffer(data, dtype=np.uint8, count=POINTS_PER_CHUNK * N_AZ, offset=o)
    computed = height != HEIGHT_NODATA
    if int(computed.sum()) != n_computed:
        raise ValueError("Chunk header: number of computed points does not match the heights")
    q = q_of_el_delta(delta.reshape(POINTS_PER_CHUNK, N_AZ))
    code = code.reshape(POINTS_PER_CHUNK, N_AZ)
    return DecodedChunk(
        row=row,
        col=col,
        law=laws[law_id],
        observer_height_m=obs_cm / 100.0,
        n_computed=n_computed,
        computed=computed,
        height_m=height,
        el_deg=q * EL_SCALE_DEG,
        dist_m=dist_m_of_code(code),
        el_q=q,
        dist_code=code,
    )


def gzip_bytes(data: bytes) -> bytes:
    """One-member gzip without name or time: the same input always gives the same bytes."""
    buf = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=buf, compresslevel=GZIP_LEVEL, mtime=0) as f:
        f.write(data)
    return buf.getvalue()


# ---------------------------------------------------------------------------------------------
# Files: cube/c_RR_CC.bin.gz, cube/done.bin, cube/cube.json
# ---------------------------------------------------------------------------------------------


def chunk_file_name(row: int, col: int) -> str:
    check_chunk(row, col)
    return f"c_{row:02d}_{col:02d}.bin.gz"


def _write_atomic(path: Path, payload: bytes) -> None:
    """Write ``<name>.tmp`` and rename it: a reader never sees a file half written (08 §2)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    with open(tmp, "wb") as f:
        f.write(payload)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def write_chunk(cube_dir: str | Path, row: int, col: int, data: bytes) -> Path:
    """Compress and write a chunk atomically. ``data`` are the bytes of :func:`encode_chunk`."""
    if len(data) != CHUNK_BYTES:
        raise ValueError(f"Chunk of {len(data)} B, expected {CHUNK_BYTES}")
    path = Path(cube_dir) / chunk_file_name(row, col)
    _write_atomic(path, gzip_bytes(data))
    return path


def read_chunk(cube_dir: str | Path, row: int, col: int) -> DecodedChunk:
    with gzip.open(Path(cube_dir) / chunk_file_name(row, col), "rb") as f:
        return decode_chunk(f.read())


def chunk_is_valid(
    cube_dir: str | Path,
    row: int,
    col: int,
    law: str,
    observer_height_m: float = DEFAULT_OBSERVER_HEIGHT_M,
) -> bool:
    """True if the file exists, follows the contract and was computed with this law and observer."""
    try:
        chunk = read_chunk(cube_dir, row, col)
    except (OSError, EOFError, ValueError):
        return False
    return (
        chunk.row == row
        and chunk.col == col
        and chunk.law == law
        and round(chunk.observer_height_m * 100) == _observer_cm(observer_height_m)
    )


def contract_version() -> str:
    return (REPO_ROOT / "contract" / "VERSION").read_text(encoding="ascii").strip()


def read_done(cube_dir: str | Path) -> np.ndarray:
    """``done.bin`` as uint8 [42, 47]; zeros if it does not exist yet."""
    path = Path(cube_dir) / "done.bin"
    if not path.is_file():
        return np.zeros((N_CHUNK_ROWS, N_CHUNK_COLS), dtype=np.uint8)
    done = np.fromfile(path, dtype=np.uint8)
    if done.size != CHUNKS_TOTAL:
        raise ValueError(f"{path}: {done.size} B, expected {CHUNKS_TOTAL}")
    return done.reshape(N_CHUNK_ROWS, N_CHUNK_COLS).copy()


def read_cube_json(cube_dir: str | Path) -> dict | None:
    path = Path(cube_dir) / "cube.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None


def write_index(
    cube_dir: str | Path,
    done: np.ndarray,
    law: str,
    dem_stack: Sequence[str],
    observer_height_m: float = DEFAULT_OBSERVER_HEIGHT_M,
) -> dict:
    """Write ``done.bin`` and ``cube.json`` (09 §10.1), both atomically. Returns the JSON document."""
    cube_dir = Path(cube_dir)
    done = (np.asarray(done).reshape(N_CHUNK_ROWS, N_CHUNK_COLS) != 0).astype(np.uint8)
    ho = float(observer_height_m)
    doc = {
        "contract_version": contract_version(),
        "grid": "map/grid.json",
        "law": law_params(law).name,
        "observer_height_m": int(ho) if ho.is_integer() else ho,
        "dem_stack": list(dem_stack),
        "el_scale_deg": EL_SCALE_DEG,
        "dist_code": {"base_m": int(DIST_CODE_BASE_M), "ratio": DIST_CODE_RATIO},
        "chunks_done": int(done.sum()),
        "chunks_total": CHUNKS_TOTAL,
        "done": "cube/done.bin",
    }
    _write_atomic(cube_dir / "done.bin", done.tobytes())
    _write_atomic(cube_dir / "cube.json", (json.dumps(doc, indent=2) + "\n").encode("utf-8"))
    return doc


# ---------------------------------------------------------------------------------------------
# Computing chunks (resumable) and cost measurement
# ---------------------------------------------------------------------------------------------


@dataclass
class RunSummary:
    computed: list[tuple[int, int]]  # chunks computed in this run
    skipped: list[tuple[int, int]]  # chunks that already existed and were valid
    samples: int  # terrain samples of the chunks computed
    seconds: float


def run_chunks(
    stack,
    chunks: Iterable[tuple[int, int]],
    law: str,
    cube_dir: str | Path,
    observer_height_m: float = DEFAULT_OBSERVER_HEIGHT_M,
    pts_batch: int | None = None,
    ring: int | None = None,
    points=None,
    force: bool = False,
    progress: Callable[[str], None] | None = None,
) -> RunSummary:
    """Compute and write the given chunks; an existing valid chunk is skipped (08 §2).

    ``stack`` is a ``engine_torch.TorchStack``. ``points`` limits the points computed in each
    chunk (indices p, default all 256). ``done.bin`` and ``cube.json`` are updated after each
    chunk, so an interrupted run leaves a usable cube.
    """
    from pipeline.horizon import engine_torch

    cube_dir = Path(cube_dir)
    previous = read_cube_json(cube_dir)
    if previous is not None and previous.get("law") != law and not force:
        raise ValueError(
            f"{cube_dir} holds a cube computed with law {previous.get('law')!r}; asked {law!r}. "
            "Use another directory or force=True: one cube never mixes two laws."
        )
    done = read_done(cube_dir) if not force else np.zeros((N_CHUNK_ROWS, N_CHUNK_COLS), dtype=np.uint8)
    kwargs = {}
    if pts_batch is not None:
        kwargs["pts_batch"] = pts_batch
    if ring is not None:
        kwargs["ring"] = ring
    chunks = list(chunks)
    summary = RunSummary([], [], 0, 0.0)
    t_start = time.perf_counter()
    compute_s = 0.0
    for k, (row, col) in enumerate(chunks, 1):
        if not force and chunk_is_valid(cube_dir, row, col, law, observer_height_m):
            done[row, col] = 1
            summary.skipped.append((row, col))
            continue
        t0 = time.perf_counter()
        res = engine_torch.compute_chunk(stack, row, col, law, observer_height_m, points=points, **kwargs)
        data = encode_chunk(
            row, col, law, res.height_m, res.el_deg, res.dist_m, res.computed, observer_height_m
        )
        write_chunk(cube_dir, row, col, data)
        done[row, col] = 1
        write_index(cube_dir, done, law, stack.names, observer_height_m)
        summary.computed.append((row, col))
        summary.samples += res.n_samples
        dt = time.perf_counter() - t0
        compute_s += dt
        if progress is not None:
            # Upper bound: the chunks still to come may already exist and be skipped.
            left_s = compute_s / len(summary.computed) * (len(chunks) - k)
            progress(
                f"[{k}/{len(chunks)}] chunk ({row:02d}, {col:02d}): {int(res.computed.sum())} points "
                f"in {dt:.1f} s; at most {format_duration(left_s)} left"
            )
    write_index(cube_dir, done, law, stack.names, observer_height_m)
    summary.seconds = time.perf_counter() - t_start
    return summary


# ---------------------------------------------------------------------------------------------
# Running the cube by levels and shards (T-25): `make cube LEVELS=… SHARD=k/n LAW=…`
# ---------------------------------------------------------------------------------------------

DEFAULT_LAW = "full"  # decision D-59: the whole cube with the law `full`
ALL_LEVELS = (1, 2, 3, 4)


def cube_dir_of(out_dir: str | Path) -> Path:
    """Where the chunks, ``done.bin`` and ``cube.json`` go: ``<out>/heavy/cube`` (02 §9, 09 §10)."""
    return Path(out_dir) / "heavy" / "cube"


def parse_levels(text: str | None) -> tuple[int, ...]:
    """``"2,3,4"`` -> (2, 3, 4). Empty or None: all four levels. Raises ValueError otherwise."""
    if text is None or not text.strip():
        return ALL_LEVELS
    try:
        levels = {int(part) for part in text.replace(" ", "").split(",") if part}
    except ValueError:
        raise ValueError(f"LEVELS must be a list such as 1 or 2,3,4; got {text!r}") from None
    if not levels or not levels <= set(ALL_LEVELS):
        raise ValueError(f"LEVELS must use the levels 1 to 4; got {text!r}")
    return tuple(sorted(levels))


def parse_shard(text: str | None) -> tuple[int, int]:
    """``"k/n"`` -> (k, n) with 0 <= k < n. Empty or None: (0, 1), the whole list."""
    if text is None or not text.strip():
        return (0, 1)
    try:
        k_text, n_text = text.strip().split("/")
        k, n = int(k_text), int(n_text)
    except ValueError:
        raise ValueError(f"SHARD must be k/n, for example 0/2; got {text!r}") from None
    if n < 1 or not 0 <= k < n:
        raise ValueError(f"SHARD k/n needs 0 <= k < n; got {text!r}")
    return (k, n)


def select_plan(
    plan: Sequence[PlanEntry], levels: Iterable[int] = ALL_LEVELS, shard: tuple[int, int] = (0, 1)
) -> list[PlanEntry]:
    """Entries of the given levels whose index in the whole ordered list satisfies ``index mod n == k``.

    The index is the one of the complete plan (08 §2), not the position among the selected levels,
    so a shard is the same set of chunks whatever levels each machine runs.
    """
    wanted = set(levels)
    k, n = shard
    return [e for e in plan if e.level in wanted and e.index % n == k]


def run_cube(
    stack,
    cube_dir: str | Path,
    law: str = DEFAULT_LAW,
    levels: Iterable[int] = ALL_LEVELS,
    shard: tuple[int, int] = (0, 1),
    plan: Sequence[PlanEntry] | None = None,
    observer_height_m: float = DEFAULT_OBSERVER_HEIGHT_M,
    pts_batch: int | None = None,
    ring: int | None = None,
    points=None,
    progress: Callable[[str], None] | None = None,
) -> RunSummary:
    """Compute the chunks of the plan selected by ``levels`` and ``shard``, in priority order.

    Resumable: a chunk that already exists and is valid is skipped, so the same call after an
    interruption finishes the work and leaves the same bytes as a run without interruption.
    """
    selected = select_plan(build_plan() if plan is None else plan, levels, shard)
    return run_chunks(
        stack,
        [(e.row, e.col) for e in selected],
        law,
        cube_dir,
        observer_height_m=observer_height_m,
        pts_batch=pts_batch,
        ring=ring,
        points=points,
        progress=progress,
    )


def run_bench(
    stack,
    laws: Sequence[str] = BENCH_LAWS,
    observer_height_m: float = DEFAULT_OBSERVER_HEIGHT_M,
    pts_batch: int | None = None,
    ring: int | None = None,
    points=None,
    chunks: Sequence[tuple[int, int]] = BENCH_CHUNKS,
    sweep_rings: Sequence[int] = BENCH_SWEEP_RINGS,
    progress: Callable[[str], None] | None = None,
) -> dict:
    """Measure the cost of the cube with the four fixed chunks (08 §4). Writes nothing.

    The time of a chunk is what the real run pays: computing it, encoding it and compressing
    it. The extrapolation multiplies the measured seconds per sample of each law by the samples
    of each level of the plan. ``sweep_rings``: block sizes compared first on a few points of
    the first chunk, for information (the measurement itself uses ``ring``).
    """
    import torch

    from pipeline.horizon import engine_torch

    kwargs = {}
    if pts_batch is not None:
        kwargs["pts_batch"] = pts_batch
    if ring is not None:
        kwargs["ring"] = ring
    cuda = stack.device.type == "cuda"
    # Warm-up, not timed: the first call pays the start of the device.
    engine_torch.compute_chunk(stack, chunks[0][0], chunks[0][1], "fast", observer_height_m, points=[0, 255])
    if cuda:
        torch.cuda.reset_peak_memory_stats(stack.device)

    sweep = []
    sweep_points = list(range(BENCH_SWEEP_POINTS)) if points is None else points
    for sweep_ring in sweep_rings:
        sweep_kwargs = {**kwargs, "ring": sweep_ring}
        t0 = time.perf_counter()
        res = engine_torch.compute_chunk(
            stack, chunks[0][0], chunks[0][1], "fast", observer_height_m, points=sweep_points, **sweep_kwargs
        )
        if cuda:
            torch.cuda.synchronize(stack.device)
        dt = time.perf_counter() - t0
        if res.n_samples:
            sweep.append({"ring": sweep_ring, "samples_per_s": res.n_samples / dt})
            if progress is not None:
                progress(f"block of {sweep_ring} samples: {res.n_samples / dt:.3e} samples/s")

    levels = plan_levels(build_plan())
    out_laws = {}
    extrapolation = {}
    for law in laws:
        per_chunk = []
        for row, col in chunks:
            t0 = time.perf_counter()
            res = engine_torch.compute_chunk(stack, row, col, law, observer_height_m, points=points, **kwargs)
            if cuda:
                torch.cuda.synchronize(stack.device)
            t1 = time.perf_counter()
            data = encode_chunk(
                row, col, law, res.height_m, res.el_deg, res.dist_m, res.computed, observer_height_m
            )
            packed = gzip_bytes(data)
            t2 = time.perf_counter()
            entry = {
                "row": row,
                "col": col,
                "points": int(res.computed.sum()),
                "samples": res.n_samples,
                "compute_s": t1 - t0,
                "encode_s": t2 - t1,
                "gz_bytes": len(packed),
                "min_el_deg": float(res.el_deg[res.computed].min()) if res.computed.any() else None,
                "max_el_deg": float(res.el_deg[res.computed].max()) if res.computed.any() else None,
            }
            per_chunk.append(entry)
            if progress is not None:
                progress(
                    f"{law} chunk ({row:02d}, {col:02d}): {entry['points']} points, "
                    f"{entry['compute_s']:.2f} s + {entry['encode_s']:.2f} s"
                )
        n_points = sum(e["points"] for e in per_chunk)
        samples = sum(e["samples"] for e in per_chunk)
        compute_s = sum(e["compute_s"] for e in per_chunk)
        seconds = compute_s + sum(e["encode_s"] for e in per_chunk)
        if n_points == 0:
            raise RuntimeError("The benchmark computed no point: the chunks have no terrain")
        s_per_sample = seconds / samples
        out_laws[law] = {
            "samples_per_ray": law_n_samples(law),
            "points": n_points,
            "samples": samples,
            "seconds": seconds,
            "compute_s": compute_s,
            "samples_per_s": samples / seconds,
            "compute_samples_per_s": samples / compute_s,
            "s_per_point": seconds / n_points,
            "gz_bytes_per_chunk": sum(e["gz_bytes"] for e in per_chunk) / len(per_chunk),
            "chunks": per_chunk,
        }
        by_level = {
            f"level_{lv['level']}_s": lv["points"] * N_AZ * law_n_samples(law) * s_per_sample for lv in levels
        }
        by_level["total_s"] = sum(by_level.values())
        extrapolation[law] = by_level
    return {
        "generated_utc": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "device": stack.device.type,
        "device_name": torch.cuda.get_device_name(stack.device) if cuda else "cpu",
        "torch_version": torch.__version__,
        "torch_threads": torch.get_num_threads(),
        "gpu_peak_mem_mb": torch.cuda.max_memory_allocated(stack.device) / 2**20 if cuda else None,
        "observer_height_m": observer_height_m,
        "dem_stack": list(stack.names),
        "pts_batch": pts_batch if pts_batch is not None else engine_torch.DEFAULT_PTS_BATCH,
        "ring": ring if ring is not None else engine_torch.DEFAULT_RING,
        "complete": points is None,
        "ring_sweep": sweep,
        "plan_levels": levels,
        "laws": out_laws,
        "extrapolation": extrapolation,
    }


def format_duration(seconds: float) -> str:
    """``3 h 05 min`` or ``4 min 10 s``."""
    seconds = int(round(seconds))
    if seconds >= 3600:
        return f"{seconds // 3600} h {seconds % 3600 // 60:02d} min"
    return f"{seconds // 60} min {seconds % 60:02d} s"


def bench_summary_lines(bench: dict) -> list[str]:
    """Short text summary of a benchmark, for the standard output."""
    lines = [
        f"device: {bench['device_name']} (torch {bench['torch_version']}, "
        f"{bench['torch_threads']} CPU threads); stack {' + '.join(bench['dem_stack'])}"
    ]
    if bench["gpu_peak_mem_mb"] is not None:
        lines.append(f"GPU memory peak: {bench['gpu_peak_mem_mb']:.0f} MB")
    for law, r in bench["laws"].items():
        lines.append(
            f"law {law}: {r['points']} points, {r['samples'] / 1e9:.3f}e9 samples in {r['seconds']:.1f} s = "
            f"{r['samples_per_s']:.3e} samples/s ({r['compute_samples_per_s']:.3e} without encoding), "
            f"{r['s_per_point'] * 1000:.1f} ms/point, {r['gz_bytes_per_chunk'] / 1024:.0f} kB/chunk"
        )
    for law, ex in bench["extrapolation"].items():
        parts = [
            f"level {lv['level']} ({lv['chunks']} chunks) " + format_duration(ex[f"level_{lv['level']}_s"])
            for lv in bench["plan_levels"]
        ]
        lines.append(
            f"extrapolation {law}: " + "; ".join(parts) + f"; TOTAL {format_duration(ex['total_s'])}"
        )
    if bench["ring_sweep"]:
        best = max(bench["ring_sweep"], key=lambda r: r["samples_per_s"])
        lines.append(
            f"block sizes (law fast, first chunk): fastest ring = {best['ring']} "
            f"({best['samples_per_s']:.3e} samples/s); used ring = {bench['ring']}, "
            f"pts_batch = {bench['pts_batch']}"
        )
    if not bench["complete"]:
        lines.append("PARTIAL RUN (--points): not valid for the decision rule of 08 §4")
    return lines


def write_bench(path: str | Path, bench: dict) -> None:
    _write_atomic(Path(path), (json.dumps(bench, indent=2) + "\n").encode("utf-8"))
