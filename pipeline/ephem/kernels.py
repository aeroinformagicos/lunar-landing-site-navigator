# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Loading of the four SPICE kernels (docs/spec/05_efemerides.md §2, 03_datos_y_fuentes.md §2).

Only these four kernels are ever loaded, in this order. No text PCK is loaded, so the IAU body-fixed
frame of the Moon cannot be evaluated and any accidental use of it raises a SPICE error.
"""

from __future__ import annotations

import os
from pathlib import Path

import spiceypy

# Load order of 03_datos_y_fuentes.md §2.
KERNEL_FILES = (
    "naif0012.tls",
    "de440.bsp",
    "moon_pa_de440_200625.bpc",
    "moon_de440_250416.tf",
)


class KernelMissing(FileNotFoundError):
    """One of the four SPICE kernels is not in the kernel directory."""


def default_kernels_dir() -> Path:
    """``$LLSN_DATA_DIR/kernels`` if the variable is set, else ``./data/kernels`` (decision D-44)."""
    env = os.environ.get("LLSN_DATA_DIR")
    return (Path(env) if env else Path("data")) / "kernels"


def _loaded_files() -> list[Path]:
    return [Path(spiceypy.kdata(i, "ALL")[0]) for i in range(spiceypy.ktotal("ALL"))]


def load_kernels(kernels_dir: Path | str | None = None) -> Path:
    """Load the four kernels and nothing else; return the directory used.

    Calling it again with the same directory does nothing. Anything else found in the kernel pool
    is unloaded first, so that exactly four kernels are loaded afterwards.
    """
    kdir = Path(kernels_dir) if kernels_dir is not None else default_kernels_dir()
    wanted = [kdir / name for name in KERNEL_FILES]
    for path in wanted:
        if not path.is_file():
            raise KernelMissing(f"Missing SPICE kernel: {path.name}. Run `make data-fetch`.")
    if _loaded_files() != wanted:
        spiceypy.kclear()
        for path in wanted:
            spiceypy.furnsh(str(path))
    assert spiceypy.ktotal("ALL") == len(KERNEL_FILES)  # nothing else loaded
    return kdir
