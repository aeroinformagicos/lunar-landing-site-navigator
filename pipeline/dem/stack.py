# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""``DemStack``: relief sources by priority, and the four stacks of the project.

docs/spec/03_datos_y_fuentes.md §7. The stack is chosen by the ``relief`` field of the site.
The ``label`` texts are the only ones allowed for ``relief_label`` in the contract
(09_contrato_datos.md §4): every result shows the relief it used.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

from pipeline.common.constants import R_MOON_M
from pipeline.dem.crop import load_crop
from pipeline.dem.grids import Grid, read_pds_image

# The five relief_label texts (exact).
LABEL_LOLA_POLAR_40_120 = "LOLA polar 40 m + 120 m"
LABEL_LOLA_POLAR_120 = "LOLA polar 120 m"
LABEL_LOLA_120 = "LOLA 120 m"
LABEL_SLDEM2015 = "SLDEM2015 59 m"
LABEL_SMOOTH = "Smooth Moon (no terrain)"
RELIEF_LABELS = (LABEL_LOLA_POLAR_40_120, LABEL_LOLA_POLAR_120, LABEL_LOLA_120, LABEL_SLDEM2015, LABEL_SMOOTH)

RELIEF_KINDS = ("lola_polar", "lola_60s", "sldem2015", "smooth")

# LOLA polar products (03 §4.1) and their half sides N·S/2 (03 §3.1).
P1_NAME = "LDEM_80S_40M"
P2_NAME = "LDEM_75S_120M"
P3_NAME = "LDEM_60S_120M"
P1_HALF_SIDE_M = 304_000.0  # 15200 px · 40 m / 2
P2_HALF_SIDE_M = 457_440.0  # 7624 px · 120 m / 2
MAX_DIST_M = 300_000.0  # reach of the horizon rays (06_horizonte.md §2)


class DemDataMissing(FileNotFoundError):
    """A file the stack needs is not in the data directory."""


@dataclass
class DemStack:
    """Grids in priority order. Each sample comes whole from the first grid that covers it."""

    grids: list[Grid]
    label: str  # text the user will see

    def height_m(self, u):
        """Height (m) at unit vector(s) ``u[..., 3]``. Returns (h, valid, grid_index).

        ``grid_index`` is the position in ``grids`` of the grid used, or -1 where no grid
        gives a valid value (then ``h`` is NaN).
        """
        u = np.asarray(u, dtype=np.float64)
        single = u.ndim == 1
        if single:
            u = u[None, :]
        shape = u.shape[:-1]
        h = np.full(shape, np.nan)
        grid_index = np.full(shape, -1, dtype=np.int8)
        for i, grid in enumerate(self.grids):
            pending = grid_index < 0
            if not pending.any():
                break
            hi, ok = grid.height_m(u[pending])
            sub = np.where(ok, i, -1).astype(np.int8)
            h[pending] = hi
            grid_index[pending] = sub
        valid = grid_index >= 0
        if single:
            return float(h[0]), bool(valid[0]), int(grid_index[0])
        return h, valid, grid_index


def polar_xy_m(lat_deg: float, lon_deg: float) -> tuple[float, float]:
    """South polar stereographic map coordinates (metres) of a point: x towards 90 E, y towards 0 E."""
    r = 2.0 * R_MOON_M * np.tan(np.radians(90.0 + lat_deg) / 2.0)
    return float(r * np.sin(np.radians(lon_deg))), float(r * np.cos(np.radians(lon_deg)))


def lola_polar_plan(lat_deg: float, lon_deg: float) -> tuple[bool, str]:
    """For a ``lola_polar`` site: (whether P3 joins the stack, relief label).

    P3 is added only if max(|x|, |y|) of the site + 300 km goes beyond the P2 square; the label
    says 40 m only if the site itself falls inside P1.
    """
    x, y = polar_xy_m(lat_deg, lon_deg)
    reach = max(abs(x), abs(y))
    needs_p3 = reach + MAX_DIST_M > P2_HALF_SIDE_M
    label = LABEL_LOLA_POLAR_40_120 if reach <= P1_HALF_SIDE_M else LABEL_LOLA_POLAR_120
    return needs_p3, label


def _open_lola(data_dir: Path, name: str, in_memory: bool) -> Grid:
    lbl = Path(data_dir) / "raw" / "lola" / f"{name}.LBL"
    img = lbl.with_suffix(".IMG")
    if not lbl.is_file() or not img.is_file():
        raise DemDataMissing(f"Missing {name}.IMG or its .LBL in {lbl.parent}; run make data-fetch")
    return read_pds_image(lbl, in_memory=in_memory)


def lola_polar_stack(
    data_dir: str | Path, lat_deg: float | None = None, lon_deg: float | None = None, in_memory: bool = False
) -> DemStack:
    """P1 + P2 (+ P3 if the site needs it). Without coordinates: the stack of the map mesh (no P3).

    ``in_memory`` loads P1 and P2 whole (580 MB); P3 is always memory-mapped.
    """
    data_dir = Path(data_dir)
    needs_p3, label = (
        (False, LABEL_LOLA_POLAR_40_120) if lat_deg is None else lola_polar_plan(lat_deg, lon_deg)
    )
    grids = [_open_lola(data_dir, P1_NAME, in_memory), _open_lola(data_dir, P2_NAME, in_memory)]
    if needs_p3:
        grids.append(_open_lola(data_dir, P3_NAME, False))
    return DemStack(grids, label)


def lola_60s_stack(data_dir: str | Path) -> DemStack:
    """P3 alone, for sites with -75° < latitude <= -60°."""
    return DemStack([_open_lola(Path(data_dir), P3_NAME, False)], LABEL_LOLA_120)


def sldem_stack(data_dir: str | Path, site_id: str, in_memory: bool = False) -> DemStack:
    """The SLDEM2015 crop of the site (built by ``pipeline.dem.crop.build_crop``)."""
    try:
        grid = load_crop(data_dir, site_id, in_memory=in_memory)
    except FileNotFoundError as exc:
        raise DemDataMissing(str(exc)) from exc
    return DemStack([grid], LABEL_SLDEM2015)


def stack_for_site(
    relief: str, site_id: str, lat_deg: float, lon_deg: float, data_dir: str | Path, in_memory: bool = False
) -> DemStack | None:
    """The stack for a site according to its ``relief`` field. ``smooth`` gives None (smooth Moon).

    Raises DemDataMissing if a needed file is absent: the batch then publishes the site as smooth.
    """
    if relief == "lola_polar":
        return lola_polar_stack(data_dir, lat_deg, lon_deg, in_memory=in_memory)
    if relief == "lola_60s":
        return lola_60s_stack(data_dir)
    if relief == "sldem2015":
        return sldem_stack(data_dir, site_id, in_memory=in_memory)
    if relief == "smooth":
        return None
    raise ValueError(f"Unknown relief {relief!r}; expected one of {RELIEF_KINDS}")
