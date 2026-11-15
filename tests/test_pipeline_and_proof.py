import json
import os
import glob
import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESULTS = os.path.join(ROOT, "results")

def test_results_files_exist():
    expected_files = ["MANIFEST.json", "seams.json", "transfer.json", "loyo.json", "drift.json", "bd_monthly.json", "events.json", "table_page5.json"]
    for f in expected_files:
        path = os.path.join(RESULTS, f)
        assert os.path.exists(path), f"Missing results file: {f}"

def test_manifest_provenance():
    with open(os.path.join(RESULTS, "MANIFEST.json"), "r", encoding="utf-8") as f:
        data = json.load(f)
    assert data["total_records_processed"] == 162266
    assert data["skipped_bad_records"] == 0
    assert data["provenance"] == "empirical_measured_and_computed"

def test_transfer_coefficients():
    with open(os.path.join(RESULTS, "transfer.json"), "r", encoding="utf-8") as f:
        data = json.load(f)
    assert abs(data["global_k1"] - 2.9705) < 0.001
    assert data["provenance"] == "computed"
    assert len(data["monthly_coefficients"]) == 12

def test_loyo_and_intervals():
    with open(os.path.join(RESULTS, "loyo.json"), "r", encoding="utf-8") as f:
        data = json.load(f)
    metrics = data["metrics"]
    assert abs(metrics["pearson_r"] - 0.4451) < 0.001
    assert abs(metrics["median_ape_pct"] - 57.33) < 0.01
    assert abs(metrics["coverage_80_pct"] - 80.38) < 0.01
    assert data["provenance"] == "computed"

def test_no_forbidden_strings():
    forbidden = ["pdf_reference", "pdf_deck_aligned", "Page 5/7"]
    for f in glob.glob(os.path.join(RESULTS, "*.json")):
        with open(f, "r", encoding="utf-8") as fh:
            text = fh.read()
            for s in forbidden:
                assert s not in text, f"Forbidden string '{s}' found in {f}"

def test_no_map_key_in_repo():
    pattern = "e7b8" + "4e6e"
    for root_dir, _, files in os.walk(ROOT):
        if any(skip in root_dir for skip in [".git", "node_modules", ".pytest_cache", "__pycache__", "tests"]):
            continue
        for fname in files:
            if fname.endswith((".js", ".html", ".py", ".json", ".md")):
                fpath = os.path.join(root_dir, fname)
                with open(fpath, "r", encoding="utf-8", errors="ignore") as fh:
                    assert pattern not in fh.read(), f"Leaked MAP_KEY in {fpath}"
