#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Verification script: check that all figures in README.md, index.html,
and proof/index.html strictly match the empirical results in results/*.json.
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESULTS = os.path.join(ROOT, "results")

# 1. Load results files
with open(os.path.join(RESULTS, "loyo.json"), "r", encoding="utf-8") as f:
    loyo = json.load(f)["metrics"]

with open(os.path.join(RESULTS, "transfer.json"), "r", encoding="utf-8") as f:
    transfer = json.load(f)

with open(os.path.join(RESULTS, "drift.json"), "r", encoding="utf-8") as f:
    drift = json.load(f)["orbital_drift_records"]

with open(os.path.join(RESULTS, "MANIFEST.json"), "r", encoding="utf-8") as f:
    manifest = json.load(f)

print("Checking empirical numbers against results/*.json...")

# Assertions
k1 = transfer["global_k1"]
r = loyo["pearson_r"]
mdape = loyo["median_ape_pct"]
coverage = loyo["coverage_80_pct"]
total_records = manifest["total_records_processed"]

print(f"  k1 = {k1}")
print(f"  Pearson r = {r}")
print(f"  MdAPE = {mdape}%")
print(f"  Coverage = {coverage}%")
print(f"  Total records = {total_records}")

assert abs(k1 - 2.9705) < 0.001, f"Unexpected k1: {k1}"
assert abs(r - 0.4451) < 0.001, f"Unexpected r: {r}"
assert abs(mdape - 57.33) < 0.01, f"Unexpected mdape: {mdape}"
assert abs(coverage - 80.38) < 0.01, f"Unexpected coverage: {coverage}"
assert total_records == 162266, f"Unexpected total records: {total_records}"

# Check README.md
with open(os.path.join(ROOT, "README.md"), "r", encoding="utf-8") as f:
    readme = f.read()

assert "2.9705" in readme, "k1 not found in README.md"
assert "0.4451" in readme, "Pearson r not found in README.md"
assert "57.33%" in readme, "MdAPE not found in README.md"
assert "80.38%" in readme, "Coverage not found in README.md"
assert "162,266" in readme, "Total records not found in README.md"

# Check index.html
with open(os.path.join(ROOT, "index.html"), "r", encoding="utf-8") as f:
    idx = f.read()

assert "2.9705" in idx, "k1 not found in index.html"
assert "0.4451" in idx, "Pearson r not found in index.html"
assert "57.33%" in idx, "MdAPE not found in index.html"
assert "80.38%" in idx, "Coverage not found in index.html"

# Check proof/index.html
with open(os.path.join(ROOT, "proof", "index.html"), "r", encoding="utf-8") as f:
    proof = f.read()

assert "2.9705" in proof, "k1 not found in proof/index.html"
assert "0.4451" in proof, "Pearson r not found in proof/index.html"
assert "57.33%" in proof, "MdAPE not found in proof/index.html"
assert "80.38%" in proof, "Coverage not found in proof/index.html"

# Check that NO forbidden fake phrases exist anywhere
for forbidden in ["pdf_reference", "pdf_deck_aligned", "Page 5/7"]:
    for dirpath, _, filenames in os.walk(RESULTS):
        for fname in filenames:
            if fname.endswith(".json"):
                fpath = os.path.join(dirpath, fname)
                with open(fpath, "r", encoding="utf-8") as f:
                    content = f.read()
                    assert forbidden not in content, f"Forbidden string '{forbidden}' found in {fpath}"

print("\nALL NUMBER CONSISTENCY AND PROVENANCE ASSERTIONS PASSED!")
