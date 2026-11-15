# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""``record_case`` files and the ``report`` subcommand (11_validacion.md §7.1; 09_contrato_datos.md §7).

All synthetic, in temporary folders: nothing here reads or writes $LLSN_DATA_DIR.
"""

from __future__ import annotations

import json

import pytest

from pipeline.cli import contract_check, report
from pipeline.cli.__main__ import main as cli_main
from pipeline.tests.conftest import REPO_ROOT

SRC = {"label": "Somewhere", "url": ""}
MANUAL_IDS = {"A5", "A11", "B8", "B9", "B10", "B11"}


def detail(label, expected, obtained, abs_err, unit, ok):
    return {"label": label, "expected": expected, "obtained": obtained, "abs_err": abs_err, "unit": unit,
            "ok": ok}


def write_manual(path, entries):
    path.write_text(json.dumps(entries), encoding="utf-8")
    return path


@pytest.fixture
def dirs(tmp_path):
    results, web = tmp_path / "out" / "test_results", tmp_path / "web"
    web.mkdir()
    return results, web, write_manual(tmp_path / "manual.json", [])


def build(dirs):
    results, web, manual = dirs
    doc = report.build_report(results, manual, web, commit="abc1234")
    assert contract_check.schema_errors("validation_report", doc) == []
    return doc


def test_the_case_list_follows_the_specification():
    ids = [c["id"] for c in report.CASES]
    assert ids == [f"A{i}" for i in range(1, 12)] + [f"B{i}" for i in range(1, 12)]
    assert {c["id"] for c in report.CASES if c.get("manual")} == MANUAL_IDS
    assert [c["id"] for c in report.CASES if not c.get("published", True)] == ["A10"]  # 11 §4, A10


def test_write_case_writes_one_file_per_case_or_part(tmp_path):
    p = report.write_case(tmp_path, "A8", "pass", "e", "o", "Exact", SRC, [detail("x", 1, 1, 0, "deg", True)])
    assert p.name == "A8.json"
    doc = json.loads(p.read_text(encoding="utf-8"))
    assert (doc["id"], doc["status"], doc["part"]) == ("A8", "pass", None)
    assert doc["recorded_utc"].endswith("Z")
    p = report.write_case(tmp_path, "A10", "fail", "e", "o", "t", SRC, [], part="relief")
    assert p.name == "A10.relief.json"


@pytest.mark.parametrize(("case_id", "status", "details", "part"), [
    ("C1", "pass", [], None),
    ("A8", "ok", [], None),
    ("A8", "pass", [{"label": "x"}], None),
    ("A8", "pass", [detail("x", 1, 2, -1, "deg", False)], None),
    ("A8", "pass", [], "Bad Part"),
])
def test_write_case_rejects_what_the_contract_does_not_allow(tmp_path, case_id, status, details, part):
    with pytest.raises(ValueError):
        report.write_case(tmp_path, case_id, status, "e", "o", "t", SRC, details, part=part)


def test_without_results_every_case_is_skipped_and_the_headline_is_pending(dirs):
    doc = build(dirs)
    assert [h["id"] for h in doc["headline"]] == list(report.HEADLINE_ORDER)
    assert all(h["status"] == "skipped" for h in doc["headline"])
    # A3 is always manual: an open discrepancy written by hand (decision D-151).
    assert len(doc["cases"]) == 21 and all(c["status"] == "skipped" for c in doc["cases"] if c["id"] != "A3")
    assert doc["summary"] == {"total": 21, "passed": 0, "failed": 0, "manual": 1, "skipped": 20,
                              "horizons_comparisons": 0, "horizons_max_abs_err_deg": None}
    assert doc["git_commit"] == "abc1234"
    assert doc["contract_version"] == (REPO_ROOT / "contract" / "VERSION").read_text(encoding="utf-8").strip()
    notes = {c["id"]: c["note"] for c in doc["cases"]}
    assert notes["A1"] == report.PENDING_NOTE and notes["B8"] == "Manual check not done yet."
    a1, _, a7b7 = doc["headline"]
    assert a1["rows"] == [] and a1["note"] == report.PENDING_NOTE
    assert a7b7["note"] == report.TONIGHT_NOTE  # "computed tonight", not an error (decision D-95)


def test_recorded_cases_fill_the_report_and_the_headline(dirs):
    results = dirs[0]
    report.write_case(results, "A1", "pass", "e", "max 2.5e-05", "0.02 deg", SRC,
                      [detail("apollo-11 sun az 2025-03-14T06:00Z", 10.0, 10.00001, 1e-5, "deg", True),
                       detail("blue-ghost-1 sun az 2025-03-14T06:00Z", 258.871284246, 258.871285, 1e-6, "deg",
                              True),
                       detail("blue-ghost-1 earth el 2025-03-14T06:00Z", 28.916324972, 28.91635, 2.5e-5,
                              "deg", True)])
    report.write_case(results, "B3", "pass", "e", "o", "5 min", SRC,
                      [detail("Eclipse starts", "2025-03-14T05:00:00Z", "2025-03-14T05:00:46Z", 0.77, "min",
                              True),
                       detail("Eclipse ends", "2025-03-14T09:52:00Z", "2025-03-14T09:51:13Z", 0.78, "min",
                              True)])
    doc = build(dirs)
    a1, b3, a7b7 = doc["headline"]
    assert a1["status"] == "pass" and a1["tolerance"] == "0.02 deg"
    # Blue Ghost 1 at 06:00 UTC on 14 March 2025, in the order Sun az, Sun el, Earth az, Earth el.
    assert a1["rows"] == [
        {"label": "Sun azimuth, Blue Ghost 1, 2025-03-14 06:00 UTC", "predicted": "258.8713°",
         "observed": "258.8713°", "ok": True},
        {"label": "Earth elevation, Blue Ghost 1, 2025-03-14 06:00 UTC", "predicted": "28.9164°",
         "observed": "28.9163°", "ok": True},
    ]
    assert a1["note"] == ("3 values: Sun and Earth, azimuth and elevation, 8 sites x 8 dates; "
                          "largest difference 0.000025°.")
    assert b3["status"] == "pass" and b3["rows"] == [
        {"label": "Eclipse starts", "predicted": "05:01 UTC", "observed": "05:00 UTC", "ok": True},
        {"label": "Eclipse ends", "predicted": "09:51 UTC", "observed": "09:52 UTC", "ok": True},
    ]
    assert a7b7["status"] == "skipped" and a7b7["rows"] == [] and "figures" not in a7b7
    s = doc["summary"]
    assert (s["passed"], s["failed"], s["skipped"]) == (2, 0, 18)
    assert (s["horizons_comparisons"], s["horizons_max_abs_err_deg"]) == (3, 2.5e-5)


def test_a3_is_an_open_discrepancy_whatever_the_results_folder_holds(dirs):
    # Decision D-151 (revises D-95): A3 is shown as manual, with expected, obtained and why they differ.
    report.write_case(dirs[0], "A3", "fail", "e", "Sunset 18:53:55 UTC", "30 min", SRC,
                      [detail("Sunset", "w", "2025-03-16T18:53:55Z", 38.92, "min", False)], "stale")
    doc = build(dirs)
    assert "A3" not in [h["id"] for h in doc["headline"]]
    a3 = next(c for c in doc["cases"] if c["id"] == "A3")
    assert (a3["status"], a3["details"]) == ("manual", [])
    assert a3["note"].startswith("Open discrepancy (decision D-151)") and "18:54 UTC" in a3["note"]
    assert "18:00-18:15 UTC" in a3["expected"] and "18:54 UTC" in a3["obtained"]
    assert doc["summary"]["failed"] == 0


def test_small_deg_matches_the_web_format():
    assert [report.small_deg(x) for x in (4e-5, 2.5e-5, 7e-6, 0.0123, 0)] == [
        "0.00004", "0.000025", "0.000007", "0.012", "0"]


def test_parts_are_merged(dirs):
    results = dirs[0]
    report.write_case(results, "A2", "pass", "e", "one", "t", SRC, [detail("x", 1, 1, 0, "s", True)],
                      part="a")
    report.write_case(results, "A2", "fail", "e", "two", "t", SRC, [detail("y", 1, 9, 8, "s", False)], "bad",
                      part="b")
    a2 = next(c for c in build(dirs)["cases"] if c["id"] == "A2")
    assert (a2["status"], a2["obtained"], a2["note"]) == ("fail", "one; two", "bad")
    assert [d["label"] for d in a2["details"]] == ["x", "y"]


def test_a10_is_recorded_but_not_published(dirs):
    report.write_case(dirs[0], "A10", "pass", "e", "o", "t", SRC, [], part="smooth")
    doc = build(dirs)
    assert "A10" not in {c["id"] for c in doc["cases"]} and doc["summary"]["passed"] == 0


def test_manual_checks_are_read_from_their_file(dirs):
    results, web, manual = dirs
    write_manual(manual, [{"case_id": "A5", "status": "manual", "obtained": "0.41, 1.02, 0.77 deg",
                           "note": "Three azimuths.", "signed_by": "A1"},
                          {"case_id": "B8", "status": "skipped", "obtained": "", "note": "",
                           "signed_by": ""}])
    cases = {c["id"]: c for c in build(dirs)["cases"]}
    assert cases["A5"]["status"] == "manual"
    assert cases["A5"]["note"] == "Three azimuths. Signed by A1."
    assert cases["B8"]["status"] == "skipped" and cases["B8"]["note"] == "Manual check not done yet."
    write_manual(manual, [{"case_id": "A1", "status": "pass", "obtained": "", "note": "",
                           "signed_by": "x"}])
    with pytest.raises(ValueError, match="not a manual case"):
        report.build_report(results, manual, web)


def test_the_repository_manual_checks_file_is_valid():
    entries = json.loads(report.MANUAL_CHECKS.read_text(encoding="utf-8"))
    assert {e["case_id"] for e in entries} == MANUAL_IDS
    assert all(set(e) == {"case_id", "status", "obtained", "note", "signed_by"} for e in entries)
    assert set(report.read_manual(report.MANUAL_CHECKS)) == MANUAL_IDS


def test_a7b7_combines_a7_and_b7_and_copies_the_figures(dirs):
    results, web, _ = dirs
    report.write_case(results, "A7", "pass", "e", "o", "r > 0.9", SRC,
                      [detail("Sun r", 0.9, 0.95, 0.05, "", True)])
    report.write_case(results, "B7", "pass", "e", "o", "r > 0.9", SRC,
                      [detail("Earth r", 0.9, 0.93, 0.03, "", True)])
    (results / "a7b7_scatter.png").write_bytes(b"\x89PNG fake")
    a7b7 = build(dirs)["headline"][2]
    assert a7b7["status"] == "pass" and [r["label"] for r in a7b7["rows"]] == ["A7: Sun r", "B7: Earth r"]
    assert a7b7["figures"] == [{"file": "validation/a7b7_scatter.png", "alt": report.FIGURES[0][1]}]
    assert (web / "validation" / "a7b7_scatter.png").read_bytes() == b"\x89PNG fake"
    report.write_case(results, "B7", "fail", "e", "o", "r > 0.9", SRC, [])
    assert build(dirs)["headline"][2]["status"] == "fail"


@pytest.mark.parametrize(("iso", "text"), [
    ("2025-03-14T05:00:29Z", "05:00 UTC"),
    ("2025-03-14T05:00:30Z", "05:01 UTC"),
    ("2025-03-14T23:59:45.000000Z", "00:00 UTC"),
    ("2025-03-16T18:00:00Z/2025-03-16T18:15:00Z", "18:00–18:15 UTC"),
])
def test_headline_times_are_rounded_to_the_minute(iso, text):
    assert report.hhmm(iso) == text


def test_report_subcommand_writes_a_valid_file(tmp_path, monkeypatch, capsys):
    out, web = tmp_path / "out", tmp_path / "web"
    web.mkdir()
    report.write_case(out / "test_results", "A8", "pass", "e", "o", "Exact", SRC, [])
    monkeypatch.setattr(report, "MANUAL_CHECKS", write_manual(tmp_path / "manual.json", []))
    assert cli_main(["--out-dir", str(out), "report", "--web-dir", str(web)]) == 0
    doc = json.loads((web / "validation_report.json").read_text(encoding="utf-8"))
    assert doc["summary"]["passed"] == 1
    assert contract_check.schema_errors("validation_report", doc) == []
    assert "21 cases" in capsys.readouterr().out
