# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""T-01 trivial tests: the toolchain imports and the kernels are where expected."""

from pathlib import Path

import pytest

from pipeline.tests.conftest import KERNELS


def test_core_dependencies_import():
    import jsonschema  # noqa: F401
    import numpy as np
    import PIL  # noqa: F401
    import spiceypy

    assert np.float64(1737.4) * 2 == 3474.8
    assert spiceypy.tkvrsn("TOOLKIT").startswith("CSPICE")


def test_contract_version_is_semver():
    version = (Path(__file__).resolve().parents[2] / "contract" / "VERSION").read_text().strip()
    assert version == "1.0.0"


@pytest.mark.kernels
def test_kernels_have_exact_sizes(kernels_dir):
    for name, size in KERNELS.items():
        assert (kernels_dir / name).stat().st_size == size, name
