# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Shared pytest fixtures and marker handling.

Markers (docs/spec/11_validacion.md §1):
- ``kernels``: needs the four SPICE kernels. Skipped locally if missing; with
  ``LLSN_REQUIRE_KERNELS=1`` (CI) a missing kernel is a failure, not a skip.
- ``data``: needs downloaded DEMs. ``slow``: needs the cube.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]

# docs/spec/03_datos_y_fuentes.md §10.1, rows 1-4: file name -> exact size in bytes.
KERNELS = {
    "naif0012.tls": 5_257,
    "de440.bsp": 119_799_808,
    "moon_pa_de440_200625.bpc": 12_863_488,
    "moon_de440_250416.tf": 19_478,
}

KERNELS_SKIP_MSG = "SPICE kernels not found; run make data-fetch"


def data_dir() -> Path:
    """Data root: $LLSN_DATA_DIR if set, else ./data (docs/decisions.md D-44)."""
    env = os.environ.get("LLSN_DATA_DIR")
    return Path(env) if env else REPO_ROOT / "data"


def kernels_present() -> bool:
    kdir = data_dir() / "kernels"
    return all((kdir / name).is_file() and (kdir / name).stat().st_size == size
               for name, size in KERNELS.items())


@pytest.fixture(scope="session")
def llsn_data_dir() -> Path:
    return data_dir()


@pytest.fixture(scope="session")
def kernels_dir() -> Path:
    return data_dir() / "kernels"


@pytest.fixture(scope="session")
def require_data(llsn_data_dir):
    """Return ``path(relative)``: the file inside the data directory, or skip the test if it is missing."""

    def path(relative: str) -> Path:
        full = llsn_data_dir / relative
        if not full.is_file():
            pytest.skip(f"data file not found: {relative}; run make data-fetch")
        return full

    return path


# Light origin published with the web (real ephemeris table since T-06, real masks since T-21) and
# the synthetic examples of the contract (09_contrato_datos.md §13), which are always present.
WEB_DATA = REPO_ROOT / "web" / "public" / "data"
EXAMPLE_DATA = REPO_ROOT / "contract" / "examples" / "data"

REAL_TABLE_SKIP_MSG = "real table not published: make ephem"


def real_table_present() -> bool:
    meta = WEB_DATA / "ephemeris.meta.json"
    return meta.is_file() and json.loads(meta.read_text(encoding="utf-8")).get("synthetic") is False


@pytest.fixture(scope="session")
def real_table():
    """The published ephemeris table (web/public/data), or skip if it is still the synthetic one."""
    from pipeline.ephem.interp import load_table

    if not real_table_present():
        pytest.skip(REAL_TABLE_SKIP_MSG)
    return load_table(WEB_DATA)


@pytest.fixture(scope="session")
def example_table():
    """The synthetic ephemeris table of the contract examples."""
    from pipeline.ephem.interp import load_table

    return load_table(EXAMPLE_DATA)


def pytest_runtest_setup(item):
    if item.get_closest_marker("kernels") is None or kernels_present():
        return
    if os.environ.get("LLSN_REQUIRE_KERNELS") == "1":
        pytest.fail(f"{KERNELS_SKIP_MSG} (LLSN_REQUIRE_KERNELS=1)", pytrace=False)
    pytest.skip(KERNELS_SKIP_MSG)
