# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Reduction of the terrain profile of each ray for the section drawing (F12).

docs/spec/06_horizonte.md §8. Each azimuth keeps 512 bins; every bin keeps the height of its
sample of greatest elevation (seen by the 2 m observer), so the drawn silhouette is the one
that fixes the horizon. The blocking point is not taken from here but from the mask.
"""

from __future__ import annotations

import numpy as np

from pipeline.common.constants import R_MOON_M
from pipeline.horizon.law import law_distance, law_n_samples

PROFILE_BINS = 512
PROFILE_NODATA = -32768  # int16 value of an empty bin
PROFILE_HEIGHT_MIN_M = -32767
PROFILE_HEIGHT_MAX_M = 32767


def profile_bin_edges(n_samples: int, n_bins: int = PROFILE_BINS) -> tuple[np.ndarray, np.ndarray]:
    """First and last sample index of every bin.

    ``i_lo = ceil(b·N_S/512)`` and ``i_hi = ceil((b+1)·N_S/512) − 1``.
    """
    if n_samples < n_bins:
        raise ValueError(f"A profile of {n_bins} bins needs at least {n_bins} samples, got {n_samples}")
    b = np.arange(n_bins + 1, dtype=np.int64)
    starts = -((-b * n_samples) // n_bins)  # integer ceil, no floating point
    return starts[:-1], starts[1:] - 1


def profile_bin_distance(law: str, b: int) -> float:
    """Drawing distance of bin ``b``, metres: the law distance of its middle sample."""
    if not 0 <= b < PROFILE_BINS:
        raise IndexError(f"Profile bin {b} outside 0..{PROFILE_BINS - 1}")
    i_lo, i_hi = profile_bin_edges(law_n_samples(law))
    return law_distance(law, int((i_lo[b] + i_hi[b]) // 2))


def reduce_profile(h, el, valid) -> np.ndarray:
    """Reduce ``h[..., N_S]`` (metres) to ``int16[..., 512]``.

    Each bin holds the rounded height of its valid sample of greatest elevation ``el`` (the
    nearest one on a tie), clamped to ±32767 m, or −32768 if the bin has no valid sample.
    """
    h = np.asarray(h, dtype=np.float64)
    valid = np.asarray(valid, dtype=bool)
    el = np.where(valid, np.asarray(el, dtype=np.float64), -np.inf)
    n_samples = h.shape[-1]
    i_lo, i_hi = profile_bin_edges(n_samples)
    counts = i_hi - i_lo + 1
    # Maximum elevation of each bin, spread back over its samples.
    bin_max = np.maximum.reduceat(el, i_lo, axis=-1)
    is_max = valid & (el == np.repeat(bin_max, counts, axis=-1))
    # First sample of each bin that reaches the maximum (n_samples = none).
    idx = np.where(is_max, np.arange(n_samples), n_samples)
    first = np.minimum.reduceat(idx, i_lo, axis=-1)
    empty = first == n_samples
    picked = np.take_along_axis(h, np.where(empty, 0, first), axis=-1)
    with np.errstate(invalid="ignore"):
        metres = np.clip(np.rint(picked), PROFILE_HEIGHT_MIN_M, PROFILE_HEIGHT_MAX_M)
    return np.where(empty, PROFILE_NODATA, metres).astype(np.int16)


def local_xy(d_m, h_m, h_site_m: float, h_obs_m: float):
    """Drawing coordinates in the local vertical plane of the observer, metres.

    ``x`` is horizontal and ``y`` vertical with respect to the eye: lines of sight are straight
    lines through the origin, ``y = x·tan(elevation)``.
    """
    d_m = np.asarray(d_m, dtype=np.float64)
    h_m = np.asarray(h_m, dtype=np.float64)
    theta = d_m / R_MOON_M
    r_t = R_MOON_M + h_m
    x = r_t * np.sin(theta)
    y = (h_m - h_site_m - h_obs_m) - 2.0 * r_t * np.sin(theta / 2.0) ** 2
    if x.ndim == 0:
        return float(x), float(y)
    return x, y
