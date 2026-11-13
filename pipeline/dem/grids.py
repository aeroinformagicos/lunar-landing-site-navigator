# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Rasters of the project as ``Grid`` objects: pixel <-> coordinates and bilinear sampling.

docs/spec/03_datos_y_fuentes.md §3 (pixel convention, projections, bilinear) and §7 (interface).

Pixel convention: 0-based column ``s`` (to the right) and row ``l`` (downwards); the file value
at (l, s) belongs to the **centre** of that pixel. Everything is vectorised: ``u`` is an array of
unit vectors in MOON_ME with shape [..., 3].
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

import numpy as np

from pipeline.common.constants import R_MOON_M
from pipeline.common.geo import latlon_of_unit, unit_vector, wrap180, wrap360
from pipeline.dem.pds_label import LabelError, PdsLabel, parse_label

# A sample is invalid if it is not finite or its height is outside this range
# (03_datos_y_fuentes.md §3.3: real extremes of the labels are -9129 m and +10783 m).
VALID_HEIGHT_ABS_MAX_M = 20_000.0


class Grid:
    """Common interface of every relief source (03_datos_y_fuentes.md §7)."""

    kind: str = ""
    name: str = ""
    res_m: float = 0.0  # nominal pixel size, metres
    data: np.ndarray | None = None  # raw units, shape [nrows, ncols]; memmap or in memory
    to_m: float = 1.0  # raw unit -> metres
    nrows: int = 0
    ncols: int = 0
    label: PdsLabel | None = None

    # --- pixel <-> coordinates (each projection implements these) ---

    def pixel_of_unit(self, u):
        """Fractional (s, l) of unit vector(s) ``u[..., 3]``."""
        raise NotImplementedError

    def pixel_of_latlon(self, lat_deg, lon_deg):
        """Fractional (s, l) of a latitude and longitude in degrees."""
        raise NotImplementedError

    def latlon_of_pixel(self, s, l):
        """(lat_deg, lon_deg) of fractional pixel(s); longitude in (-180, 180]."""
        raise NotImplementedError

    def unit_of_pixel(self, s, l) -> np.ndarray:
        return unit_vector(*self.latlon_of_pixel(s, l))

    # --- sampling ---

    def sample_pixels(self, s, l):
        """Bilinear interpolation at fractional pixel(s). Returns (height_m, valid).

        Literal §3.3: NODATA (valid = False, height NaN) if any of the four neighbour
        centres is outside the raster or holds an invalid value. Never nearest neighbour.
        """
        if self.data is None:
            raise ValueError(f"Grid {self.name} has no data loaded")
        s = np.asarray(s, dtype=np.float64)
        l = np.asarray(l, dtype=np.float64)
        s0 = np.floor(s)
        l0 = np.floor(l)
        inside = (s0 >= 0) & (l0 >= 0) & (s0 + 1 <= self.ncols - 1) & (l0 + 1 <= self.nrows - 1)
        s0i = np.where(inside, s0, 0).astype(np.intp)
        l0i = np.where(inside, l0, 0).astype(np.intp)
        fs = s - s0
        fl = l - l0
        flat = self.data.reshape(-1)
        idx = l0i * self.ncols + s0i
        a00 = np.take(flat, idx).astype(np.float64) * self.to_m
        a01 = np.take(flat, idx + 1).astype(np.float64) * self.to_m
        a10 = np.take(flat, idx + self.ncols).astype(np.float64) * self.to_m
        a11 = np.take(flat, idx + self.ncols + 1).astype(np.float64) * self.to_m
        valid = inside
        if not self._samples_always_valid():
            for a in (a00, a01, a10, a11):
                valid = valid & np.isfinite(a) & (np.abs(a) <= VALID_HEIGHT_ABS_MAX_M)
        with np.errstate(invalid="ignore"):
            v = (1 - fl) * ((1 - fs) * a00 + fs * a01) + fl * ((1 - fs) * a10 + fs * a11)
        return np.where(valid, v, np.nan), valid

    def _samples_always_valid(self) -> bool:
        """True if no stored value can be invalid (integers whose whole range is a valid height)."""
        dtype = self.data.dtype
        if dtype.kind != "i":
            return False
        return abs(float(np.iinfo(dtype).min) * self.to_m) <= VALID_HEIGHT_ABS_MAX_M

    def height_m(self, u):
        """Height in metres above the reference sphere at unit vector(s) ``u``. Returns (h, valid)."""
        s, l = self.pixel_of_unit(u)
        return self.sample_pixels(s, l)

    def __repr__(self) -> str:
        return f"<{type(self).__name__} {self.name} {self.nrows}x{self.ncols} res={self.res_m:.4g} m>"


class PolarSouthGrid(Grid):
    """South polar stereographic raster (P1-P3, N1-N5). 03_datos_y_fuentes.md §3.1.

    Square image of N pixels and exact scale S metres per pixel at the pole; longitude 0
    points straight up from the centre and 90 E to the right.
    """

    kind = "polar_south"

    def __init__(
        self, name: str, n: int, scale_m: float, data=None, to_m: float = 1.0, label: PdsLabel | None = None
    ):
        if data is not None and tuple(data.shape) != (n, n):
            raise ValueError(f"Grid {name}: data shape {data.shape} is not ({n}, {n})")
        self.name = name
        self.N = int(n)
        self.S = float(scale_m)
        self.res_m = float(scale_m)
        self.nrows = self.ncols = int(n)
        self.data = data
        self.to_m = float(to_m)
        self.label = label

    @property
    def half_side_m(self) -> float:
        return self.N * self.S / 2.0

    def pixel_of_xy(self, x_m, y_m):
        """Map metres (x to the right = 90 E, y upwards = 0 E) to fractional (s, l)."""
        s = np.asarray(x_m, dtype=np.float64) / self.S + self.N / 2 - 0.5
        l = self.N / 2 - 0.5 - np.asarray(y_m, dtype=np.float64) / self.S
        return s, l

    def xy_of_pixel(self, s, l):
        x = (np.asarray(s, dtype=np.float64) - self.N / 2 + 0.5) * self.S
        y = (self.N / 2 - 0.5 - np.asarray(l, dtype=np.float64)) * self.S
        return x, y

    def pixel_of_unit(self, u):
        # Rational form, no trigonometry: x = 2R·Y/(1 − Z), y = 2R·X/(1 − Z). Valid for Z < 1.
        u = np.asarray(u, dtype=np.float64)
        with np.errstate(divide="ignore", invalid="ignore"):
            k = 2.0 * R_MOON_M / (1.0 - u[..., 2])
            return self.pixel_of_xy(k * u[..., 1], k * u[..., 0])

    def pixel_of_latlon(self, lat_deg, lon_deg):
        c = np.radians(90.0 + np.asarray(lat_deg, dtype=np.float64))  # colatitude from the south pole
        lon = np.radians(np.asarray(lon_deg, dtype=np.float64))
        r = 2.0 * R_MOON_M * np.tan(c / 2.0)
        return self.pixel_of_xy(r * np.sin(lon), r * np.cos(lon))

    def latlon_of_pixel(self, s, l):
        x, y = self.xy_of_pixel(s, l)
        r = np.hypot(x, y)
        lat = -90.0 + np.degrees(2.0 * np.arctan(r / (2.0 * R_MOON_M)))
        lon = wrap180(np.degrees(np.arctan2(x, y)))  # at the exact pole (r = 0), lon = 0
        return lat, lon


class CylindricalGrid(Grid):
    """Simple cylindrical raster (SLDEM2015 tiles and per-site crops). §3.2 and §5.3.

    Columns are equally spaced in longitude from ``lon_west_deg360`` eastwards and rows in
    latitude from ``lat_max_deg`` southwards, ``ppd`` pixels per degree.
    """

    kind = "cylindrical"

    def __init__(
        self,
        name: str,
        lat_max_deg: float,
        lon_west_deg360: float,
        ppd: float,
        nrows: int,
        ncols: int,
        data=None,
        to_m: float = 1.0,
        label: PdsLabel | None = None,
    ):
        if data is not None and tuple(data.shape) != (nrows, ncols):
            raise ValueError(f"Grid {name}: data shape {data.shape} is not ({nrows}, {ncols})")
        self.name = name
        self.LATMAX = float(lat_max_deg)
        self.LONW = float(lon_west_deg360)
        self.ppd = float(ppd)
        self.nrows = int(nrows)
        self.ncols = int(ncols)
        self.res_m = R_MOON_M * np.pi / 180.0 / self.ppd
        self.data = data
        self.to_m = float(to_m)
        self.label = label

    def pixel_of_latlon(self, lat_deg, lon_deg):
        # wrap360(lon − LONW) handles crops that cross 0°/360° (06_horizonte.md §6).
        s = np.asarray(wrap360(np.asarray(lon_deg, dtype=np.float64) - self.LONW)) * self.ppd - 0.5
        l = (self.LATMAX - np.asarray(lat_deg, dtype=np.float64)) * self.ppd - 0.5
        return s, l

    def pixel_of_unit(self, u):
        return self.pixel_of_latlon(*latlon_of_unit(u))

    def latlon_of_pixel(self, s, l):
        lon360 = self.LONW + (np.asarray(s, dtype=np.float64) + 0.5) / self.ppd
        lat = self.LATMAX - (np.asarray(l, dtype=np.float64) + 0.5) / self.ppd
        return lat, wrap180(lon360)


class SyntheticGrid(Grid):
    """Relief given by an analytic function of the position, not by a file.

    Used by the synthetic horizon tests (06_horizonte.md §10): the expected value comes
    from a formula worked out by hand.

    ``height_fn(u)`` returns the height in metres for unit vectors ``u[..., 3]`` (shape
    ``u.shape[:-1]``); a non-finite or out-of-range height is "no data". ``valid_fn(u)``,
    optional, returns a boolean mask that limits the extent of the grid.
    """

    kind = "synthetic"

    def __init__(
        self,
        height_fn: Callable[[np.ndarray], np.ndarray],
        valid_fn: Callable[[np.ndarray], np.ndarray] | None = None,
        name: str = "synthetic",
        res_m: float = 0.0,
    ):
        self.name = name
        self.res_m = float(res_m)
        self._height_fn = height_fn
        self._valid_fn = valid_fn

    def height_m(self, u):
        u = np.asarray(u, dtype=np.float64)
        h = np.broadcast_to(np.asarray(self._height_fn(u), dtype=np.float64), u.shape[:-1])
        valid = np.isfinite(h) & (np.abs(h) <= VALID_HEIGHT_ABS_MAX_M)
        if self._valid_fn is not None:
            valid = valid & np.broadcast_to(np.asarray(self._valid_fn(u), dtype=bool), u.shape[:-1])
        return np.where(valid, h, np.nan), valid


def grid_from_label(label: PdsLabel, data=None) -> Grid:
    """Build the Grid a label describes. ``data`` is the raw matrix (or None: geometry only)."""
    name = Path(label.image_file).stem
    proj = label.map_projection_type.upper()
    if proj == "POLAR STEREOGRAPHIC":
        n = label.lines
        centre = n / 2 - 0.5
        if (
            label.line_samples != n
            or label.center_latitude != -90.0
            or label.center_longitude != 0.0
            or label.line_projection_offset != centre
            or label.sample_projection_offset != centre
        ):
            raise LabelError(f"{name}: not a square south polar stereographic image centred on the pole")
        return PolarSouthGrid(name, n, label.map_scale_m, data=data, to_m=label.to_m, label=label)
    if proj == "SIMPLE CYLINDRICAL":
        if label.maximum_latitude is None or label.westernmost_longitude is None:
            raise LabelError(f"{name}: MAXIMUM_LATITUDE or WESTERNMOST_LONGITUDE missing")
        ppd = label.map_resolution
        # The label offsets must agree with §3.2 (pixel centres half a pixel inside the corner).
        exp_sample = (label.center_longitude - label.westernmost_longitude) * ppd - 0.5
        exp_line = (label.maximum_latitude - label.center_latitude) * ppd - 0.5
        if label.sample_projection_offset != exp_sample or label.line_projection_offset != exp_line:
            raise LabelError(
                f"{name}: projection offsets do not match MAXIMUM_LATITUDE / WESTERNMOST_LONGITUDE"
            )
        return CylindricalGrid(
            name,
            label.maximum_latitude,
            label.westernmost_longitude,
            ppd,
            label.lines,
            label.line_samples,
            data=data,
            to_m=label.to_m,
            label=label,
        )
    raise LabelError(f"{name}: unsupported MAP_PROJECTION_TYPE {label.map_projection_type!r}")


def read_pds_image(lbl_path: str | Path, in_memory: bool = False) -> Grid:
    """Open the raster a .LBL describes (the .IMG next to it) as a Grid.

    ``in_memory=False`` maps the file (pages are read on demand); ``True`` loads it whole.
    The file size must be exactly the one the label implies.
    """
    label = parse_label(lbl_path)
    img_path = Path(lbl_path).with_name(label.image_file)
    if not img_path.is_file():
        raise FileNotFoundError(f"Missing data file: {img_path}")
    size = img_path.stat().st_size
    if size != label.image_bytes:
        raise LabelError(f"Size mismatch for {img_path.name}: expected {label.image_bytes}, got {size}.")
    shape = (label.lines, label.line_samples)
    if in_memory:
        data = np.fromfile(img_path, dtype=label.dtype).reshape(shape)
    else:
        data = np.memmap(img_path, dtype=label.dtype, mode="r", shape=shape)
    return grid_from_label(label, data)
