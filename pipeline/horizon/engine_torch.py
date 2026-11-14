# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Horizon engine of the cube (PyTorch, float32; GPU if there is one, else CPU, same code).

docs/spec/08_mapa_polar.md §3. Same samples and same formulas as the reference engine
(``engine_ref``, 06_horizonte.md §4-§5): each ray follows the great circle of its azimuth,
every sample takes its height from the first polar grid that covers it (bilinear) and its
elevation is the closed form with curvature. Only the observer of one height is computed.

Arithmetic (08 §3.3 asks for less than 0.002° against the reference). In float32 a position
is known to ~0.02 m and a height to ~0.0005 m, and the nearest samples are 20 m away: a literal
float32 transcription of 08 §3.2 differs from the reference by up to 0.0039° on the test
terrain. So everything is computed **relative to the site** (measured: 8e-6°), which is exact
algebra on the formulas of 08 §3.2, not another algorithm:

- sample direction: ``P = u0 + δ`` with ``δ = sin θ·T − 2 sin²(θ/2)·u0``;
- map position: ``x − x0 = (2R·δy + x0·δz) / (1 − u0z − δz)`` (and the same for y with δx),
  from ``x = 2R·Py / (1 − Pz)``;
- pixel: the integer part of the site pixel is kept apart, as an integer;
- height: the four neighbours are read minus the site height, so the bilinear result is
  already ``h − h_site``.

The maximum is taken on ``tan(el) = vertical / horizontal`` (horizontal > 0), and the arctangent
only of the winner: it is the same sample because the arctangent is increasing.
"""

from __future__ import annotations

import math
import os
from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
import torch

from pipeline.common.constants import R_MOON_M
from pipeline.dem.grids import PolarSouthGrid
from pipeline.dem.stack import DemStack
from pipeline.horizon.cube import POINTS_PER_CHUNK, chunk_frames
from pipeline.horizon.engine_ref import smooth_horizon
from pipeline.horizon.law import AZ_STEP_DEG, N_AZ, law_distances, law_n_samples

DEFAULT_OBSERVER_HEIGHT_M = 2.0
DEFAULT_PTS_BATCH = 64  # points per batch (08 §3.2)
# Consecutive samples per block. 08 §3.2 proposes 128; 32 gives the same result about twice as
# fast, on the GPU and on the CPU (decision D-53: measured, see docs/constants.md).
DEFAULT_RING = 32
DEVICE_ENV = "LLSN_DEVICE"  # auto | cuda | cpu (02_arquitectura.md §5)

F32 = torch.float32
F64 = torch.float64


def pick_device(name: str | None = None) -> torch.device:
    """``cuda`` if there is one, else ``cpu``; ``name`` or $LLSN_DEVICE can force either."""
    name = (name or os.environ.get(DEVICE_ENV) or "auto").lower()
    if name == "auto":
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if name not in ("cuda", "cpu"):
        raise ValueError(f"Unknown device {name!r}; expected auto, cuda or cpu")
    if name == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA asked but torch.cuda.is_available() is False; run make setup-gpu")
    return torch.device(name)


@dataclass
class TorchGrid:
    """A south polar raster on the device (03_datos_y_fuentes.md §3.1), raw integer units."""

    name: str
    n: int  # pixels per side
    scale_m: float  # metres per pixel
    to_m: float  # raw unit -> metres
    flat: torch.Tensor  # int16 [n·n], row by row

    @property
    def half_side_m(self) -> float:
        return self.n * self.scale_m / 2.0

    @property
    def scale_bound(self) -> float:
        """Upper bound of the map scale (map metres per metre on the sphere) inside the square.

        The scale of the polar stereographic projection is 1 + (ρ/2R)², largest at the corners.
        """
        return 1.0 + (self.half_side_m * math.sqrt(2.0) / (2.0 * R_MOON_M)) ** 2


class TorchStack:
    """Polar grids in priority order: each sample comes whole from the first one that covers it."""

    def __init__(self, grids: Sequence[TorchGrid], device: torch.device):
        if not grids:
            raise ValueError("The stack needs at least one grid")
        self.grids = list(grids)
        self.device = device

    @property
    def names(self) -> list[str]:
        return [g.name for g in self.grids]

    @classmethod
    def from_dem_stack(cls, stack: DemStack, device: torch.device | str | None = None) -> TorchStack:
        """Copy the grids of a ``DemStack`` to the device. Only integer south polar rasters."""
        device = device if isinstance(device, torch.device) else pick_device(device)
        grids = []
        for g in stack.grids:
            if not isinstance(g, PolarSouthGrid) or g.data is None or g.data.dtype != np.dtype("int16"):
                raise ValueError(f"Grid {g.name}: the cube engine needs int16 south polar rasters in memory")
            if not g._samples_always_valid():
                raise ValueError(f"Grid {g.name}: the cube engine does not handle invalid values")
            data = np.ascontiguousarray(g.data, dtype=np.int16)
            flat = torch.from_numpy(data).reshape(-1).to(device)
            grids.append(TorchGrid(g.name, g.N, g.S, g.to_m, flat))
        return cls(grids, device)

    def site_pixels(self, grid: TorchGrid, x0: np.ndarray, y0: np.ndarray):
        """Fractional pixel (s, l) of map points, float64 (03 §3.1)."""
        s = x0 / grid.scale_m + grid.n / 2 - 0.5
        l = grid.n / 2 - 0.5 - y0 / grid.scale_m
        return s, l

    def site_heights(self, x0: np.ndarray, y0: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Height (m, float64) at map points and whether some grid covers them (08 §3.2)."""
        h = np.full(x0.shape, np.nan)
        valid = np.zeros(x0.shape, dtype=bool)
        for g in self.grids:
            s, l = self.site_pixels(g, x0, y0)
            inside = (s >= 0) & (l >= 0) & (s <= g.n - 1) & (l <= g.n - 1) & ~valid
            if not inside.any():
                continue
            s0 = np.clip(np.floor(s[inside]), 0, g.n - 2)
            l0 = np.clip(np.floor(l[inside]), 0, g.n - 2)
            fs, fl = s[inside] - s0, l[inside] - l0
            idx = torch.from_numpy((l0 * g.n + s0).astype(np.int64)).to(self.device)
            a = [g.flat[idx + o].cpu().numpy().astype(np.float64) * g.to_m for o in (0, 1, g.n, g.n + 1)]
            h[inside] = (1 - fl) * ((1 - fs) * a[0] + fs * a[1]) + fl * ((1 - fs) * a[2] + fs * a[3])
            valid |= inside
        return h, valid


@dataclass
class _GridSite:
    """Per-batch constants of one grid: where the sites fall in it. Shapes [B, 1, 1]."""

    grid: TorchGrid
    sb: torch.Tensor  # int64, integer part of the site column
    lb: torch.Tensor  # int64, integer part of the site row
    sf: torch.Tensor  # float32, fraction of the site column
    lf: torch.Tensor  # float32, fraction of the site row
    lo_s: torch.Tensor  # float32, lowest relative column inside the raster (-sb)
    hi_s: torch.Tensor  # float32, highest relative column inside the raster (n - 1 - sb)
    lo_l: torch.Tensor
    hi_l: torch.Tensor
    base_raw: torch.Tensor  # float32, site height in raw units, rounded (an exact integer)
    offset_m: torch.Tensor  # float32, base_raw·to_m − h_site (small)
    margin_m: float  # smallest distance from a site of the batch to the edge of the raster


def _grid_site(stack: TorchStack, grid: TorchGrid, x0, y0, h_site) -> _GridSite:
    dev = stack.device
    s, l = stack.site_pixels(grid, x0, y0)
    sb, lb = np.floor(s), np.floor(l)
    base = np.rint(h_site / grid.to_m)

    def col(a, dtype):
        return torch.as_tensor(np.asarray(a), dtype=dtype, device=dev).reshape(-1, 1, 1)

    return _GridSite(
        grid=grid,
        sb=col(sb, torch.int64),
        lb=col(lb, torch.int64),
        sf=col(s - sb, F32),
        lf=col(l - lb, F32),
        lo_s=col(-sb, F32),
        hi_s=col(grid.n - 1 - sb, F32),
        lo_l=col(-lb, F32),
        hi_l=col(grid.n - 1 - lb, F32),
        base_raw=col(base, F32),
        offset_m=col(base * grid.to_m - h_site, F32),
        margin_m=float((grid.half_side_m - np.maximum(np.abs(x0), np.abs(y0))).min()),
    )


def _sample_rel(gs: _GridSite, mx: torch.Tensor, my: torch.Tensor):
    """Bilinear height minus the site height (m) at map offsets (mx, my) from the sites.

    Returns (rel, inside), [B, 720, ring]. 08 §3.2 ``sample_stack_xy`` for one grid.
    """
    g = gs.grid
    s_rel = gs.sf + mx / g.scale_m
    l_rel = gs.lf - my / g.scale_m
    inside = (s_rel >= gs.lo_s) & (s_rel <= gs.hi_s) & (l_rel >= gs.lo_l) & (l_rel <= gs.hi_l)
    ds = torch.minimum(torch.maximum(torch.floor(s_rel), gs.lo_s), gs.hi_s - 1.0)
    dl = torch.minimum(torch.maximum(torch.floor(l_rel), gs.lo_l), gs.hi_l - 1.0)
    fs = s_rel - ds
    fl = l_rel - dl
    idx = (gs.lb + dl.long()) * g.n + (gs.sb + ds.long())
    # int16 and base_raw are exact in float32 and so is their difference.
    a00 = g.flat[idx].to(F32) - gs.base_raw
    a01 = g.flat[idx + 1].to(F32) - gs.base_raw
    a10 = g.flat[idx + g.n].to(F32) - gs.base_raw
    a11 = g.flat[idx + (g.n + 1)].to(F32) - gs.base_raw
    v = (1.0 - fl) * ((1.0 - fs) * a00 + fs * a01) + fl * ((1.0 - fs) * a10 + fs * a11)
    return v * g.to_m + gs.offset_m, inside


@dataclass
class PointsHorizon:
    """Horizon of some points for one observer height. Arrays in float64 on the CPU."""

    valid: np.ndarray  # bool [P]: the stack gives a height at the point
    height_m: np.ndarray  # [P], terrain height at the point; NaN where not valid
    el_deg: np.ndarray  # [P, 720]; NaN where the point is not valid
    dist_m: np.ndarray  # [P, 720]
    sample_index: np.ndarray  # int64 [P, 720], i*; -1 where no sample of the ray is valid
    n_samples: int  # terrain samples evaluated


@torch.no_grad()
def horizon_points(
    stack: TorchStack,
    u0,
    east,
    north,
    law: str = "full",
    observer_height_m: float = DEFAULT_OBSERVER_HEIGHT_M,
    pts_batch: int = DEFAULT_PTS_BATCH,
    ring: int = DEFAULT_RING,
) -> PointsHorizon:
    """Horizon of the points with unit vectors ``u0`` and local bases ``east``, ``north`` ([P, 3]).

    08 §3.2. A point outside every grid is returned as not valid. A ray without any valid
    sample takes the values of the smooth Moon (06 §6).
    """
    if pts_batch < 1 or ring < 1:
        raise ValueError("pts_batch and ring must be positive")
    dev = stack.device
    u0 = np.asarray(u0, dtype=np.float64).reshape(-1, 3)
    east = np.asarray(east, dtype=np.float64).reshape(-1, 3)
    north = np.asarray(north, dtype=np.float64).reshape(-1, 3)
    n_pts = len(u0)
    n_s = law_n_samples(law)
    dist = law_distances(law)
    theta = dist / R_MOON_M
    sin_t = torch.as_tensor(np.sin(theta), dtype=F32, device=dev)
    two_s2 = torch.as_tensor(2.0 * np.sin(theta / 2.0) ** 2, dtype=F32, device=dev)
    az = np.radians(AZ_STEP_DEG * np.arange(N_AZ))
    cos_a = torch.as_tensor(np.cos(az), dtype=F64, device=dev)[None, :, None]
    sin_a = torch.as_tensor(np.sin(az), dtype=F64, device=dev)[None, :, None]

    # Sites in map coordinates (float64): x = 2R·Y/(1 − Z), y = 2R·X/(1 − Z).
    denom = 1.0 - u0[:, 2]
    x0 = 2.0 * R_MOON_M * u0[:, 1] / denom
    y0 = 2.0 * R_MOON_M * u0[:, 0] / denom
    h_site, valid_pt = stack.site_heights(x0, y0)

    smooth_el_deg, smooth_dist_m = smooth_horizon(observer_height_m)
    out = PointsHorizon(
        valid=valid_pt,
        height_m=h_site,
        el_deg=np.full((n_pts, N_AZ), np.nan),
        dist_m=np.full((n_pts, N_AZ), np.nan),
        sample_index=np.full((n_pts, N_AZ), -1, dtype=np.int64),
        n_samples=0,
    )
    todo = np.flatnonzero(valid_pt)
    two_r = 2.0 * R_MOON_M
    for b0 in range(0, len(todo), pts_batch):
        sel = todo[b0 : b0 + pts_batch]
        n_b = len(sel)

        def col(a, dtype=F32, n_b=n_b):
            return torch.as_tensor(np.asarray(a), dtype=dtype, device=dev).reshape(n_b, 1, 1)

        # Tangent of each azimuth, T = cos a·N + sin a·E, built in float64: [B, 720, 3].
        nb = torch.as_tensor(north[sel], dtype=F64, device=dev)[:, None, :]
        eb = torch.as_tensor(east[sel], dtype=F64, device=dev)[:, None, :]
        tangent = (cos_a * nb + sin_a * eb).to(F32)
        tx, ty, tz = tangent[:, :, 0:1], tangent[:, :, 1:2], tangent[:, :, 2:3]
        ux, uy, uz = col(u0[sel, 0]), col(u0[sel, 1]), col(u0[sel, 2])
        den0 = col(denom[sel])
        x0b, y0b = col(x0[sel]), col(y0[sel])
        r_site = col(R_MOON_M + h_site[sel])
        sites = [_grid_site(stack, g, x0[sel], y0[sel], h_site[sel]) for g in stack.grids]

        best = torch.full((n_b, N_AZ), -torch.inf, dtype=F32, device=dev)
        best_i = torch.zeros((n_b, N_AZ), dtype=torch.int64, device=dev)
        for i0 in range(0, n_s, ring):
            i1 = min(i0 + ring, n_s)
            st = sin_t[i0:i1][None, None, :]
            c2 = two_s2[i0:i1][None, None, :]
            # δ = P − u0, and from it the map offset of the sample from its site.
            dz = st * tz - c2 * uz
            inv = 1.0 / (den0 - dz)
            mx = (two_r * (st * ty - c2 * uy) + x0b * dz) * inv
            my = (two_r * (st * tx - c2 * ux) + y0b * dz) * inv

            rel, valid = _sample_rel(sites[0], mx, my)
            reach_m = float(dist[i1 - 1])
            for k in range(1, len(sites)):
                # The previous grids cover the whole block if no ray can have left them yet.
                prev = sites[k - 1]
                if reach_m * prev.grid.scale_bound < prev.margin_m:
                    break
                rel_k, inside_k = _sample_rel(sites[k], mx, my)
                rel = torch.where(valid, rel, rel_k)
                valid = valid | inside_k

            r_t = r_site + rel
            tan_el = ((rel - observer_height_m) - r_t * c2) / (r_t * st)
            tan_el = torch.where(valid, tan_el, -torch.inf)
            m, k_max = tan_el.max(dim=2)  # first maximum of the block
            better = m > best  # strict: the nearest sample wins a tie
            best = torch.where(better, m, best)
            best_i = torch.where(better, i0 + k_max, best_i)

        tan_best = best.to(F64).cpu().numpy()
        i_best = best_i.cpu().numpy()
        empty = np.isneginf(tan_best)
        out.el_deg[sel] = np.where(empty, smooth_el_deg, np.degrees(np.arctan(tan_best)))
        out.dist_m[sel] = np.where(empty, smooth_dist_m, dist[i_best])
        out.sample_index[sel] = np.where(empty, -1, i_best)
        out.n_samples += n_b * N_AZ * n_s
    return out


@dataclass
class ChunkResult:
    """One chunk of the cube before encoding (08 §3.2). Index p = 16·r + c."""

    row: int
    col: int
    law: str
    computed: np.ndarray  # bool [256]
    height_m: np.ndarray  # [256]; NaN where not computed
    el_deg: np.ndarray  # [256, 720]
    dist_m: np.ndarray  # [256, 720]
    n_samples: int


def compute_chunk(
    stack: TorchStack,
    row: int,
    col: int,
    law: str = "full",
    observer_height_m: float = DEFAULT_OBSERVER_HEIGHT_M,
    pts_batch: int = DEFAULT_PTS_BATCH,
    ring: int = DEFAULT_RING,
    points=None,
) -> ChunkResult:
    """Horizon of the points of chunk (row, col). ``points``: indices p to compute (default all).

    A point left out, or without terrain in the stack, is "not computed" (height -32768 in the file).
    """
    frames = chunk_frames(row, col)
    sel = np.arange(POINTS_PER_CHUNK) if points is None else np.unique(np.asarray(points, dtype=np.int64))
    if sel.size and (sel[0] < 0 or sel[-1] >= POINTS_PER_CHUNK):
        raise ValueError(f"Point indices must be in 0..{POINTS_PER_CHUNK - 1}")
    res = horizon_points(
        stack, frames.u0[sel], frames.east[sel], frames.north[sel], law, observer_height_m, pts_batch, ring
    )
    out = ChunkResult(
        row=row,
        col=col,
        law=law,
        computed=np.zeros(POINTS_PER_CHUNK, dtype=bool),
        height_m=np.full(POINTS_PER_CHUNK, np.nan),
        el_deg=np.full((POINTS_PER_CHUNK, N_AZ), np.nan),
        dist_m=np.full((POINTS_PER_CHUNK, N_AZ), np.nan),
        n_samples=res.n_samples,
    )
    out.computed[sel] = res.valid
    out.height_m[sel] = res.height_m
    out.el_deg[sel] = res.el_deg
    out.dist_m[sel] = res.dist_m
    return out
