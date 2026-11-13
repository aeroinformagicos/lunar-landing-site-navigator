# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Pipeline command line: ``python -m pipeline.cli <subcommand>``.

Each task card adds its subcommand (docs/spec/02_arquitectura.md §4.2). All of
them accept ``--data-dir`` (default: $LLSN_DATA_DIR, else ./data) and
``--out-dir``, print a short summary and return a non-zero code on failure.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path


def default_data_dir() -> Path:
    env = os.environ.get("LLSN_DATA_DIR")
    return Path(env) if env else Path("data")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m pipeline.cli",
                                     description="Lunar Landing Site Navigator pipeline")
    parser.add_argument("--data-dir", type=Path, default=default_data_dir())
    parser.add_argument("--out-dir", type=Path, default=None)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("info", help="print the data directory and what it contains")
    return parser


def cmd_info(args: argparse.Namespace) -> int:
    root = args.data_dir
    print(f"data dir: {root.resolve()}")
    for name in ("kernels", "raw/lola", "raw/sldem2015", "raw/nasa_illum", "crops", "out"):
        path = root / name
        count = sum(1 for p in path.iterdir() if p.is_file()) if path.is_dir() else 0
        print(f"  {name:<16} {'present' if path.is_dir() else 'missing'} ({count} files)")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    handlers = {"info": cmd_info}
    return handlers[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
