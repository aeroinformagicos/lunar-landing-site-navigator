# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Replanning requirements (07_visibilidad.md §8.1–§8.4, F10): ``assess`` (`go`, `marginal` or
`no_go` with checks and reason codes), the site × date matrix row and the next valid landing window.

Same algorithm and the same operations, in the same order, as web/src/core/requirements.ts (07 §12),
including what decision D-82 fixes for the matrix: on the 10-min grid a run of k night samples counts
as k × 10 min, clipped to [i0, i1] with both ends included, and a cell whose mission leaves the table
has no status (None).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, replace

from pipeline.ephem.interp import EphemerisTable, SiteFrame, find_segment
from pipeline.vis.metrics import DAY_S, Metrics, mission_metrics
from pipeline.vis.sky import Mask, SkyState, evaluate, margins

STATUSES = ("go", "marginal", "no_go")
REASONS = (
    "no_sun_at_landing", "no_earth_at_landing", "night_too_long",
    "sun_partly_hidden", "earth_low", "night_near_limit",
)
# Share of the night limit above which a night counts as close to it (07 §8.2).
NIGHT_NEAR_LIMIT = 0.75
# Tolerance of the «whole Sun disc» comparison (07 §8.2).
SUN_FRACTION_EPS = 1e-9


@dataclass(frozen=True)
class Requirements:
    """07 §8.1, with the default values of the plan."""

    need_sun_at_landing: bool = True
    need_earth_at_landing: bool = True
    max_night_hours: float = 24.0
    marginal_earth_margin_deg: float = 1.0
    marginal_sun_fraction: float = 1.0


DEFAULT_REQUIREMENTS = Requirements()


@dataclass(frozen=True)
class Checks:
    sun_at_landing: bool
    earth_at_landing: bool
    night_ok: bool


@dataclass(frozen=True)
class Assessment:
    status: str  # one of STATUSES
    checks: Checks
    longest_night_h: float
    both_pct: float
    reasons: list[str]


def assess(at_landing: SkyState, longest_night_h: float, both_pct: float, req: Requirements) -> Assessment:
    """07 §8.2 with the state at landing (``evaluate(…, landing)``) and two mission metrics.

    Reasons: the failed checks for `no_go`, otherwise the low-margin conditions for `marginal`.
    """
    checks = Checks(
        sun_at_landing=(not req.need_sun_at_landing) or at_landing.sun.visible,
        earth_at_landing=(not req.need_earth_at_landing) or at_landing.earth.visible,
        night_ok=longest_night_h <= req.max_night_hours,
    )
    reasons: list[str] = []
    if not (checks.sun_at_landing and checks.earth_at_landing and checks.night_ok):
        status = "no_go"
        if not checks.sun_at_landing:
            reasons.append("no_sun_at_landing")
        if not checks.earth_at_landing:
            reasons.append("no_earth_at_landing")
        if not checks.night_ok:
            reasons.append("night_too_long")
    else:
        sun_limit = req.marginal_sun_fraction - SUN_FRACTION_EPS
        if req.need_sun_at_landing and at_landing.sun.disc_fraction < sun_limit:
            reasons.append("sun_partly_hidden")
        if req.need_earth_at_landing and at_landing.earth.margin_deg < req.marginal_earth_margin_deg:
            reasons.append("earth_low")
        if longest_night_h > NIGHT_NEAR_LIMIT * req.max_night_hours:
            reasons.append("night_near_limit")
        status = "marginal" if reasons else "go"
    return Assessment(status, checks, longest_night_h, both_pct, reasons)


def assess_scenario(
    table: EphemerisTable,
    frame: SiteFrame,
    mask: Mask,
    landing_unix: float,
    mission_days: float,
    req: Requirements = DEFAULT_REQUIREMENTS,
) -> tuple[Assessment, Metrics]:
    """``assess(scenario, req)`` of 07 §8.2: the state at landing and the exact mission metrics."""
    m = mission_metrics(table, frame, mask, landing_unix, mission_days, landing_unix)
    return assess(evaluate(table, frame, mask, landing_unix), m.longest_night_h, m.both_pct, req), m


# ---- Replanning matrix and next window (07 §8.3, §8.4), on the 10-min grid without bisection ----

# Grid step of the matrix (07 §8.3).
GRID_S = 600
# Columns of the matrix: delays k·Δ for k = 0…30.
MATRIX_COLUMNS = 31
# `next_valid_landing` looks 90 days ahead, landing every hour (07 §8.4).
NEXT_WINDOW_DAYS = 90
HOUR_STEPS = 3600 // GRID_S


def _round(x: float) -> int:
    """``Math.round`` for the non-negative values used here: floor(x + 0.5) (07 §12.7)."""
    return math.floor(x + 0.5)


@dataclass(frozen=True)
class Cell:
    landing_unix: float
    status: str | None  # None when part of the mission falls outside the ephemeris table
    sun_at_landing: bool
    earth_at_landing: bool
    longest_night_h: float
    reasons: list[str]


@dataclass(frozen=True)
class Grid:
    """Sun and Earth visibility (07 §3) on the 10-min grid from ``t0``; None outside the table."""

    t0: float
    sun: list[bool | None]
    earth: list[bool | None]
    nights: list[tuple[int, int]]  # runs of sun == False: [first, last] sample indices (inclusive)


def visibility_grid(table: EphemerisTable, frame: SiteFrame, mask: Mask, t0: float, span_s: float) -> Grid:
    n = math.floor(span_s / GRID_S) + 1
    sun: list[bool | None] = []
    earth: list[bool | None] = []
    for i in range(n):
        t = t0 + i * GRID_S
        if find_segment(table, t) is None:
            sun.append(None)
            earth.append(None)
            continue
        m = margins(table, frame, mask, t)
        sun.append(m.sun > 0)
        earth.append(m.earth > 0)
    nights: list[tuple[int, int]] = []
    i = 0
    while i < n:
        if sun[i] is False:
            start = i
            while i + 1 < n and sun[i + 1] is False:
                i += 1
            nights.append((start, i))
        i += 1
    return Grid(t0, sun, earth, nights)


def longest_night_in(g: Grid, i0: int, i1: int) -> float:
    """Longest night inside samples [i0, i1], hours; a run of k samples counts as k × 10 min (D-82)."""
    best = 0
    for a, b in g.nights:
        if b < i0 or a > i1:
            continue
        best = max(best, min(b, i1) - max(a, i0) + 1)
    return (best * GRID_S) / 3600


def cell_at(
    g: Grid,
    i0: int,
    mission_steps: int,
    req: Requirements,
    table: EphemerisTable,
    frame: SiteFrame,
    mask: Mask,
) -> Cell:
    """07 §8.2 status of a landing at sample ``i0`` with ``mission_steps`` samples of mission."""
    landing_unix = g.t0 + i0 * GRID_S
    i1 = i0 + mission_steps
    complete = i1 < len(g.sun) and all(g.sun[i] is not None for i in range(i0, i1 + 1))
    if not complete:
        return Cell(landing_unix, None, False, False, 0.0, [])
    sun_at_landing = g.sun[i0] is True
    earth_at_landing = g.earth[i0] is True
    longest = longest_night_in(g, i0, i1)
    # Margins for `marginal` with evaluate() only at T[i0] (07 §8.3); visibility from the grid.
    s = evaluate(table, frame, mask, landing_unix)
    at_landing = replace(
        s, sun=replace(s.sun, visible=sun_at_landing), earth=replace(s.earth, visible=earth_at_landing)
    )
    a = assess(at_landing, longest, 0.0, req)
    return Cell(landing_unix, a.status, sun_at_landing, earth_at_landing, longest, a.reasons)


def replan_row(
    table: EphemerisTable,
    frame: SiteFrame,
    mask: Mask,
    t0: float,
    delta_s: float,
    mission_days: float,
    req: Requirements = DEFAULT_REQUIREMENTS,
) -> list[Cell]:
    """One matrix row: 31 landings t0 + k·Δ, each with the mission length D (07 §8.3)."""
    mission_steps = _round((mission_days * DAY_S) / GRID_S)
    step_k = _round(delta_s / GRID_S)
    g = visibility_grid(table, frame, mask, t0, (MATRIX_COLUMNS - 1) * delta_s + mission_days * DAY_S)
    return [cell_at(g, k * step_k, mission_steps, req, table, frame, mask) for k in range(MATRIX_COLUMNS)]


@dataclass(frozen=True)
class LandingWindow:
    start_unix: float
    end_unix: float
    status_at_start: str


def next_valid_landing(
    table: EphemerisTable,
    frame: SiteFrame,
    mask: Mask,
    t0: float,
    mission_days: float,
    req: Requirements = DEFAULT_REQUIREMENTS,
    horizon_days: float = NEXT_WINDOW_DAYS,
) -> LandingWindow | None:
    """First run of hourly landings that are not `no_go`, within 90 days of ``t0`` (07 §8.4)."""
    mission_steps = _round((mission_days * DAY_S) / GRID_S)
    g = visibility_grid(table, frame, mask, t0, (horizon_days + mission_days) * DAY_S)
    last = math.floor((horizon_days * DAY_S) / GRID_S)
    first: Cell | None = None
    i = 0
    while i <= last:
        c = cell_at(g, i, mission_steps, req, table, frame, mask)
        if c.status is not None and c.status != "no_go":
            first = c
            break
        i += HOUR_STEPS
    if first is None:
        return None
    end = first.landing_unix
    i += HOUR_STEPS
    while i <= last:
        c = cell_at(g, i, mission_steps, req, table, frame, mask)
        if c.status is None or c.status == "no_go":
            break
        end = c.landing_unix
        i += HOUR_STEPS
    return LandingWindow(first.landing_unix, end, first.status)
