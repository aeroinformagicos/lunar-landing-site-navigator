# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Crossings, events and windows (07_visibilidad.md §6; eclipse events of §9). Times in Unix seconds.

Same algorithm and the same operations, in the same order, as web/src/core/events.ts (07 §12).
"""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass
from typing import TypedDict

from pipeline.ephem.interp import EphemerisTable, SiteFrame, find_segment
from pipeline.vis.eclipse import eclipse_margin_fns
from pipeline.vis.sky import Mask, margins

# Scan step of the crossing search, seconds (07 §6.1). Windows shorter than 10 min are ignored on
# purpose.
SCAN_STEP_S = 600

EVENT_KINDS = (
    "sunrise", "sunset", "earthrise", "earthset",
    "eclipse_start", "eclipse_end", "totality_start", "totality_end",
)


class Crossing(TypedDict):
    t: int  # Unix seconds, rounded to the second
    rising: bool  # the condition starts to hold (the margin goes from <= 0 to > 0)


@dataclass(frozen=True)
class SkyEvent:
    t_unix: int
    kind: str  # one of EVENT_KINDS


@dataclass(frozen=True)
class Window:
    start_unix: float
    end_unix: float
    open_start: bool  # the window continues before the analysed interval
    open_end: bool  # … or after it


def _round_half_up(x: float) -> int:
    """Rounding of 07 §12.7: floor(x + 0.5)."""
    return math.floor(x + 0.5)


def find_crossings(
    f: Callable[[float], float], t_a: float, t_b: float, step: float = SCAN_STEP_S, first: bool = False
) -> tuple[list[Crossing], bool]:
    """Sign changes of ``f`` (positive = the condition holds) in [``t_a``, ``t_b``] (07 §6.1).

    The interval is scanned every ``step`` seconds and each change is bisected down to 1 s.
    ``first = True`` stops at the first crossing (the countdowns of 07 §7, like ``findCrossings``).
    Returns the crossings, in time order, and the initial state ``f(t_a) > 0``.
    """
    out: list[Crossing] = []
    t0 = t_a
    m0 = f(t0)
    initial_state = m0 > 0
    while t0 < t_b:
        t1 = min(t0 + step, t_b)
        m1 = f(t1)
        if (m0 > 0) != (m1 > 0):
            lo, hi, up = t0, t1, m1 > 0  # up: the condition starts to hold
            while hi - lo > 1:
                mid = (lo + hi) / 2
                if (f(mid) > 0) == up:
                    hi = mid
                else:
                    lo = mid
            out.append({"t": _round_half_up((lo + hi) / 2), "rising": up})
            if first:
                break
        t0 = t1
        m0 = m1
    return out, initial_state


def windows_from(crossings: list[Crossing], initial_state: bool, t_a: float, t_b: float) -> list[Window]:
    """Windows where the condition holds, from its crossings (07 §6.3)."""
    ws: list[Window] = []
    start = t_a if initial_state else None
    open_start = initial_state
    for c in crossings:
        if c["rising"] and start is None:
            start = c["t"]
            open_start = False
        if not c["rising"] and start is not None:
            ws.append(Window(start, c["t"], open_start, False))
            start = None
    if start is not None:
        ws.append(Window(start, t_b, open_start, True))
    return ws


def intersect_windows(a: list[Window], b: list[Window]) -> list[Window]:
    """Intersection of two sorted, non-overlapping window lists (Sun and Earth → both, 07 §6.3)."""
    out: list[Window] = []
    i = j = 0
    while i < len(a) and j < len(b):
        s = max(a[i].start_unix, b[j].start_unix)
        e = min(a[i].end_unix, b[j].end_unix)
        if s < e:
            # Open at an end only if every window that sets that end is open there.
            out.append(Window(
                s, e,
                (a[i].open_start if s == a[i].start_unix else True)
                and (b[j].open_start if s == b[j].start_unix else True),
                (a[i].open_end if e == a[i].end_unix else True)
                and (b[j].open_end if e == b[j].end_unix else True),
            ))
        if a[i].end_unix < b[j].end_unix:
            i += 1
        else:
            j += 1
    return out


def complement_windows(ws: list[Window], t_a: float, t_b: float) -> list[Window]:
    """Complement of sorted windows inside [``t_a``, ``t_b``] (nights = complement of the Sun windows)."""
    out: list[Window] = []
    cursor = t_a
    cursor_open = True
    for w in ws:
        if w.start_unix > cursor:
            out.append(Window(cursor, w.start_unix, cursor_open, False))
        cursor = max(cursor, w.end_unix)
        cursor_open = False
    if cursor < t_b:
        out.append(Window(cursor, t_b, cursor_open, True))
    return out


def window_hours(ws: list[Window]) -> float:
    """Total length of the windows, hours."""
    s = 0.0
    for w in ws:
        s += w.end_unix - w.start_unix
    return s / 3600


def longest_hours(ws: list[Window]) -> float:
    """Longest window, hours (0 if there is none)."""
    m = 0.0
    for w in ws:
        m = max(m, w.end_unix - w.start_unix)
    return m / 3600


def sun_margin_fn(table: EphemerisTable, frame: SiteFrame, mask: Mask) -> Callable[[float], float]:
    return lambda t: margins(table, frame, mask, t).sun


def earth_margin_fn(table: EphemerisTable, frame: SiteFrame, mask: Mask) -> Callable[[float], float]:
    return lambda t: margins(table, frame, mask, t).earth


# ---- Eclipses (07 §9): searched with the same crossings over the displayed interval ----


@dataclass(frozen=True)
class EclipseTimeline:
    events: list[SkyEvent]
    windows: list[Window]  # any part of the Sun covered
    totality: list[Window]  # the Sun fully covered


def eclipse_timeline(table: EphemerisTable, frame: SiteFrame, t_a: float, t_b: float) -> EclipseTimeline:
    """Eclipse events and windows in [``t_a``, ``t_b``], clipped to the table segment (07 §9)."""
    seg = find_segment(table, t_a) or find_segment(table, t_b)
    if seg is None:
        return EclipseTimeline([], [], [])
    a = max(t_a, seg.valid_from_unix)
    b = min(t_b, seg.valid_to_unix)
    if b <= a:
        return EclipseTimeline([], [], [])
    f_eclipse, f_totality = eclipse_margin_fns(table, frame)
    e, e_initial = find_crossings(f_eclipse, a, b)
    tot, tot_initial = find_crossings(f_totality, a, b)
    events = [SkyEvent(c["t"], "eclipse_start" if c["rising"] else "eclipse_end") for c in e]
    events += [SkyEvent(c["t"], "totality_start" if c["rising"] else "totality_end") for c in tot]
    events.sort(key=lambda ev: ev.t_unix)  # stable, like Array.prototype.sort
    return EclipseTimeline(
        events, windows_from(e, e_initial, a, b), windows_from(tot, tot_initial, a, b)
    )


def find_events(
    table: EphemerisTable, frame: SiteFrame, mask: Mask, t_a: float, t_b: float
) -> list[SkyEvent]:
    """Sunrise/sunset, Earthrise/Earthset and eclipse events in [``t_a``, ``t_b``], by time (07 §6.2)."""
    sun, _ = find_crossings(sun_margin_fn(table, frame, mask), t_a, t_b)
    earth, _ = find_crossings(earth_margin_fn(table, frame, mask), t_a, t_b)
    events = [SkyEvent(c["t"], "sunrise" if c["rising"] else "sunset") for c in sun]
    events += [SkyEvent(c["t"], "earthrise" if c["rising"] else "earthset") for c in earth]
    events += eclipse_timeline(table, frame, t_a, t_b).events
    events.sort(key=lambda ev: ev.t_unix)
    return events
