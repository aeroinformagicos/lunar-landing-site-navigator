# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Visibility layers of the south pole map (08_mapa_polar.md §5 and §9; 09_contrato_datos.md §8.1, §9).

For every mesh point with a horizon in the cube and for every period, the share of hourly steps
with Sun, with Earth and with both, with the **centre of the disc** criterion and the observer at
2 m (``layers/<period>.bin.gz``), plus the validation layer ``mean186_any`` with the «any part of
the disc» criterion of 07 §4.2, one step in three (08 §5.2).

The step loop is written once for two array back ends: NumPy (float64; the reference, and what the
tests run without PyTorch) and PyTorch (float32 on the GPU, or the CPU). Both use only operations
that exist with the same name and meaning in the two libraries; the few that differ go through the
back end object.

Resumable (08 §5.2): the values of each cube chunk are kept in ``<out>/layers/partial/c_RR_CC.npz``
with a key that names the chunk file, the ephemeris table and the parameters; a chunk whose partial
file has the right key is not computed again. Cells whose chunk is not in the cube stay at 255.
"""

from __future__ import annotations

import calendar
import gzip
import hashlib
import io
import json
import math
import os
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from pipeline.common.constants import OBSERVER_HEIGHT_M, R_EARTH_KM, R_MOON_KM, R_SUN_KM, STEP_S
from pipeline.common.timeutil import iso_to_unix, unix_to_iso
from pipeline.ephem.interp import EphemerisTable
from pipeline.ephem.table import RECORD_BYTES
from pipeline.horizon import cube
from pipeline.horizon.law import AZ_STEP_DEG, N_AZ
from pipeline.vis.discs import ANY_COLUMNS, MIN_COS_EL

# --- Periods (08 §5.1, decision D-22) ---
MEAN_ID = "mean186"
MEAN_LABEL = "18.6-year mean"
MEAN_START_UTC = "2026-01-01T00:00:00Z"
MEAN_STEPS = 163_152  # 6798 days of hourly steps
# Index of 2026-01-01T00:00Z in the segment `main` of the table: sample 1 is 2024-01-01T00:00Z and
# there are 731 days to 2026-01-01, so 1 + 731·24 (08 §5.2).
FIRST_STEP_INDEX = 17_545
MONTHS = tuple((y, m) for y in range(2026, 2031) for m in range(1, 13))  # 2026-01 … 2030-12
MONTH_STEPS_TOTAL = 43_824  # 1826 days: the first steps of the same run
MEAN_COL = len(MONTHS)  # column of the 18.6-year mean in the counters; 0…59 are the months
N_COLS = len(MONTHS) + 1
ANY_EVERY = 3  # the «any part» layer takes one step in three (08 §5.2)
SEGMENT_ID = "main"

# --- Encoding (09 §9) ---
PCT_PER_UNIT = 0.4
UNITS_FULL = 250  # 100 % / 0.4
NODATA = 255
BANDS = ("sun", "earth", "both")
ANY_BANDS = ("sun_any", "earth_any")
NY, NX = cube.NY, cube.NX
LAYER_BYTES = len(BANDS) * NY * NX  # 1 516 032
LAYER_ANY_BYTES = len(ANY_BANDS) * NY * NX  # 1 010 688

# --- Work sizes (08 §5.2 gives them as examples) ---
DEFAULT_BATCH_CHUNKS = 64  # 16 384 points
DEFAULT_BLOCK_STEPS = 512

SOURCE_COMPUTED = "computed"
SOURCE_NASA = "nasa_avgvisib"  # plan B-4 (08 §9)
NASA_OBSERVER_HEIGHT_M = 0  # 03 §6: the NASA products give no height; taken as the surface
# Format of the partial files. Change it when the meaning of a partial changes.
PARTIAL_FORMAT = "llsn-layers-partial-1"


# ---------------------------------------------------------------------------------------------
# Periods and steps
# ---------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Period:
    id: str
    label: str
    start_utc: str
    end_utc: str
    n_steps: int
    col: int  # column of the counters

    def doc(self) -> dict:
        return {"id": self.id, "label": self.label, "start_utc": self.start_utc, "end_utc": self.end_utc,
                "n_steps": self.n_steps, "file": f"layers/{self.id}.bin.gz"}


def _month_steps(y: int, m: int) -> int:
    return 24 * calendar.monthrange(y, m)[1]


def periods() -> list[Period]:
    """``mean186`` first, then the 60 months 2026-01 … 2030-12 (09 §9.1)."""
    end = unix_to_iso(iso_to_unix(MEAN_START_UTC) + MEAN_STEPS * STEP_S)[:19] + "Z"  # 2044-08-12T00:00:00Z
    out = [Period(MEAN_ID, MEAN_LABEL, MEAN_START_UTC, end, MEAN_STEPS, MEAN_COL)]
    for col, (y, m) in enumerate(MONTHS):
        ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
        out.append(Period(f"{y}-{m:02d}", f"{calendar.month_abbr[m]} {y}", f"{y}-{m:02d}-01T00:00:00Z",
                          f"{ny}-{nm:02d}-01T00:00:00Z", _month_steps(y, m), col))
    return out


def month_of_step(n_steps: int = MEAN_STEPS) -> np.ndarray:
    """Month index 0…59 of each step of the run, or −1 after 2030-12 (08 §5.2)."""
    months = np.repeat(np.arange(len(MONTHS), dtype=np.int16), [_month_steps(y, m) for y, m in MONTHS])
    out = np.full(n_steps, -1, dtype=np.int16)
    k = min(n_steps, months.size)
    out[:k] = months[:k]
    return out


@dataclass(frozen=True)
class Steps:
    """The hourly steps of the run: body vectors (MOON_ME, km) and the period of each step."""

    sun: np.ndarray  # float64 [K, 3]
    earth: np.ndarray  # float64 [K, 3]
    month: np.ndarray  # int16 [K]: 0…59, or −1
    any_step: np.ndarray  # bool [K]: steps of the «any part» layer

    @property
    def n(self) -> int:
        return int(self.sun.shape[0])


def table_steps(table: EphemerisTable, n_steps: int = MEAN_STEPS) -> Steps:
    """The steps from 2026-01-01T00:00Z, read from the samples of the table.

    They are exact nodes (one per hour): nothing is interpolated (08 §5.2).
    """
    seg = next((s for s in table.segments if s.id == SEGMENT_ID), None)
    if seg is None:
        raise ValueError(f"The ephemeris table has no segment {SEGMENT_ID!r}")
    k0, rest = divmod(int(iso_to_unix(MEAN_START_UTC)) - seg.t0_unix, table.step_s)
    if rest or table.step_s != STEP_S or k0 != FIRST_STEP_INDEX:
        raise ValueError(f"2026-01-01T00:00Z is sample {k0} (+{rest} s) of {SEGMENT_ID}, "
                         f"expected {FIRST_STEP_INDEX}")
    if not 0 < n_steps <= MEAN_STEPS or k0 + n_steps - 1 > seg.n - 2:
        raise ValueError(f"{n_steps} steps from sample {k0} leave the valid part of the table")
    first = seg.byte_offset // RECORD_BYTES + k0
    rows = table.data[first : first + n_steps].astype(np.float64)
    k = np.arange(n_steps)
    return Steps(rows[:, 0:3], rows[:, 3:6], month_of_step(n_steps), k % ANY_EVERY == 0)


def steps_digest(steps: Steps) -> str:
    """Short fingerprint of the vectors and of the number of steps (key of the partial files)."""
    h = hashlib.sha256()
    for a in (steps.sun, steps.earth):
        h.update(np.ascontiguousarray(a, dtype="<f8").tobytes())
    return f"{h.hexdigest()[:16]}x{steps.n}"


def column_weights(steps: Steps) -> np.ndarray:
    """[K, 61] of 0/1: column 60 (the mean) in every step, the month column while there is one."""
    w = np.zeros((steps.n, N_COLS), dtype=np.float64)
    w[:, MEAN_COL] = 1.0
    in_month = steps.month >= 0
    w[np.flatnonzero(in_month), steps.month[in_month]] = 1.0
    return w


def period_steps(steps: Steps) -> np.ndarray:
    """Steps of each counter column in this run (int64 [61])."""
    return column_weights(steps).sum(axis=0).astype(np.int64)


# ---------------------------------------------------------------------------------------------
# Points
# ---------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Points:
    """Observers: position (terrain + observer height) and local basis in MOON_ME, and horizon."""

    pos_km: np.ndarray  # float64 [P, 3]
    east: np.ndarray  # [P, 3]
    north: np.ndarray  # [P, 3]
    up: np.ndarray  # [P, 3]
    el_deg: np.ndarray  # float64 [P, 720]: horizon every 0.5° of azimuth

    @property
    def n(self) -> int:
        return int(self.pos_km.shape[0])


def points_of(frames: cube.Frames, height_m, el_deg, observer_height_m: float = OBSERVER_HEIGHT_M) -> Points:
    """Points from the frames of 08 §1.2, the terrain height (m) and the horizon (deg)."""
    h = np.asarray(height_m, dtype=np.float64)
    r = R_MOON_KM + (h + observer_height_m) / 1000.0
    el = np.asarray(el_deg, dtype=np.float64)
    if el.shape != (h.size, N_AZ):
        raise ValueError(f"Horizons of shape {el.shape}, expected ({h.size}, {N_AZ})")
    return Points(r[:, None] * frames.u0, frames.east, frames.north, frames.u0, el)


def concat_points(parts: Sequence[Points]) -> Points:
    return Points(*(np.concatenate([getattr(p, f) for p in parts]) for f in
                    ("pos_km", "east", "north", "up", "el_deg")))


# ---------------------------------------------------------------------------------------------
# Array back ends
# ---------------------------------------------------------------------------------------------


class NumpyBackend:
    """NumPy, float64: the reference."""

    name = "numpy"

    def __init__(self) -> None:
        self.xp = np
        self.dtype = np.float64

    def array(self, a) -> np.ndarray:
        return np.ascontiguousarray(a, dtype=self.dtype)

    def index(self, a) -> np.ndarray:
        return np.asarray(a, dtype=np.int64)

    def to_index(self, a) -> np.ndarray:
        return a.astype(np.int64)

    def to_float(self, a) -> np.ndarray:
        return a.astype(self.dtype)

    def host(self, a) -> np.ndarray:
        return np.asarray(a)


class TorchBackend:
    """PyTorch on ``device`` (float32 by default: the GPU of the team is slow in float64)."""

    def __init__(self, device, dtype=None) -> None:
        import torch

        self.xp = torch
        self.device = torch.device(device)
        self.dtype = dtype or torch.float32
        self.name = f"torch-{self.device.type}"

    def array(self, a):
        return self.xp.as_tensor(np.asarray(a), dtype=self.dtype, device=self.device)

    def index(self, a):
        return self.xp.as_tensor(np.asarray(a, dtype=np.int64), device=self.device)

    def to_index(self, a):
        return a.to(self.xp.int64)

    def to_float(self, a):
        return a.to(self.dtype)

    def host(self, a) -> np.ndarray:
        return a.detach().cpu().numpy()


def pick_backend(device: str | None = None):
    """PyTorch if installed (GPU if there is one, see ``LLSN_DEVICE``), else NumPy; ``numpy`` forces it."""
    if device == "numpy":
        return NumpyBackend()
    try:
        from pipeline.horizon import engine_torch
    except ImportError:
        if device in ("cuda", "cpu"):
            raise RuntimeError("PyTorch is not installed: run make setup-gpu or use --device numpy") from None
        return NumpyBackend()
    return TorchBackend(engine_torch.pick_device(device))


# ---------------------------------------------------------------------------------------------
# The step loop (08 §5.2)
# ---------------------------------------------------------------------------------------------


def _horizon(bk, m_flat, row_off, az_deg):
    """Periodic linear interpolation of each point's mask at ``az_deg`` [P, B] (07 §2)."""
    xp = bk.xp
    x = xp.remainder(az_deg, 360.0) / AZ_STEP_DEG
    j = xp.floor(x)
    f = x - j
    j0 = bk.to_index(j) % N_AZ  # % again: remainder() may round up to exactly 360
    j1 = (j0 + 1) % N_AZ
    return (1 - f) * m_flat[row_off + j0] + f * m_flat[row_off + j1]


@dataclass
class Counts:
    """Steps that pass each test, per point: centre criterion [3, P, 61] and «any part» [2, P]."""

    centre: np.ndarray  # int64 [3, P, 61]: sun, earth, both
    any: np.ndarray  # int64 [2, P]: sun_any, earth_any
    n_any: int  # steps of the «any part» layer


def count_visibility(
    points: Points, steps: Steps, bk=None, block_steps: int = DEFAULT_BLOCK_STEPS
) -> Counts:
    """Count, for each point, the steps in which each body is visible (08 §5.2).

    Centre criterion: elevation of the centre of the disc > horizon in its azimuth (strict, 07 §3).
    «Any part» (07 §4.2, five columns) only in the steps marked ``any_step``.
    """
    bk = bk or NumpyBackend()
    xp = bk.xp
    p = points.n
    m_flat = bk.array(points.el_deg.reshape(-1))
    row_off = bk.index(np.arange(p, dtype=np.int64) * N_AZ)[:, None]
    basis = [bk.array(b) for b in (points.east, points.north, points.up)]
    offsets = [bk.array(np.einsum("ij,ij->i", points.pos_km, b))[:, None]
               for b in (points.east, points.north, points.up)]
    weights = column_weights(steps)
    acc = [bk.array(np.zeros((p, N_COLS))) for _ in BANDS]
    acc_any = [bk.array(np.zeros(p)) for _ in ANY_BANDS]
    radii = (R_SUN_KM, R_EARTH_KM)
    cols = [(q, math.sqrt(1.0 - q * q)) for q in ANY_COLUMNS]
    for b0 in range(0, steps.n, block_steps):
        b1 = min(b0 + block_steps, steps.n)
        w = bk.array(weights[b0:b1])
        sel = np.flatnonzero(steps.any_step[b0:b1])
        sel_bk = bk.index(sel) if sel.size else None
        vis = []
        for body, (vectors, radius) in enumerate(zip((steps.sun, steps.earth), radii, strict=True)):
            v = bk.array(vectors[b0:b1]).T  # [3, B]
            e, n, u = ((b @ v) - o for b, o in zip(basis, offsets, strict=True))  # [P, B]
            horiz = xp.sqrt(e * e + n * n)
            az = xp.rad2deg(xp.atan2(e, n))
            el = xp.rad2deg(xp.atan2(u, horiz))
            ok = el > _horizon(bk, m_flat, row_off, az)
            vis.append(ok)
            acc[body] += bk.to_float(ok) @ w
            if sel_bk is None:
                continue
            e, n, u, az, el = (a[:, sel_bk] for a in (e, n, u, az, el))
            rho = xp.rad2deg(xp.asin(radius / xp.sqrt(e * e + n * n + u * u)))
            cos_el = xp.clip(xp.cos(xp.deg2rad(el)), MIN_COS_EL, None)
            seen = None
            for q, half_chord in cols:
                c = (el + rho * half_chord) > _horizon(bk, m_flat, row_off, az + (q * rho) / cos_el)
                seen = c if seen is None else (seen | c)
            acc_any[body] += bk.to_float(seen).sum(1)
        acc[2] += bk.to_float(vis[0] & vis[1]) @ w
    centre = np.stack([np.rint(bk.host(a)).astype(np.int64) for a in acc])
    any_counts = np.stack([np.rint(bk.host(a)).astype(np.int64) for a in acc_any])
    return Counts(centre, any_counts, int(steps.any_step.sum()))


def units_of_counts(counts: np.ndarray, n_steps) -> np.ndarray:
    """``v = round(pct / 0.4)`` with ``pct = 100 · count / n`` (09 §9.2), as uint8.

    In integers, so that a value exactly halfway rounds up the same on every machine:
    ``v = floor(250·count/n + 1/2) = (500·count + n) // (2n)`` (decision D-98).
    A period without steps in this run (a shortened run of the tests) gives 255.
    """
    c = np.asarray(counts, dtype=np.int64)
    n = np.asarray(n_steps, dtype=np.int64)
    safe = np.maximum(n, 1)
    return np.where(n > 0, (2 * UNITS_FULL * c + safe) // (2 * safe), NODATA).astype(np.uint8)


def layer_units(counts: Counts, steps: Steps) -> tuple[np.ndarray, np.ndarray]:
    """(uint8 [61, 3, P] by counter column, uint8 [2, P]) of a run of :func:`count_visibility`."""
    per_col = period_steps(steps)  # [61]
    v = units_of_counts(counts.centre, per_col[None, None, :])  # [3, P, 61]
    v_any = units_of_counts(counts.any, counts.n_any)
    return np.ascontiguousarray(v.transpose(2, 0, 1)), v_any


# ---------------------------------------------------------------------------------------------
# Chunks, partial files and the whole run
# ---------------------------------------------------------------------------------------------


def layers_dir_of(heavy_dir: str | Path) -> Path:
    return Path(heavy_dir) / "layers"


def partial_dir_of(out_dir: str | Path) -> Path:
    """``<out>/layers/partial`` (08 §5.2): outside ``heavy``, so it is never published."""
    return Path(out_dir) / "layers" / "partial"


def write_atomic(path: Path, payload: bytes) -> None:
    """``<name>.tmp`` and rename: a reader never sees a file half written."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    with open(tmp, "wb") as f:
        f.write(payload)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def write_if_changed(path: Path, payload: bytes) -> bool:
    if path.is_file() and path.read_bytes() == payload:
        return False
    write_atomic(path, payload)
    return True


def partial_key(chunk_sha: str, steps_key: str, observer_height_m: float) -> str:
    return f"{PARTIAL_FORMAT}|chunk {chunk_sha}|steps {steps_key}|h {observer_height_m:g}"


def partial_path(partial_dir: Path, row: int, col: int) -> Path:
    return Path(partial_dir) / f"c_{row:02d}_{col:02d}.npz"


def write_partial(
    path: Path, key: str, values: np.ndarray, values_any: np.ndarray, computed: np.ndarray
) -> None:
    buf = io.BytesIO()
    np.savez(buf, key=np.array(key), values=values, values_any=values_any, computed=computed)
    write_atomic(path, buf.getvalue())


def read_partial(path: Path, key: str) -> tuple[np.ndarray, np.ndarray, np.ndarray] | None:
    """(values [61, 3, 256], values_any [2, 256], computed [256]) if the file exists with this key."""
    try:
        with np.load(path, allow_pickle=False) as z:
            if str(z["key"]) != key:
                return None
            values, values_any, computed = z["values"], z["values_any"], z["computed"]
    except (OSError, ValueError, KeyError, EOFError):
        return None
    if (values.shape != (N_COLS, len(BANDS), cube.POINTS_PER_CHUNK)
            or values_any.shape != (len(ANY_BANDS), cube.POINTS_PER_CHUNK)
            or computed.shape != (cube.POINTS_PER_CHUNK,)):
        return None
    return values, values_any, computed.astype(bool)


def chunk_points(chunk: cube.DecodedChunk, observer_height_m: float = OBSERVER_HEIGHT_M) -> Points:
    """The computed points of a decoded chunk, in file order."""
    frames = cube.chunk_frames(chunk.row, chunk.col)
    keep = chunk.computed
    sub = cube.Frames(*(getattr(frames, f)[keep] for f in ("u0", "east", "north", "lat_deg", "lon_deg")))
    return points_of(sub, chunk.height_m[keep], chunk.el_deg[keep], observer_height_m)


def chunk_units(
    chunks: Sequence[cube.DecodedChunk], steps: Steps, bk=None, block_steps: int = DEFAULT_BLOCK_STEPS,
    observer_height_m: float = OBSERVER_HEIGHT_M,
) -> list[tuple[np.ndarray, np.ndarray]]:
    """Per chunk: (values [61, 3, 256], values_any [2, 256]); 255 at the points not computed."""
    parts = [chunk_points(c, observer_height_m) for c in chunks]
    total = sum(p.n for p in parts)
    if total:
        v, v_any = layer_units(count_visibility(concat_points(parts), steps, bk, block_steps), steps)
    out = []
    start = 0
    for c, p in zip(chunks, parts, strict=True):
        values = np.full((N_COLS, len(BANDS), cube.POINTS_PER_CHUNK), NODATA, dtype=np.uint8)
        values_any = np.full((len(ANY_BANDS), cube.POINTS_PER_CHUNK), NODATA, dtype=np.uint8)
        if p.n:
            values[:, :, c.computed] = v[:, :, start : start + p.n]
            values_any[:, c.computed] = v_any[:, start : start + p.n]
        start += p.n
        out.append((values, values_any))
    return out


@dataclass
class LayersSummary:
    chunks_in_cube: int
    computed: list[tuple[int, int]]  # chunks computed in this run
    skipped: list[tuple[int, int]]  # chunks whose partial file was already valid
    bad: list[tuple[int, int]]  # chunks marked done whose file could not be read
    computed_points: int
    seconds: float
    files: list[Path]


def _chunk_bytes(cube_dir: Path, row: int, col: int) -> bytes:
    return (cube_dir / cube.chunk_file_name(row, col)).read_bytes()


def run_layers(
    cube_dir: str | Path,
    heavy_dir: str | Path,
    partial_dir: str | Path,
    steps: Steps,
    bk=None,
    *,
    batch_chunks: int = DEFAULT_BATCH_CHUNKS,
    block_steps: int = DEFAULT_BLOCK_STEPS,
    force: bool = False,
    observer_height_m: float = OBSERVER_HEIGHT_M,
    progress: Callable[[str], None] = print,
) -> LayersSummary:
    """Layers of every chunk marked in ``done.bin``, in the order of the plan (08 §2), then the files.

    Resumable by chunks; may run with the cube half done (the missing cells stay at 255).
    """
    cube_dir, heavy_dir, partial_dir = Path(cube_dir), Path(heavy_dir), Path(partial_dir)
    bk = bk or NumpyBackend()
    t_start = time.perf_counter()
    done = cube.read_done(cube_dir)
    order = [(e.row, e.col) for e in cube.build_plan() if done[e.row, e.col]]
    steps_key = steps_digest(steps)
    keys: dict[tuple[int, int], str] = {}
    todo, skipped, bad = [], [], []
    for row, col in order:
        try:
            raw = _chunk_bytes(cube_dir, row, col)
        except OSError:
            bad.append((row, col))
            continue
        keys[(row, col)] = partial_key(hashlib.sha256(raw).hexdigest()[:32], steps_key, observer_height_m)
        if not force and read_partial(partial_path(partial_dir, row, col), keys[(row, col)]) is not None:
            skipped.append((row, col))
        else:
            todo.append((row, col))
    progress(f"layers: {len(order)} chunks in the cube, {len(skipped)} already done, {len(todo)} to compute "
             f"on {bk.name}, {steps.n} steps")
    computed = []
    for b0 in range(0, len(todo), batch_chunks):
        batch = todo[b0 : b0 + batch_chunks]
        t0 = time.perf_counter()
        chunks = []
        for row, col in batch:
            try:
                chunks.append(cube.decode_chunk(gzip.decompress(_chunk_bytes(cube_dir, row, col))))
            except (OSError, EOFError, ValueError):
                bad.append((row, col))
        results = chunk_units(chunks, steps, bk, block_steps, observer_height_m)
        for c, (values, values_any) in zip(chunks, results, strict=True):
            write_partial(partial_path(partial_dir, c.row, c.col), keys[(c.row, c.col)], values, values_any,
                          c.computed)
            computed.append((c.row, c.col))
        dt = time.perf_counter() - t0
        left = len(todo) - b0 - len(batch)
        progress(f"[{len(computed)}/{len(todo)}] {len(chunks)} chunks "
                 f"({sum(int(c.n_computed) for c in chunks)} points) in {dt:.1f} s; "
                 f"about {cube.format_duration(dt * left / max(len(batch), 1))} left")
    for rc in bad:
        progress(f"chunk {rc} is marked done but its file cannot be read: left out (cells at {NODATA})")
    values, values_any, n_points = assemble(order, keys, partial_dir)
    files = write_layer_files(heavy_dir, values, values_any, n_points)
    return LayersSummary(len(order), computed, skipped, bad, n_points, time.perf_counter() - t_start, files)


def assemble(
    order: Sequence[tuple[int, int]], keys: dict[tuple[int, int], str], partial_dir: Path
) -> tuple[np.ndarray, np.ndarray, int]:
    """Whole-mesh arrays uint8 [61, 3, NY, NX] and [2, NY, NX] from the partial files."""
    values = np.full((N_COLS, len(BANDS), NY, NX), NODATA, dtype=np.uint8)
    values_any = np.full((len(ANY_BANDS), NY, NX), NODATA, dtype=np.uint8)
    n_points = 0
    for row, col in order:
        key = keys.get((row, col))
        part = read_partial(partial_path(partial_dir, row, col), key) if key else None
        if part is None:
            continue
        v, va, computed = part
        i, j = cube.chunk_cells(row, col)
        values[:, :, j, i] = v
        values_any[:, j, i] = va
        n_points += int(computed.sum())
    return values, values_any, n_points


# ---------------------------------------------------------------------------------------------
# Files: layers/*.bin.gz, layers/layers.json, map/grid.json
# ---------------------------------------------------------------------------------------------


def contract_version() -> str:
    return cube.contract_version()


def json_bytes(doc: dict) -> bytes:
    return (json.dumps(doc, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def layers_doc(source: str, computed_points: int, period_list: Sequence[Period]) -> dict:
    """``layers/layers.json`` (09 §9.1)."""
    nasa = source == SOURCE_NASA
    h = NASA_OBSERVER_HEIGHT_M if nasa else int(OBSERVER_HEIGHT_M)
    return {
        "contract_version": contract_version(),
        "source": source,
        "criterion": "any" if nasa else "center",
        "observer_height_m": h,
        "time_step_s": STEP_S,
        "encoding": {"dtype": "uint8", "pct_per_unit": PCT_PER_UNIT, "nodata": NODATA, "bands": list(BANDS),
                     "layout": "band,row,col"},
        "periods": [p.doc() for p in period_list],
        "validation": {"file": "layers/mean186_any.bin.gz", "bands": list(ANY_BANDS), "criterion": "any",
                       "observer_height_m": h},
        "coverage": {"computed_points": int(computed_points), "total_points": cube.POINTS_TOTAL},
    }


def grid_doc() -> dict:
    """``map/grid.json`` (09 §8.1): the mesh of 08 §1.2."""
    from pipeline.common.constants import R_MOON_M

    return {
        "contract_version": contract_version(),
        "projection": "polar_stereographic_south",
        "radius_m": int(R_MOON_M),
        "cell_m": int(cube.CELL_M),
        "nx": cube.NX,
        "ny": cube.NY,
        "x_min_m": int(cube.X_MIN_M),
        "y_max_m": int(cube.Y_MAX_M),
        "chunk": cube.CHUNK,
        "n_chunk_cols": cube.N_CHUNK_COLS,
        "n_chunk_rows": cube.N_CHUNK_ROWS,
    }


def write_grid(heavy_dir: str | Path) -> Path:
    path = Path(heavy_dir) / "map" / "grid.json"
    write_if_changed(path, json_bytes(grid_doc()))
    return path


def write_layer_files(
    heavy_dir: str | Path,
    values: np.ndarray,
    values_any: np.ndarray,
    computed_points: int,
    source: str = SOURCE_COMPUTED,
    period_list: Sequence[Period] | None = None,
) -> list[Path]:
    """The period files, ``mean186_any`` and ``layers.json`` (written last), plus ``map/grid.json``."""
    heavy_dir = Path(heavy_dir)
    period_list = list(period_list) if period_list is not None else periods()
    out = []
    for p in period_list:
        data = np.ascontiguousarray(values[p.col], dtype=np.uint8).tobytes()
        if len(data) != LAYER_BYTES:
            raise ValueError(f"Layer {p.id}: {len(data)} B, expected {LAYER_BYTES}")
        path = heavy_dir / p.doc()["file"]
        write_if_changed(path, cube.gzip_bytes(data))
        out.append(path)
    data = np.ascontiguousarray(values_any, dtype=np.uint8).tobytes()
    if len(data) != LAYER_ANY_BYTES:
        raise ValueError(f"Layer mean186_any: {len(data)} B, expected {LAYER_ANY_BYTES}")
    path = heavy_dir / "layers" / "mean186_any.bin.gz"
    write_if_changed(path, cube.gzip_bytes(data))
    out.append(path)
    path = heavy_dir / "layers" / "layers.json"
    write_if_changed(path, json_bytes(layers_doc(source, computed_points, period_list)))
    out.append(path)
    out.append(write_grid(heavy_dir))
    return out


# ---------------------------------------------------------------------------------------------
# Plan B-4: the NASA layers resampled to the mesh (08 §9)
# ---------------------------------------------------------------------------------------------


def nasa_units(dn_sum9: np.ndarray, valid: np.ndarray) -> np.ndarray:
    """Units of 0.4 % from the sum of a 3 × 3 window of DN: pct = 100·0.00004·sum/9 (03 §6, 08 §8.2).

    ``v = round(pct/0.4) = round(sum/900)``, half up, in integers; 255 where not valid.
    """
    s = np.asarray(dn_sum9, dtype=np.int64)
    v = np.clip((2 * s + 900) // 1800, 0, UNITS_FULL)
    return np.where(valid, v, NODATA).astype(np.uint8)


def write_nasa_layers(heavy_dir: str | Path, products) -> tuple[list[Path], int]:
    """Plan B-4 (08 §9): ``source = nasa_avgvisib``, only ``mean186``, band ``both`` all 255.

    The validation layer holds the same two NASA bands (they already use the «any part» criterion).
    """
    from pipeline.layers.compare_nasa import mesh_dn_sums

    nasa = mesh_dn_sums(products)
    sums, valid = nasa.sums, nasa.valid  # [2, NY, NX] each: sun, earth
    bands = np.stack([nasa_units(sums[0], valid[0]), nasa_units(sums[1], valid[1])])
    values = np.full((N_COLS, len(BANDS), NY, NX), NODATA, dtype=np.uint8)
    values[MEAN_COL, 0:2] = bands
    mean = [p for p in periods() if p.id == MEAN_ID]
    n_points = int((valid[0] & valid[1]).sum())
    for stale in layers_dir_of(heavy_dir).glob("20*.bin.gz"):  # months of an earlier computed run
        stale.unlink()
    return write_layer_files(heavy_dir, values, bands, n_points, SOURCE_NASA, mean), n_points


# ---------------------------------------------------------------------------------------------
# Reading a layer back (compare-nasa and the tests)
# ---------------------------------------------------------------------------------------------


def read_layer(path: str | Path, n_bands: int) -> np.ndarray:
    """uint8 [n_bands, NY, NX] of a ``layers/*.bin.gz`` file."""
    data = gzip.decompress(Path(path).read_bytes())
    if len(data) != n_bands * NY * NX:
        raise ValueError(f"{path}: {len(data)} B, expected {n_bands * NY * NX}")
    return np.frombuffer(data, dtype=np.uint8).reshape(n_bands, NY, NX)
