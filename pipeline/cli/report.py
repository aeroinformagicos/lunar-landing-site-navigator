# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""From the test results to ``validation_report.json`` (11_validacion.md §7.1; 09_contrato_datos.md §7).

Each test tied to a validation case calls the ``record_case`` fixture (pipeline/tests/conftest.py),
which writes ``<data>/out/test_results/<case_id>.json`` with :func:`write_case`. A case measured by
two tests writes one *part* each (``<case_id>.<part>.json``); :func:`merge_parts` joins them.
``python -m pipeline.cli report`` gathers the files with :func:`build_report`:

- cases without a file come out as ``skipped``;
- the manual cases (A5, A11, B8, B9, B10, B11) are read from ``docs/manual_checks.json``
  (``{case_id, status, obtained, note, signed_by}``), which A1 and A3 edit;
- the headline is A1 (JPL Horizons), B3 and A7B7, in that order; A7B7 combines A7 and B7;
- A10 is computed and recorded but not published (11 §4, A10);
- A3 is an open discrepancy (decision D-151, revises D-95): it is listed as ``manual`` with what Firefly
  implies, what we obtain and why they differ; a stale ``A3.json`` in the results folder is ignored.

Nothing here decides whether a case passes: the status is the one the test recorded.
"""

from __future__ import annotations

import json
import math
import re
import shutil
import subprocess
from datetime import UTC, datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CONTRACT_VERSION_FILE = REPO_ROOT / "contract" / "VERSION"
MANUAL_CHECKS = REPO_ROOT / "docs" / "manual_checks.json"
WEB_DATA_DIR = REPO_ROOT / "web" / "public" / "data"

STATUSES = ("pass", "fail", "manual", "skipped")
HEADLINE_ORDER = ("A1", "B3", "A7B7")  # 09 §7 (decision D-95)
CASE_ID = re.compile(r"^[AB][0-9]{1,2}$")
PART = re.compile(r"^[a-z0-9_]+$")

FIREFLY = {"label": "Firefly Aerospace, Blue Ghost Mission 1 updates", "url": "https://fireflyspace.com/?p=3379"}
# Firefly's end-of-mission note: last data and "5 hours into the lunar night" (case A3, open discrepancy).
FIREFLY_END = {"label": "Firefly Aerospace, end of Blue Ghost Mission 1 surface operations",
               "url": "https://fireflyspace.com/news/"
                      "firefly-aerospace-successfully-completes-14-days-of-surface-operations-on-the-moon"}
HORIZONS = {"label": "JPL Horizons", "url": "https://ssd.jpl.nasa.gov/horizons/"}
PGDA = {"label": "NASA PGDA, south pole illumination products", "url": "https://pgda.gsfc.nasa.gov/products/69"}
ESPENAK = {"label": "F. Espenak, NASA GSFC, Lunar Eclipses 2021-2030",
           "url": "https://eclipse.gsfc.nasa.gov/LEdecade/LEdecade2021.html"}
NONE = {"label": "", "url": ""}

# 11 §4 and §5: the cases, their English title, what is expected, tolerance and independent source.
# ``manual``: read from docs/manual_checks.json. ``published``: goes to the report (A10 does not).
CASES: list[dict] = [
    {"id": "A1", "title": "Sun and Earth azimuth and elevation vs JPL Horizons",
     "expected": "JPL Horizons, observer on the lunar surface, 8 sites x 8 instants",
     "tolerance": "0.02 deg", "source": HORIZONS},
    {"id": "A2", "title": "Sunrise and sunset in March 2025 vs JPL Horizons (smooth Moon)",
     "expected": "0 deg crossings of the 1-minute Horizons series at 3 sites",
     "tolerance": "5 min", "source": HORIZONS},
    {"id": "A3", "title": "Sunset seen by Blue Ghost 1 (16 March 2025)",
     "expected": "Sunset around 18:00-18:15 UTC (last data about 23:15 UTC, "
                 "\"just over 5 hours into the lunar night\")",
     "tolerance": "30 min", "source": FIREFLY_END, "open_discrepancy": True},
    {"id": "A4", "title": "Horizon of a smooth sphere and of a 3 km mountain, by hand",
     "expected": "-0.087, -0.615, -1.943 and 2.606 deg", "tolerance": "0.005 deg",
     "source": {"label": "Hand calculation with R = 1737.4 km", "url": ""}},
    {"id": "A5", "title": "Horizon at three azimuths of Malapert massif vs a manual terrain profile",
     "expected": "Our mask elevation at 0, 120 and 240 deg azimuth", "tolerance": "0.1 deg",
     "source": {"label": "Manual profile in QGIS (same terrain model)", "url": ""}, "manual": True},
    {"id": "A6", "title": "Longest light near Shackleton crater vs published values",
     "expected": "Continuous light of about 240 days; longest night about 1.5 days",
     "tolerance": "Same order (factor 3)",
     "source": {"label": "Mazarico et al. (2011), Icarus 211", "url": "https://doi.org/10.1016/j.icarus.2010.10.030"}},
    {"id": "A7", "title": "Mean Sun and Earth visibility at 20 random south pole points vs NASA maps",
     "expected": "NASA AVGVISIB maps at the same points", "tolerance": "r > 0.9 and mean |diff| < 10 points",
     "source": PGDA},
    {"id": "A8", "title": "Geometric sanity checks, 2024-2044 (smooth Moon)",
     "expected": "Chang'e 4: Earth always below the horizon. (0, 0): Earth always above 75 deg. "
                 "South pole: |Sun elevation| < 1.6 deg and |Earth elevation| < 7.5 deg",
     "tolerance": "Exact", "source": {"label": "Lunar orbital geometry", "url": ""}},
    {"id": "A9", "title": "Invariants of the horizon, the disc fraction and the ephemeris table",
     "expected": "Disc fraction in [0, 1]; a taller mast never raises the horizon; "
                 "table vs SPICE < 0.001 deg",
     "tolerance": "Exact", "source": {"label": "Logical properties", "url": ""}},
    {"id": "A10", "title": "Sunrise at the planned IM-2 site (March 2025)",
     "expected": "Smooth Moon: sunrise 4 March 09:14 UTC; Sun at 2.46 deg on 6 March 17:30 UTC. "
                 "With terrain: lower or later",
     "tolerance": "2 min and 0.01 deg", "source": HORIZONS, "published": False},
    {"id": "A11", "title": "Demo pair: opposite results with a cause visible in the terrain",
     "expected": "Opposite results for a visible reason", "tolerance": "Qualitative",
     "source": {"label": "Manual profile in QGIS", "url": ""}, "manual": True},
    {"id": "B1", "title": "Interface figures vs the Python reference in five scenarios",
     "expected": "Panel figures equal to the reference", "tolerance": "0.01 deg and 1 min",
     "source": {"label": "Python reference validated at checkpoint A", "url": ""}},
    {"id": "B2", "title": "Blue Ghost 1 delayed by 14 and 29.5 days",
     "expected": "+14 d: no go; +29.5 d: go", "tolerance": "Correct traffic light",
     "source": {"label": "Lunar synodic period", "url": ""}},
    {"id": "B3", "title": "Total solar eclipse seen by Blue Ghost 1 (14 March 2025)",
     "expected": "Partial 05:00-09:52 UTC, total 06:18-08:34 UTC", "tolerance": "5 min", "source": FIREFLY},
    {"id": "B4", "title": "Eclipses at (0, 0) from 2025 to 2030 vs the NASA eclipse catalogue",
     "expected": "Every detected interval contains a catalogue maximum; the 6 total eclipses are total",
     "tolerance": "Same date", "source": ESPENAK},
    {"id": "B5", "title": "Moon elevation from a ground station vs JPL Horizons",
     "expected": "Horizons values with the station as observer", "tolerance": "0.05 deg and 2 min",
     "source": HORIZONS},
    {"id": "B6", "title": "Horizon cube vs per-site masks at 10 cells",
     "expected": "Same masks and same percentages", "tolerance": "0.01 deg and 0.4 points",
     "source": {"label": "Two independent computation paths", "url": ""}},
    {"id": "B7", "title": "South pole visibility maps vs NASA maps (all cells)",
     "expected": "Same pattern", "tolerance": "r > 0.9", "source": PGDA},
    {"id": "B8", "title": "Three people outside the team, three tasks",
     "expected": "Each task in under 60 s", "tolerance": "2 of 3 people",
     "source": {"label": "Direct observation", "url": ""}, "manual": True},
    {"id": "B9", "title": "Keyboard, contrast, load time, phone and offline copy",
     "expected": "Full checklist", "tolerance": "Full checklist",
     "source": {"label": "Browser audit and manual test", "url": ""}, "manual": True},
    {"id": "B10", "title": "Submission checklist",
     "expected": "Public link, English page, sources, AI statement, licence, video",
     "tolerance": "Everything present", "source": {"label": "Official submission guide", "url": ""},
     "manual": True},
    {"id": "B11", "title": "LROC image vs computed lighting (optional)",
     "expected": "Same pattern of light and shadow", "tolerance": "Visual",
     "source": {"label": "LROC", "url": ""}, "manual": True},
]
CASES_BY_ID = {c["id"]: c for c in CASES}

HEADLINES = {
    "A1": {"title": "Sun and Earth positions vs JPL Horizons (8 sites, 8 dates)", "source": HORIZONS,
           "note": ""},
    "B3": {"title": "Total solar eclipse seen by Blue Ghost 1 (14 March 2025)", "source": FIREFLY,
           "note": "Firefly gives the times as CST; they match UTC-5 (CDT)."},
    "A7B7": {"title": "Our south pole maps vs NASA illumination and Earth visibility maps", "source": PGDA,
             "note": ""},
}
PENDING_NOTE = "Not run in this build."
# A7B7 before the overnight run (decision D-95): a plain "computed tonight", not an error.
TONIGHT_NOTE = ("Computed tonight: this comparison needs the full south pole terrain run. "
                "The result appears here when it finishes.")
# A3 shown as an open discrepancy (decision D-151, revises D-95). Figures: docs/handoff/A3-investigacion.md
# §2 (SLDEM2015, observer 2 m; smooth Moon at 0 m; one 59 m pixel of site position moves the centre sunset
# from -51 to +33 min). Firefly: final data around 6:15 pm CDT (23:15 UTC), "just over 5 hours into the
# lunar night".
A3_OBTAINED = ("Centre of the Sun on the horizon 18:54 UTC (starts to set 18:20 UTC, fully set 19:28 UTC; "
               "smooth Moon 20:11 UTC)")
A3_NOTE = (
    "Open discrepancy (decision D-151): not passed and not hidden. Firefly gives no exact sunset time, only "
    "that the final data arrived around 23:15 UTC, \"just over 5 hours into the lunar night\", which puts "
    "sunset around 18:00-18:15 UTC. Our sunset (centre of the Sun) is 18:54 UTC, about 40 minutes later. "
    "The exact time depends on terrain near the lander smaller than our 59 m map: the horizon there is an "
    "11 m rise 800 m away, and moving the site by one 59 m pixel moves our sunset by up to 51 minutes."
)


# ------------------------------------------------------------------------------- writing (tests)


def results_dir_of(data_dir: Path) -> Path:
    """``<data>/out/test_results`` (11 §7.1; data root of decision D-44)."""
    return Path(data_dir) / "out" / "test_results"


def _detail(d: dict) -> dict:
    keys = ("label", "expected", "obtained", "abs_err", "unit", "ok")
    missing = [k for k in keys if k not in d]
    if missing:
        raise ValueError(f"detail {d.get('label')!r} lacks {missing}")
    if d["abs_err"] is not None and d["abs_err"] < 0:
        raise ValueError(f"detail {d['label']!r}: abs_err must be >= 0")
    return {k: d[k] for k in keys}


def write_case(
    results_dir: Path,
    case_id: str,
    status: str,
    expected: str,
    obtained: str,
    tolerance: str,
    source: dict,
    details: list[dict],
    note: str = "",
    part: str | None = None,
) -> Path:
    """Write the result of one case (or of one part of it) and return the path."""
    if case_id not in CASES_BY_ID:
        raise ValueError(f"unknown case {case_id!r}")
    if status not in STATUSES:
        raise ValueError(f"status must be one of {STATUSES}, got {status!r}")
    if part is not None and not PART.match(part):
        raise ValueError(f"part must match {PART.pattern}, got {part!r}")
    doc = {
        "id": case_id,
        "part": part,
        "status": status,
        "expected": expected,
        "obtained": obtained,
        "tolerance": tolerance,
        "source": {"label": source["label"], "url": source["url"]},
        "details": [_detail(d) for d in details],
        "note": note,
        "recorded_utc": utc_now(),
    }
    results_dir = Path(results_dir)
    results_dir.mkdir(parents=True, exist_ok=True)
    path = results_dir / (f"{case_id}.json" if part is None else f"{case_id}.{part}.json")
    path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    return path


# ------------------------------------------------------------------------------- reading (report)


def iso_z(iso: str) -> str:
    """``2025-03-16T18:53:55.000000Z`` -> ``2025-03-16T18:53:55Z`` (whole seconds)."""
    return iso.replace(".000000Z", "Z")


def utc_now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def git_commit() -> str:
    try:
        out = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO_ROOT, capture_output=True,
                             text=True, check=True, timeout=10)
        return out.stdout.strip() or "unknown"
    except (OSError, subprocess.SubprocessError):
        return "unknown"


def read_results(results_dir: Path) -> dict[str, list[dict]]:
    """Recorded files per case id, parts sorted by name."""
    out: dict[str, list[dict]] = {}
    root = Path(results_dir)
    if not root.is_dir():
        return out
    for path in sorted(root.glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        if doc.get("id") in CASES_BY_ID:
            out.setdefault(doc["id"], []).append(doc)
    return out


def merge_parts(parts: list[dict]) -> dict:
    """One result from the parts of a case: ``fail`` if any part failed, ``pass`` if all passed."""
    if len(parts) == 1:
        return parts[0]
    statuses = [p["status"] for p in parts]
    if "fail" in statuses:
        status = "fail"
    elif all(s == "pass" for s in statuses):
        status = "pass"
    elif "pass" in statuses:
        status = "pass"  # a part skipped on this machine does not undo the others
    else:
        status = statuses[0]
    return {
        "status": status,
        "expected": parts[0]["expected"],
        "obtained": "; ".join(p["obtained"] for p in parts if p["obtained"]),
        "tolerance": parts[0]["tolerance"],
        "source": parts[0]["source"],
        "details": [d for p in parts for d in p["details"]],
        "note": " ".join(p["note"] for p in parts if p["note"]),
    }


def read_manual(path: Path) -> dict[str, dict]:
    """``docs/manual_checks.json``: a list of ``{case_id, status, obtained, note, signed_by}``."""
    if not Path(path).is_file():
        return {}
    entries = json.loads(Path(path).read_text(encoding="utf-8"))
    out = {}
    for e in entries:
        case = CASES_BY_ID.get(e.get("case_id"))
        if case is None or not case.get("manual"):
            raise ValueError(f"{path}: {e.get('case_id')!r} is not a manual case")
        if e.get("status") not in STATUSES:
            raise ValueError(f"{path}: {e['case_id']} has status {e.get('status')!r}")
        out[e["case_id"]] = e
    return out


def build_case(case: dict, recorded: list[dict] | None, manual: dict | None) -> dict:
    base = {"id": case["id"], "group": case["id"][0], "title": case["title"], "expected": case["expected"],
            "tolerance": case["tolerance"], "source": dict(case["source"])}
    if case.get("open_discrepancy"):
        return {**base, "status": "manual", "obtained": A3_OBTAINED, "details": [], "note": A3_NOTE}
    if recorded:
        r = merge_parts(recorded)
        return {**base, "status": r["status"], "obtained": r["obtained"], "details": r["details"],
                "note": r["note"]}
    if manual is not None:
        note = manual.get("note", "")
        signed = manual.get("signed_by", "")
        if signed:
            note = f"{note} Signed by {signed}.".strip()
        status = manual["status"]
        if status == "skipped" and not note:
            note = "Manual check not done yet."
        return {**base, "status": status, "obtained": manual.get("obtained", ""), "details": [], "note": note}
    note = "Manual check not done yet." if case.get("manual") else PENDING_NOTE
    return {**base, "status": "skipped", "obtained": "", "details": [], "note": note}


def _minute(iso: str) -> str:
    """``HH:MM`` of an ISO instant, rounded to the nearest minute (half a minute rounds up)."""
    t = datetime.strptime(iso_z(iso)[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=UTC)
    return datetime.fromtimestamp(t.timestamp() + 30, UTC).strftime("%H:%M")


def hhmm(iso: str) -> str:
    """``2025-03-14T05:00:46Z`` -> ``05:01 UTC``; an interval ``a/b`` -> ``HH:MM–HH:MM UTC``."""
    if "/" in iso:
        a, b = iso.split("/")
        return f"{_minute(a)}–{_minute(b)} UTC"
    return f"{_minute(iso)} UTC"


def _time_rows(case: dict, labels: list[str]) -> list[dict]:
    by_label = {d["label"]: d for d in case["details"]}
    rows = []
    for label in labels:
        d = by_label.get(label)
        if d is None:
            continue
        rows.append({"label": label, "predicted": hhmm(str(d["obtained"])),
                     "observed": hhmm(str(d["expected"])), "ok": d["ok"]})
    return rows


B3_ROWS = ["Eclipse starts", "Totality starts", "Totality ends", "Eclipse ends"]
# A1 card: Blue Ghost 1 at 06:00 UTC on 14 March 2025, an instant of case A1 (11 §2.3) during the eclipse.
A1_SITE, A1_SITE_NAME, A1_UTC = "blue-ghost-1", "Blue Ghost 1", "2025-03-14T06:00Z"
A1_ROWS = [("sun", "az", "Sun azimuth"), ("sun", "el", "Sun elevation"),
           ("earth", "az", "Earth azimuth"), ("earth", "el", "Earth elevation")]


def _a1_rows(a1: dict) -> list[dict]:
    by_label = {d["label"]: d for d in a1["details"]}
    rows = []
    for target, angle, name in A1_ROWS:
        d = by_label.get(f"{A1_SITE} {target} {angle} {A1_UTC}")
        if d is None or not isinstance(d["obtained"], (int, float)):
            continue
        rows.append({"label": f"{name}, {A1_SITE_NAME}, {A1_UTC[:10]} {A1_UTC[11:16]} UTC",
                     "predicted": f"{d['obtained']:.4f}°", "observed": f"{float(d['expected']):.4f}°",
                     "ok": d["ok"]})
    return rows


def small_deg(deg: float) -> str:
    """Small angles without exponent notation, like ``formatSmallDeg`` of the web: 2.5e-05 -> 0.000025."""
    if deg == 0:
        return "0"
    digits = min(12, max(2, math.ceil(-math.log10(abs(deg))) + 1))
    return f"{deg:.{digits}f}".rstrip("0").rstrip(".")


def build_headline(cases: dict[str, dict], results_dir: Path, web_dir: Path) -> list[dict]:
    out = []
    a1 = cases["A1"]
    n, worst = horizons_summary(a1)
    note = (f"{n} values: Sun and Earth, azimuth and elevation, 8 sites x 8 dates; largest difference "
            f"{small_deg(worst)}°." if n and worst is not None else a1["note"] or PENDING_NOTE)
    out.append({"id": "A1", **HEADLINES["A1"], "rows": _a1_rows(a1), "tolerance": a1["tolerance"],
                "status": a1["status"], "note": note})
    b3 = cases["B3"]
    out.append({"id": "B3", **HEADLINES["B3"], "rows": _time_rows(b3, B3_ROWS), "tolerance": b3["tolerance"],
                "status": b3["status"],
                "note": " ".join(x for x in (HEADLINES["B3"]["note"], b3["note"]) if x)})
    a7, b7 = cases["A7"], cases["B7"]
    statuses = {a7["status"], b7["status"]}
    status = "fail" if "fail" in statuses else ("pass" if statuses == {"pass"} else "skipped")
    rows = [{"label": f"{c['id']}: {d['label']}", "predicted": str(d["obtained"]),
             "observed": str(d["expected"]), "ok": d["ok"]} for c in (a7, b7) for d in c["details"]]
    a7b7 = {"id": "A7B7", **HEADLINES["A7B7"], "rows": rows,
            "tolerance": f"A7: {a7['tolerance']}; B7: {b7['tolerance']}", "status": status,
            "note": " ".join(x for x in (a7["note"], b7["note"]) if x and x != PENDING_NOTE)
            or (TONIGHT_NOTE if status == "skipped" else "")}
    figures = copy_figures(results_dir, web_dir)
    if figures:
        a7b7["figures"] = figures
    out.append(a7b7)
    return out


# 09 §7.1: the two figures of A7B7, written by compare-nasa into the results folder.
FIGURES = [
    ("a7b7_scatter.png",
     "Scatter plot of our mean visibility against NASA's, Sun and Earth panels, with the 1:1 line"),
    ("a7b7_diff_map.png", "Map of our mean Sun visibility minus NASA's over the south pole grid"),
]


def copy_figures(results_dir: Path, web_dir: Path) -> list[dict]:
    figures = []
    for name, alt in FIGURES:
        src = Path(results_dir) / name
        if src.is_file():
            dst = Path(web_dir) / "validation" / name
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, dst)
            figures.append({"file": f"validation/{name}", "alt": alt})
    return figures


def horizons_summary(a1: dict) -> tuple[int, float | None]:
    """Values compared with Horizons in A1 and the largest error (deg)."""
    errs = [d["abs_err"] for d in a1["details"] if d["unit"] == "deg" and d["abs_err"] is not None]
    return len(errs), (max(errs) if errs else None)


def build_report(results_dir: Path, manual_path: Path, web_dir: Path, commit: str | None = None) -> dict:
    recorded = read_results(results_dir)
    manual = read_manual(manual_path)
    built = {c["id"]: build_case(c, recorded.get(c["id"]), manual.get(c["id"])) for c in CASES}
    published = [built[c["id"]] for c in CASES if c.get("published", True)]
    count = {s: sum(c["status"] == s for c in published) for s in STATUSES}
    n, worst = horizons_summary(built["A1"])
    return {
        "contract_version": CONTRACT_VERSION_FILE.read_text(encoding="utf-8").strip(),
        "generated_utc": utc_now(),
        "git_commit": commit or git_commit(),
        "summary": {"total": len(published), "passed": count["pass"], "failed": count["fail"],
                    "manual": count["manual"], "skipped": count["skipped"],
                    "horizons_comparisons": n, "horizons_max_abs_err_deg": worst},
        "headline": build_headline(built, results_dir, web_dir),
        "cases": published,
    }


def mark_in_manifest(web_dir: Path) -> None:
    """Set ``has_validation_report`` in ``manifest.json`` if the manifest exists (09 §3.1)."""
    path = Path(web_dir) / "manifest.json"
    if not path.is_file():
        return
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if manifest.get("has_validation_report") is not True:
        manifest["has_validation_report"] = True
        text = json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
        path.write_text(text, encoding="utf-8", newline="\n")


def write_report(report: dict, web_dir: Path) -> Path:
    path = Path(web_dir) / "validation_report.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    return path
