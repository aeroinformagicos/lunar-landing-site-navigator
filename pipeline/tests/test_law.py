# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""T-08 fast tests: radial sampling law and profile reduction.

Expected values come from docs/spec/06_horizonte.md (§2, §3, §8 and the hand calculations of
§10.2 and §10.3), never from the code under test.
"""

import math

import numpy as np
import pytest

from pipeline.horizon.law import (
    AZ_STEP_DEG,
    LAWS,
    MAX_DIST_M,
    N_AZ,
    law_distance,
    law_distances,
    law_n_samples,
)
from pipeline.horizon.profile import (
    PROFILE_BINS,
    PROFILE_NODATA,
    local_xy,
    profile_bin_distance,
    profile_bin_edges,
    reduce_profile,
)

# ---------------------------------------------------------------- law (06 §2, §3)


def test_constants_of_the_mask():
    assert N_AZ == 720
    assert AZ_STEP_DEG == 0.5
    assert N_AZ * AZ_STEP_DEG == 360.0
    assert MAX_DIST_M == 300_000.0


@pytest.mark.parametrize(("law", "n_s", "last_m"), [("full", 3709, 299_878.0), ("fast", 1855, 299_772.0)])
def test_number_of_samples_and_last_distance(law, n_s, last_m):
    assert law_n_samples(law) == n_s
    assert law_distances(law).shape == (n_s,)
    assert law_distance(law, n_s - 1) == pytest.approx(last_m, abs=5.0)


@pytest.mark.parametrize(("law", "n_lin", "g"), [("full", 1000, 1.001), ("fast", 500, 1.002)])
def test_n_s_follows_from_the_300_km_limit(law, n_lin, g):
    # N_S = linear samples + floor(ln 15 / ln g): 2709 and 1355 geometric steps (06 §3).
    steps = math.floor(math.log(15.0) / math.log(g))
    assert steps == {"full": 2709, "fast": 1355}[law]
    assert law_n_samples(law) == n_lin + steps
    d = law_distances(law)
    assert d[-1] <= MAX_DIST_M
    assert d[-1] * g > MAX_DIST_M  # one more step would go beyond 300 km


def test_linear_stretch_values():
    # full: 20, 40, …, 20 000 m (1000 samples); fast: 40, 80, …, 20 000 m (500 samples).
    expected = [20.0, 40.0, 60.0, 9980.0, 10000.0, 20000.0]
    assert [law_distance("full", i) for i in (0, 1, 2, 498, 499, 999)] == expected
    assert [law_distance("fast", i) for i in (0, 1, 249, 499)] == [40.0, 80.0, 10000.0, 20000.0]
    np.testing.assert_array_equal(law_distances("full")[:1000], 20.0 * np.arange(1, 1001))
    np.testing.assert_array_equal(law_distances("fast")[:500], 40.0 * np.arange(1, 501))


def test_geometric_stretch_values():
    # 20 000 · 1.001^n, n = 1 … 2709; 20 000 · 1.002^n, n = 1 … 1355.
    assert law_distance("full", 1000) == pytest.approx(20_020.0, abs=1e-9)
    assert law_distance("full", 1001) == pytest.approx(20_040.02, abs=1e-9)
    assert law_distance("fast", 500) == pytest.approx(20_040.0, abs=1e-9)
    # 06 §10.2: the sample nearest to 50 km is n = 917, at 50 012.6 m.
    assert law_distance("full", 999 + 917) == pytest.approx(50_012.6, abs=0.05)
    assert law_distance("full", 999 + 916) < 50_000.0 < law_distance("full", 999 + 917)
    # Far away the step is 0.1 % (full) or 0.2 % (fast) of the distance.
    for law, g in (("full", 1.001), ("fast", 1.002)):
        d = law_distances(law)
        n_lin = LAWS[law].n_lin
        np.testing.assert_allclose(d[n_lin:] / d[n_lin - 1 : -1], g, rtol=1e-12)


@pytest.mark.parametrize("law", ["full", "fast"])
def test_distances_increase_and_match_the_scalar_form(law):
    d = law_distances(law)
    assert d.dtype == np.float64
    assert np.all(np.diff(d) > 0)
    assert all(d[i] == law_distance(law, i) for i in range(d.size))  # bit for bit
    assert not d.flags.writeable


def test_law_errors():
    with pytest.raises(ValueError, match="Unknown sampling law"):
        law_distance("medium", 0)
    with pytest.raises(ValueError):
        law_n_samples("")
    for law, n_s in (("full", 3709), ("fast", 1855)):
        with pytest.raises(IndexError):
            law_distance(law, n_s)
        with pytest.raises(IndexError):
            law_distance(law, -1)


# ---------------------------------------------------------------- profile reduction (06 §8)


def reduce_profile_literal(h, el, valid):
    """The pseudocode of 06 §8, line by line (one ray)."""
    n_s = len(h)
    out = np.empty(512, dtype=np.int16)
    for b in range(512):
        i_lo = math.ceil(b * n_s / 512)
        i_hi = math.ceil((b + 1) * n_s / 512) - 1
        candidates = [i for i in range(i_lo, i_hi + 1) if valid[i]]
        if not candidates:
            out[b] = -32768
        else:
            best = max(candidates, key=lambda i: el[i])  # first maximum
            out[b] = min(max(round(h[best]), -32767), 32767)
    return out


@pytest.mark.parametrize(("n_s", "sizes"), [(3709, {7, 8}), (1855, {3, 4})])
def test_bins_cover_every_sample_once(n_s, sizes):
    i_lo, i_hi = profile_bin_edges(n_s)
    assert PROFILE_BINS == 512
    assert i_lo.shape == i_hi.shape == (512,)
    assert i_lo[0] == 0 and i_hi[-1] == n_s - 1
    np.testing.assert_array_equal(i_lo[1:], i_hi[:-1] + 1)
    assert set((i_hi - i_lo + 1).tolist()) == sizes  # full: 7 or 8 samples per bin (06 §8)
    for b in (0, 1, 2, 255, 256, 510, 511):
        assert i_lo[b] == math.ceil(b * n_s / 512)
        assert i_hi[b] == math.ceil((b + 1) * n_s / 512) - 1


def test_profile_bin_distance():
    # full, b = 0: samples 0..7, middle sample 3 -> 80 m. b = 1: samples 8..14, middle 11 -> 240 m.
    assert profile_bin_distance("full", 0) == 80.0
    assert profile_bin_distance("full", 1) == 240.0
    # fast, b = 0: samples 0..3, middle 1 -> 80 m.
    assert profile_bin_distance("fast", 0) == 80.0
    # full, b = 511: samples 3702..3708, middle 3705 = 20 000 · 1.001^2706.
    assert profile_bin_distance("full", 511) == pytest.approx(20_000.0 * 1.001**2706, rel=1e-12)
    d = [profile_bin_distance("full", b) for b in range(512)]
    assert all(b > a for a, b in zip(d, d[1:], strict=False))
    with pytest.raises(IndexError):
        profile_bin_distance("full", 512)


@pytest.mark.parametrize("n_s", [3709, 1855])
def test_reduce_profile_matches_the_literal_pseudocode(n_s):
    rng = np.random.default_rng(8)
    h = rng.uniform(-9000.0, 11000.0, (6, n_s))
    el = rng.uniform(-0.1, 0.5, (6, n_s))
    valid = rng.random((6, n_s)) > 0.3
    valid[1] = True
    valid[2, 500:] = False  # truncated ray
    valid[3] = False  # empty ray
    el[4] = np.round(el[4], 1)  # many ties: the nearest sample wins
    h[~valid] = np.nan
    out = reduce_profile(h, el, valid)
    assert out.dtype == np.int16 and out.shape == (6, 512)
    for r in range(6):
        np.testing.assert_array_equal(out[r], reduce_profile_literal(h[r], el[r], valid[r]))
        np.testing.assert_array_equal(reduce_profile(h[r], el[r], valid[r]), out[r])  # one ray alone
    assert np.all(out[3] == PROFILE_NODATA)
    assert np.all(out[1] != PROFILE_NODATA)


def test_reduce_profile_keeps_the_sample_of_greatest_elevation_and_clamps():
    n_s = 3709
    h = np.zeros(n_s)
    el = np.zeros(n_s)
    valid = np.ones(n_s, dtype=bool)
    # Bin 0 holds samples 0..7: the greatest elevation is at sample 5.
    h[:8] = [10.4, 20.0, 30.0, 40.0, 50.0, 1234.6, 70.0, 80.0]
    el[:8] = [0.1, 0.2, 0.3, 0.2, 0.1, 0.9, 0.0, -0.5]
    # Bin 1 holds samples 8..14: the best one is not valid, so the next best is kept.
    h[8:15] = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0]
    el[8:15] = [0.0, 0.9, 0.5, 0.0, 0.0, 0.0, 0.0]
    valid[9] = False
    # Bin 2 (samples 15..21) and bin 3 (22..28): heights beyond the int16 range are clamped.
    h[15:22] = 40_000.0
    h[22:29] = -40_000.0
    # Bin 4 (samples 29..36) has no valid sample.
    valid[29:37] = False
    out = reduce_profile(h, el, valid)
    assert out[:5].tolist() == [1235, 3, 32767, -32767, -32768]
    assert np.all(out[5:] == 0)


def test_reduce_profile_needs_512_samples():
    with pytest.raises(ValueError):
        reduce_profile(np.zeros(100), np.zeros(100), np.ones(100, dtype=bool))


def test_local_xy_hand_values():
    # 06 §10.3: rim at 10 000 m, 500 m high, observer 2 m above a site at height 0.
    x, y = local_xy(10_000.0, 500.0, 0.0, 2.0)
    assert x == pytest.approx(10_002.82, abs=0.01)
    assert y == pytest.approx(469.213, abs=0.001)
    assert math.degrees(math.atan2(y, x)) == pytest.approx(2.6857, abs=0.0001)
    # 06 §10.2: 3 km mountain at 50 km, observer at 0 m.
    x, y = local_xy(50_000.0, 3000.0, 0.0, 0.0)
    assert x == pytest.approx(50_079.4, abs=0.05)
    assert y == pytest.approx(2279.3, abs=0.05)
    # Arrays: the smooth sphere falls away (curvature) and the eye is the origin.
    x, y = local_xy(np.array([0.0, 100_000.0]), np.zeros(2), 0.0, 0.0)
    assert x[0] == 0.0 and y[0] == 0.0
    assert y[1] == pytest.approx(-(100_000.0**2) / (2 * 1_737_400.0), rel=1e-3)  # ≈ −d²/2R
