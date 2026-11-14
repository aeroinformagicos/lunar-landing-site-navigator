# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Radial sampling law of the horizon rays.

docs/spec/06_horizonte.md §2 and §3. Distances are measured on the reference sphere and are
the same for every site and azimuth. The law is a closed form, so that Python and TypeScript
obtain the same values: a linear stretch up to 20 km followed by a geometric one up to ~300 km.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from functools import cache

import numpy as np

from pipeline.dem.stack import MAX_DIST_M

# Mask sampling in azimuth: one value every 0.5 degrees (06 §2).
N_AZ = 720
AZ_STEP_DEG = 0.5


@dataclass(frozen=True)
class Law:
    """Parameters of one sampling law (06 §2, decision D-07)."""

    name: str
    d0_m: float  # step of the linear stretch, metres
    n_lin: int  # samples of the linear stretch
    g: float  # ratio of the geometric stretch
    n_samples: int  # N_S

    @property
    def lin_end_m(self) -> float:
        """Last distance of the linear stretch (20 000 m in both laws)."""
        return self.d0_m * self.n_lin


LAWS = {
    "full": Law("full", d0_m=20.0, n_lin=1000, g=1.001, n_samples=3709),
    "fast": Law("fast", d0_m=40.0, n_lin=500, g=1.002, n_samples=1855),
}

__all__ = [
    "AZ_STEP_DEG",
    "LAWS",
    "MAX_DIST_M",
    "N_AZ",
    "Law",
    "law_distance",
    "law_distances",
    "law_n_samples",
    "law_params",
]


def law_params(law: str) -> Law:
    try:
        return LAWS[law]
    except KeyError:
        raise ValueError(f"Unknown sampling law {law!r}; expected 'full' or 'fast'") from None


def law_n_samples(law: str) -> int:
    """N_S: 3709 for ``full``, 1855 for ``fast``."""
    return law_params(law).n_samples


def law_distance(law: str, i: int) -> float:
    """Distance in metres of sample ``i`` (0 … N_S − 1). Literal closed form of 06 §3."""
    p = law_params(law)
    if not 0 <= i < p.n_samples:
        raise IndexError(f"Sample index {i} outside 0..{p.n_samples - 1} for law {law!r}")
    if i < p.n_lin:
        return p.d0_m * (i + 1)
    return p.lin_end_m * math.pow(p.g, i - (p.n_lin - 1))


@cache
def law_distances(law: str) -> np.ndarray:
    """All N_S distances (metres, float64, read-only). Built from :func:`law_distance`."""
    n = law_n_samples(law)
    d = np.array([law_distance(law, i) for i in range(n)], dtype=np.float64)
    d.setflags(write=False)
    return d
