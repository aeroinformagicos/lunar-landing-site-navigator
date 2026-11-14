# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Metrics of a scenario (07_visibilidad.md §7, §10): hours of Sun, Earth and both, longest night and
link gap, elevation extremes, next events (F6), curves (F5) and the smooth-Moon effect (F4).

Same algorithm and the same operations, in the same order, as web/src/core/metrics.ts (07 §12).
Times in Unix seconds.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass

from pipeline.ephem.interp import (
    OUT_OF_RANGE_MSG,
    EphemerisTable,
    OutOfRange,
    SiteFrame,
    find_segment,
    sky_at,
)
from pipeline.vis.events import (
    SCAN_STEP_S,
    SkyEvent,
    Window,
    complement_windows,
    earth_margin_fn,
    eclipse_timeline,
    find_crossings,
    intersect_windows,
    longest_hours,
    sun_margin_fn,
    window_hours,
    windows_from,
)
from pipeline.vis.sky import Mask, SkyState, evaluate, horizon_at

DAY_S = 86_400
# Countdown search horizon (07 §7, F6): 60 days after the cursor, even past the mission end.
NEXT_EVENT_HORIZON_S = 60 * DAY_S
# Text of the truncation warning (07 §7).
TRUNCATED_WARNING = "Mission extends beyond available ephemeris; results truncated."


@dataclass(frozen=True)
class NextEvent:
    kind: str  # expected kind, also when none is found (`No sunset in the next 60 days`)
    t_unix: int | None  # None when there is none within 60 days (or before the end of the table)


@dataclass(frozen=True)
class MissionWindows:
    sun: list[Window]
    earth: list[Window]
    both: list[Window]
    nights: list[Window]
    link_gaps: list[Window]


@dataclass(frozen=True)
class Metrics:
    t_a: float
    t_b: float  # clipped to the end of the table segment (``truncated``)
    truncated: bool
    now: SkyState | None  # state at the cursor, None if the cursor is outside the table
    sun_hours: float
    earth_hours: float
    both_hours: float
    sun_pct: float
    earth_pct: float
    both_pct: float
    longest_night_h: float
    longest_link_gap_h: float
    sun_el_max_deg: float
    sun_el_min_deg: float
    next_sun_event: NextEvent | None
    next_earth_event: NextEvent | None
    windows: MissionWindows
    events: list[SkyEvent]


def mission_interval(
    table: EphemerisTable, landing_unix: float, mission_days: float
) -> tuple[float, float, bool]:
    """Mission interval ``(t_a, t_b, truncated)`` clipped to the table segment of the landing.

    Raises :class:`OutOfRange` if the landing is outside the table (07 §10).
    """
    t_a = landing_unix
    seg = find_segment(table, t_a)
    if seg is None:
        raise OutOfRange(OUT_OF_RANGE_MSG)
    end = t_a + mission_days * DAY_S
    if end > seg.valid_to_unix:
        return t_a, seg.valid_to_unix, True
    return t_a, end, False


def next_event(
    f: Callable[[float], float], table: EphemerisTable, t: float, kinds: tuple[str, str]
) -> NextEvent | None:
    """Next set (if the condition holds at ``t``) or rise, within 60 days and the table segment.

    ``kinds`` is ``(rise, set)``. None if ``t`` is outside the table.
    """
    seg = find_segment(table, t)
    if seg is None:
        return None
    t_b = min(t + NEXT_EVENT_HORIZON_S, seg.valid_to_unix)
    crossings, initial_state = find_crossings(f, t, t_b, SCAN_STEP_S, True)
    kind = kinds[1] if initial_state else kinds[0]
    return NextEvent(kind, crossings[0]["t"] if crossings else None)


def mission_metrics(
    table: EphemerisTable,
    frame: SiteFrame,
    mask: Mask,
    landing_unix: float,
    mission_days: float,
    cursor_unix: float,
) -> Metrics:
    """All §7 metrics of a mission with a mask; ``cursor_unix`` drives the state and the countdowns."""
    t_a, t_b, truncated = mission_interval(table, landing_unix, mission_days)
    sun_f = sun_margin_fn(table, frame, mask)
    earth_f = earth_margin_fn(table, frame, mask)
    sun_c, sun_initial = find_crossings(sun_f, t_a, t_b)
    earth_c, earth_initial = find_crossings(earth_f, t_a, t_b)
    sun = windows_from(sun_c, sun_initial, t_a, t_b)
    earth = windows_from(earth_c, earth_initial, t_a, t_b)
    both = intersect_windows(sun, earth)
    nights = complement_windows(sun, t_a, t_b)
    link_gaps = complement_windows(earth, t_a, t_b)

    # Elevation extremes on the 10-min grid: t_a, t_a + 600, …, and t_b (the scan grid of 07 §6.1).
    el_max = -math.inf
    el_min = math.inf
    t = t_a
    while True:
        el = sky_at(table, frame, t)["sun"]["el_deg"]
        if el > el_max:
            el_max = el
        if el < el_min:
            el_min = el
        if t >= t_b:
            break
        t = min(t + SCAN_STEP_S, t_b)

    hours = (t_b - t_a) / 3600

    def pct(h: float) -> float:
        return (h / hours) * 100 if hours > 0 else 0.0

    sun_hours = window_hours(sun)
    earth_hours = window_hours(earth)
    both_hours = window_hours(both)
    in_table = find_segment(table, cursor_unix) is not None

    events = [SkyEvent(c["t"], "sunrise" if c["rising"] else "sunset") for c in sun_c]
    events += [SkyEvent(c["t"], "earthrise" if c["rising"] else "earthset") for c in earth_c]
    events += eclipse_timeline(table, frame, t_a, t_b).events
    events.sort(key=lambda ev: ev.t_unix)  # stable, like Array.prototype.sort

    return Metrics(
        t_a=t_a,
        t_b=t_b,
        truncated=truncated,
        now=evaluate(table, frame, mask, cursor_unix) if in_table else None,
        sun_hours=sun_hours,
        earth_hours=earth_hours,
        both_hours=both_hours,
        sun_pct=pct(sun_hours),
        earth_pct=pct(earth_hours),
        both_pct=pct(both_hours),
        longest_night_h=longest_hours(nights),
        longest_link_gap_h=longest_hours(link_gaps),
        sun_el_max_deg=el_max,
        sun_el_min_deg=el_min,
        next_sun_event=next_event(sun_f, table, cursor_unix, ("sunrise", "sunset")),
        next_earth_event=next_event(earth_f, table, cursor_unix, ("earthrise", "earthset")),
        windows=MissionWindows(sun, earth, both, nights, link_gaps),
        events=events,
    )


@dataclass(frozen=True)
class Curves:
    t: list[float]
    sun_el_deg: list[float]
    sun_horizon_deg: list[float]
    earth_el_deg: list[float]
    earth_horizon_deg: list[float]


def curves(
    table: EphemerisTable, frame: SiteFrame, mask: Mask, t_a: float, t_b: float, step: float = SCAN_STEP_S
) -> Curves:
    """Elevation of the Sun and the Earth and the horizon at their azimuth on the 10-min grid of
    [``t_a``, ``t_b``] (F5). Instants outside the table are NaN (the chart leaves a gap)."""
    n = max(1, math.ceil((t_b - t_a) / step) + 1)
    c = Curves([], [], [], [], [])
    for i in range(n):
        t = min(t_a + i * step, t_b)
        c.t.append(t)
        if find_segment(table, t) is None:
            for v in (c.sun_el_deg, c.sun_horizon_deg, c.earth_el_deg, c.earth_horizon_deg):
                v.append(math.nan)
            continue
        s = sky_at(table, frame, t)
        c.sun_el_deg.append(s["sun"]["el_deg"])
        c.sun_horizon_deg.append(horizon_at(mask.el, s["sun"]["az_deg"]))
        c.earth_el_deg.append(s["earth"]["el_deg"])
        c.earth_horizon_deg.append(horizon_at(mask.el, s["earth"]["az_deg"]))
    return c


@dataclass(frozen=True)
class TerrainEffect:
    d_sun_hours: float  # real − smooth, hours
    d_earth_hours: float
    first_sun_event_shift_s: float | None  # real − smooth, seconds; None if not comparable


def terrain_effect(real: Metrics, smooth: Metrics) -> TerrainEffect:
    """F4: the same metrics with the real and the smooth mask, same frame (07 §7). The first solar
    event is comparable only when both runs have one and it is of the same kind."""

    def first(m: Metrics) -> SkyEvent | None:
        return next((e for e in m.events if e.kind in ("sunrise", "sunset")), None)

    r = first(real)
    s = first(smooth)
    return TerrainEffect(
        d_sun_hours=real.sun_hours - smooth.sun_hours,
        d_earth_hours=real.earth_hours - smooth.earth_hours,
        first_sun_event_shift_s=r.t_unix - s.t_unix if r and s and r.kind == s.kind else None,
    )
