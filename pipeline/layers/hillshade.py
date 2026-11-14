# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Background of the map: hillshade of P2 at 250 m and heights at the cell centres.

docs/spec/08_mapa_polar.md §6 and docs/spec/09_contrato_datos.md §8.3:

- ``map/hillshade_250m.png``: 8-bit grey PNG of 1504 × 1344 px that covers the mesh exactly, from
  ``LDEM_75S_120M`` (P2) sampled bilinearly at the pixel centres; light from the top left (map
  azimuth 315°, altitude 30°), vertical exaggeration 2;
- ``map/dem_500m.bin.gz``: int16 [672][752], height in metres at the centre of each cell (bilinear
  of P2), −32768 = no data, no header.
"""

from __future__ import annotations

import io
import math
from pathlib import Path

import numpy as np

from pipeline.dem.grids import PolarSouthGrid
from pipeline.horizon import cube
from pipeline.layers.layers import write_if_changed

HILL_STEP_M = 250.0
HILL_W = round((cube.NX * cube.CELL_M) / HILL_STEP_M)  # 1504
HILL_H = round((cube.NY * cube.CELL_M) / HILL_STEP_M)  # 1344
Z_FACTOR = 2.0  # k: vertical exaggeration (08 §6)
LIGHT_ALT_DEG = 30.0
LIGHT_AZ_DEG = 45.0  # the light comes from up-left: L = (−cos 30°·sin 45°, cos 30°·cos 45°, sin 30°)
AMBIENT = 0.35
DIFFUSE = 0.65
DEM_NODATA = -32768


def light_vector() -> np.ndarray:
    alt, az = math.radians(LIGHT_ALT_DEG), math.radians(LIGHT_AZ_DEG)
    return np.array([-math.cos(alt) * math.sin(az), math.cos(alt) * math.cos(az), math.sin(alt)])


def pixel_centres(step_m: float, nx: int, ny: int) -> tuple[np.ndarray, np.ndarray]:
    """Map metres [ny, nx] of the pixel centres of an image that covers the mesh with ``step_m``."""
    c = np.arange(nx)
    f = np.arange(ny)
    x = cube.X_MIN_M + (c + 0.5) * step_m
    y = cube.Y_MAX_M - (f + 0.5) * step_m
    return np.broadcast_to(x[None, :], (ny, nx)), np.broadcast_to(y[:, None], (ny, nx))


def sample_xy(grid: PolarSouthGrid, x, y) -> tuple[np.ndarray, np.ndarray]:
    """Bilinear height (m) of a polar grid at map points (03 §3.3). Returns (h, valid)."""
    s, l = grid.pixel_of_xy(x, y)
    return grid.sample_pixels(s, l)


def slopes(z: np.ndarray, step_m: float) -> tuple[np.ndarray, np.ndarray]:
    """∂h/∂x (x to the right) and ∂h/∂y (y **upwards**) of an image ``z[row][col]`` (08 §6).

    Central differences inside, ``(Z[f][c+1] − Z[f][c−1]) / (2·step)`` and
    ``(Z[f−1][c] − Z[f+1][c]) / (2·step)``; one-sided differences on the border.
    """
    z = np.asarray(z, dtype=np.float64)
    dx = np.empty_like(z)
    dy = np.empty_like(z)
    dx[:, 1:-1] = (z[:, 2:] - z[:, :-2]) / (2 * step_m)
    dx[:, 0] = (z[:, 1] - z[:, 0]) / step_m
    dx[:, -1] = (z[:, -1] - z[:, -2]) / step_m
    dy[1:-1, :] = (z[:-2, :] - z[2:, :]) / (2 * step_m)
    dy[0, :] = (z[0, :] - z[1, :]) / step_m
    dy[-1, :] = (z[-2, :] - z[-1, :]) / step_m
    return dx, dy


def shade(z: np.ndarray, step_m: float = HILL_STEP_M) -> np.ndarray:
    """uint8 hillshade: round(255·clamp(0.35 + 0.65·n·L, 0, 1)), half up; 0 where the height is NaN."""
    dx, dy = slopes(z, step_m)
    nx, ny = -dx * Z_FACTOR, -dy * Z_FACTOR
    norm = np.sqrt(nx * nx + ny * ny + 1.0)
    lx, ly, lz = light_vector()
    dot = (nx * lx + ny * ly + lz) / norm
    v = np.floor(255.0 * np.clip(AMBIENT + DIFFUSE * dot, 0.0, 1.0) + 0.5)
    return np.where(np.isfinite(v), v, 0).astype(np.uint8)


def hillshade_png(grid: PolarSouthGrid) -> bytes:
    from PIL import Image

    x, y = pixel_centres(HILL_STEP_M, HILL_W, HILL_H)
    h, _ = sample_xy(grid, x, y)
    buf = io.BytesIO()
    Image.fromarray(shade(h), "L").save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def dem_500m(grid: PolarSouthGrid) -> np.ndarray:
    """int16 [672, 752]: height (m, rounded half up) at each cell centre; −32768 where not valid."""
    x, y = pixel_centres(cube.CELL_M, cube.NX, cube.NY)
    h, valid = sample_xy(grid, x, y)
    v = np.floor(np.where(valid, h, 0.0) + 0.5)
    return np.where(valid, v, DEM_NODATA).astype("<i2")


def write_background(heavy_dir: str | Path, grid: PolarSouthGrid) -> tuple[Path, Path, dict]:
    """Write both files under ``<heavy>/map`` and return their paths and a short summary."""
    heavy_dir = Path(heavy_dir)
    png = heavy_dir / "map" / "hillshade_250m.png"
    write_if_changed(png, hillshade_png(grid))
    dem = dem_500m(grid)
    gz = heavy_dir / "map" / "dem_500m.bin.gz"
    write_if_changed(gz, cube.gzip_bytes(dem.tobytes()))
    ok = dem != DEM_NODATA
    summary = {"dem_min_m": int(dem[ok].min()) if ok.any() else None,
               "dem_max_m": int(dem[ok].max()) if ok.any() else None,
               "dem_nodata": int((~ok).sum())}
    return png, gz, summary
