# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Repository rules that a test can check (CLAUDE.md §13, 2026 Space Apps rules)."""

import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
HEADER = "AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos"
SOURCE_SUFFIXES = {".py", ".ts", ".tsx", ".mjs", ".js", ".css", ".html", ".yml", ".yaml", ".sh", ".toml"}
SOURCE_NAMES = {"Makefile"}
MAX_VERSIONED_BYTES = 10 * 1024 * 1024


def _tracked_files() -> list[Path]:
    out = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard"],
        cwd=REPO_ROOT, capture_output=True, text=True, check=True, encoding="utf-8",
    ).stdout
    return [REPO_ROOT / line for line in out.splitlines() if line]


def test_source_files_start_with_ai_header():
    missing = []
    for path in _tracked_files():
        if not path.is_file():
            continue
        if path.suffix not in SOURCE_SUFFIXES and path.name not in SOURCE_NAMES:
            continue
        lines = path.read_text(encoding="utf-8").splitlines()
        # A shebang must stay on line 1; then the header goes on line 2.
        first = lines[1:2] if lines and lines[0].startswith("#!") else lines[:1]
        if not first or HEADER not in first[0]:
            missing.append(str(path.relative_to(REPO_ROOT)))
    assert not missing, f"Missing AI header on the first line: {missing}"


def test_no_versioned_file_over_10_mb():
    big = [str(p.relative_to(REPO_ROOT)) for p in _tracked_files()
           if p.is_file() and p.stat().st_size > MAX_VERSIONED_BYTES]
    assert not big, f"Files over 10 MB must not be versioned: {big}"
