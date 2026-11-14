# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Ranking of candidate sites for a landing date and a duration (07_visibilidad.md §8.5).

Same order as web/src/core/ranking.ts (07 §12): status (go, marginal, no_go), both_pct descending,
longest_night_h ascending, sun_pct descending, site_id ascending; both_pct and longest_night_h compare
rounded to 0.1 so that Python and TypeScript agree.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from pipeline.vis.requirements import Assessment

STATUS_ORDER = {"go": 0, "marginal": 1, "no_go": 2}


@dataclass(frozen=True)
class RankRow:
    site_id: str
    name: str
    assessment: Assessment
    sun_pct: float
    earth_pct: float


def tenth(x: float) -> float:
    """Rounded to 0.1, half up (07 §8.5, §12.7)."""
    return math.floor(x * 10 + 0.5) / 10


def rank_key(r: RankRow) -> tuple:
    return (
        STATUS_ORDER[r.assessment.status],
        -tenth(r.assessment.both_pct),
        tenth(r.assessment.longest_night_h),
        -r.sun_pct,
        r.site_id,
    )


def rank_candidates(rows: list[RankRow]) -> list[RankRow]:
    """Rows in ranking order (a new list; the sort is stable and total)."""
    return sorted(rows, key=rank_key)


def best_alternative(ranked: list[RankRow], current_site_id: str) -> RankRow | None:
    """The alternative the interface proposes: first row other than the current site with `go`,
    otherwise `marginal`; None if there is neither."""
    others = [r for r in ranked if r.site_id != current_site_id]
    for status in ("go", "marginal"):
        for r in others:
            if r.assessment.status == status:
                return r
    return None
